# Public source and transformations

- Dataset: **Productivity Prediction of Garment Employees**, UCI 597, 2020.
- Source: https://archive.ics.uci.edu/dataset/597/productivity+prediction+of+garment+employees
- DOI / attribution: Productivity Prediction of Garment Employees [Dataset]. (2020). UCI Machine Learning Repository. https://doi.org/10.24432/C51S6D
- Public ZIP: https://archive.ics.uci.edu/static/public/597/productivity%2Bprediction%2Bof%2Bgarment%2Bemployees.zip
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- Bundled original: `garments_worker_productivity.csv`, unchanged 1,197 rows ×15 columns, SHA-256 `763ffcdd39b7f7f360243c2af8f89ed733e8b5f9e511efeb0c886b83e1b76866`.

The small original was copied from the portfolio's previously attributed source bundle and independently verified against the same original SHA-256. Normal operation requires no download or other project. UCI describes manually collected garment-production records; these are historical team-level observations, not individual worker records or current factory telemetry.

Dates are parsed as month/day/year. Add a one-based source-row ID, stably sort by date/source row, trim department labels and normalize `sweing` to `sewing`. No observation is dropped or duplicated. Preserve fractional worker counts. All selected fields are present; the excluded WIP column has 506 missing entries. There are 37 actual-productivity labels above the metadata's documented 0–1 range, maximum 1.1204375. Preserve and disclose them rather than clipping/removing them.

Only targeted productivity, standard minute value, reported worker count and department enter models. Their availability before a shift is a stated teaching assumption; source timestamps do not prove it. No target-derived columns, overtime, incentives, idle measures, team IDs, WIP, style-change measures or calendar labels enter prediction.

Split all 59 distinct dates once: first 35 dates / 711 rows for training, next 12 / 232 for validation, final 12 / 254 for replay. The forest's random state is 42; no randomized row split is used. The seed does not apply to this public data's collection.

`policy.json` contains authored teaching thresholds, not empirical industrial standards. The only synthetic input-fault scenario multiplies replay SMV by 1.8. It has no valid changed outcomes, so its actual labels are hidden and no error score is computed. No synthetic observations replace the unchanged historical evaluation.
