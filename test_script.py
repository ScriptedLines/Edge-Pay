"""
EdgePay -- Android App Model Inference Test
====================================================================
Mirrors EXACTLY what the Android app does in trust_engine.ts:

  Step 1: Hold raw transaction ledgers (date, amount, type, target)
           -- same shape as the app's localStorage transaction array
  Step 2: compute_xgb_profile()  <-- mirrors buildXGBProfile() in trust_engine.ts
  Step 3: build_gru_sequence()   <-- mirrors buildGRUSequence()  in trust_engine.ts
  Step 4: Run 3 XGBoost models + TFLite GRU
  Step 5: Apply balance-anchored EdgeLimit formula

NO hardcoded feature vectors. All features are derived from raw tx data.
"""

import json
import math
import os
import sys
import random
from datetime import datetime, timedelta
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import numpy as np
import pandas as pd
import xgboost as xgb
import tensorflow as tf

import builtins as _builtins
builtins_print = _builtins.print

# Always write a clean copy of results (no TF noise) to this file
RESULTS_FILE = Path(__file__).resolve().parent / "inference_results.txt"
_results_fh  = None

def _print(*args, **kwargs):
    """print() that mirrors output to inference_results.txt."""
    builtins_print(*args, **kwargs)             # console
    if _results_fh:
        kw = {k: v for k, v in kwargs.items() if k != "file"}
        builtins_print(*args, **kw, file=_results_fh)  # file

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR  = SCRIPT_DIR / "public" / "models" / "trustscore"
META_PATH  = MODEL_DIR / "model_metadata.json"

if not META_PATH.exists():
    print(f"ERROR: model_metadata.json not found at {META_PATH}")
    sys.exit(1)

with open(META_PATH, "r") as f:
    META = json.load(f)

TRUST_FEATURES   = META["trust_features"]
AMOUNT_FEATURES  = META["amount_features"]
SESSION_FEATURES = META["session_features"]
SEQ_LEN          = META["gru_seq_len"]    # 20
GRU_N_FEATURES   = META["gru_n_features"] # 10
FALLBACK_STATS   = META.get("trust_feature_stats", {})


# ══════════════════════════════════════════════════════════════════════════════
# 1. RAW ACCOUNT GENERATOR
#    Each account is a dict:
#      { name, starting_balance, bank_balance, transactions[] }
#    Each transaction:
#      { date_ms, amount, type ('debit'|'credit'), target }
#    This is the exact same shape as the app's localStorage ledger.
# ══════════════════════════════════════════════════════════════════════════════

NOW_MS = int(datetime.now().timestamp() * 1000)
ONE_DAY_MS  = 24 * 3600 * 1000
ONE_WEEK_MS = 7 * ONE_DAY_MS

def days_ago(n: float) -> int:
    """Returns Unix-ms timestamp for n days ago."""
    return int(NOW_MS - n * ONE_DAY_MS)

def make_tx(date_ms: int, amount: float, tx_type: str, target: str) -> dict:
    return {"date": date_ms, "amount": amount, "type": tx_type, "target": target}


def account_veteran_professional():
    """
    Rohan S. — Senior developer, 2 years on the app.
    300+ transactions: salary credits, consistent UPI payments to 8-10 known merchants.
    Daytime activity (10 AM - 7 PM). Good balance maintained. No spikes.
    Expected: HIGH trust, reasonable offline limit.
    """
    rng = random.Random(42)
    txs = []
    merchants = ["Zomato", "Swiggy", "Amazon", "Netflix", "Airtel", "HDFC EMI",
                 "Zepto", "BookMyShow", "PhonePe Gas", "BESCOM Electric"]

    # 280 debit transactions over 600 days (older history first, newest last in list)
    for i in range(280):
        days_back = rng.uniform(1, 600)
        hour = rng.randint(10, 19)   # 10 AM–7 PM
        amount = rng.gauss(3200, 800)
        amount = max(200, round(amount, 2))
        txs.append(make_tx(
            date_ms=days_ago(days_back) + hour * 3600 * 1000,
            amount=amount,
            tx_type="debit",
            target=rng.choice(merchants)
        ))

    # 40 salary credits
    for i in range(40):
        days_back = i * 15 + rng.uniform(0, 2)
        txs.append(make_tx(
            date_ms=days_ago(days_back),
            amount=rng.gauss(85000, 3000),
            tx_type="credit",
            target="Employer NEFT"
        ))

    # Sort newest-first (matches app: transactions[0] = latest)
    txs.sort(key=lambda t: t["date"], reverse=True)

    starting_balance = 120000
    bank_balance = 87400.0   # healthy remaining balance

    return {
        "name": "Rohan S. (Veteran Professional)",
        "starting_balance": starting_balance,
        "bank_balance": bank_balance,
        "transactions": txs,
    }


def account_bustout_fraudster():
    """
    Unknown — Bust-Out scammer. Builds fake trust for 45 days,
    then in the last 3 days makes 18 rapid large transfers at 2-4 AM
    to unknown accounts, draining balance to near zero.
    Expected: LOW trust, HIGH GRU risk, limit blocked.
    """
    rng = random.Random(99)
    txs = []

    # Phase 1: 30 legitimate-looking small debits over 45 days
    phase1_merchants = ["Reliance Fresh", "DMart", "Auto Rickshaw", "Cafe Coffee Day"]
    for i in range(30):
        days_back = rng.uniform(5, 45)
        hour = rng.randint(11, 20)
        txs.append(make_tx(
            date_ms=days_ago(days_back) + hour * 3600 * 1000,
            amount=round(rng.uniform(150, 600), 2),
            tx_type="debit",
            target=rng.choice(phase1_merchants)
        ))

    # Phase 2: 18 large bust-out transfers in last 3 days at 2-4 AM
    for i in range(18):
        days_back = rng.uniform(0.05, 3.0)
        hour = rng.randint(1, 4)   # 1-4 AM
        txs.append(make_tx(
            date_ms=days_ago(days_back) + hour * 3600 * 1000,
            amount=round(rng.uniform(4000, 9500), 2),
            tx_type="debit",
            target=f"Unknown_Acc_{rng.randint(1000,9999)}"  # all different receivers
        ))

    txs.sort(key=lambda t: t["date"], reverse=True)

    starting_balance = 40000
    bank_balance = 1200.0   # nearly drained

    return {
        "name": "Unknown (Bust-Out Scammer)",
        "starting_balance": starting_balance,
        "bank_balance": bank_balance,
        "transactions": txs,
    }


def account_college_student():
    """
    Priya K. — College student, 8 months on app.
    80 transactions: mix of small food/movie payments, a couple of
    unexpected large spikes (trip expenses), moderate late-night activity.
    Expected: MODERATE trust, moderate limit.
    """
    rng = random.Random(7)
    txs = []
    places = ["Zomato", "Swiggy", "Dominos", "PVR Cinemas", "Ola", "Uber",
              "Amazon", "Ajio", "IRCTC", "Zepto"]

    for i in range(75):
        days_back = rng.uniform(1, 240)
        hour = rng.choices(
            population=list(range(24)),
            weights=[1,1,1,1,1,0,0,0,1,2,3,4,5,5,5,5,4,4,3,3,4,3,2,2],
            k=1
        )[0]
        # Occasional large spike (10% of txs)
        if rng.random() < 0.10:
            amount = round(rng.uniform(3000, 8000), 2)
        else:
            amount = round(rng.uniform(80, 700), 2)
        txs.append(make_tx(
            date_ms=days_ago(days_back) + hour * 3600 * 1000,
            amount=amount,
            tx_type="debit",
            target=rng.choice(places)
        ))

    # 12 credits (pocket money from parents)
    for i in range(12):
        txs.append(make_tx(
            date_ms=days_ago(rng.uniform(5, 240)),
            amount=round(rng.uniform(3000, 8000), 2),
            tx_type="credit",
            target="Family Transfer"
        ))

    txs.sort(key=lambda t: t["date"], reverse=True)

    starting_balance = 25000
    bank_balance = 9800.0

    return {
        "name": "Priya K. (College Student)",
        "starting_balance": starting_balance,
        "bank_balance": bank_balance,
        "transactions": txs,
    }


def account_fresh_user():
    """
    New_User_7842 — Installed app 6 days ago. Only 7 transactions.
    Expected: COLD START — offline locked regardless of behaviour.
    """
    rng = random.Random(13)
    txs = []
    for i in range(5):
        txs.append(make_tx(
            date_ms=days_ago(rng.uniform(0.2, 6)),
            amount=round(rng.uniform(50, 300), 2),
            tx_type="debit",
            target=rng.choice(["Zomato", "Swiggy", "Auto"])
        ))
    # 2 credits
    txs.append(make_tx(days_ago(5), 5000.0, "credit", "Self Transfer"))
    txs.append(make_tx(days_ago(3), 2000.0, "credit", "Friend"))
    txs.sort(key=lambda t: t["date"], reverse=True)

    return {
        "name": "New_User_7842 (Fresh / Cold Start)",
        "starting_balance": 7000,
        "bank_balance": 6250.0,
        "transactions": txs,
    }


def account_merchant_regular():
    """
    Deepak M. — Kirana shop owner, uses UPI for vendor payments.
    150 transactions over 1 year: frequent small-to-mid payments to 5-6 vendors.
    Very high repeat-receiver ratio, low variance, all daytime.
    Expected: HIGH trust (repeat, predictable), decent limit.
    """
    rng = random.Random(55)
    txs = []
    vendors = ["Haldiram Wholesale", "Amul Distributor", "ITC Trade", "Coca-Cola Dist", "Nestle Trade"]

    for i in range(130):
        days_back = rng.uniform(1, 365)
        hour = rng.randint(9, 18)
        amount = round(rng.gauss(1800, 400), 2)
        amount = max(300, amount)
        txs.append(make_tx(
            date_ms=days_ago(days_back) + hour * 3600 * 1000,
            amount=amount,
            tx_type="debit",
            target=rng.choice(vendors)
        ))

    for i in range(22):
        txs.append(make_tx(
            date_ms=days_ago(rng.uniform(1, 360)),
            amount=round(rng.gauss(45000, 5000), 2),
            tx_type="credit",
            target="Customer Sales NEFT"
        ))

    txs.sort(key=lambda t: t["date"], reverse=True)

    starting_balance = 95000
    bank_balance = 71000.0

    return {
        "name": "Deepak M. (Regular Merchant)",
        "starting_balance": starting_balance,
        "bank_balance": bank_balance,
        "transactions": txs,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 2. FEATURE ENGINEERING
#    Mirrors trust_engine.ts buildXGBProfile() LINE BY LINE.
#    Variable names are kept identical to the TypeScript source.
# ══════════════════════════════════════════════════════════════════════════════

def compute_xgb_profile(txs: list, bank_balance: float, starting_balance: float) -> dict:
    """
    Exact Python port of trust_engine.ts buildXGBProfile().
    Input: raw transaction list (same shape as app localStorage).
    Output: dict of all 25 named features ready for XGBoost.
    """
    debits  = [t for t in txs if t["type"] == "debit"]
    amounts = [t["amount"] for t in debits]
    n       = len(debits)
    now     = NOW_MS
    one_week = ONE_WEEK_MS

    # ── Amount stats ──────────────────────────────────────────────────────────
    fallback_avg = FALLBACK_STATS.get("avg_amount", {}).get("mean", 500)
    avg_amount = sum(amounts) / n if n > 0 else fallback_avg
    max_amount = max(amounts)      if n > 0 else avg_amount
    std_amount = (
        math.sqrt(sum((a - avg_amount) ** 2 for a in amounts) / (n - 1))
        if n > 1 else avg_amount * 0.2
    )
    sorted_amt = sorted(amounts)
    p90_amount = sorted_amt[math.floor(len(sorted_amt) * 0.9)] if sorted_amt else avg_amount

    # ── Transaction counts ────────────────────────────────────────────────────
    tx_count    = max(len(txs), 1)
    tx_count_7d = sum(1 for t in txs if t["date"] >= now - one_week)

    # ── Cash-out ratio ────────────────────────────────────────────────────────
    cash_out_ratio = len(debits) / len(txs) if txs else 0.3

    # ── Balance drain ratio ───────────────────────────────────────────────────
    effective_start    = max(starting_balance, 1)
    balance_drain_ratio = min(1.0, max(0.0,
        (effective_start - bank_balance) / effective_start
    ))

    # ── Zero / near-limit events ──────────────────────────────────────────────
    low_threshold      = effective_start * 0.05
    times_balance_zero = 1 if bank_balance < low_threshold else 0
    times_near_limit   = sum(1 for a in amounts if a > avg_amount * 0.8)
    fb_adblh = FALLBACK_STATS.get("avg_days_between_limit_hits", {}).get("mean", 0.13)
    avg_days_between_limit_hits = (
        (tx_count_7d / max(times_near_limit, 1)) / 7
        if times_near_limit > 0 else fb_adblh
    )

    # ── Frequency spike ratio ─────────────────────────────────────────────────
    oldest_date = min((t["date"] for t in txs), default=now)
    age_ms      = now - oldest_date
    age_days    = max(age_ms / ONE_DAY_MS, 1)
    daily_avg       = tx_count / age_days
    recent_7d_rate  = tx_count_7d / 7
    freq_spike_ratio = min(recent_7d_rate / daily_avg, 5.0) if daily_avg > 0 else 1.0

    # ── Late night ratio ──────────────────────────────────────────────────────
    def hour_of(ts_ms): return datetime.fromtimestamp(ts_ms / 1000).hour
    late_night_count = sum(1 for t in txs if hour_of(t["date"]) >= 23 or hour_of(t["date"]) <= 4)
    late_night_ratio = late_night_count / len(txs) if txs else 0.0

    # ── Amount vs avg ratio (most recent debit vs personal avg) ──────────────
    last_debit_amt    = amounts[0] if amounts else avg_amount  # amounts[0] = latest debit
    amount_vs_avg_ratio = last_debit_amt / avg_amount if avg_amount > 0 else 1.0

    # ── Repeat receiver ratio ─────────────────────────────────────────────────
    all_targets = [t["target"] for t in txs if t.get("target")]
    target_counts = {}
    for tgt in all_targets:
        target_counts[tgt] = target_counts.get(tgt, 0) + 1
    unique_targets = len(target_counts)
    repeat_targets = sum(1 for c in target_counts.values() if c > 1)
    repeat_receiver_ratio = repeat_targets / unique_targets if unique_targets > 0 else 0.0

    week_txs = [t for t in txs if t["date"] >= now - one_week]
    unique_receiver_count_7d = len(set(t.get("target") for t in week_txs if t.get("target")))

    # ── Infra / device / KYC signals (mirrors trust_engine.ts exactly) ───────
    account_age_days = 180   # fixed in JS
    device_consistency = min(0.95,
        0.5 + (math.log1p(tx_count) / math.log1p(100)) * 0.45
    )
    offline_tx_ratio       = min(1.0, cash_out_ratio * 0.5 + 0.1)
    avg_offline_session_hours = max(0.5, 12 - math.log1p(tx_count_7d) * 1.2)
    days_since_last_sync   = min(5.0, 0.5 if tx_count_7d > 5 else 1.5)
    current_unsynced_amount = min(14000,
        avg_amount * days_since_last_sync * max(tx_count_7d / 7, 0.1) + 150
    )
    unsynced_amount_vs_avg_ratio = (
        min(50.0, current_unsynced_amount / avg_amount) if avg_amount > 0 else 1.0
    )
    kyc_days_ago         = 365   # fixed in JS
    balance_recovery_speed = max(1.0, 15.0 / (times_balance_zero + 1))

    return {
        "avg_amount":                  avg_amount,
        "std_amount":                  std_amount,
        "p90_amount":                  p90_amount,
        "max_amount":                  max_amount,
        "tx_count":                    tx_count,
        "cash_out_ratio":              cash_out_ratio,
        "balance_drain_ratio":         balance_drain_ratio,
        "times_balance_zero":          times_balance_zero,
        "times_near_limit":            times_near_limit,
        "avg_days_between_limit_hits": avg_days_between_limit_hits,
        "tx_count_7d":                 tx_count_7d,
        "freq_spike_ratio":            freq_spike_ratio,
        "late_night_ratio":            late_night_ratio,
        "amount_vs_avg_ratio":         amount_vs_avg_ratio,
        "repeat_receiver_ratio":       repeat_receiver_ratio,
        "unique_receiver_count_7d":    unique_receiver_count_7d,
        "account_age_days":            account_age_days,
        "device_consistency":          device_consistency,
        "offline_tx_ratio":            offline_tx_ratio,
        "avg_offline_session_hours":   avg_offline_session_hours,
        "days_since_last_sync":        days_since_last_sync,
        "current_unsynced_amount":     current_unsynced_amount,
        "unsynced_amount_vs_avg_ratio":unsynced_amount_vs_avg_ratio,
        "kyc_days_ago":                kyc_days_ago,
        "balance_recovery_speed":      balance_recovery_speed,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 3. GRU SEQUENCE BUILDER
#    Mirrors trust_engine.ts buildGRUSequence() LINE BY LINE.
#    Note: maxAmount passed from the app is bankBalance (not tx max).
# ══════════════════════════════════════════════════════════════════════════════

def type_code(tx: dict) -> float:
    """Mirrors typeCode() in trust_engine.ts."""
    if tx["type"] == "credit":
        return 0.0
    if tx["type"] == "repay":
        return 0.5
    return 0.75   # default: PAYMENT (debit)


def build_gru_sequence(
    txs: list,
    bank_balance: float,
    avg_amount: float,
    max_amount: float,      # the app passes bankBalance here
    starting_balance: float,
    seq_len: int = 20,
) -> np.ndarray:
    """
    Exact Python port of trust_engine.ts buildGRUSequence().
    Returns shape (1, seq_len, 10) float32 ready for TFLite.
    """
    # Take most-recent seq_len txs, reverse to oldest-first
    recent  = list(reversed(txs[:seq_len]))
    # Known receivers = history BEYOND the window
    known_targets = set(t.get("target") for t in txs[seq_len:] if t.get("target"))

    balance_ceiling = max(starting_balance, bank_balance, 1)
    seq = np.zeros((1, seq_len, 10), dtype=np.float32)

    for i in range(seq_len):
        if i >= len(recent):
            # Zero-pad (same as app's new Array(10).fill(0))
            continue

        tx   = recent[i]
        prev = recent[i - 1] if i > 0 else None
        hour = datetime.fromtimestamp(tx["date"] / 1000).hour

        # [0] amount_normalized
        amount_normalized = min((tx["amount"] or 0) / max_amount, 1.0) if max_amount > 0 else 0.0

        # [1] type_code
        t_code = type_code(tx)

        # [2][3] hour_sin, hour_cos
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)

        # [4] balance_normalized (constant across all steps — same as app)
        balance_normalized = min(1.0, max(0.0, bank_balance / balance_ceiling))

        # [5] is_familiar_receiver
        is_familiar = 1.0 if (tx.get("target") and tx["target"] in known_targets) else 0.0

        # [6] days_gap
        if prev:
            days_gap = min(30.0, (tx["date"] - prev["date"]) / ONE_DAY_MS)
        else:
            days_gap = 1.0 / 24.0

        # [7] amount_vs_user_max (same formula as [0])
        amount_vs_max = min((tx["amount"] or 0) / max_amount, 1.0) if max_amount > 0 else 0.0

        # [8] sudden_spike_flag
        sudden_spike = 1.0 if (avg_amount > 0 and (tx["amount"] or 0) > avg_amount * 3) else 0.0

        # [9] late_night_flag
        late_night = 1.0 if (hour >= 23 or hour <= 4) else 0.0

        seq[0, i] = [
            amount_normalized, t_code, hour_sin, hour_cos,
            balance_normalized, is_familiar, days_gap,
            amount_vs_max, sudden_spike, late_night,
        ]

        # Grow known receivers as we replay (same as app's knownTargets.add)
        if tx.get("target"):
            known_targets.add(tx["target"])

    return seq


# ══════════════════════════════════════════════════════════════════════════════
# 4. MODEL LOADERS
# ══════════════════════════════════════════════════════════════════════════════

def load_xgboost(filename: str) -> xgb.Booster:
    path = MODEL_DIR / filename
    b = xgb.Booster()
    b.load_model(str(path))
    return b


def run_tflite_gru(tensor: np.ndarray) -> float:
    """Load and run gru_sequence.tflite. Returns sequence risk score 0-1."""
    interp = tf.lite.Interpreter(model_path=str(MODEL_DIR / "gru_sequence.tflite"))
    interp.allocate_tensors()
    in_idx  = interp.get_input_details()[0]["index"]
    out_idx = interp.get_output_details()[0]["index"]
    interp.set_tensor(in_idx, tensor)
    interp.invoke()
    return float(interp.get_tensor(out_idx)[0][0])


# ══════════════════════════════════════════════════════════════════════════════
# 5. EDGE LIMIT FORMULA
#    Mirrors trust_engine.ts computeTrustLimit() exactly:
#      allowanceRate = 0.15 + rawTrust * 0.35
#      maxSafeAmount = bankBalance * allowanceRate
#      combined      = clip(0.6*(1-gru) + 0.4*trust, 0, 1)
#      decay         = max(0.2, 1 - elapsed / 6)
#      edgeLimit     = clip(combined * maxSafeAmount * decay, 0, 10000)
# ══════════════════════════════════════════════════════════════════════════════

def compute_edge_limit(
    raw_trust: float,
    gru_risk: float,
    bank_balance: float,
    elapsed_hours: float,
    tx_count: int,
    cap: float = 10_000.0,
) -> float:
    if tx_count < 10:
        return 0.0
    session_h     = 6.0
    allowance     = 0.15 + raw_trust * 0.35
    max_safe      = bank_balance * allowance
    combined      = min(1.0, max(0.0, 0.6 * (1.0 - gru_risk) + 0.4 * raw_trust))
    decay         = max(0.2, 1.0 - elapsed_hours / session_h)
    return round(min(combined * max_safe * decay, cap), 2)


# ══════════════════════════════════════════════════════════════════════════════
# 6. MAIN
# ══════════════════════════════════════════════════════════════════════════════

def run_account(account: dict, trust_m, amount_m, session_m):
    name              = account["name"]
    txs               = account["transactions"]
    bank_balance      = account["bank_balance"]
    starting_balance  = account["starting_balance"]

    # ── A. Compute all features from raw tx ledger ────────────────────────────
    profile = compute_xgb_profile(txs, bank_balance, starting_balance)

    # ── B. Build XGBoost DMatrix (feature order from metadata) ───────────────
    row = {k: profile[k] for k in TRUST_FEATURES}
    trust_dm   = xgb.DMatrix(pd.DataFrame([{k: profile[k] for k in TRUST_FEATURES}]))
    amount_dm  = xgb.DMatrix(pd.DataFrame([{k: profile[k] for k in AMOUNT_FEATURES}]))
    session_dm = xgb.DMatrix(pd.DataFrame([{k: profile[k] for k in SESSION_FEATURES}]))

    # ── C. Predict with XGBoost models ───────────────────────────────────────
    raw_trust    = float(np.clip(trust_m.predict(trust_dm)[0],   0.0, 1.0))
    raw_amount   = float(amount_m.predict(amount_dm)[0])      # raw regression output
    raw_session  = float(session_m.predict(session_dm)[0])

    # ── D. Build GRU sequence from raw tx ledger ──────────────────────────────
    # app passes     (txs, bankBalance, avg_amount, bankBalance, startingBalance, seqLen)
    avg_amt_for_gru = profile["avg_amount"] if profile["avg_amount"] > 0 else bank_balance * 0.1
    gru_tensor = build_gru_sequence(
        txs, bank_balance, avg_amt_for_gru, bank_balance, starting_balance, SEQ_LEN
    )

    # ── E. Run TFLite GRU ─────────────────────────────────────────────────────
    gru_risk = run_tflite_gru(gru_tensor)

    # ── F. Apply balance-anchored limit formula ───────────────────────────────
    tx_count = int(profile["tx_count"])

    # Print report
    print("=" * 70)
    print(f"  ACCOUNT : {name}")
    print(f"  Balance : Rs.{bank_balance:>10,.2f}  (started Rs.{starting_balance:,.0f})")
    print(f"  Txs     : {len(txs)} total  |  {profile['tx_count_7d']} in last 7 days")
    print("-" * 70)
    print(f"  [Computed Features]")
    print(f"    avg_amount          = Rs.{profile['avg_amount']:>10,.2f}")
    print(f"    max_amount          = Rs.{profile['max_amount']:>10,.2f}")
    print(f"    balance_drain_ratio =   {profile['balance_drain_ratio']:>7.3f}  ({profile['balance_drain_ratio']*100:.1f}% drained)")
    print(f"    cash_out_ratio      =   {profile['cash_out_ratio']:>7.3f}")
    print(f"    freq_spike_ratio    =   {profile['freq_spike_ratio']:>7.3f}")
    print(f"    late_night_ratio    =   {profile['late_night_ratio']:>7.3f}")
    print(f"    repeat_recv_ratio   =   {profile['repeat_receiver_ratio']:>7.3f}")
    print(f"    times_near_limit    =   {profile['times_near_limit']:>7.0f}")
    print(f"    times_balance_zero  =   {profile['times_balance_zero']:>7.0f}")
    print(f"    device_consistency  =   {profile['device_consistency']:>7.3f}")
    print("-" * 70)
    print(f"  [Model Predictions]")
    print(f"    XGBoost Trust Score    = {raw_trust:.4f} / 1.0  -> {raw_trust*100:.1f} / 100")
    print(f"    TFLite GRU Risk Score  = {gru_risk:.4f} / 1.0  ({'HIGH RISK' if gru_risk > 0.5 else 'LOW RISK'})")
    print(f"    XGBoost Raw Amount     = Rs.{raw_amount:>12,.2f}  (raw regression, not used for limit)")
    print(f"    XGBoost Session Hours  = {raw_session:.2f} h")
    print("-" * 70)

    if tx_count < 10:
        print(f"  [LOCKED] COLD START -- < 10 txs ({tx_count}). Offline capability disabled.")
        print()
        return

    allowance_rate   = 0.15 + raw_trust * 0.35
    max_safe_amount  = bank_balance * allowance_rate
    combined_trust   = min(1.0, max(0.0, 0.6 * (1 - gru_risk) + 0.4 * raw_trust))

    print(f"  [Balance-Anchored Limit Formula]")
    print(f"    allowanceRate   = 0.15 + {raw_trust:.3f} * 0.35 = {allowance_rate:.3f}")
    print(f"    maxSafeAmount   = Rs.{bank_balance:,.0f} * {allowance_rate:.3f} = Rs.{max_safe_amount:,.2f}")
    print(f"    combinedTrust   = 0.6*(1-{gru_risk:.3f}) + 0.4*{raw_trust:.3f} = {combined_trust:.3f}")
    print(f"  -- Offline limit at elapsed hours (decay = max(0.2, 1 - t/6)) --")

    for elapsed in [0, 1, 2, 4, 6, 12, 24]:
        limit = compute_edge_limit(raw_trust, gru_risk, bank_balance, elapsed, tx_count)
        decay = max(0.2, 1.0 - elapsed / 6.0)
        tag   = "[OK  ]" if limit > 5000 else "[WARN]" if limit > 1000 else "[LOW ]" if limit > 0 else "[ZERO]"
        print(f"    {tag}  T+{elapsed:>2}h  (decay={decay:.2f})  -->  Rs.{limit:>9,.2f}")
    print()


def main():
    global _results_fh, print
    _results_fh = open(RESULTS_FILE, "w", encoding="utf-8")
    print = _print   # shadow built-in with our tee version

    print("\n" + "=" * 70)
    print("  EdgePay -- Android App Inference Simulator")
    print("  Feature engineering mirrors trust_engine.ts exactly.")
    print("=" * 70 + "\n")

    print("Loading XGBoost models...")
    trust_m   = load_xgboost("trust_xgboost.json")
    amount_m  = load_xgboost("max_amount_xgboost.json")
    session_m = load_xgboost("session_duration_xgboost.json")
    print("OK: 3 XGBoost models loaded.")
    print("OK: TFLite GRU will be loaded per inference call.\n")

    accounts = [
        account_veteran_professional(),
        account_bustout_fraudster(),
        account_college_student(),
        account_fresh_user(),
        account_merchant_regular(),
    ]

    for acc in accounts:
        run_account(acc, trust_m, amount_m, session_m)

    _results_fh.close()
    print = builtins_print  # restore
    builtins_print(f"\nClean results written to: {RESULTS_FILE.name}")


if __name__ == "__main__":
    main()
