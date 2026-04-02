import json
import numpy as np
import pandas as pd
import xgboost as xgb
import tensorflow as tf
from pathlib import Path

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
MODEL_DIR = Path("public/models/trustscore") # using app models dir
META_PATH = MODEL_DIR / "model_metadata.json"

if not META_PATH.exists():
    print(f"✗ Error: Metadata not found at {META_PATH}. Run training script first.")
    exit(1)

with open(META_PATH, "r") as f:
    meta = json.load(f)

TRUST_FEATURES   = meta["trust_features"]
AMOUNT_FEATURES  = meta["amount_features"]
SESSION_FEATURES = meta["session_features"]
SEQ_LEN          = meta["gru_seq_len"]
GRU_FEATURES     = meta["gru_n_features"]

def generate_dummy_users() -> pd.DataFrame:
    profiles = [
        {
            "user_id": "user_risky",
            "avg_amount": 500.0, "std_amount": 2500.0, "p90_amount": 8000.0, "max_amount": 9500.0,
            "tx_count": 45, "cash_out_ratio": 0.8, "balance_drain_ratio": 0.80, "times_balance_zero": 0,
            "times_near_limit": 15, "avg_days_between_limit_hits": 2.0, "tx_count_7d": 25,
            "freq_spike_ratio": 3.5, "late_night_ratio": 0.65, "amount_vs_avg_ratio": 8.5,
            "repeat_receiver_ratio": 0.1, "unique_receiver_count_7d": 18, "account_age_days": 45,
            "device_consistency": 0.4, "offline_tx_ratio": 0.8, "avg_offline_session_hours": 12.0,
            "days_since_last_sync": 5.0, "current_unsynced_amount": 4500.0, "unsynced_amount_vs_avg_ratio": 9.0,
            "kyc_days_ago": 40, "balance_recovery_speed": 15.0,
        }
    ]
    return pd.DataFrame(profiles)

def build_gru_tensor(profile_id: str) -> np.ndarray:
    seq = np.zeros((1, SEQ_LEN, GRU_FEATURES), dtype=np.float32)
    return seq

def load_xgboost_model(filename: str):
    booster = xgb.Booster()
    booster.load_model(MODEL_DIR / filename)
    return booster

def run_gru_tflite(dummy_sequence: np.ndarray) -> float:
    interpreter = tf.lite.Interpreter(model_path=str(MODEL_DIR / "gru_sequence.tflite"))
    interpreter.allocate_tensors()
    input_index = interpreter.get_input_details()[0]['index']
    output_index = interpreter.get_output_details()[0]['index']
    interpreter.set_tensor(input_index, dummy_sequence)
    interpreter.invoke()
    return float(interpreter.get_tensor(output_index)[0][0])

def compute_edge_limit(trust, gru, max_amt, session_h, elapsed, tx_count, cap=10000.0):
    if tx_count < 10:
        return 0.0
    combined_trust = float(np.clip(0.6 * (1.0 - gru) + 0.4 * trust, 0.0, 1.0))
    decay = max(0.2, 1.0 - (elapsed / max(session_h, 1.0)))
    raw_limit = combined_trust * max_amt * decay
    return round(float(np.clip(raw_limit, 0.0, cap)), 2)

def main():
    trust_model   = load_xgboost_model("trust_xgboost.json")
    amount_model  = load_xgboost_model("max_amount_xgboost.json")
    session_model = load_xgboost_model("session_duration_xgboost.json")

    users_df = generate_dummy_users()

    for idx, user in users_df.iterrows():
        trust_x   = xgb.DMatrix(pd.DataFrame([user], columns=TRUST_FEATURES))
        amount_x  = xgb.DMatrix(pd.DataFrame([user], columns=AMOUNT_FEATURES))
        session_x = xgb.DMatrix(pd.DataFrame([user], columns=SESSION_FEATURES))
        
        gru_tensor = build_gru_tensor(user['user_id'])

        trust_pred   = float(trust_model.predict(trust_x)[0])
        amount_pred  = float(amount_model.predict(amount_x)[0])
        session_pred = float(session_model.predict(session_x)[0])
        gru_pred     = run_gru_tflite(gru_tensor) 

        print(f"  AI Trust Score:      {trust_pred:.3f} / 1.0 (XGBoost)")
        print(f"  AI Safe Amount:      {amount_pred:,.2f} (XGBoost)")
        print(f"  limit at T=0:        {compute_edge_limit(trust_pred, gru_pred, amount_pred, session_pred, 0, user['tx_count'])}")

if __name__ == "__main__":
    main()
