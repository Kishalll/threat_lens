export interface ScoreInputs {
  activeBreachesCount: number;
  totalMessagesScanCount: number; // kept for compatibility (not used)
  flaggedMessagesScanCount: number; // kept for compatibility (not used)
  protectedImagesCount: number;
  totalSuggestions: number;
  actedSuggestions: number;
}

const BASE_SCORE = 100;

// ✅ CAPPED BREACH PENALTY
function getBreachPenalty(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 10;
  if (count <= 5) return 20;
  if (count <= 10) return 30;
  return 40; // max penalty
}

const MAX_SUGGESTION_BONUS = 20;
const IMAGE_BONUS_PER_PROTECTION = 3;
const MAX_IMAGE_BONUS = 15;

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function calculateSafetyScore(inputs: ScoreInputs): number {
  const activeBreachesCount = Math.max(0, inputs.activeBreachesCount);

  const totalSuggestions = Math.max(0, inputs.totalSuggestions);
  const actedSuggestions = Math.min(
    Math.max(0, inputs.actedSuggestions),
    totalSuggestions
  );

  const protectedImagesCount = Math.max(0, inputs.protectedImagesCount);

  // 🧠 Behavior-based scoring
  let score = BASE_SCORE;

  // 🔴 Breach penalty (CAPPED)
  score -= getBreachPenalty(activeBreachesCount);

  // 🟢 Suggestions bonus
  if (totalSuggestions > 0) {
    score += (actedSuggestions / totalSuggestions) * MAX_SUGGESTION_BONUS;
  }

  // 🟢 Image protection bonus
  score += Math.min(
    protectedImagesCount * IMAGE_BONUS_PER_PROTECTION,
    MAX_IMAGE_BONUS
  );

  return Math.round(clampScore(score));
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#4ADE80"; // 🟢 Secure
  if (score >= 50) return "#FBBF24"; // 🟡 Moderate Risk
  return "#F87171"; // 🔴 At Risk
}