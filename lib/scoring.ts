/**
 * Lead scoring: explainable rule signals + LLM-assessed readiness, blended 50/50.
 * Every signal is written to leads/{id}/events so counsellors can audit the score.
 */
export const EVENT_POINTS: Record<string, number> = {
  phone_captured: 15,
  name_captured: 5,
  city_captured: 5,
  eligibility_pass: 10,
  eligibility_fail: 5, // still engagement
  asked_fees: 10,
  visit_intent: 20,
  quiz_done: 10,
  wa_opt_in: 10,
  wa_replied: 15,
  application_submitted: 25,
  parent_detected: 5,
  long_conversation: 5,
  voice_call_completed: 10,
  call_outcome_visit_booked: 20,
  call_outcome_interested: 10,
  call_outcome_callback: 8,
  revived: 0,
  inactivity_decay: -15,
  eligibility_check: 3,
};

export const HOT_THRESHOLD = 70;
export const WARM_THRESHOLD = 40;

export function blendScore(ruleScore: number, llmReadiness: number | null) {
  const rule = clamp(ruleScore, 0, 100);
  const llm = llmReadiness == null ? rule : clamp(llmReadiness, 0, 100);
  return Math.round(0.5 * rule + 0.5 * llm);
}

export function temperatureFor(score: number): "cold" | "warm" | "hot" {
  if (score >= HOT_THRESHOLD) return "hot";
  if (score >= WARM_THRESHOLD) return "warm";
  return "cold";
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
