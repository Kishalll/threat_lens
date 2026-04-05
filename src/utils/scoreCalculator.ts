export interface ScoreInputs {
  activeBreachesCount: number;
  totalMessagesScanCount: number;
  flaggedMessagesScanCount: number;
  protectedImagesCount: number;
  totalSuggestions: number;
  actedSuggestions: number;
}

export function calculateSafetyScore(inputs: ScoreInputs): number {
  let score = 0;

  // 1. Breach Status (40%)
  // 0 breaches = 100 * 0.40 = 40 pts
  // Each unresolved breach deducts 20 pts (so deducts 20*0.40 = 8 pts out of 40)
  let breachScore = 100 - inputs.activeBreachesCount * 20;
  if (breachScore < 0) breachScore = 0;
  score += breachScore * 0.4;

  // 2. Message Safety (30%)
  // Ratio of safe vs total messages
  let messageScore = 100;
  if (inputs.totalMessagesScanCount > 0) {
    const safeMessages =
      inputs.totalMessagesScanCount - inputs.flaggedMessagesScanCount;
    messageScore = (safeMessages / inputs.totalMessagesScanCount) * 100;
  }
  score += messageScore * 0.3;

  // 3. Image Protection Activity (20%)
  // Max 100 at 5+ images -> 20 pts per image
  let imageScore = inputs.protectedImagesCount * 20;
  if (imageScore > 100) imageScore = 100;
  score += imageScore * 0.2;

  // 4. Suggestions Acted On (10%)
  // % of Gemini suggestions acted on
  let suggestionsScore = 100;
  if (inputs.totalSuggestions > 0) {
    suggestionsScore =
      (inputs.actedSuggestions / inputs.totalSuggestions) * 100;
  }
  score += suggestionsScore * 0.1;

  return Math.round(score);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#4ADE80"; // Green (Secure)
  if (score >= 50) return "#FBBF24"; // Amber (Moderate Risk)
  return "#F87171"; // Red (At Risk)
}
