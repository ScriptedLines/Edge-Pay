import xgboost as xgb
import onnxmltools
from onnxmltools.convert import convert_xgboost
from onnxconverter_common.data_types import FloatTensorType
import json
from pathlib import Path

# ─── Paths (relative to this script file) ────────────────────────────────────
# This script lives in Edge-pay/. App models live in Edge-pay/public/models/trustscore/
SCRIPT_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPT_DIR / "public" / "models" / "trustscore"


def convert_xgb_to_onnx(json_path: Path, onnx_path: Path, num_features: int):
    print(f"Loading {json_path.name}...")
    model = xgb.XGBRegressor()
    model.load_model(str(json_path))

    initial_types = [('input', FloatTensorType([None, num_features]))]
    print(f"  Converting to ONNX ({num_features} features)...")
    onnx_model = convert_xgboost(model, initial_types=initial_types)

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"  ✓ Saved → {onnx_path.relative_to(SCRIPT_DIR)}\n")


def main():
    meta_path = MODELS_DIR / "model_metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(
            f"model_metadata.json not found at:\n  {meta_path}\n"
            "Make sure models are in Edge-pay/public/models/trustscore/"
        )

    with open(meta_path, "r") as f:
        meta = json.load(f)

    trust_feats   = len(meta["trust_features"])
    amount_feats  = len(meta["amount_features"])
    session_feats = len(meta["session_features"])

    print(f"\nEdgePay — XGBoost → ONNX Converter")
    print(f"Source : {MODELS_DIR.relative_to(SCRIPT_DIR)}")
    print(f"Features: trust={trust_feats}  amount={amount_feats}  session={session_feats}\n")

    models = [
        (
            MODELS_DIR / "trust_xgboost.json",
            MODELS_DIR / "trust_xgboost.onnx",
            trust_feats,
        ),
        (
            MODELS_DIR / "max_amount_xgboost.json",
            MODELS_DIR / "max_amount_xgboost.onnx",
            amount_feats,
        ),
        (
            MODELS_DIR / "session_duration_xgboost.json",
            MODELS_DIR / "session_duration_xgboost.onnx",
            session_feats,
        ),
    ]

    for in_path, out_path, num_feats in models:
        convert_xgb_to_onnx(in_path, out_path, num_feats)

    print("✓ All models converted successfully.")


if __name__ == "__main__":
    main()
