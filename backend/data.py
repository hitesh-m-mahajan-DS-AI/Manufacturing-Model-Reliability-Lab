"""Load the unchanged public source; validate before constructing date partitions."""
from hashlib import sha256
from pathlib import Path
import json
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = "763ffcdd39b7f7f360243c2af8f89ed733e8b5f9e511efeb0c886b83e1b76866"
NUMERIC = ["targeted_productivity", "smv", "no_of_workers"]
FEATURES = NUMERIC + ["department"]
TARGET = "actual_productivity"


def digest(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def load_data(path=None):
    path = Path(path or ROOT / "data/garments_worker_productivity.csv")
    if digest(path) != SOURCE_SHA:
        raise ValueError("Source checksum mismatch. Restore the bundled UCI CSV.")
    frame = pd.read_csv(path)
    if frame.shape != (1197, 15):
        raise ValueError("Expected 1,197 rows and 15 source columns.")
    frame["source_row"] = np.arange(1, len(frame) + 1)
    frame["date"] = pd.to_datetime(frame["date"], format="%m/%d/%Y", errors="raise")
    frame["department"] = frame["department"].str.strip().str.lower().replace({"sweing": "sewing"})
    if frame[FEATURES + [TARGET]].isna().any().any():
        raise ValueError("A selected feature or label is missing.")
    if not np.isfinite(frame[NUMERIC + [TARGET]].to_numpy()).all():
        raise ValueError("Nonfinite feature or label.")
    if set(frame.department) != {"sewing", "finishing"}:
        raise ValueError("Unexpected department.")
    if not frame.targeted_productivity.between(0, 1).all() or (frame[["smv", "no_of_workers"]] <= 0).any().any():
        raise ValueError("Selected feature outside the source contract.")
    return frame.sort_values(["date", "source_row"], kind="stable").reset_index(drop=True)


def partition(frame, policy):
    dates = sorted(frame.date.unique())
    if len(dates) != sum(policy[k] for k in ["train_dates", "validation_dates", "replay_dates"]):
        raise ValueError("Expected 59 dates for the fixed 35/12/12-date design.")
    a, b = policy["train_dates"], policy["train_dates"] + policy["validation_dates"]
    return [frame[frame.date.isin(group)].copy() for group in [dates[:a], dates[a:b], dates[b:]]]


def load_policy():
    return json.loads((ROOT / "data/policy.json").read_text(encoding="utf-8"))


def data_report(frame, groups):
    return {
        "source_sha256": SOURCE_SHA, "rows": len(frame), "dates": int(frame.date.nunique()),
        "target_above_one": int((frame[TARGET] > 1).sum()),
        "missing_excluded_wip": int(frame.wip.isna().sum()),
        "exact_source_duplicates": int(frame.drop(columns="source_row").duplicated().sum()),
        "target_max": float(frame[TARGET].max()),
        "features": FEATURES,
        "splits": [{"name": name, "rows": len(group), "dates": int(group.date.nunique()),
                    "start": str(group.date.min().date()), "end": str(group.date.max().date())}
                   for name, group in zip(["Train", "Validation", "Replay"], groups)],
        "sample": json.loads(frame[["source_row", "date"] + FEATURES + [TARGET]].head(8).to_json(orient="records", date_format="iso")),
    }
