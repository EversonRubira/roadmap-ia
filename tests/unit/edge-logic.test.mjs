import test from "node:test";
import assert from "node:assert/strict";
import { buildCandidates, capSuggestedStatus, groupsOf } from "../../supabase/functions/_shared/candidates.ts";
import { validate } from "../../supabase/functions/_shared/validate.ts";
import { RECOMMENDATION_SCHEMA, toApiSchema } from "../../supabase/functions/_shared/schemas.ts";
import { checkRecommendation, checkAssessments } from "../../supabase/functions/_shared/output-rules.ts";
import { estimateCostUsd } from "../../supabase/functions/_shared/cost.ts";

const NOW = new Date("2026-11-16T12:00:00Z");
const comp = (slug, w = 3, extra = {}) => ({ id: slug, slug, status: "exploring", priorityWeight: w, isCurrentFocus: false, ...extra });
const base = (over = {}) => ({
  now: NOW, weeklyHours: 5, competencies: [comp("a"), comp("b")], evidence: [], resources: [], feedback: [], pastRecs: [], ...over,
});

test("sem evidência: aprender (e aplicar como alternativa pequena)", () => {
  const { candidates } = buildCandidates(base({ competencies: [comp("a")] }));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind === "learn" || candidates[0].kind === "apply", true);
});

test("só curso concluído => aplicar, nunca outro curso", () => {
  const { candidates } = buildCandidates(base({ competencies: [comp("a")], evidence: [{ competencyId: "a", type: "course", isPublic: false }] }));
  assert.equal(candidates[0].kind, "apply");
});

test("implementação sem testes/evals => consolidar", () => {
  const { candidates } = buildCandidates(base({ competencies: [comp("a")], evidence: [{ competencyId: "a", type: "implementation", isPublic: false }] }));
  assert.equal(candidates[0].kind, "consolidate");
});

test("prática + qualidade, sem evidência pública => demonstrar", () => {
  const ev = [{ competencyId: "a", type: "implementation", isPublic: false }, { competencyId: "a", type: "tests", isPublic: false }];
  const { candidates } = buildCandidates(base({ competencies: [comp("a")], evidence: ev }));
  assert.equal(candidates[0].kind, "demonstrate");
});

test("tudo coberto => sem candidato", () => {
  const ev = [{ competencyId: "a", type: "implementation", isPublic: true }, { competencyId: "a", type: "tests", isPublic: false }];
  assert.equal(buildCandidates(base({ competencies: [comp("a")], evidence: ev })).candidates.length, 0);
});

test("relevância profissional ordena", () => {
  const { candidates } = buildCandidates(base({ competencies: [comp("a", 2), comp("b", 5)] }));
  assert.equal(candidates[0].slug, "b");
});

test("'Já domino' remove aprender/aplicar mas não a competência inteira", () => {
  const fb = [{ competencyId: "a", kind: "learn", feedback: "already_known", reason: null, createdAt: "2026-11-10T00:00:00Z" }];
  const { candidates } = buildCandidates(base({ competencies: [comp("a")], feedback: fb }));
  assert.equal(candidates.length, 1);
  assert.ok(["consolidate", "demonstrate"].includes(candidates[0].kind));
});

test("rejeitar como 'não relevante' desce a competência", () => {
  const fb = [{ competencyId: "b", kind: "learn", feedback: "rejected", reason: "not_relevant", createdAt: "2026-11-15T00:00:00Z" }];
  const { candidates } = buildCandidates(base({ competencies: [comp("a"), comp("b", 5)], feedback: fb }));
  assert.equal(candidates[0].slug, "a");
});

test("'avaliação incorreta' bloqueia a competência até revisão", () => {
  const fb = [{ competencyId: "a", kind: "apply", feedback: "rejected", reason: "wrong_assessment", createdAt: "2026-11-15T00:00:00Z" }];
  const r = buildCandidates(base({ competencies: [comp("a"), comp("b")], feedback: fb }));
  assert.deepEqual(r.needsReview, ["a"]);
  assert.ok(r.candidates.every((c) => c.slug !== "a"));
});

test("recomendação recente da mesma competência é penalizada", () => {
  const past = [{ competencyId: "b", kind: "learn", status: "superseded", createdAt: "2026-11-15T00:00:00Z" }];
  const { candidates } = buildCandidates(base({ competencies: [comp("a"), comp("b")], pastRecs: past }));
  assert.equal(candidates[0].slug, "a");
});

test("Applied nunca só com curso", () => {
  const g = groupsOf([{ competencyId: "a", type: "course", isPublic: false }]);
  assert.deepEqual(capSuggestedStatus("applied", g), { status: "developing", capped: true });
  const g2 = groupsOf([{ competencyId: "a", type: "implementation", isPublic: false }, { competencyId: "a", type: "tests", isPublic: false }]);
  assert.equal(capSuggestedStatus("applied", g2).capped, false);
});

const good = {
  candidateId: "c1", competencyId: "evals-reliability", title: "Criar avaliação", reason: "Porque falta baseline.",
  actionType: "project", estimatedHours: { min: 4, max: 6 }, expectedEvidence: ["Dataset"], acceptanceCriteria: ["Runner executa"],
  learningResources: [], confidence: "medium", language: "pt-PT",
};
const ctx = { candidates: [{ id: "c1", slug: "evals-reliability", kind: "apply" }], resources: [], language: "pt-PT" };

test("Structured Output válido é aceite", () => assert.equal(checkRecommendation(good, ctx).ok, true));

test("Structured Output inválido é rejeitado", () => {
  const bad = [
    { ...good, extra: 1 },                                  // propriedade extra
    { ...good, estimatedHours: { min: 9, max: 2 } },        // min > max
    { ...good, estimatedHours: { min: -1, max: 2 } },       // negativo
    { ...good, actionType: "magic" },                       // enum
    { ...good, competencyId: "retrieval" },                 // não é a do candidato
    { ...good, candidateId: "outro" },                      // candidato inventado
    { ...good, language: "en-GB" },                         // idioma errado
    { ...good, actionType: "course" },                      // incompatível com 'apply'
    { ...good, title: "" },
    { ...good, learningResources: [{ title: "Inventado", provider: "X", url: "https://x.y" }] }, // fora do catálogo
    { ...good, confidence: "certain" },
    "texto livre", null, {},
  ];
  for (const b of bad) assert.equal(checkRecommendation(b, ctx).ok, false, JSON.stringify(b));
});

test("recurso do catálogo é aceite; schema da API não leva min/max", () => {
  const res = { title: "Curso A", provider: "Alura", url: null };
  assert.equal(checkRecommendation({ ...good, actionType: "improvement", learningResources: [res] }, { ...ctx, resources: [res] }).ok, true);
  const api = JSON.stringify(toApiSchema(RECOMMENDATION_SCHEMA));
  assert.ok(!/minimum|maximum|maxLength|minLength|maxItems/.test(api));
  assert.equal(validate(RECOMMENDATION_SCHEMA, good).length, 0);
});

test("avaliações: competência desconhecida e idioma errado falham", () => {
  const a = { language: "pt-PT", assessments: [{ competencyId: "zzz", status: "applied", confidence: "low", found: [], missing: [] }] };
  assert.equal(checkAssessments(a, { slugs: ["x"], language: "pt-PT" }).ok, false);
  assert.equal(checkAssessments({ ...a, assessments: [] }, { slugs: ["x"], language: "en-GB" }).ok, false);
});

test("custo estimado", () => assert.equal(estimateCostUsd("claude-opus-5-5", 1_000_000, 100_000), 6));
