import { buildCandidates, capSuggestedStatus, groupsOf } from "../_shared/candidates.ts";
import { checkAssessments } from "../_shared/output-rules.ts";
import { assessmentPrompt } from "../_shared/prompts.ts";
import { ASSESSMENT_SCHEMA } from "../_shared/schemas.ts";
import { callAndCheck, reserveOrThrow, usage } from "../_shared/run.ts";
import { HttpError } from "../_shared/ports.ts";
import type { Deps, Lang } from "../_shared/ports.ts";

/**
 * mode "candidates": só regras determinísticas (sem Claude, sem quota) — recalcula os candidatos.
 * mode "full": candidatos + sugestões de avaliação por Claude (quota diária, ex.: 2).
 */
export async function analyse(deps: Deps, body: { mode: "candidates" | "full"; language: Lang }) {
  const runId = body.mode === "full" ? await reserveOrThrow(deps, "analysis") : null;
  try {
    const { port } = deps;
    const [profile, comps, evidence, resources, feedback, pastRecs] = await Promise.all([
      port.getProfile(), port.getCompetencies(), port.getEvidence(body.language),
      port.getResources(), port.getFeedback(), port.getPastRecs(),
    ]);

    const { candidates, needsReview } = buildCandidates({
      now: deps.now(), weeklyHours: profile.weeklyHours,
      competencies: comps.map((c) => ({ id: c.id, slug: c.slug, status: c.status, priorityWeight: c.priorityWeight, isCurrentFocus: c.isCurrentFocus })),
      evidence: evidence.map((e) => ({ competencyId: e.competencyId, type: e.type, isPublic: e.isPublic })),
      resources: resources.map((r) => ({ competencySlugs: r.competencySlugs, status: r.status, hours: r.hours })),
      feedback, pastRecs,
    });
    await port.replaceCandidates(candidates);

    let assessments = 0;
    if (body.mode === "full" && runId) {
      const p = assessmentPrompt(body.language, profile, comps, evidence);
      const { value, res } = await callAndCheck(deps, runId,
        { ...p, schema: ASSESSMENT_SCHEMA, maxTokens: 4000, effort: "medium" },
        (j) => checkAssessments(j, { slugs: comps.map((c) => c.slug), language: body.language }));
      const rows = value.assessments.map((a) => {
        const comp = comps.find((c) => c.slug === a.competencyId)!;
        const g = groupsOf(evidence.filter((e) => e.competencyId === comp.id).map((e) => ({ competencyId: e.competencyId, type: e.type, isPublic: e.isPublic })));
        const capped = capSuggestedStatus(a.status, g);   // "Applied" nunca só com curso
        return { competencyId: comp.id, language: body.language, status: capped.status, confidence: capped.capped ? "low" : a.confidence, found: a.found, missing: a.missing };
      });
      await port.insertAssessments(rows, runId);
      await port.finishRun(runId, usage(res, { status: "ok" }));
      assessments = rows.length;
    }
    return {
      candidates: candidates.map((c) => ({ competency: c.slug, kind: c.kind, score: c.score })),
      needsReview, assessments,
    };
  } catch (e) {
    if (runId && !(e instanceof HttpError)) await deps.port.finishRun(runId, { status: "error", errorCode: "internal_error" });
    throw e;
  }
}
