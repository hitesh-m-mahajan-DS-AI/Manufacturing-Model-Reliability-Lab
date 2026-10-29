# Explain this project in an interview

## Thirty-second introduction

I built a local model-lifecycle application for manufacturing productivity. It goes beyond a regression notebook: it validates a public dataset, compares three fixed models on separate dates, logs real MLflow runs, enforces release checks, serves version-stamped predictions, replays later records and verifies rollback. I kept the model mistakes and data limitations visible. Ridge slightly beat the selected forest on later MAE, which is a useful reminder that validation rank does not guarantee future rank.

## Three-minute walkthrough

1. **Overview:** identify the active model/generation and the validation recommendation. Explain that they are different concepts.
2. **Dataset contract:** show711/232/254 rows across 35/12/12 dates. Explain why the same date never appears on both sides. Point out 37 labels above the documented range and unverified input timing.
3. **Experiments:** select each model. Show the fixed parameters, validation/department scores, gate checklist and actual local MLflow run ID. No parameter search used later data.
4. **Release console:** release Ridge if needed, request the sample prediction, then release the forest. Observe that the old displayed prediction keeps its original version and stale-generation notice. Request again to verify the change.
5. **Replay monitor:** run unchanged history with outcomes, inspect per-date errors and PSI, then inject the labelled SMV fault. The altered inputs cannot use the old outcomes for an accuracy claim.
6. **Rollback:** restore the previous model and request identical inputs. Verify model ID, hash and exact prediction match while generation increases.
7. **Audit:** inspect state changes and export local evidence. Explain why an append-only API ledger is not tamper-proof against a machine owner.

## Questions to prepare for

- **Why this split?** A fixed chronological date split approximates later-date evaluation without mixing team observations from the same date across partitions. One short window is limited; real work would need rolling backtests and independent future dates.
- **Why not pick Ridge after the replay?** Forest was selected before replay on a declared validation rule. Its later MAE was 0.1059 versus Ridge 0.1052; the forest's later RMSE was lower. I report both and do not retune or change the rule to flatter the result. Another independent period is needed for a new comparison.
- **What does the gate prove?** Compliance with this authored validation policy, finite outputs and artifact round-trip equality. It does not prove acceptable real business error or production readiness.
- **Why a mean model?** A transparent fallback and a verified version to restore. Its minimal gate is explicitly weaker; no claim that a constant predictor meets a manufacturing service level.
- **What is actually in MLflow?** Three finished runs with algorithm parameters, source/policy/artifact hashes, validation metrics, serialized models and validation reports. SQLite/application tables implement release state separately. No hosted MLflow UI or Model Registry is claimed.
- **How do you avoid leakage?** Only four allowed inputs; fit scaling/encoding/models on training dates; validation determines eligibility; replay is evaluated only after freeze. Feature timing remains an unresolved source limitation rather than a proven absence of all leakage.
- **Does drift mean the model is failing?** No. PSI measures a feature-distribution difference. In this history SMV PSI was 0.827 even though replay MAE was lower than validation MAE. Label-based errors answer a separate question.
- **Why no error for shifted SMV?** Multiplying an input changes the hypothetical situation. The source label belongs to the original observation; using it as the changed situation's truth would invent a counterfactual.
- **What stops a bad release?** Version eligibility, policy/engine compatibility, expected-generation check, artifact hash/reload, and one transaction for pointer/event mutation. Tests exercise negative paths. A trusted machine owner remains outside that security boundary.
- **What makes rollback verifiable?** The earlier artifact and same input request restore the exact model ID/hash/prediction, with a new generation. The active pointer and rollback event commit atomically.
- **How would you extend it?** Independent new dates; rolling backtests; documented feature timestamps; business-specific asymmetric error costs; categorical monitoring; signed artifacts; authentication; concurrency controls; a controlled deployment pipeline. Add only what the target job needs.

## Honest résumé wording

Say: “Built and evaluated a local model lifecycle with reproducible evidence.” Do not say: “Improved factory productivity”, “eliminated drift”, “real-time MLOps”, “production ready”, “automated employee decisions”, or “certified in MLflow”. These were not established by this project.

## Suggested short recording

Record your screen for 90–120 seconds: overview → one dataset boundary → forest's gate → versioned prediction → historical/synthetic monitoring distinction → rollback → audit export. A narration should explain a decision or limitation rather than merely reading UI labels. No video has been generated by the project.
