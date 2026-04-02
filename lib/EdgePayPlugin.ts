/**
 * EdgePayPlugin — TypeScript bindings for the native Capacitor plugin.
 *
 * On Android: calls EdgePayPlugin.java → real TFLite GRU inference
 * On Web/iOS : falls back to JS approximation (approximateGRU in trust_engine.ts)
 *
 * Usage:
 *   import { EdgePay } from '@/lib/EdgePayPlugin';
 *   const { risk } = await EdgePay.runGRU({ sequence: flatArray });
 */

import { registerPlugin } from '@capacitor/core';

// ── Type definitions ──────────────────────────────────────────────────────────

export interface EdgePayPlugin {
  /**
   * Run the real TFLite GRU model on a sequence of transactions.
   *
   * @param options.sequence - Flat Float32 array of length seqLen × nFeatures (200)
   *   Row-major: [step0_f0, step0_f1, ... step0_f9, step1_f0, ...]
   *   Feature order (from model_metadata.json gru_feature_order):
   *     [0] amount_normalized        [1] type_code
   *     [2] hour_sin                 [3] hour_cos
   *     [4] balance_normalized       [5] is_familiar_receiver
   *     [6] days_gap                 [7] amount_vs_user_max
   *     [8] sudden_spike_flag        [9] late_night_flag
   *
   * @returns { risk: number } — 0.0 (very safe) → 1.0 (high fraud risk)
   */
  runGRU(options: { sequence: number[] }): Promise<{ risk: number }>;

  /**
   * Returns model metadata for debugging / validation.
   */
  getModelInfo(): Promise<{
    seqLen: number;
    nFeatures: number;
    inputSize: number;
    modelAsset: string;
    loaded: boolean;
  }>;
}

// ── Register with Capacitor ───────────────────────────────────────────────────
// On Android: resolves to EdgePayPlugin.java
// On Web    : resolves to undefined (we catch this in trust_engine.ts fallback)
export const EdgePay = registerPlugin<EdgePayPlugin>('EdgePay');
