// Espelho (mínimo) dos grupos de evidência usados no servidor (supabase/functions/_shared/candidates.ts).
// Um teste garante que os dois não divergem.
export const THEORY = ["course"];
export const PRACTICE = ["implementation", "production", "personal_project", "professional_experience", "experiment"];
export const QUALITY = ["tests", "llm_evaluation", "documentation", "architecture_decision"];
export const EVIDENCE_TYPES = [...PRACTICE, ...QUALITY, ...THEORY, "presentation"];
export function groupsOf(list) {
  return {
    theory: list.some((e) => THEORY.includes(e.evidence_type)),
    practice: list.some((e) => PRACTICE.includes(e.evidence_type)),
    quality: list.some((e) => QUALITY.includes(e.evidence_type)),
    showcase: list.some((e) => e.visibility === "public" || e.evidence_type === "presentation"),
  };
}
