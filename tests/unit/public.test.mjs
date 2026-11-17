import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derivePublic } from "../../scripts/public.mjs";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const pub = read("data/public.json");
const model = read("data/competencias.json");
const latest = read("data/analises/latest.json");

test("projeção pública: só os campos autorizados", () => {
  assert.deepEqual(Object.keys(pub).sort(), ["en", "focus", "next", "path", "pt", "skills", "updated"]);
  for (const l of ["pt", "en"]) assert.deepEqual(Object.keys(pub[l]).sort(), ["advisor", "focus", "next", "now"]);
  for (const s of pub.skills) assert.deepEqual(Object.keys(s).filter((k) => k !== "repo").sort(), ["evidence", "id", "level", "name", "what"]);
});
test("textos públicos sem métricas, níveis numéricos, prompts, cursos ou travessões", () => {
  const text = JSON.stringify([pub.pt, pub.en, pub.skills, pub.next]);
  assert.ok(!/\d\s?%|confidence|system prompt|prompt do sistema|curso|course|"level":\s*\d/i.test(text), "campo sensível ou métrica");
  assert.ok(!text.includes("—"));
});
test("o foco coincide com a última análise e pertence ao percurso", () => {
  assert.equal(pub.focus, latest.focus.competency);
  assert.equal(pub.updated, latest.date);
  assert.deepEqual(pub.path, model.competencies.map((c) => c.id));
  assert.ok(pub.path.includes(pub.focus));
});
test("skills: só competências com evidência (nível 2 ou 3) e nunca o foco sem evidência", () => {
  const strong = latest.competencies.filter((e) => e.level >= 2).map((e) => e.id).sort();
  assert.deepEqual(pub.skills.map((s) => s.id).sort(), strong);
  for (const s of pub.skills) {
    assert.ok(["consolidated", "applied"].includes(s.level));
    assert.ok(s.evidence.length >= 1 && s.evidence.every((e) => e.pt && e.en));
  }
  for (const n of pub.next) assert.equal(latest.competencies.find((e) => e.id === n.id).level, 0);
  assert.ok(!pub.next.some((n) => n.id === pub.focus));
});
test("public.json é a derivação atual (corre node scripts/public.mjs se falhar)", () => {
  assert.deepEqual(derivePublic(model, latest, pub), pub);
});
