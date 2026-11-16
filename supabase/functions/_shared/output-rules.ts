// Regras de negócio aplicadas às saídas do modelo, DEPOIS da validação do schema.
import { RECOMMENDATION_SCHEMA, ASSESSMENT_SCHEMA, EXPLANATION_SCHEMA } from "./schemas.ts";
import { validate } from "./validate.ts";
import type { Kind } from "./candidates.ts";

export interface AllowedResource { title: string; provider: string; url: string | null }
export interface RecommendationOut {
  candidateId: string; competencyId: string; title: string; reason: string;
  actionType: "course" | "documentation" | "project" | "improvement" | "demonstration";
  estimatedHours: { min: number; max: number };
  expectedEvidence: string[]; acceptanceCriteria: string[];
  learningResources: AllowedResource[]; confidence: "low" | "medium" | "high"; language: "pt-PT" | "en-GB";
}
const ACTION_BY_KIND: Record<Kind, string[]> = {
  learn: ["course", "documentation"],
  apply: ["project", "improvement"],
  consolidate: ["improvement", "documentation", "project"],
  demonstrate: ["demonstration", "documentation"],
};

export function checkRecommendation(
  raw: unknown,
  ctx: { candidates: { id: string; slug: string; kind: Kind }[]; resources: AllowedResource[]; language: string },
): { ok: true; value: RecommendationOut } | { ok: false; errors: string[] } {
  const errors = validate(RECOMMENDATION_SCHEMA, raw);
  if (errors.length) return { ok: false, errors };
  const v = raw as RecommendationOut;
  const cand = ctx.candidates.find((c) => c.id === v.candidateId);
  if (!cand) errors.push("candidateId desconhecido");
  else {
    if (cand.slug !== v.competencyId) errors.push("competencyId não corresponde ao candidato");
    if (!ACTION_BY_KIND[cand.kind].includes(v.actionType)) errors.push("actionType incompatível com o tipo de recomendação");
  }
  if (v.language !== ctx.language) errors.push("idioma diferente do pedido");
  if (v.estimatedHours.min > v.estimatedHours.max) errors.push("horas: min > max");
  for (const r of v.learningResources) {
    if (!ctx.resources.some((a) => a.title === r.title && a.provider === r.provider && (a.url ?? null) === (r.url ?? null))) {
      errors.push("recurso não existe no catálogo fornecido");
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: v };
}

export function checkAssessments(raw: unknown, ctx: { slugs: string[]; language: string }) {
  const errors = validate(ASSESSMENT_SCHEMA, raw);
  if (errors.length) return { ok: false as const, errors };
  const v = raw as { language: string; assessments: { competencyId: string }[] };
  if (v.language !== ctx.language) errors.push("idioma diferente do pedido");
  for (const a of v.assessments) if (!ctx.slugs.includes(a.competencyId)) errors.push(`competência desconhecida: ${a.competencyId}`);
  return errors.length ? { ok: false as const, errors } : { ok: true as const, value: v as never as {
    language: "pt-PT" | "en-GB";
    assessments: { competencyId: string; status: "exploring" | "developing" | "applied"; confidence: "low" | "medium" | "high"; found: string[]; missing: string[] }[];
  } };
}

export function checkExplanation(raw: unknown, language: string) {
  const errors = validate(EXPLANATION_SCHEMA, raw);
  if (errors.length) return { ok: false as const, errors };
  const v = raw as { language: string; answer: string; points: string[] };
  if (v.language !== language) return { ok: false as const, errors: ["idioma diferente do pedido"] };
  return { ok: true as const, value: v };
}
