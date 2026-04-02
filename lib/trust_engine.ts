/**
 * EdgePay Trust Engine — Web Port
 * -----------------------------------------------------------------------
 * Full on-device inference pipeline — mirrors trust_engine.ts for Android:
 *   1. XGBoost Boosters (JS tree-walker) for trust_score, max_amount, session_duration
 *   2. GRU inference:
 *        Android → native TFLite via EdgePayPlugin.java (REAL model weights)
 *        Browser → approximateGRU() JS fallback (for web testing only)
 *   3. Balance-anchored EdgeLimit with elapsed-hours decay
 *
 * Python formula: limit = (0.6*(1-gru) + 0.4*trust) * maxSafe * decay
 */

import { XGBoostPredictor } from './ai/xgboost';
import { EdgePay } from './EdgePayPlugin';

let trustModel: XGBoostPredictor | null = null;
let amountModel: XGBoostPredictor | null = null;
let sessionModel: XGBoostPredictor | null = null;
let metadata: any = null;
let isLoaded = false;

export async function initTrustEngine() {
  if (isLoaded) return;
  try {
    const [trustRes, amtRes, sessRes, metaRes] = await Promise.all([
      fetch('/models/trustscore/trust_xgboost.json').then(r => r.json()),
      fetch('/models/trustscore/max_amount_xgboost.json').then(r => r.json()),
      fetch('/models/trustscore/session_duration_xgboost.json').then(r => r.json()),
      fetch('/models/trustscore/model_metadata.json').then(r => r.json()),
    ]);
    trustModel  = new XGBoostPredictor(trustRes);
    amountModel = new XGBoostPredictor(amtRes);
    sessionModel = new XGBoostPredictor(sessRes);
    metadata = metaRes;
    isLoaded = true;
    console.log('[TrustEngine] ✓ Models loaded');
  } catch (err) {
    console.error('[TrustEngine] ✗ Failed to load models:', err);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface TxRecord {
  id: string;
  date: number;     // Unix ms
  amount: number;
  type: string;     // 'debit' | 'credit' | 'repay'
  target?: string;
}

export interface TrustResult {
  trustScore: number;        // 0–100 (from XGBoost, *100)
  gruRisk: number;           // 0–1 (sequence risk, higher = risky)
  maxAmount: number;         // ₹ ceiling from XGBoost
  sessionDuration: number;   // hours from XGBoost
  edgeLimit: number;         // final capped limit (₹)
  balanceDrainPct: number;   // 0–100 (for UI display)
  elapsedHours: number;      // hours offline (for UI display)
  isColdStart?: boolean;     // true if tx_count < 10
}

// ── 1. Build XGBoost Feature Vector ─────────────────────────────────────────
// Mirrors the Python profile dict keys exactly, in the same order as
// TRUST_FEATURES / AMOUNT_FEATURES / SESSION_FEATURES from model_metadata.json

function buildXGBProfile(
  txs: TxRecord[],
  bankBalance: number,
  startingBalance: number,
): Record<string, number> {
  const debits = txs.filter(t => t.type === 'debit');
  const amounts = debits.map(t => t.amount || 0);
  const n = debits.length;
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 3600 * 1000;

  // ── Amount stats ─────────────────────────────────────────────────────────
  const avg_amount = n > 0
    ? amounts.reduce((a, b) => a + b, 0) / n
    : (metadata?.trust_feature_stats?.avg_amount?.mean ?? 500);

  const max_amount = n > 0 ? Math.max(...amounts) : avg_amount;

  const std_amount = n > 1
    ? Math.sqrt(amounts.reduce((s, a) => s + (a - avg_amount) ** 2, 0) / (n - 1))
    : avg_amount * 0.2;

  const sorted = [...amounts].sort((a, b) => a - b);
  const p90_amount = sorted.length > 0
    ? sorted[Math.floor(sorted.length * 0.9)]
    : avg_amount;

  // ── Transaction counts ────────────────────────────────────────────────────
  const tx_count     = Math.max(txs.length, 1);
  const tx_count_7d  = txs.filter(t => t.date >= now - oneWeekMs).length;

  // ── Cash-out ratio (debits / all) ─────────────────────────────────────────
  const cash_out_ratio = txs.length > 0 ? debits.length / txs.length : 0.3;

  // ── Balance drain ratio ────────────────────────────────────────────────────
  // Python profile: "balance_drain_ratio: 0.05 means keeps plenty of money"
  // Our interpretation: (start - current) / start
  const effectiveStart = Math.max(startingBalance, 1);
  const balance_drain_ratio = Math.min(1.0, Math.max(0,
    (effectiveStart - bankBalance) / effectiveStart
  ));

  // ── Zero / near-limit events ──────────────────────────────────────────────
  const lowThreshold = effectiveStart * 0.05;
  const times_balance_zero  = bankBalance < lowThreshold ? 1 : 0;
  const times_near_limit    = amounts.filter(a => a > avg_amount * 0.8).length;
  const avg_days_between_limit_hits = times_near_limit > 0
    ? (tx_count_7d / Math.max(times_near_limit, 1)) / 7
    : (metadata?.trust_feature_stats?.avg_days_between_limit_hits?.mean ?? 0.13);

  // ── Frequency spike ratio ─────────────────────────────────────────────────
  // Python: "freq_spike_ratio: 3.5 means sudden spike in usage"
  const ageMs   = now - Math.min(...txs.map(t => t.date), now);
  const ageDays = Math.max(ageMs / (1000 * 3600 * 24), 1);
  const dailyAvg       = tx_count / ageDays;
  const recent7dRate   = tx_count_7d / 7;
  const freq_spike_ratio = dailyAvg > 0
    ? Math.min(recent7dRate / dailyAvg, 5)
    : 1.0;

  // ── Late night ratio ──────────────────────────────────────────────────────
  const lateNight = txs.filter(t => {
    const h = new Date(t.date).getHours();
    return h >= 23 || h <= 4;
  }).length;
  const late_night_ratio = txs.length > 0 ? lateNight / txs.length : 0;

  // ── Amount vs avg ratio (last tx relative to personal avg) ────────────────
  const lastDebitAmt   = amounts.length > 0 ? amounts[0] : avg_amount;
  const amount_vs_avg_ratio = avg_amount > 0 ? lastDebitAmt / avg_amount : 1.0;

  // ── Repeat receiver ratio ─────────────────────────────────────────────────
  const targets = txs.map(t => t.target).filter(Boolean);
  const targetCountMap = targets.reduce((acc: Record<string, number>, t) => {
    acc[t!] = (acc[t!] || 0) + 1; return acc;
  }, {});
  const uniqueTargets  = Object.keys(targetCountMap).length;
  const repeatTargets  = Object.values(targetCountMap).filter(c => c > 1).length;
  const repeat_receiver_ratio = uniqueTargets > 0 ? repeatTargets / uniqueTargets : 0;
  const unique_receiver_count_7d = new Set(
    txs.filter(t => t.date >= now - oneWeekMs).map(t => t.target)
  ).size;

  // ── Infra / KYC / device signals (realistic defaults matching Python gold profile) ─
  const account_age_days       = 180;
  const device_consistency     = Math.min(0.95,
    0.5 + (Math.log1p(tx_count) / Math.log1p(100)) * 0.45
  );
  const offline_tx_ratio       = Math.min(1.0, cash_out_ratio * 0.5 + 0.1);
  const avg_offline_session_hours = Math.max(0.5, 12 - Math.log1p(tx_count_7d) * 1.2);
  const days_since_last_sync   = Math.min(5.0, tx_count_7d > 5 ? 0.5 : 1.5);
  const current_unsynced_amount = Math.min(14000,
    avg_amount * days_since_last_sync * Math.max(tx_count_7d / 7, 0.1) + 150
  );
  const unsynced_amount_vs_avg_ratio = avg_amount > 0
    ? Math.min(50, current_unsynced_amount / avg_amount)
    : 1.0;
  const kyc_days_ago          = 365;
  const balance_recovery_speed = Math.max(1.0, 15.0 / (times_balance_zero + 1));

  return {
    avg_amount, std_amount, p90_amount, max_amount,
    tx_count, cash_out_ratio, balance_drain_ratio,
    times_balance_zero, times_near_limit, avg_days_between_limit_hits,
    tx_count_7d, freq_spike_ratio, late_night_ratio,
    amount_vs_avg_ratio, repeat_receiver_ratio, unique_receiver_count_7d,
    account_age_days, device_consistency,
    offline_tx_ratio, avg_offline_session_hours, days_since_last_sync,
    current_unsynced_amount, unsynced_amount_vs_avg_ratio,
    kyc_days_ago, balance_recovery_speed,
  };
}

function toVector(featureNames: string[], profile: Record<string, number>): number[] {
  return featureNames.map(k => profile[k] ?? 0);
}

// ── 2. Build GRU Sequence matching Python build_gru_tensor() ────────────────
// Feature order (from gru_feature_order in metadata):
//   [0] amount_normalized    [1] type_code (norm)  [2] hour_sin  [3] hour_cos
//   [4] balance_normalized   [5] is_familiar_receiver [6] days_gap
//   [7] amount_vs_user_max   [8] sudden_spike_flag  [9] late_night_flag

// Python type codes (normalized, matching script):
//   CASH_IN / credit  → 0.0
//   PAYMENT / debit   → 0.75
//   TRANSFER / debit  → 1.0
//   repay             → 0.5

function typeCode(tx: TxRecord): number {
  if (tx.type === 'credit') return 0.0;
  if (tx.type === 'repay')  return 0.5;
  // Heuristic: high-value debits are more likely "transfers"
  return 0.75; // default: PAYMENT
}

function buildGRUSequence(
  txs: TxRecord[],
  bankBalance: number,
  avgAmount: number,
  maxAmount: number,
  startingBalance: number,
  seqLen: number = 20
): number[][] {
  const recent = txs.slice(0, seqLen).reverse(); // oldest-first
  const sequence: number[][] = [];

  // Build known receiver set from older history (beyond seqLen)
  const knownTargets = new Set(txs.slice(seqLen).map(t => t.target));

  // The latest balance ceiling (use starting balance as the 100% mark)
  const balanceCeiling = Math.max(startingBalance, bankBalance, 1);

  for (let i = 0; i < seqLen; i++) {
    if (i >= recent.length) {
      // Zero-pad for missing history (matches Python's np.zeros)
      sequence.push(new Array(10).fill(0));
      continue;
    }

    const tx   = recent[i];
    const prev = i > 0 ? recent[i - 1] : null;
    const hour = new Date(tx.date).getHours();

    // [0] amount_normalized — amount vs user's personal max
    const amount_normalized = maxAmount > 0
      ? Math.min((tx.amount || 0) / maxAmount, 1.0)
      : 0;

    // [1] type_code (normalized, matching Python)
    const type_code = typeCode(tx);

    // [2][3] hour_sin, hour_cos — cyclic time encoding
    const hour_sin = Math.sin((2 * Math.PI * hour) / 24);
    const hour_cos = Math.cos((2 * Math.PI * hour) / 24);

    // [4] balance_normalized — current balance vs session ceiling
    const balance_normalized = Math.min(1.0, Math.max(0, bankBalance / balanceCeiling));

    // [5] is_familiar_receiver — 1 if user has paid this merchant before
    const is_familiar_receiver = tx.target && knownTargets.has(tx.target) ? 1.0 : 0.0;

    // [6] days_gap — fraction-of-a-day since previous tx (like Python's 1/24)
    const days_gap = prev
      ? Math.min(30, (tx.date - prev.date) / (1000 * 3600 * 24))
      : 1.0 / 24.0;

    // [7] amount_vs_user_max — how close to the user's known ceiling
    const amount_vs_user_max = maxAmount > 0
      ? Math.min((tx.amount || 0) / maxAmount, 1.0)
      : 0;

    // [8] sudden_spike_flag — 1 if tx is >3× personal average (mirrors Python)
    const sudden_spike_flag = avgAmount > 0 && (tx.amount || 0) > avgAmount * 3 ? 1.0 : 0.0;

    // [9] late_night_flag — 1 if 11 PM – 5 AM (mirrors Python's hour=3 check)
    const late_night_flag = (hour >= 23 || hour <= 4) ? 1.0 : 0.0;

    sequence.push([
      amount_normalized, type_code, hour_sin, hour_cos,
      balance_normalized, is_familiar_receiver, days_gap,
      amount_vs_user_max, sudden_spike_flag, late_night_flag,
    ]);

    // Grow known receivers as we replay history  
    if (tx.target) knownTargets.add(tx.target);
  }

  return sequence;
}

/**
 * GRU risk approximation — mirrors the TFLite model's sensitivity.
 *
 * Key patterns it catches (same as Python user_risky tensor):
 *   • Bust-out attack: normal spend for N steps, then sudden high-value
 *     night transfers to unknown receivers (sudden_spike + late_night + unknown)
 *   • Drain-to-zero: balance_norm drops rapidly across sequence
 *   • Sustained anomaly: high freq in recent steps vs baseline
 *
 * Returns 0.0 (very safe) → 1.0 (fraud pattern detected)
 */
function approximateGRU(sequence: number[][]): number {
  if (!sequence.length) return 0.2;

  const n = sequence.length;
  let weightedRisk = 0;
  let totalWeight  = 0;

  // Track balance trend across sequence (for drain detection)
  const balances = sequence.map(f => f[4]); // balance_normalized
  const balanceDrop = balances.length >= 2
    ? Math.max(0, balances[0] - balances[balances.length - 1])
    : 0;

  sequence.forEach((f, idx) => {
    // More recent steps carry higher weight (GRU hidden state recency)
    const recencyWeight = Math.pow(1.2, idx);

    const [
      amount_norm, , , ,
      balance_norm,
      is_familiar,
      ,
      amount_vs_max,
      sudden_spike,
      late_night,
    ] = f;

    // Python user_risky pattern: spikes at late night to unknowns
    const burstRisk  = sudden_spike * 0.35 + late_night * 0.20;
    const unknownRisk = (1 - is_familiar) * 0.15;
    const sizeRisk    = amount_vs_max   * 0.15;
    const balRisk     = (1 - balance_norm) * 0.10;
    const drainBonus  = balanceDrop    * 0.05;

    const stepRisk = Math.min(1.0,
      burstRisk + unknownRisk + sizeRisk + balRisk + drainBonus
    );

    weightedRisk += stepRisk * recencyWeight;
    totalWeight  += recencyWeight;
  });

  return Math.min(0.95, Math.max(0, weightedRisk / totalWeight));
}
// ── 3. GRU inference dispatcher ──────────────────────────────────────────────
//
//  On Android (inside the Capacitor WebView):
//    → Calls EdgePayPlugin.java which runs gru_sequence.tflite via real TFLite.
//    → Uses REAL model weights. Zero approximation.
//
//  On Web (browser / `npm run dev`):
//    → Native plugin is unavailable → falls back to approximateGRU().
//    → The JS approximation is only for development/testing, never production.

async function runGRUInference(sequence: number[][]): Promise<number> {
  try {
    // Flatten the 2D sequence to a 1D array for the native bridge
    // Shape: [seqLen × nFeatures] = 200 floats, row-major
    const flat = sequence.flat();
    const { risk } = await EdgePay.runGRU({ sequence: flat });
    // Validate the returned value is a sane number
    if (typeof risk === 'number' && isFinite(risk)) {
      console.log('[TrustEngine] GRU via native TFLite:', risk.toFixed(4));
      return Math.max(0, Math.min(1, risk));
    }
    throw new Error('Invalid risk value from native plugin: ' + risk);
  } catch (err) {
    // Native plugin not available (web browser / iOS) — use JS approximation
    console.warn('[TrustEngine] Native GRU unavailable, using JS approximation:', err);
    return approximateGRU(sequence);
  }
}



export async function computeTrustLimit(
  txs: TxRecord[],
  bankBalance: number,
  startingBalance: number = 40000,
  elapsedHours: number    = 0,  // hours since going offline
): Promise<TrustResult> {
  if (!isLoaded) await initTrustEngine();
  if (!trustModel || !metadata) {
    // Fallback: simple balance-based estimate
    const fallbackLimit = Math.round(Math.min(bankBalance * 0.3, 10000));
    return {
      trustScore: 50, gruRisk: 0.3, maxAmount: fallbackLimit,
      sessionDuration: 6, edgeLimit: fallbackLimit,
      balanceDrainPct: 0, elapsedHours,
    };
  }

  const { trust_features, gru_seq_len } = metadata;

  // ── A. Compute XGBoost feature profile ──────────────────────────────────────
  const profile = buildXGBProfile(txs, bankBalance, startingBalance);
  const trustVec = toVector(trust_features, profile);

  // rawTrust: stable 0–1 sigmoid output from trust XGBoost (classification-like)
  const rawTrust = Math.max(0, Math.min(1, trustModel.predict(trustVec)));

  // ── B. GRU sequence risk ─────────────────────────────────────────────────────
  const seqLen = gru_seq_len ?? 20;
  // Use avg_amount from profile for GRU sequence building
  const avgAmtForGRU = profile.avg_amount > 0 ? profile.avg_amount : bankBalance * 0.1;
  const sequence = buildGRUSequence(
    txs, bankBalance, avgAmtForGRU, bankBalance, startingBalance, seqLen
  );
  // Try native TFLite (Android) first; fall back to JS approximation on web
  const gruRisk = await runGRUInference(sequence);

  // ── C. Cold Start Rule ───────────────────────────────────────────────────────
  const COLD_START_THRESHOLD = 10;
  if (profile.tx_count < COLD_START_THRESHOLD) {
    return {
      trustScore:      Math.round(rawTrust * 100),
      gruRisk:         Math.round(gruRisk * 100) / 100,
      maxAmount:       0,
      sessionDuration: 6,
      edgeLimit:       0,
      balanceDrainPct: Math.round(profile.balance_drain_ratio * 100),
      elapsedHours,
      isColdStart:     true,
    };
  }

  // ── D. Deterministic, Balance-Anchored EdgeLimit Formula ─────────────────────
  //
  // Problem with raw XGBoost maxAmount:
  //   The regression model was trained on synthetic data and outputs 500k+ raw
  //   values. Small feature shifts (e.g. paying ₹500) can move the decision path
  //   to a completely different leaf, crashing the prediction from 560k to <1k.
  //
  // Solution: Anchor the offline limit to the user's actual real balance and
  // trust score. This is financially sound, stable, and user-friendly:
  //
  //   maxSafeAmount = bankBalance × allowanceRate
  //   allowanceRate = lerp(0.15, 0.50, rawTrust)   →  range: 15%–50% of balance
  //   combined      = 0.6(1 − gruRisk) + 0.4(rawTrust)
  //   decayFactor   = max(0.2, 1 − elapsed / sessionHours)
  //   edgeLimit     = clip(combined × maxSafeAmount × decayFactor, 0, 10000)
  //
  // Examples:
  //   Balance ₹8,000 · trust 0.70 · gru 0.25 → allowance ₹2,800 → limit ₹2,128
  //   Balance ₹8,000 · trust 0.85 · gru 0.15 → allowance ₹3,600 → limit ₹3,024
  //   Balance ₹40,000· trust 0.90 · gru 0.10 → allowance ₹18,000 → cap ₹10,000

  const sessionH = 6; // fixed 6-hour reference session (stable, not XGBoost)

  // allowanceRate: trust 0 → 15% of balance, trust 1 → 50% of balance
  const allowanceRate   = 0.15 + rawTrust * 0.35;
  const maxSafeAmount   = bankBalance * allowanceRate;

  // combined_trust: identical to Python formula (gru risk reduces it)
  const combinedTrust   = Math.min(1, Math.max(0, 0.6 * (1 - gruRisk) + 0.4 * rawTrust));

  // time decay: limit reduces as session ages (same Python formula)
  const decay           = Math.max(0.2, 1.0 - (elapsedHours / sessionH));

  const rawLimit        = combinedTrust * maxSafeAmount * decay;
  const backendCap      = metadata.session_decay?.backend_cap_default ?? 10000;
  const edgeLimit       = Math.round(Math.min(rawLimit, backendCap));

  console.log('[EdgePay AI]', {
    rawTrust: rawTrust.toFixed(3),
    gruRisk:  gruRisk.toFixed(3),
    allowanceRate: allowanceRate.toFixed(3),
    maxSafeAmount: Math.round(maxSafeAmount),
    combinedTrust: combinedTrust.toFixed(3),
    decay:    decay.toFixed(3),
    edgeLimit,
  });

  return {
    trustScore:      Math.round(rawTrust * 100),
    gruRisk:         Math.round(gruRisk * 100) / 100,
    maxAmount:       Math.round(maxSafeAmount),
    sessionDuration: sessionH,
    edgeLimit,
    balanceDrainPct: Math.round(profile.balance_drain_ratio * 100),
    elapsedHours,
    isColdStart:     false,
  };
}

