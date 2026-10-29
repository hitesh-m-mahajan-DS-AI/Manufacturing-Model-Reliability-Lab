import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Database,
  FlaskConical,
  GitBranch,
  History,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Snapshot, Model, Prediction, Replay } from "./types";

const navigation = [
  { id: "overview", label: "Lab overview", icon: Layers3 },
  { id: "data", label: "Dataset contract", icon: Database },
  { id: "experiments", label: "Experiments", icon: FlaskConical },
  { id: "release", label: "Release console", icon: GitBranch },
  { id: "monitor", label: "Replay monitor", icon: Activity },
  { id: "audit", label: "Audit & architecture", icon: History },
];
const fmt = (value: number, digits = 4) =>
  value.toLocaleString("en-GB", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const date = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) + " UTC";
const short = (value: string) =>
  value.length > 25 ? value.slice(0, 22) + "…" : value;
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Section({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lead">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={"panel " + className}>{children}</section>;
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function GateList({ model }: { model: Model }) {
  return (
    <ul className="gate-list">
      {model.checks.map((c) => (
        <li key={c.name}>
          <span className={c.passed ? "pass" : "fail"}>
            {c.passed ? <Check size={14} /> : <X size={14} />}
          </span>
          <div>
            <b>{c.name}</b>
            <small>{c.detail}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}
function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const high = Math.max(...values, 0.01) * 1.15,
    w = 760,
    h = 180,
    p = 32;
  const points = values.map((v, i) => [
    p + (i * (w - 2 * p)) / Math.max(1, values.length - 1),
    h - p - (v / high) * (h - 2 * p),
  ]);
  return (
    <svg
      className="line-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Daily mean absolute prediction error on replay dates"
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={p}
            y1={h - p - f * (h - 2 * p)}
            x2={w - p}
            y2={h - p - f * (h - 2 * p)}
            stroke="#e4e5e8"
          />
          <text
            x={0}
            y={h - p - f * (h - 2 * p) + 4}
            fontSize="10"
            fill="#747b87"
          >
            {(high * f).toFixed(2)}
          </text>
        </g>
      ))}
      <polyline
        points={points.map((q) => q.join(",")).join(" ")}
        fill="none"
        stroke="#b66a22"
        strokeWidth="2.5"
      />
      {points.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.6" fill="#b66a22">
            <title>
              {labels[i]}: {fmt(values[i])}
            </title>
          </circle>
          {(i === 0 || i === points.length - 1 || i % 3 === 0) && (
            <text
              x={x}
              y={h - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#747b87"
            >
              {labels[i].slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function App() {
  const [page, setPage] = useState(
    navigation.some((n) => n.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "overview",
  );
  const [lab, setLab] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedModel, setSelectedModel] = useState("forest");
  const [replay, setReplay] = useState<Replay | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [shift, setShift] = useState(false);
  const [labels, setLabels] = useState(true);
  const [inputs, setInputs] = useState({
    targeted_productivity: "0.8",
    smv: "26",
    no_of_workers: "56",
    department: "sewing",
  });

  async function request(path: string, body?: unknown) {
    const response = await fetch(
      "/api/" + path,
      body === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail
                .map(
                  (d: { loc: string[]; msg: string }) =>
                    d.loc.slice(1).join(".") + ": " + d.msg,
                )
                .join("; ")
            : "The local request failed.",
      );
    return data;
  }
  async function refresh() {
    const next = (await request("lab")) as Snapshot;
    setLab(next);
    setReplay((current) => current || next.replays[0] || null);
    return next;
  }
  useEffect(() => {
    refresh().catch((e) => setError(String(e.message)));
    const handler = () => {
      const id = location.hash.slice(1);
      if (navigation.some((n) => n.id === id)) setPage(id);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  function go(next: string) {
    location.hash = next;
    setPage(next);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0 });
  }
  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function release(model: Model) {
    await act("Releasing model", async () => {
      await request("release", {
        version: model.version,
        expected_generation: lab!.state.generation,
      });
      setNotice(
        "Released " +
          model.version +
          ". New predictions now identify this version.",
      );
    });
  }
  async function rollback() {
    await act("Restoring previous version", async () => {
      await request("rollback", { expected_generation: lab!.state.generation });
      setNotice("Rollback complete. The previous verified artifact is active.");
    });
  }
  async function runReplay() {
    await act("Replaying 12 historical dates", async () => {
      const result = (await request("replay", {
        shifted: shift,
        labels,
      })) as Replay;
      setReplay(result);
      setNotice(
        "Saved " +
          result.id +
          ". This is historical replay, not live factory telemetry.",
      );
    });
  }
  async function predict() {
    await act("Checking prediction request", async () => {
      if (Object.values(inputs).some((v) => v.trim() === ""))
        throw new Error("Complete every prediction field.");
      const result = (await request("predict", {
        targeted_productivity: Number(inputs.targeted_productivity),
        smv: Number(inputs.smv),
        no_of_workers: Number(inputs.no_of_workers),
        department: inputs.department,
      })) as Prediction;
      setPrediction(result);
      setNotice(
        "Prediction returned with model version and artifact fingerprint.",
      );
    });
  }
  const activeNav = navigation.find((n) => n.id === page) || navigation[0];
  if (!lab)
    return (
      <div className="loading">
        <Box size={36} />
        <h1>Opening Model Foundry</h1>
        <p>
          {error ||
            "Validating the dataset and preparing the first local comparison…"}
        </p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  const { state, experiment, data } = lab;
  const model =
    experiment.models.find((m) => m.kind === selectedModel) ||
    experiment.models[0];
  const recommended = experiment.models.find(
    (m) => m.version === experiment.selected_version,
  )!;
  const baseline = experiment.models[0];
  const improvement =
    ((baseline.validation.mae - recommended.validation.mae) /
      baseline.validation.mae) *
    100;
  const showBusy = !!busy;
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Layers3 size={23} />
          </div>
          <div>
            MODEL FOUNDRY<small>RELIABILITY LAB / F3</small>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item, i) => (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              className={page === item.id ? "selected" : ""}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              <small>{String(i + 1).padStart(2, "0")}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={23} />
          <b>Evidence before release.</b>
          <p>
            One dataset. Fixed models.
            <br />
            An inspectable lifecycle.
          </p>
          <span className="status-dot" /> LOCAL CPU WORKSPACE
        </div>
        <div className="author">
          <span>HM</span>
          <div>
            Hitesh M. Mahajan<small>ML engineering / operations</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div>
            <span className="breadcrumb">Manufacturing</span>
            <ChevronRight size={13} />
            <b>{activeNav.label}</b>
          </div>
          <div>
            <span className="status-dot" />
            <span>Local workspace</span>
            <Badge>UCI / HISTORICAL DATA</Badge>
          </div>
        </header>
        <main id="main">
          {busy && (
            <div className="banner processing" role="status">
              <Loader2 className="spin" size={16} />
              {busy}…
            </div>
          )}
          {error && (
            <div className="banner error" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner success" role="status">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {page === "overview" && (
            <>
              <Section
                eyebrow="MODEL LIFECYCLE / OVERVIEW"
                title="Build trust into every release."
                description="From a validated dataset to a versioned prediction. Inspect the evidence, release deliberately, and know how to go back."
                action={
                  <button className="primary" onClick={() => go("experiments")}>
                    Inspect comparison <ArrowRight size={16} />
                  </button>
                }
              />
              <div className="hero-grid">
                <section className="hero">
                  <div>
                    <Badge tone="amber">
                      MANUFACTURING MODEL RELIABILITY LAB
                    </Badge>
                    <h2>
                      A better validation score
                      <br />
                      is only the beginning.
                    </h2>
                    <p>
                      Compare a mean fallback, a linear incumbent and a forest
                      candidate. Release checks, replay evidence and rollback
                      share one traceable workflow.
                    </p>
                    <button onClick={() => go("release")}>
                      Open release console <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="model-graphic" aria-hidden="true">
                    <div className="orbit o1" />
                    <div className="orbit o2" />
                    <div className="graphic-node node1">
                      <Database size={20} />
                    </div>
                    <div className="graphic-node node2">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="graphic-node node3">
                      <Activity size={20} />
                    </div>
                    <div className="graphic-core">
                      <Box size={34} />
                      <span>
                        VERIFIED
                        <br />
                        ARTIFACT
                      </span>
                    </div>
                  </div>
                </section>
                <Panel className="active-card">
                  <div className="panel-top">
                    <p className="eyebrow">CURRENT DEPLOYMENT</p>
                    <Badge tone="green">ACTIVE</Badge>
                  </div>
                  <Box size={30} />
                  <h3>
                    {state.active.split("-")[0] === "mean"
                      ? "Mean fallback"
                      : state.active.split("-")[0] === "ridge"
                        ? "Ridge incumbent"
                        : "Forest candidate"}
                  </h3>
                  <code>{state.active}</code>
                  <div className="keyline">
                    <span>Release generation</span>
                    <b>{state.generation}</b>
                  </div>
                  <div className="keyline">
                    <span>Previous version</span>
                    <b>{state.previous ? short(state.previous) : "None yet"}</b>
                  </div>
                  <button className="text-button" onClick={() => go("release")}>
                    Inspect release history <ArrowRight size={14} />
                  </button>
                </Panel>
              </div>
              <div className="metrics">
                <Metric
                  label="Validated source rows"
                  value={data.rows.toLocaleString()}
                  note={`${data.dates} distinct production dates`}
                />
                <Metric
                  label="Best eligible validation MAE"
                  value={fmt(recommended.validation.mae)}
                  note={recommended.title}
                />
                <Metric
                  label="Against mean fallback"
                  value={`${fmt(improvement, 1)}%`}
                  note="Lower validation MAE; not business savings"
                />
                <Metric
                  label="Release policy"
                  value="v1.0"
                  note="Frozen before replay evaluation"
                />
              </div>
              <div className="panel-top workflow-title">
                <h2>One complete engineering loop.</h2>
                <span>Follow the evidence, step by step</span>
              </div>
              <div className="workflow">
                {[
                  {
                    title: "Validate",
                    text: "Check source, schema and date boundaries.",
                    page: "data",
                    icon: Database,
                  },
                  {
                    title: "Compare",
                    text: "Train three fixed models; inspect validation.",
                    page: "experiments",
                    icon: FlaskConical,
                  },
                  {
                    title: "Release",
                    text: "Pass the gate and update the local version.",
                    page: "release",
                    icon: GitBranch,
                  },
                  {
                    title: "Observe",
                    text: "Replay later records; inspect shift and errors.",
                    page: "monitor",
                    icon: Activity,
                  },
                ].map((item, i) => (
                  <button
                    className="step"
                    key={item.title}
                    onClick={() => go(item.page)}
                  >
                    <span className="step-number">0{i + 1}</span>
                    <item.icon size={22} />
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
              <div className="footnote">
                <CircleHelp size={16} />
                <span>
                  A local engineering demonstration on historical team-level
                  data. No individual worker scoring, real-time monitoring or
                  autonomous production release.
                </span>
              </div>
            </>
          )}
          {page === "data" && (
            <>
              <Section
                eyebrow="01 / DATASET CONTRACT"
                title="Know what enters the model."
                description="An unchanged public source, a short feature allowlist and three non-overlapping date partitions."
              />
              <div className="metrics">
                <Metric
                  label="Source records"
                  value="1,197"
                  note="UCI garment-productivity dataset"
                />
                <Metric
                  label="Selected inputs"
                  value="4"
                  note="Three numeric + department"
                />
                <Metric
                  label="Labels above 1"
                  value={String(data.target_above_one)}
                  note="Retained; source metadata says 0–1"
                />
                <Metric
                  label="Missing excluded WIP"
                  value={String(data.missing_excluded_wip)}
                  note="WIP is never a model feature"
                />
              </div>
              <Panel>
                <div className="panel-top">
                  <h2>Dates separate the evidence.</h2>
                  <Badge tone="green">NO DATE OVERLAP</Badge>
                </div>
                <div className="split-track">
                  {data.splits.map((s) => (
                    <div
                      key={s.name}
                      className={"split " + s.name.toLowerCase()}
                      style={{ flex: s.dates }}
                    >
                      <b>{s.name}</b>
                      <span>
                        {s.dates} dates / {s.rows} rows
                      </span>
                    </div>
                  ))}
                </div>
                <div className="split-details">
                  {data.splits.map((s) => (
                    <div key={s.name}>
                      <h3>{s.name}</h3>
                      <p>
                        {s.start} → {s.end}
                      </p>
                      <small>
                        {s.name === "Train"
                          ? "Preprocessing and model fitting"
                          : s.name === "Validation"
                            ? "Release eligibility and fixed comparison"
                            : "Historical replay only after freeze"}
                      </small>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="two-col">
                <Panel>
                  <p className="eyebrow">ALLOWED FEATURES</p>
                  <h2>Plausible planning inputs.</h2>
                  {data.features.map((f) => (
                    <div className="keyline" key={f}>
                      <code>{f}</code>
                      <CheckCircle2 size={15} className="pass-text" />
                    </div>
                  ))}
                  <p className="muted">
                    Feature timing is assumed, not verified from source
                    timestamps. Department spelling variants are normalized.
                    Fractional worker counts and target values above one are
                    retained.
                  </p>
                </Panel>
                <Panel>
                  <p className="eyebrow">EXCLUDED FROM MODELLING</p>
                  <h2>Keep outcomes out of inputs.</h2>
                  <p className="muted">
                    Actual productivity is the label. WIP, overtime, incentives,
                    idle time, idle workers, team identifiers and style-change
                    measures are excluded. No target-derived feature enters a
                    prediction.
                  </p>
                  <p className="muted">
                    Targeted productivity may reflect managerial knowledge. This
                    is a teaching assumption, not proof of availability before a
                    shift.
                  </p>
                  <a
                    className="text-button"
                    href="https://archive.ics.uci.edu/dataset/597/productivity+prediction+of+garment+employees"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the UCI data description <ArrowRight size={14} />
                  </a>
                </Panel>
              </div>
              <Panel>
                <div className="panel-top">
                  <h2>Source preview</h2>
                  <span>First eight chronological records</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Source row",
                          "Date",
                          "Target",
                          "SMV",
                          "Workers",
                          "Department",
                          "Actual",
                        ].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sample.map((row) => (
                        <tr key={String(row.source_row)}>
                          <td>{String(row.source_row)}</td>
                          <td>{String(row.date).slice(0, 10)}</td>
                          {[
                            "targeted_productivity",
                            "smv",
                            "no_of_workers",
                            "department",
                            "actual_productivity",
                          ].map((f) => (
                            <td key={f}>
                              {typeof row[f] === "number"
                                ? fmt(row[f] as number, 3)
                                : String(row[f])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="hash">
                  <b>Source SHA-256</b>
                  <code>{data.source_sha256}</code>
                </div>
              </Panel>
            </>
          )}
          {page === "experiments" && (
            <>
              <Section
                eyebrow="02 / FIXED MODEL COMPARISON"
                title="Compare before you promote."
                description="All models fit the same training dates. Only validation errors determine release eligibility; no search or tuning uses replay outcomes."
                action={
                  <button
                    disabled={showBusy}
                    className="secondary"
                    onClick={() =>
                      act("Training a fresh fixed comparison", async () => {
                        await request("train", {});
                        setNotice(
                          "New experiment frozen. Existing deployment was preserved.",
                        );
                      })
                    }
                  >
                    <RefreshCw size={15} /> Train fresh comparison
                  </button>
                }
              />
              <div className="experiment-strip">
                <div>
                  <span>EXPERIMENT</span>
                  <code>{experiment.id}</code>
                </div>
                <div>
                  <span>FROZEN</span>
                  <b>{date(experiment.frozen_at)}</b>
                </div>
                <div>
                  <span>FIT + TRACK</span>
                  <b>{fmt(experiment.duration_seconds, 2)} s</b>
                </div>
                <div>
                  <span>RECOMMENDED</span>
                  <b>{recommended.title}</b>
                </div>
              </div>
              <div className="model-grid">
                {experiment.models.map((m) => (
                  <button
                    key={m.kind}
                    className={
                      "model-card " + (model.kind === m.kind ? "chosen" : "")
                    }
                    onClick={() => setSelectedModel(m.kind)}
                  >
                    <div className="panel-top">
                      <Box size={20} />
                      <Badge tone={m.eligible ? "green" : "red"}>
                        {m.eligible ? "ELIGIBLE" : "BLOCKED"}
                      </Badge>
                    </div>
                    <h3>{m.title}</h3>
                    <p>
                      {m.kind === "mean"
                        ? "Training target mean"
                        : m.kind === "ridge"
                          ? "Ridge α=1.0"
                          : "80 trees · depth 6 · min leaf 8"}
                    </p>
                    <strong>{fmt(m.validation.mae)}</strong>
                    <span>VALIDATION MAE</span>
                    <div className="model-bar">
                      <i
                        style={{
                          width: `${(m.validation.mae / baseline.validation.mae) * 85}%`,
                        }}
                      />
                    </div>
                    <div className="keyline">
                      <span>RMSE</span>
                      <b>{fmt(m.validation.rmse)}</b>
                    </div>
                    <div className="keyline">
                      <span>R²</span>
                      <b>{fmt(m.validation.r2, 3)}</b>
                    </div>
                  </button>
                ))}
              </div>
              <div className="two-col">
                <Panel>
                  <div className="panel-top">
                    <h2>{model.title}: release checks</h2>
                    <Badge tone={model.eligible ? "green" : "red"}>
                      {model.checks.filter((c) => c.passed).length}/
                      {model.checks.length} PASSED
                    </Badge>
                  </div>
                  <GateList model={model} />
                </Panel>
                <Panel>
                  <p className="eyebrow">SLICE CHECKS / VALIDATION</p>
                  <h2>Look beyond the average.</h2>
                  {model.departments.map((d) => (
                    <div className="department" key={d.department}>
                      <div>
                        <b>{d.department}</b>
                        <span>{d.rows} rows</span>
                        <strong>{fmt(d.mae)} MAE</strong>
                      </div>
                      <div className="slice-bar">
                        <i
                          style={{
                            width: `${Math.min((d.mae / 0.3) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="muted">
                    These are department slices, not individual outcomes or a
                    fairness assessment. Small samples and the short observation
                    period limit interpretation.
                  </p>
                  <div className="hash">
                    <b>Actual MLflow run</b>
                    <code>{model.mlflow_run_id}</code>
                    <small>
                      Metrics, parameters, model and validation report logged
                      locally.
                    </small>
                  </div>
                </Panel>
              </div>
              <Panel>
                <h2>Frozen provenance</h2>
                <div className="hash">
                  <b>Policy fingerprint</b>
                  <code>{experiment.policy_sha256}</code>
                  <b>Engine fingerprint</b>
                  <code>{experiment.engine_sha256}</code>
                </div>
                <p className="muted">
                  A new comparison uses the same fixed models and split.
                  Repeating an experiment does not create new unseen evidence.
                  The mean fallback follows a minimal finite-output/artifact
                  gate; learned models face additional error and sample
                  requirements.
                </p>
              </Panel>
            </>
          )}
          {page === "release" && (
            <>
              <Section
                eyebrow="03 / LOCAL RELEASE CONTROL"
                title="A version you can trace. A way back."
                description="Release only an eligible, hash-checked artifact. Each change increments a generation and appends an audit event."
                action={
                  <button
                    disabled={showBusy || !state.previous}
                    className="secondary"
                    onClick={rollback}
                  >
                    <RotateCcw size={15} /> Roll back to previous
                  </button>
                }
              />
              <div className="deployment">
                <div>
                  <Badge tone="green">
                    ACTIVE / GENERATION {state.generation}
                  </Badge>
                  <h2>{state.active}</h2>
                  <p>All new inference requests use this local version.</p>
                </div>
                <ArrowRight size={25} />
                <div>
                  <span className="eyebrow">PREVIOUS VERIFIED VERSION</span>
                  <h3>{state.previous || "No previous release yet"}</h3>
                  <p>Rollback checks its artifact again before restoring it.</p>
                </div>
              </div>
              <Panel>
                <div className="panel-top">
                  <h2>Choose a release from the latest comparison.</h2>
                  <span>Validation eligibility is frozen</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Model / version</th>
                        <th>Validation MAE</th>
                        <th>Gate</th>
                        <th>Local action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {experiment.models.map((m) => (
                        <tr key={m.version}>
                          <td>
                            <b>{m.title}</b>
                            <code className="subcode">{m.version}</code>
                          </td>
                          <td>{fmt(m.validation.mae)}</td>
                          <td>
                            <Badge tone={m.eligible ? "green" : "red"}>
                              {m.eligible ? "ELIGIBLE" : "BLOCKED"}
                            </Badge>
                          </td>
                          <td>
                            <button
                              className={
                                m.version === state.active
                                  ? "secondary"
                                  : "primary"
                              }
                              disabled={
                                showBusy ||
                                !m.eligible ||
                                m.version === state.active
                              }
                              onClick={() => release(m)}
                            >
                              {m.version === state.active
                                ? "Active"
                                : "Release locally"}
                              <ArrowRight size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <div className="two-col">
                <Panel>
                  <p className="eyebrow">VERSIONED INFERENCE / API</p>
                  <h2>Send a planning-input request.</h2>
                  <div className="input-grid">
                    {[
                      ["targeted_productivity", "Target productivity", "0.01"],
                      ["smv", "SMV / allocated minutes", "0.1"],
                      ["no_of_workers", "Reported worker count", "0.5"],
                    ].map(([key, label, step]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          step={step}
                          value={inputs[key as keyof typeof inputs]}
                          onChange={(e) =>
                            setInputs({ ...inputs, [key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Department
                      <select
                        value={inputs.department}
                        onChange={(e) =>
                          setInputs({ ...inputs, department: e.target.value })
                        }
                      >
                        <option value="sewing">sewing</option>
                        <option value="finishing">finishing</option>
                      </select>
                    </label>
                  </div>
                  <button
                    className="primary"
                    disabled={showBusy}
                    onClick={predict}
                  >
                    Request prediction <Play size={14} />
                  </button>
                  <p className="muted">
                    The API rejects unknown fields, nonfinite values, invalid
                    departments and values outside its broad input contract. It
                    does not infer availability at planning time.
                  </p>
                </Panel>
                <Panel className="prediction-card">
                  <p className="eyebrow">INFERENCE RESPONSE</p>
                  {prediction ? (
                    <>
                      <strong>{fmt(prediction.prediction)}</strong>
                      <span>Source productivity ratio</span>
                      <div className="keyline">
                        <span>Model</span>
                        <code>{prediction.model_version}</code>
                      </div>
                      <div className="keyline">
                        <span>Generation</span>
                        <b>{prediction.generation}</b>
                      </div>
                      <div className="keyline">
                        <span>Request duration</span>
                        <b>{fmt(prediction.duration_ms, 2)} ms</b>
                      </div>
                      <div className="hash">
                        <b>Artifact SHA-256</b>
                        <code>{prediction.artifact_sha256}</code>
                      </div>
                      {prediction.generation !== state.generation && (
                        <p className="inline-warning">
                          Saved response from an earlier generation. Request
                          again to verify the active version.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="empty">
                      <Box size={32} />
                      <h3>Every prediction carries its identity.</h3>
                      <p>
                        Submit the sample inputs to inspect the version,
                        fingerprint and measured request duration.
                      </p>
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
          {page === "monitor" && (
            <>
              <Section
                eyebrow="04 / POST-FREEZE HISTORICAL REPLAY"
                title="Observe errors. Investigate change."
                description="Replay the final 12 production dates against the active version. Feature alerts and observed model errors answer different questions."
              />
              <Panel className="replay-controls">
                <div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={shift}
                      onChange={(e) => setShift(e.target.checked)}
                    />{" "}
                    Inject synthetic SMV ×1.8 fault
                  </label>
                  <small>
                    Input-only experiment; original outcomes are not valid
                    labels after this change.
                  </small>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={labels}
                    disabled={shift}
                    onChange={(e) => setLabels(e.target.checked)}
                  />{" "}
                  Reveal recorded outcomes
                </label>
                <button
                  disabled={showBusy}
                  className="primary"
                  onClick={runReplay}
                >
                  <Play size={15} /> Run historical replay
                </button>
              </Panel>
              {replay ? (
                <>
                  {(replay.synthetic_shift !== shift ||
                    replay.labels_available !== (labels && !shift)) && (
                    <p className="inline-warning">
                      Controls changed. The saved report below keeps its
                      original settings until you run a new replay.
                    </p>
                  )}
                  <div className="report-strip">
                    <span>
                      <Badge
                        tone={replay.synthetic_shift ? "amber" : "neutral"}
                      >
                        {replay.synthetic_shift
                          ? "SYNTHETIC INPUT FAULT"
                          : "UNCHANGED HISTORICAL RECORDS"}
                      </Badge>
                    </span>
                    <code>{replay.model_version}</code>
                    <span>{date(replay.created)}</span>
                    <div className="exports">
                      <a href={`/api/replays/${replay.id}/export/md`}>
                        <ArrowDownToLine size={13} /> Brief
                      </a>
                      <a href={`/api/replays/${replay.id}/export/csv`}>CSV</a>
                      <a href={`/api/replays/${replay.id}/export/json`}>JSON</a>
                    </div>
                  </div>
                  {replay.model_version !== state.active && (
                    <p className="inline-warning">
                      This saved replay used {replay.model_version}. The active
                      version is now {state.active}.
                    </p>
                  )}
                  <div className="metrics">
                    <Metric
                      label="Replay records"
                      value={String(replay.rows)}
                      note="12 chronological date batches"
                    />
                    <Metric
                      label="Observed replay MAE"
                      value={
                        replay.metrics ? fmt(replay.metrics.mae) : "Unavailable"
                      }
                      note={
                        replay.labels_available
                          ? "Recorded outcomes revealed"
                          : "No valid outcome labels for scoring"
                      }
                    />
                    <Metric
                      label="Feature alerts"
                      value={`${replay.drift.filter((d) => d.alert).length} / 3`}
                      note="PSI ≥0.20; illustrative threshold"
                    />
                    <Metric
                      label="Replay request"
                      value={`${fmt(replay.duration_ms, 0)} ms`}
                      note="Includes artifact load, inference and diagnostics"
                    />
                  </div>
                  <Panel>
                    <div className="panel-top">
                      <h2>Prediction error across replay dates</h2>
                      <span>MAE / source productivity ratio</span>
                    </div>
                    {replay.metrics ? (
                      <LineChart
                        values={replay.batches.map((b) => b.metrics!.mae)}
                        labels={replay.batches.map((b) => b.date)}
                      />
                    ) : (
                      <div className="empty">
                        <CircleHelp size={30} />
                        <h3>Error cannot be measured without valid labels.</h3>
                        <p>
                          Input shift and prediction distributions remain
                          observable. No accuracy or error is claimed for this
                          replay.
                        </p>
                      </div>
                    )}
                  </Panel>
                  <div className="drift-grid">
                    {replay.drift.map((d) => (
                      <Panel key={d.feature}>
                        <div className="panel-top">
                          <code>{d.feature}</code>
                          <Badge tone={d.alert ? "amber" : "green"}>
                            {d.alert ? "INVESTIGATE" : "BELOW THRESHOLD"}
                          </Badge>
                        </div>
                        <strong className="psi">
                          {fmt(d.psi, 3)}
                          <small>PSI</small>
                        </strong>
                        <div className="keyline">
                          <span>Training mean</span>
                          <b>{fmt(d.reference_mean, 2)}</b>
                        </div>
                        <div className="keyline">
                          <span>Replay mean</span>
                          <b>{fmt(d.batch_mean, 2)}</b>
                        </div>
                        <div className="keyline">
                          <span>Outside train range</span>
                          <b>
                            {d.out_of_training_range} / {replay.rows}
                          </b>
                        </div>
                      </Panel>
                    ))}
                  </div>
                  <Panel>
                    <div className="panel-top">
                      <h2>Batch ledger</h2>
                      <span>Same frozen model throughout each replay</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Production date</th>
                            <th>Rows</th>
                            <th>Observed MAE</th>
                            <th>Prediction mean</th>
                            <th>Input alerts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replay.batches.map((b) => (
                            <tr key={b.date}>
                              <td>{b.date}</td>
                              <td>{b.rows}</td>
                              <td>
                                {b.metrics
                                  ? fmt(b.metrics.mae)
                                  : "No valid labels"}
                              </td>
                              <td>{fmt(b.prediction_mean)}</td>
                              <td>
                                {b.drift.filter((d) => d.alert).length} / 3
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              ) : (
                <Panel className="empty">
                  <Activity size={34} />
                  <h2>Replay later dates when you are ready.</h2>
                  <p>
                    The training and validation windows remain separate. Release
                    a model first, or inspect the mean fallback currently
                    active.
                  </p>
                </Panel>
              )}
              {lab.replays.length > 0 && (
                <Panel>
                  <h2>Saved replays</h2>
                  <div className="saved-replays">
                    {lab.replays.slice(0, 8).map((r) => (
                      <button
                        key={r.id}
                        className={r.id === replay?.id ? "selected" : ""}
                        onClick={() => setReplay(r)}
                      >
                        <b>
                          {r.synthetic_shift
                            ? "Synthetic fault"
                            : "Historical replay"}
                        </b>
                        <code>{r.model_version}</code>
                        <span>{date(r.created)}</span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                </Panel>
              )}
              <div className="footnote">
                <TriangleAlert size={16} />
                <span>
                  PSI uses training quantile bins and a 1e-6 floor. Small daily
                  batches can produce large values. It is a diagnostic, not a
                  statistical significance test or evidence of deteriorated
                  accuracy.
                </span>
              </div>
            </>
          )}
          {page === "audit" && (
            <>
              <Section
                eyebrow="05 / INSPECTABLE ENGINEERING"
                title="Keep the lifecycle accountable."
                description="Local experiment tracking, verified artifacts and a durable release ledger. Evidence remains inspectable after a restart."
                action={
                  <a className="button secondary" href="/api/export/audit">
                    <ArrowDownToLine size={15} /> Export audit JSON
                  </a>
                }
              />
              <Panel>
                <p className="eyebrow">SYSTEM / SINGLE-ORIGIN LOCAL APP</p>
                <div className="architecture">
                  {[
                    {
                      icon: Layers3,
                      title: "React + TypeScript",
                      text: "Six workflow sections",
                    },
                    {
                      icon: GitBranch,
                      title: "FastAPI lifecycle",
                      text: "Schema + generation checks",
                    },
                    {
                      icon: Box,
                      title: "scikit-learn artifacts",
                      text: "Train-only transforms",
                    },
                    {
                      icon: Database,
                      title: "SQLite + MLflow",
                      text: "State, runs and artifacts",
                    },
                  ].map((item, i) => (
                    <div key={item.title}>
                      <item.icon size={23} />
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                      {i < 3 && <ArrowRight size={16} />}
                    </div>
                  ))}
                </div>
                <p className="muted">
                  MLflow's Python tracking client writes real run metadata to a
                  local SQLite backend and artifacts to local files. This app
                  implements the release registry itself; it does not claim to
                  use MLflow Model Registry or host an MLflow UI server.
                </p>
                <a
                  className="text-button"
                  href="/openapi.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect the actual API contract <ArrowRight size={14} />
                </a>
              </Panel>
              <div className="two-col">
                <Panel>
                  <h2>Controls that matter</h2>
                  <ul className="plain-list">
                    <li>Unchanged source bytes verified with SHA-256.</li>
                    <li>
                      No date crosses the train/validation/replay boundaries.
                    </li>
                    <li>
                      Policy, source and model-engine fingerprints are frozen.
                    </li>
                    <li>
                      Model hashes are rechecked before inference, release and
                      rollback.
                    </li>
                    <li>Stale release generations receive HTTP 409.</li>
                    <li>Invalid prediction fields receive HTTP 422.</li>
                    <li>
                      Rollback atomically restores a verified previous version.
                    </li>
                  </ul>
                </Panel>
                <Panel>
                  <h2>Limits worth explaining</h2>
                  <p className="muted">
                    Historical team-level observations from 2015, limited input
                    timing evidence and 37 labels above the documented range
                    constrain the business interpretation.
                  </p>
                  <p className="muted">
                    No live data feed, cloud deployment, multi-user
                    authentication, automatic retraining, causal productivity
                    claim or worker-level decision is included. Saved local
                    audit events are append-only through the API, but not
                    tamper-proof against the machine owner.
                  </p>
                  <div className="hash">
                    <b>Local MLflow backend</b>
                    <code>{experiment.tracking_uri}</code>
                  </div>
                </Panel>
              </div>
              <Panel>
                <div className="panel-top">
                  <h2>Lifecycle ledger</h2>
                  <button
                    className="text-button"
                    disabled={showBusy}
                    onClick={() =>
                      act("Refreshing ledger", async () => {
                        await refresh();
                      })
                    }
                  >
                    <RefreshCw size={14} /> Refresh
                  </button>
                </div>
                <div className="ledger">
                  {lab.events.map((event) => (
                    <div key={event.id}>
                      <span className="event-marker" />
                      <div>
                        <b>{event.action.replaceAll("_", " ")}</b>
                        <p>
                          {date(event.created)} · event #{event.id}
                        </p>
                        <code>{JSON.stringify(event.payload)}</code>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Latest 100 events shown. Local state is persisted under this
                  project's ignored runtime directory. Trained artifacts are
                  created locally; never load untrusted joblib files.
                </p>
              </Panel>
            </>
          )}
        </main>
        <footer>
          <span>Hitesh Milind Mahajan / Model Foundry</span>
          <span>Historical data · Local execution · Inspectable evidence</span>
        </footer>
      </div>
    </div>
  );
}
