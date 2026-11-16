// JSON Schemas das saídas de Claude. Duas utilizações:
//   1. toApiSchema(): versão aceite pela API de Structured Outputs (sem min/max/length).
//   2. validate(): validação completa no servidor ANTES de persistir (validate.ts).
// A API garante a forma; a nossa validação garante limites e regras de negócio.

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: (string | number | null)[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  description?: string;
};

const str = (max: number, min = 1): JsonSchema => ({ type: "string", minLength: min, maxLength: max });
const strList = (maxItems: number, maxLen: number): JsonSchema => ({
  type: "array", items: str(maxLen), minItems: 1, maxItems,
});

export const LANGUAGES = ["pt-PT", "en-GB"] as const;
export const ACTION_TYPES = ["course", "documentation", "project", "improvement", "demonstration"] as const;
export const CONFIDENCE = ["low", "medium", "high"] as const;
export const STATUSES = ["exploring", "developing", "applied"] as const;

/** Recomendação de próxima etapa (contrato do produto + candidateId para ligar ao candidato escolhido). */
export const RECOMMENDATION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidateId", "competencyId", "title", "reason", "actionType", "estimatedHours",
    "expectedEvidence", "acceptanceCriteria", "learningResources", "confidence", "language",
  ],
  properties: {
    candidateId: str(64),
    competencyId: str(64),
    title: str(160),
    reason: str(700),
    actionType: { type: "string", enum: [...ACTION_TYPES] },
    estimatedHours: {
      type: "object", additionalProperties: false, required: ["min", "max"],
      properties: { min: { type: "integer", minimum: 0, maximum: 80 }, max: { type: "integer", minimum: 0, maximum: 80 } },
    },
    expectedEvidence: strList(5, 200),
    acceptanceCriteria: strList(6, 240),
    learningResources: {
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false, required: ["title", "provider", "url"],
        properties: { title: str(200), provider: str(80), url: { type: ["string", "null"], maxLength: 500 } },
      },
    },
    confidence: { type: "string", enum: [...CONFIDENCE] },
    language: { type: "string", enum: [...LANGUAGES] },
  },
};

/** Sugestões de avaliação por competência (analyse-learning-profile). */
export const ASSESSMENT_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language", "assessments"],
  properties: {
    language: { type: "string", enum: [...LANGUAGES] },
    assessments: {
      type: "array", maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["competencyId", "status", "confidence", "found", "missing"],
        properties: {
          competencyId: str(64),
          status: { type: "string", enum: [...STATUSES] },
          confidence: { type: "string", enum: [...CONFIDENCE] },
          found: { type: "array", maxItems: 6, items: str(200) },
          missing: { type: "array", maxItems: 6, items: str(200) },
        },
      },
    },
  },
};

/** Explicação contextual (explain-recommendation). */
export const EXPLANATION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language", "answer", "points"],
  properties: {
    language: { type: "string", enum: [...LANGUAGES] },
    answer: str(900),
    points: { type: "array", maxItems: 5, items: str(240) },
  },
};

export const EXPLAIN_QUESTIONS = ["why", "evidence_used", "shorter_alternative", "need_course", "how_to_know"] as const;

/** Remove palavras-chave que a API de Structured Outputs não aceita; a validação local mantém-nas. */
export function toApiSchema(s: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...s };
  for (const k of ["minLength", "maxLength", "minimum", "maximum", "maxItems"] as const) delete out[k];
  if (out.minItems !== undefined && out.minItems > 1) out.minItems = 1;
  if (out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, toApiSchema(v)]));
  }
  if (out.items) out.items = toApiSchema(out.items);
  return out;
}
