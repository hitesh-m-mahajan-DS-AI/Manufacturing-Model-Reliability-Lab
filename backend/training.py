"""Fixed models, validation-only release rules, and real local MLflow tracking."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import time
from uuid import uuid4
import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from mlflow.tracking import MlflowClient
from .data import ROOT, FEATURES, NUMERIC, TARGET, SOURCE_SHA, digest


def now():
    return datetime.now(timezone.utc).isoformat()


def scores(actual, predicted):
    return {"mae": float(mean_absolute_error(actual, predicted)),
            "rmse": float(root_mean_squared_error(actual, predicted)),
            "r2": float(r2_score(actual, predicted))}


def pipeline(kind):
    transform = ColumnTransformer([
        ("numeric", StandardScaler(), NUMERIC),
        ("department", OneHotEncoder(handle_unknown="error", sparse_output=False), ["department"]),
    ])
    models = {"mean": DummyRegressor(strategy="mean"), "ridge": Ridge(alpha=1.0),
              "forest": RandomForestRegressor(n_estimators=80, max_depth=6,
                         min_samples_leaf=8, random_state=42, n_jobs=1)}
    return Pipeline([("features", transform), ("model", models[kind])])


def release_checks(kind, metric, departments, reference_mae, finite, policy):
    checks = [{"name": "Finite validation predictions", "passed": bool(finite), "detail": "Every validation prediction is finite."}]
    if kind != "mean":
        threshold = reference_mae * (1 - policy["minimum_relative_mae_improvement"])
        checks.extend([
            {"name": "MAE improves reference by ≥2%", "passed": metric["mae"] <= threshold,
             "detail": f"{metric['mae']:.5f} ≤ {threshold:.5f}; reference is mean for ridge, ridge for forest."},
            {"name": "Validation MAE ≤ 0.16", "passed": metric["mae"] <= policy["maximum_validation_mae"], "detail": "Illustrative absolute-error ceiling."},
            {"name": "Department MAE ≤ 0.22", "passed": all(d["mae"] <= policy["maximum_department_mae"] for d in departments), "detail": "Each department is checked separately."},
            {"name": "Department support ≥20", "passed": all(d["rows"] >= policy["minimum_department_rows"] for d in departments), "detail": "Both observed departments need validation support."},
        ])
    return checks


def engine_digest():
    # Normalize newlines so the fingerprint survives Windows Git checkouts.
    text = "\n".join((ROOT / "backend" / name).read_text(encoding="utf-8")
                     for name in ["data.py", "training.py", "monitoring.py"])
    return sha256(text.encode()).hexdigest()


def train_experiment(runtime, train, validation, policy):
    started = time.perf_counter()
    experiment_id = "exp-" + uuid4().hex[:12]
    directory = runtime / "artifacts" / experiment_id
    directory.mkdir(parents=True)
    uri = "sqlite:///" + (runtime / "mlflow.sqlite3").resolve().as_posix()
    client = MlflowClient(tracking_uri=uri)
    tracking_id = client.get_experiment_by_name("Manufacturing Reliability")
    tracking_id = tracking_id.experiment_id if tracking_id else client.create_experiment(
        "Manufacturing Reliability", artifact_location=(runtime / "mlflow-artifacts").resolve().as_uri())
    models = []
    for kind, title in [("mean", "Mean fallback"), ("ridge", "Ridge incumbent"), ("forest", "Forest candidate")]:
        start = time.perf_counter()
        model = pipeline(kind).fit(train[FEATURES], train[TARGET])
        predictions = model.predict(validation[FEATURES])
        metric = scores(validation[TARGET], predictions)
        departments = [{"department": name, "rows": int(mask.sum()), "mae": float(mean_absolute_error(validation.loc[mask, TARGET], predictions[mask]))}
                       for name in sorted(validation.department.unique()) for mask in [validation.department.eq(name).to_numpy()]]
        reference = models[-1]["validation"]["mae"] if kind != "mean" else metric["mae"]
        checks = release_checks(kind, metric, departments, reference, np.isfinite(predictions).all(), policy)
        artifact = directory / (kind + ".joblib")
        joblib.dump(model, artifact)
        artifact_sha = digest(artifact)
        # Reload before release; only locally created, hash-checked artifacts are used.
        reloaded = joblib.load(artifact)
        same = np.allclose(predictions, reloaded.predict(validation[FEATURES]), rtol=0, atol=1e-12)
        checks.append({"name": "Artifact round-trip matches", "passed": bool(same), "detail": "Serialized/reloaded validation predictions agree within 1e-12."})
        version = kind + "-" + experiment_id[4:]
        run = client.create_run(tracking_id, tags={"mlflow.runName": version, "stage": "validation", "source_sha256": SOURCE_SHA, "lab_experiment": experiment_id})
        run_id = run.info.run_id
        for key, value in {"kind": kind, "seed": 42, "train_rows": len(train), "validation_rows": len(validation),
                           "policy_sha256": digest(ROOT / "data/policy.json"), "artifact_sha256": artifact_sha,
                           "parameters": str(model.named_steps["model"].get_params())}.items():
            client.log_param(run_id, key, str(value))
        for key, value in metric.items():
            client.log_metric(run_id, "validation_" + key, value)
        report_path = directory / (kind + "_validation.json")
        report_path.write_text(json.dumps({"metrics": metric, "checks": checks, "departments": departments}, indent=2), encoding="utf-8")
        client.log_artifact(run_id, str(artifact))
        client.log_artifact(run_id, str(report_path))
        client.set_terminated(run_id)
        models.append({"version": version, "kind": kind, "title": title, "validation": metric, "departments": departments,
                       "checks": checks, "eligible": all(c["passed"] for c in checks), "artifact": str(artifact.relative_to(runtime)),
                       "artifact_sha256": artifact_sha, "mlflow_run_id": run_id,
                       "fit_and_log_seconds": round(time.perf_counter() - start, 6)})
    eligible = [m for m in models if m["eligible"]]
    selected = min(eligible, key=lambda m: m["validation"]["mae"])["version"]
    freeze = {"id": experiment_id, "frozen_at": now(), "models": models, "selected_version": selected,
              "policy": policy, "policy_sha256": digest(ROOT / "data/policy.json"), "source_sha256": SOURCE_SHA,
              "engine_sha256": engine_digest(), "tracking_uri": uri, "duration_seconds": round(time.perf_counter() - started, 6),
              "training_rows": len(train), "validation_rows": len(validation),
              "scope": "Release eligibility uses validation only; replay labels have not been scored here."}
    (directory / "freeze.json").write_text(json.dumps(freeze, indent=2), encoding="utf-8")
    return freeze


def load_model(runtime, metadata):
    artifact = (runtime / metadata["artifact"]).resolve()
    if not artifact.is_relative_to(runtime.resolve() / "artifacts") or digest(artifact) != metadata["artifact_sha256"]:
        raise ValueError("Model artifact integrity check failed.")
    return joblib.load(artifact)
