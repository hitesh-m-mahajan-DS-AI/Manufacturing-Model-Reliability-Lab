export type Metrics = { mae: number; rmse: number; r2: number };
export type Check = { name: string; passed: boolean; detail: string };
export type Model = {
  version: string;
  kind: string;
  title: string;
  eligible: boolean;
  validation: Metrics;
  checks: Check[];
  departments: { department: string; rows: number; mae: number }[];
  artifact_sha256: string;
  mlflow_run_id: string;
  fit_and_log_seconds: number;
};
export type Experiment = {
  id: string;
  frozen_at: string;
  selected_version: string;
  models: Model[];
  policy_sha256: string;
  source_sha256: string;
  engine_sha256: string;
  duration_seconds: number;
  tracking_uri: string;
};
export type Drift = {
  feature: string;
  psi: number;
  alert: boolean;
  reference_mean: number;
  batch_mean: number;
  out_of_training_range: number;
};
export type Batch = {
  date: string;
  rows: number;
  metrics: Metrics | null;
  drift: Drift[];
  prediction_mean: number;
};
export type Replay = {
  id: string;
  created: string;
  model_version: string;
  generation: number;
  synthetic_shift: boolean;
  labels_available: boolean;
  metrics: Metrics | null;
  rows: number;
  drift: Drift[];
  batches: Batch[];
  duration_ms: number;
  interpretation: string;
};
export type LabState = {
  active: string;
  previous: string | null;
  generation: number;
};
export type Prediction = {
  prediction: number;
  model_version: string;
  generation: number;
  artifact_sha256: string;
  duration_ms: number;
  unit: string;
};
export type Snapshot = {
  state: LabState;
  experiment: Experiment;
  policy: { psi_alert_threshold: number; [key: string]: unknown };
  data: {
    rows: number;
    dates: number;
    target_above_one: number;
    missing_excluded_wip: number;
    exact_source_duplicates: number;
    target_max: number;
    features: string[];
    source_sha256: string;
    splits: {
      name: string;
      rows: number;
      dates: number;
      start: string;
      end: string;
    }[];
    sample: Record<string, unknown>[];
  };
  events: {
    id: number;
    created: string;
    action: string;
    payload: Record<string, unknown>;
  }[];
  replays: Replay[];
};
