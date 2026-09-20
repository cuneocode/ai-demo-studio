#!/usr/bin/env python3
"""Fix NVIDIA 3.0.0 boosting.py: QuantileDMatrix path deletes tensors still needed for SVS."""
from pathlib import Path

path = Path("/workspace/mnmg/boosting.py")
text = path.read_text()
needle = """        xgb_model = xgb.train(
            params,
            Xy_train,
            num_boost_round=num_boost_round,
            evals=[(Xy_train, "train"), (Xy_val, "val")],
            early_stopping_rounds=early_stopping_rounds,
            verbose_eval=False,
            callbacks=[_LoggerEvalMonitor(period=log_period, rank=global_rank)],
        )

    logger.debug("xgb_booster_check"""
insert = """        xgb_model = xgb.train(
            params,
            Xy_train,
            num_boost_round=num_boost_round,
            evals=[(Xy_train, "train"), (Xy_val, "val")],
            early_stopping_rounds=early_stopping_rounds,
            verbose_eval=False,
            callbacks=[_LoggerEvalMonitor(period=log_period, rank=global_rank)],
        )

    X_train_t = edge_embeddings[idx_train_t].to(device)
    X_val_t = edge_embeddings[idx_val_t].to(device)

    logger.debug("xgb_booster_check"""
if needle not in text:
    raise SystemExit("boosting.py train/SVS block changed; patch_boosting.py needs an update")
if "X_train_t = edge_embeddings[idx_train_t].to(device)\n    X_val_t" in text:
    print("boosting.py already patched")
else:
    path.write_text(text.replace(needle, insert, 1))
    print("patched boosting.py to restore tensors before SVS")
