import { checkExplanation } from "../_shared/output-rules.ts";
import { explainPrompt } from "../_shared/prompts.ts";
import { EXPLAIN_QUESTIONS, EXPLANATION_SCHEMA } from "../_shared/schemas.ts";
import { callAndCheck, reserveOrThrow, usage } from "../_shared/run.ts";
import { HttpError } from "../_shared/ports.ts";
import type { Deps, Lang } from "../_shared/ports.ts";

/** Responde a uma de cinco perguntas fixas (não é um chat). Respostas ficam em cache por pergunta+idioma. */
export async function explain(deps: Deps, body: { recommendationId: string; question: string; language: Lang }) {
  if (!(EXPLAIN_QUESTIONS as readonly string[]).includes(body.question)) throw new HttpError(400, "invalid_question");
  const { port } = deps;
  const rec = await port.getRec(body.recommendationId);
  if (!rec || !["active", "accepted"].includes(rec.status)) throw new HttpError(404, "not_found");
  if (rec.language !== body.language) throw new HttpError(409, "language_mismatch");

  const key = `${body.question}:${body.language}`;
  const cached = rec.explanations[key];
  if (cached) return { explanation: cached, cached: true };

  const runId = await reserveOrThrow(deps, "explanation");
  try {
    const [comps, evidence, resources] = await Promise.all([port.getCompetencies(), port.getEvidence(body.language), port.getResources()]);
    const comp = comps.find((c) => c.id === rec.competencyId);
    if (!comp) throw new HttpError(404, "not_found");
    const p = explainPrompt(body.language, body.question, rec, comp, evidence, resources);
    const { value, res } = await callAndCheck(deps, runId,
      { ...p, schema: EXPLANATION_SCHEMA, maxTokens: 1200, effort: "low" },
      (j) => checkExplanation(j, body.language));
    await port.setExplanation(rec.id, key, { answer: value.answer, points: value.points });
    await port.finishRun(runId, usage(res, { status: "ok" }));
    return { explanation: { answer: value.answer, points: value.points }, cached: false };
  } catch (e) {
    if (!(e instanceof HttpError)) await port.finishRun(runId, { status: "error", errorCode: "persist_failed" });
    throw e;
  }
}
