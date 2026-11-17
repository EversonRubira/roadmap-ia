// Contrato da resposta do advisor: JSON Schema enviado à Groq + validação própria (a Groq pode falhar a conformidade).
export const ACTION_TYPES = ["LEARN", "APPLY", "CONSOLIDATE", "DEMONSTRATE"];
export const LIMITS = { reason: 700, next_action: 400, public_summary: 400, item: 200, skills: 6, evidence: 5 };

export function resultSchema(competencyIds) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["current_focus", "reason", "next_action", "action_type", "skills_to_learn", "expected_evidence", "public_summary"],
    properties: {
      current_focus: { type: "string", enum: competencyIds },
      reason: { type: "string" },
      next_action: { type: "string" },
      action_type: { type: "string", enum: ACTION_TYPES },
      skills_to_learn: { type: "array", items: { type: "string" } },
      expected_evidence: { type: "array", items: { type: "string" } },
      public_summary: { type: "string" },
    },
  };
}

const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const strList = (v, maxItems, min) => Array.isArray(v) && v.length >= min && v.length <= maxItems && v.every((x) => str(x, LIMITS.item));

/** Devolve { ok: true, value } com só os campos conhecidos, ou { ok: false, errors }. Nunca confia no modelo. */
export function validateResult(raw, competencyIds) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["resposta não é um objeto"] };
  if (!competencyIds.includes(raw.current_focus)) errors.push("current_focus inválido");
  if (!str(raw.reason, LIMITS.reason)) errors.push("reason inválido");
  if (!str(raw.next_action, LIMITS.next_action)) errors.push("next_action inválido");
  if (!ACTION_TYPES.includes(raw.action_type)) errors.push("action_type inválido");
  if (!strList(raw.skills_to_learn, LIMITS.skills, 0)) errors.push("skills_to_learn inválido");
  if (!strList(raw.expected_evidence, LIMITS.evidence, 1)) errors.push("expected_evidence inválido");
  if (!str(raw.public_summary, LIMITS.public_summary)) errors.push("public_summary inválido");
  if (errors.length) return { ok: false, errors };
  const { current_focus, reason, next_action, action_type, skills_to_learn, expected_evidence, public_summary } = raw;
  return { ok: true, value: { current_focus, reason: reason.trim(), next_action: next_action.trim(), action_type, skills_to_learn: skills_to_learn.map((s) => s.trim()), expected_evidence: expected_evidence.map((s) => s.trim()), public_summary: public_summary.trim() } };
}
