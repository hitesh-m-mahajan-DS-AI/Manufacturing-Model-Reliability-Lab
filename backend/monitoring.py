"""Feature shift and observed errors are deliberately separate measurements."""
import numpy as np
from .data import NUMERIC, TARGET, FEATURES
from .training import scores


def psi(reference, observed):
    # Quantile boundaries are fitted ONLY to the training reference.
    edges = np.unique(np.quantile(reference, np.linspace(0, 1, 6)))
    edges = np.concatenate(([-np.inf], edges[1:-1], [np.inf]))
    expected = np.histogram(reference, bins=edges)[0].astype(float)
    actual = np.histogram(observed, bins=edges)[0].astype(float)
    expected = np.maximum(expected / expected.sum(), 1e-6)
    actual = np.maximum(actual / actual.sum(), 1e-6)
    return float(np.sum((actual - expected) * np.log(actual / expected)))


def monitor(train, batch, model, policy, shifted=False, labels=True):
    observed = batch.copy()
    if shifted:
        # Synthetic input-only fault. Its original outcome is NOT a valid new label.
        observed["smv"] = observed.smv * 1.8
    predicted = model.predict(observed[FEATURES])
    drift = [{"feature": field, "psi": psi(train[field], observed[field]),
              "reference_mean": float(train[field].mean()), "batch_mean": float(observed[field].mean()),
              "out_of_training_range": int(((observed[field] < train[field].min()) | (observed[field] > train[field].max())).sum())}
             for field in NUMERIC]
    for row in drift:
        row["alert"] = row["psi"] >= policy["psi_alert_threshold"]
    return {"rows": len(observed), "synthetic_shift": shifted, "labels_available": labels and not shifted,
            "metrics": scores(observed[TARGET], predicted) if labels and not shifted else None,
            "drift": drift, "prediction_mean": float(predicted.mean()),
            "predictions": [{"source_row": int(row.source_row), "date": str(row.date.date()),
                             "prediction": float(value), "actual": float(row[TARGET]) if labels and not shifted else None}
                            for (_, row), value in zip(observed.iterrows(), predicted)],
            "interpretation": "Input distribution alert is not proof of deteriorated accuracy. Shifted inputs have no valid counterfactual outcomes."}
