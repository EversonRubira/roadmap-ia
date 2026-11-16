import { checkRecommendation } from "../_shared/output-rules.ts";
import { nextStepPrompt } from "../_shared/prompts.ts";
import { RECOMMENDATION_SCHEMA } from "../_shared/schemas.ts";
import { callAndCheck, reserveOrThrow, usage } from "../_shared/run.ts";
import { HttpError } from "../_shared/ports.ts";
import type { Deps, Lang } from "../_shared/ports.ts";

/**
 * Gera (ou reutiliza) a recomendação ativa. Nunca corre ao abrir a app:
 * só quando o cliente pede (nova evidência, etapa concluída, rejeição, objetivo alterado, reanálise, alternativa).
 * Recebe apenas os 3 melhores candidatos, não a base de dados inteira.
 */
export async function generateNextStep(deps: Deps, body: { language: Lang; replaceId: string | null }) {
  const { port } = deps;
  const active = await port.getActiveRec();

  if (active && !body.replaceId && active.language === body.language) {
    return { recommendationId: active.id, reused: true };       // reutilizar recomendação válida: custo zero
  }
  let replaceId = body.replaceId;
  if (active) {
    if (replaceId && replaceId !== active.id) throw new HttpError(409, "stale_recommendation");
    replaceId = active.id;
  } else if (replaceId) {
    throw new HttpError(409, "stale_recommendation");
  }

  const top = await port.getTopCandidates(3);
  if (!top.length) throw new HttpError(409, "no_candidates");

  const runId = await reserveOrThrow(deps, "generation");
  try {
    const [profile, comps, evidence, resources] = await Promise.all([
      port.getProfile(), port.getCompetencies(), port.getEvidence(body.language), port.getResources(),
    ]);
    const cands = top.map((row) => ({ row, comp: comps.find((c) => c.id === row.competencyId)!, c: null }));
    const p = nextStepPrompt(body.language, profile, cands, evidence, resources);
    const catalog = resources.filter((r) => r.status === "available").map((r) => ({ title: r.title, provider: r.provider, url: r.url }));

    const { value, res } = await callAndCheck(deps, runId,
      { ...p, schema: RECOMMENDATION_SCHEMA, maxTokens: 8000, effort: "medium" },
      (j) => checkRecommendation(j, {
        candidates: top.map((t) => ({ id: t.id, slug: t.slug, kind: t.kind })), resources: catalog, language: body.language,
      }));

    await port.activate(value.candidateId, replaceId, value, runId);
    await port.finishRun(runId, usage(res, { status: "ok" }));
    return { recommendationId: value.candidateId, reused: false };
  } catch (e) {
    if (!(e instanceof HttpError)) await port.finishRun(runId, { status: "error", errorCode: "persist_failed" });
    throw e;
  }
}
