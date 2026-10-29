"""Readable single-process lifecycle orchestration, with optimistic release versions."""
import json
from pathlib import Path
from threading import RLock
import time
from uuid import uuid4
from .data import ROOT, FEATURES, load_data, load_policy, partition, data_report
from .training import train_experiment, load_model, now, digest, engine_digest
from .monitoring import monitor
from .store import Store


class LabError(Exception):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


class Lab:
    def __init__(self, runtime=None):
        self.runtime = Path(runtime or ROOT / "runtime").resolve()
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.lock = RLock()
        self.policy = load_policy()
        self.frame = load_data()
        self.train, self.validation, self.replay_data = partition(self.frame, self.policy)
        self.report = data_report(self.frame, [self.train, self.validation, self.replay_data])
        self.store = Store(self.runtime / "registry.sqlite3")
        if not self.store.experiments():
            self.train_new()

    def train_new(self):
        with self.lock:
            # Reread source/policy so a new comparison really uses the current contract.
            # Existing deployment eligibility remains tied to its original fingerprints.
            self.policy = load_policy()
            self.frame = load_data()
            self.train, self.validation, self.replay_data = partition(self.frame, self.policy)
            self.report = data_report(self.frame, [self.train, self.validation, self.replay_data])
            experiment = train_experiment(self.runtime, self.train, self.validation, self.policy)
            with self.store.connect() as db:
                db.execute("INSERT INTO experiments VALUES(?,?,?)", (experiment["id"], experiment["frozen_at"], json.dumps(experiment)))
                self.store.event(db, "comparison_frozen", {"experiment": experiment["id"], "selected_version": experiment["selected_version"], "engine_sha256": experiment["engine_sha256"]})
                if not db.execute("SELECT 1 FROM state WHERE id=1").fetchone():
                    baseline = experiment["models"][0]["version"]
                    db.execute("INSERT INTO state VALUES(1,?,NULL,1)", (baseline,))
                    self.store.event(db, "bootstrap_fallback", {"version": baseline, "generation": 1})
            return experiment

    def metadata(self, version):
        for experiment in self.store.experiments():
            for model in experiment["models"]:
                if model["version"] == version:
                    return model, experiment
        raise LabError("Unknown model version.", 404)

    def verified(self, version):
        metadata, experiment = self.metadata(version)
        if experiment["policy_sha256"] != digest(ROOT / "data/policy.json") or experiment["engine_sha256"] != engine_digest():
            raise LabError("Code/policy differs from this frozen comparison. Train a new comparison first.")
        try:
            return load_model(self.runtime, metadata), metadata
        except (ValueError, OSError) as exc:
            raise LabError(str(exc)) from exc

    def snapshot(self):
        with self.lock:
            return {"state": self.store.state(), "experiment": self.store.experiments()[0], "data": self.report,
                    "events": self.store.events(), "replays": self.store.replays(), "policy": self.policy}

    def release(self, version, expected_generation, rollback=False):
        with self.lock:
            state = self.store.state()
            if state["generation"] != expected_generation:
                raise LabError("State changed. Refresh before releasing a model.")
            if rollback:
                version = state["previous"]
                if not version:
                    raise LabError("There is no previous verified deployment.")
            model, metadata = self.verified(version)
            if not metadata["eligible"]:
                raise LabError("Release blocked: this model failed its frozen validation checks.")
            if version == state["active"]:
                raise LabError("That version is already active.")
            # Integrity is checked BEFORE changing the active pointer. Model is loaded now.
            del model
            generation = state["generation"] + 1
            with self.store.connect() as db:
                db.execute("UPDATE state SET active=?,previous=?,generation=? WHERE id=1", (version, state["active"], generation))
                self.store.event(db, "rollback" if rollback else "release", {"from": state["active"], "to": version, "generation": generation,
                    "artifact_sha256": metadata["artifact_sha256"], "mlflow_run_id": metadata["mlflow_run_id"]})
            return self.store.state()

    def predict(self, fields):
        import pandas as pd
        with self.lock:
            start = time.perf_counter()
            state = self.store.state()
            model, metadata = self.verified(state["active"])
            value = float(model.predict(pd.DataFrame([fields])[FEATURES])[0])
            result = {"prediction": value, "model_version": metadata["version"], "generation": state["generation"],
                      "artifact_sha256": metadata["artifact_sha256"], "duration_ms": round((time.perf_counter()-start)*1000, 3),
                      "unit": "source productivity ratio; not clipped to 0–1"}
            with self.store.connect() as db:
                self.store.event(db, "prediction", {"model_version": metadata["version"], "generation": state["generation"], "prediction": value})
            return result

    def replay(self, shifted=False, labels=True):
        with self.lock:
            start = time.perf_counter()
            state = self.store.state()
            model, metadata = self.verified(state["active"])
            batches = []
            for date, batch in self.replay_data.groupby("date", sort=True):
                item = monitor(self.train, batch, model, self.policy, shifted, labels)
                item.pop("predictions")
                batches.append({"date": str(date.date()), **item})
            total = monitor(self.train, self.replay_data, model, self.policy, shifted, labels)
            result = {"id": "replay-" + uuid4().hex[:12], "created": now(), "model_version": metadata["version"],
                      "generation": state["generation"], "batches": batches, **total,
                      "duration_ms": round((time.perf_counter()-start)*1000, 3),
                      "scope": "Historical replay after configuration freeze; repeated replay is not new unseen evidence."}
            with self.store.connect() as db:
                db.execute("INSERT INTO replays VALUES(?,?,?)", (result["id"], result["created"], json.dumps(result)))
                self.store.event(db, "synthetic_input_replay" if shifted else "historical_replay", {"id": result["id"], "model_version": metadata["version"], "labels_available": result["labels_available"], "rows": result["rows"]})
            return result

    def replay_by_id(self, replay_id):
        for item in self.store.replays():
            if item["id"] == replay_id:
                return item
        raise LabError("Unknown replay.", 404)
