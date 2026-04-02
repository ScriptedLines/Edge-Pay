export class XGBoostPredictor {
  private trees: any[];
  private baseScore: number;

  constructor(modelJson: any) {
    this.trees = modelJson.learner.gradient_booster.model.trees;
    // Handle exponential notation like 7.81929E-1
    this.baseScore = Number(modelJson.learner.learner_model_param.base_score);
  }

  public predict(features: number[]): number {
    let sum = this.baseScore;

    for (const tree of this.trees) {
      let nodeIdx = 0; // Root node
      
      // Node is a leaf when left_children[idx] == -1
      while (tree.left_children[nodeIdx] !== -1) {
        const featureIdx = tree.split_indices[nodeIdx];
        const threshold = tree.split_conditions[nodeIdx];
        const featVal = features[featureIdx] || 0.0; // Assume 0 if missing

        // If the value is missing (undefined/NaN), XGBoost uses default_left
        // Simplified here since we fill missing with 0 in our feature extractor
        if (featVal < threshold) {
          nodeIdx = tree.left_children[nodeIdx];
        } else {
          nodeIdx = tree.right_children[nodeIdx];
        }
      }
      sum += tree.base_weights[nodeIdx];
    }
    return sum;
  }
}
