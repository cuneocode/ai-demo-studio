# Fraud scoring service

FastAPI adapter (`server.py`, `scorer.py`) in front of a GraphSAGE + XGBoost model trained with
NVIDIA's `financial-fraud-training` image on IBM TabFormer (synthetic card transactions). Training
and serving run on Sparky (NVIDIA DGX Spark, GB10, aarch64). The Mac uses the live sidecar through
an SSH tunnel, or replays recorded scores.

Everything generated lives in the git-ignored `services/fraud/.cache/`. Never commit raw data,
graphs, or weights.

## Studio adapter setup

Complete the [live Studio setup](../../README.md#start-the-live-studio), then run
`npm run dev:studio` and open **Card fraud triage**. `npm run fraud:install`
reinstalls this adapter. It listens on `127.0.0.1:8012` behind `/api/fraud` and
reads root `.env`. Stop the managed runtime with Ctrl+C.

For standalone development, run
`(cd services/fraud && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8012)`
and `npm run dev` in separate terminals. Stop each with Ctrl+C. Health is at
`http://localhost:4200/api/fraud/health`; tests use `npm run fraud:test`.

The adapter and recorded/sample scoring work on the Studio CPU. Live graph scores
require the separate NVIDIA scorer described below. Set `FRAUD_SCORE_URL` to its
reachable endpoint, or use a tunnel to the default `http://127.0.0.1:8000`.
The existing scripts call the development machine `Sparky`; replace that SSH alias
with your GPU host. NVIDIA runtime, training data, and model artifacts are required
on that host. Allow about 40 GB free disk for the existing training pipeline.

The triage agent uses the Studio model chain independently of scoring. When a
model is unavailable, scripted summaries are labelled. Recorded/sample scores and
explicit recorded-run playback retain their provenance; a failed live triage
request does not silently replay a previous run. Local work lives in `.cache/`;
curated recordings and input data live in `data/`.

AI Defense follows `AIDEFENSE_MODE` and defaults to enforce when a key is set.
Agent Observability and hosted controls use the shared `GALILEO_*` settings.
To enable hosted controls, create your observability project/stream, review
`controls.py`, and run the explicit tenant-changing command:

```sh
(cd services/fraud && .venv/bin/python setup_controls.py)
```

Restart through **Services → Apply**. The run identifies local checks or hosted
controls and reports actual trace export. See
[configuration](../../docs/CONFIGURATION.md) for shared settings.

## Model, honestly

- **Graph:** account (user-card) and merchant nodes. Each payment is an edge with amount, hour
  (sin/cos), and channel. Node features are train-window aggregates (avg/std amount, count, unique
  counterparties). MCC, `Errors?`, and merchant state are kept in `cases.csv` for the rules baseline
  and case selection only; the GNN does not see them.
- **Split:** 2019 only. Train is through 2019-08-31; the test window is 2019-09-01..10-31.
- **Training:** `skip_gnn_train: false`. In the 3.0.0 image, `true` skips GraphSAGE and loads
  `model_final.pt` from `checkpoint_dir`, so the old config never trained a GNN.
  `final_fit_epochs: 0`, because a positive value fine-tunes on validation + test edges, which leaks
  the test window.
- **Point-in-time scoring:** `infer_server.py` (via `temporal_graph.py`) samples each payment's
  neighbourhood from the training split plus the test window, keeping only payments made strictly
  before it (`as_of`). It samples like PyG `NeighborLoader` (sampled edges only), and is
  deterministic per payment.
- **Explanations:** exact XGBoost TreeSHAP (`pred_contribs`). Values are in log-odds, summed per
  feature group from `feature_map.json`. The groups plus `explain.base_value` add up to the logit
  of `probability`. This replaces Captum Shapley sampling.
- **Metrics to show:** `backtest.json` scores rules, XGBoost-only, and GNN+XGBoost on the same
  point-in-time test sample. The image's own `metrics.json` is kept for reference, but its test pass
  is not point in time.

## Reproduce on Sparky

Prerequisites:
- SSH access. The NVIDIA Sync alias is `Sparky` (capital S). It needs the same LAN, and Cisco
  Secure Client must allow local LAN access or be disconnected.
- Docker with the NVIDIA runtime.
- About 40 GB free disk.
- `NGC_API_KEY` exported in Sparky's shell. Never commit it or put it in this repo.

```bash
# on Sparky, in a checkout of this branch
export NGC_API_KEY=...            # from your NGC account; do not echo it
nohup services/fraud/scripts/sparky_m4.sh > services/fraud/.cache/m4.log 2>&1 &
tail -f services/fraud/.cache/m4.log
```

`sparky_m4.sh` runs these steps. A step whose output already exists is skipped; `FORCE=1` reruns
everything.

1. Image check. Logs in to nvcr.io and verifies a `linux/arm64` manifest before pulling.
2. `hardware.json`: GPU, driver, CUDA, cores, memory.
3. Dataset. Downloads TabFormer `transactions.tgz` (about 266 MB) from the IBM/TabFormer Git LFS
   media URL into `.cache/raw/card_transaction.v1.csv`. If the LFS quota is exhausted, download it
   manually from <https://ibm.box.com/v/tabformer-data>.
4. `preprocess_tabformer_v3.py`, run in the image. Writes `.cache/graph/` and
   `.cache/preprocess_stats.json`, including wall-clock seconds.
5. `train.sh`. Writes the image artifacts plus `train.log` and `train_run.json` (seconds, image
   digest, peak memory) to `.cache/train/`.
6. `select_studio_cases.py`: `.cache/studio_cases.json`.
7. `backtest.py`: `.cache/backtest.json`. Uses every fraud-labelled test payment plus 20k sampled
   legit payments, re-weighted to the full window. Reports a 0.5% alert rate.
8. `bench_score.py`: `.cache/bench.json`. Per-request latency p50/p95 on `cuda` and `cpu`, on the
   same box.
9. `serve.sh` (detached container `fsi-fraud-gnn` on `127.0.0.1:8000`), then `record_scores.py`,
   which writes `.cache/scores.json`.
10. `build_model_card.py`: `.cache/model_card.json`.

Run steps individually with `scripts/in_image.sh <script.py> [args]`. GB10 memory is unified, so
stop the 120B vLLM model (`services/llm/serve.sh`) before training.

If a future image tag has no arm64 build, the fallback is a native aarch64 environment: PyTorch
(CUDA 13 aarch64 wheels), PyG, and XGBoost (aarch64 CUDA wheels). That still needs the image's
`gnn_arch.py` and training loop, so prefer a multi-arch tag. Forum reports confirm arm64 since
`2.0.0`.

## Use it from the Mac

- **Live:** run `ssh -N -L 8000:127.0.0.1:8000 user@gpu-host`. The default
  `FRAUD_SCORE_URL=http://127.0.0.1:8000` then reaches the sidecar.
- **Recorded:** copy the small artifacts back. Do not copy the graph or weights.

  ```bash
  rsync -av Sparky:<repo>/services/fraud/.cache/{studio_cases.json,scores.json,model_card.json,backtest.json,bench.json} \
    services/fraud/.cache/
  ```

  `scores.json` is keyed by the case ids in `studio_cases.json`. Copy both together.

## Artifact schemas

`studio_cases.json` is a list of cases. Public fields carry no ground truth.

```json
{"id": "tabformer-0001146", "label": "Card not present · $180.34 · Oct 30 19:11",
 "account": "****0017-0", "merchant": "Merchant 7912081", "amount": 180.34, "channel": "cnp",
 "neighborhood": "Card: 77 earlier payments, 2 at this merchant · Merchant: 66 cards seen earlier, 48 with fraud-labelled payments before this one",
 "hint": "TabFormer test-window payment (synthetic). The label stays hidden until the analyst decides.",
 "src": 70, "dst": 30, "edge_attr": [180.34, -0.97, 0.26, 0.0, 1.0, 0.0],
 "as_of": "2019-10-30T19:11:00", "date": "2019-10-30", "raw_channel": "Online Transaction",
 "scenario": "cpp | card_testing | clean_control | queue",
 "history": {"card_prior_payments": 77, "card_prior_fraud": 0, "card_prior_visits_here": 2,
             "merchant_prior_payments": 130, "merchant_prior_cards": 66,
             "merchant_prior_fraud_cards": 48, "card_small_payments_24h": 0},
 "tabformer_label": "fraud | legit"}
```

`scores.json` maps each case id to a recorded score:

```json
{"tabformer-0001146": {
  "probability": 0.0, "shap": [{"feature": "...", "value": 0.0, "direction": "risk | protective"}],
  "explain": {"method": "xgboost_treeshap", "units": "log_odds", "base_value": 0.0},
  "as_of": "2019-10-30T19:11:00", "temporal_filter": true, "device": "cuda",
  "timing_ms": {"sample_ms": 0.0, "gnn_ms": 0.0, "xgb_ms": 0.0, "explain_ms": 0.0, "total_ms": 0.0,
                "sampled_edges": {"account_transacts_merchant": 0, "merchant_rev_transacts_account": 0}},
  "http_ms": 0.0, "model": "gnn-xgb-tabformer", "recorded_at": "ISO-8601",
  "served_by": {"url": "http://127.0.0.1:8000", "device": "cuda", "backend": "gnn_xgb"}}}
```

`model_card.json` (`schema_version: 1`) puts what the UI needs under `headline`:

```json
{"schema_version": 1, "generated_at": "ISO-8601", "status": "measured | partial",
 "tag": "Measured · TabFormer test window · synthetic data",
 "headline": {
   "alert_rate": 0.005,
   "fraud_amount_caught_share": {"rules": 0.0, "xgboost_only": 0.0, "gnn_xgboost": 0.0},
   "recall_at_alert_rate": {"...": 0.0}, "fp_per_tp_at_rules_recall": {"...": 0.0},
   "auc_roc": {"...": 0.0}, "auc_pr": {"...": 0.0},
   "train_minutes": 0.0, "preprocess_seconds": 0.0,
   "score_p50_ms": {"cuda": 0.0, "cpu": 0.0}, "score_p95_ms": {"cuda": 0.0, "cpu": 0.0}},
 "model": {"id": "gnn-xgb-tabformer", "image": "...", "image_digest": "...", "gnn_trained": true, "...": "..."},
 "dataset": {"train": {"from": "...", "to": "...", "edges": 0, "fraud": 0}, "test": {"...": "..."}, "synthetic": true},
 "metrics": {"backtest": {}, "container_reported": {}},
 "timings": {"preprocess_seconds": 0.0, "train": {}, "inference": {}},
 "hardware": {"gpu": "...", "machine": "aarch64", "memory_gib": 0.0},
 "provenance": {"git_sha": "...", "git_dirty": false, "host_label": "Sparky · NVIDIA DGX Spark (GB10) · dev box, not Cisco hardware"},
 "missing": []}
```

Any input that was not produced is listed in `missing`, and its fields stay `null`. Nothing is
filled in by hand.

## Tests for the scripts

```bash
uv run --no-project --with numpy --with pandas --with pytest pytest services/fraud/scripts/tests
# plus the torch/xgboost engine smoke test (macOS: xgboost needs libomp; torch ships one)
DYLD_LIBRARY_PATH=$(uv run --no-project --with torch python -c "import torch,os;print(os.path.dirname(torch.__file__)+'/lib')") \
  uv run --no-project --with numpy --with pandas --with pytest --with torch --with xgboost pytest services/fraud/scripts/tests
```

## Stop GPU scoring

On the GPU host run `docker stop fsi-fraud-gnn`; close any SSH tunnel with Ctrl+C.
This does not delete the training artifacts.
