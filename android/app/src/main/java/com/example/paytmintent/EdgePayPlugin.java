package com.example.paytmintent;

import android.content.res.AssetFileDescriptor;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.tensorflow.lite.Interpreter;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;

/**
 * EdgePayPlugin — Native Capacitor bridge for on-device ML inference.
 *
 * Exposed to JavaScript via:
 *   import { EdgePay } from '@/lib/EdgePayPlugin';
 *   const { risk } = await EdgePay.runGRU({ sequence: float200Array });
 *
 * The GRU model (gru_sequence.tflite) expects:
 *   Input  : float32[1][20][10]  — 20 time-steps × 10 features
 *   Output : float32[1][1]       — sequence risk score 0–1
 *
 * Model asset path inside APK:
 *   Capacitor copies webDir ("out/") → assets/public/
 *   So the model lives at:  assets/public/models/trustscore/gru_sequence.tflite
 *   (This is the exact same file served as /models/trustscore/gru_sequence.tflite
 *    to the WebView — no duplication needed.)
 */
@CapacitorPlugin(name = "EdgePay")
public class EdgePayPlugin extends Plugin {

    // Path within Android assets (Capacitor wraps webDir under "public/")
    private static final String GRU_MODEL_ASSET = "public/models/trustscore/gru_sequence.tflite";

    // Shape constants from model_metadata.json
    private static final int SEQ_LEN    = 20;
    private static final int N_FEATURES = 10;

    // Lazily initialised — loaded once, reused for every call
    private Interpreter gruInterpreter = null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public void load() {
        // Pre-warm the interpreter at startup so first payment is instant
        try {
            gruInterpreter = new Interpreter(loadModelBuffer(GRU_MODEL_ASSET));
            android.util.Log.i("EdgePay", "[GRU] TFLite interpreter loaded successfully.");
        } catch (IOException e) {
            // Non-fatal: will retry lazily on first runGRU() call
            android.util.Log.w("EdgePay", "[GRU] Pre-warm failed, will retry lazily: " + e.getMessage());
        }
    }

    // ── Plugin Methods ────────────────────────────────────────────────────────

    /**
     * runGRU — Run the real TFLite GRU on the 20-step transaction sequence.
     *
     * JS call:
     *   const { risk } = await EdgePay.runGRU({
     *     sequence: Float32Array(200)   // flat [20 × 10] row-major
     *   });
     *
     * Returns: { risk: number }  where 0 = safe, 1 = high fraud risk
     */
    @PluginMethod
    public void runGRU(PluginCall call) {
        JSArray seqArr = call.getArray("sequence");
        if (seqArr == null || seqArr.length() == 0) {
            call.reject("Missing or empty 'sequence' parameter (expected 200 floats).");
            return;
        }

        try {
            // ── 1. Parse flat JS array → float[1][20][10] ────────────────────
            float[][][] input = new float[1][SEQ_LEN][N_FEATURES];
            int totalLen = SEQ_LEN * N_FEATURES;
            for (int i = 0; i < SEQ_LEN; i++) {
                for (int j = 0; j < N_FEATURES; j++) {
                    int idx = i * N_FEATURES + j;
                    if (idx < seqArr.length()) {
                        // getDouble() handles both integer and float JSON values
                        input[0][i][j] = (float) seqArr.getDouble(idx);
                    }
                    // else: leaves as 0.0f — same as Python's np.zeros zero-padding
                }
            }

            // ── 2. Lazy-load interpreter if pre-warm failed ──────────────────
            if (gruInterpreter == null) {
                gruInterpreter = new Interpreter(loadModelBuffer(GRU_MODEL_ASSET));
            }

            // ── 3. Run inference ─────────────────────────────────────────────
            float[][] output = new float[1][1];
            gruInterpreter.run(input, output);

            // ── 4. Clamp to [0, 1] and return ───────────────────────────────
            double risk = Math.max(0.0, Math.min(1.0, output[0][0]));
            android.util.Log.d("EdgePay", "[GRU] Sequence risk = " + risk);

            JSObject result = new JSObject();
            result.put("risk", risk);
            call.resolve(result);

        } catch (Exception e) {
            android.util.Log.e("EdgePay", "[GRU] Inference error: " + e.getMessage(), e);
            call.reject("GRU inference failed: " + e.getMessage());
        }
    }

    /**
     * getModelInfo — Returns model shape info so JS can validate before calling.
     * Useful for debugging.
     */
    @PluginMethod
    public void getModelInfo(PluginCall call) {
        JSObject info = new JSObject();
        info.put("seqLen",     SEQ_LEN);
        info.put("nFeatures",  N_FEATURES);
        info.put("inputSize",  SEQ_LEN * N_FEATURES);
        info.put("modelAsset", GRU_MODEL_ASSET);
        info.put("loaded",     gruInterpreter != null);
        call.resolve(info);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Memory-map an asset file for zero-copy loading into TFLite.
     * This is the recommended approach from TFLite Android docs.
     */
    private MappedByteBuffer loadModelBuffer(String assetPath) throws IOException {
        AssetFileDescriptor fd = getContext().getAssets().openFd(assetPath);
        FileInputStream stream = new FileInputStream(fd.getFileDescriptor());
        FileChannel channel = stream.getChannel();
        return channel.map(
            FileChannel.MapMode.READ_ONLY,
            fd.getStartOffset(),
            fd.getDeclaredLength()
        );
    }
}
