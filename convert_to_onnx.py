import xgboost as xgb
import onnxmltools
from onnxmltools.convert import convert_xgboost
from onnxconverter_common.data_types import FloatTensorType
import json
import os

def convert_xgb_to_onnx(json_path, onnx_path, num_features):
    print(f"Loading {json_path}...")
    model = xgb.XGBRegressor()
    model.load_model(json_path)

    # Convert to ONNX
    initial_types = [('input', FloatTensorType([None, num_features]))]
    
    print(f"Converting to ONNX ({num_features} features)...")
    onnx_model = convert_xgboost(model, initial_types=initial_types)
    
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"Saved ONNX to {onnx_path}")

def main():
    metadata_path = r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\model_metadata.json"
    with open(metadata_path, 'r') as f:
        meta = json.load(f)
        
    trust_feats = len(meta['trust_features'])
    amount_feats = len(meta['amount_features'])
    session_feats = len(meta['session_features'])
    
    models = [
        (r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\trust_xgboost.json",
         r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\trust_xgboost.onnx",
         trust_feats),
         
        (r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\max_amount_xgboost.json",
         r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\max_amount_xgboost.onnx",
         amount_feats),
         
        (r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\session_duration_xgboost.json",
         r"c:\Users\avi40\Desktop\Paytm\paytm-intent\public\models\trustscore\session_duration_xgboost.onnx",
         session_feats)
    ]
    
    for in_path, out_path, num_feats in models:
        convert_xgb_to_onnx(in_path, out_path, num_feats)

if __name__ == '__main__':
    main()
