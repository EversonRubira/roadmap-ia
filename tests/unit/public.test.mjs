import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pub = JSON.parse(readFileSync("data/public.json", "utf8"));
const model = JSON.parse(readFileSync("data/competencias.json", "utf8"));
const latest = JSON.parse(readFileSync("data/analises/latest.json", "utf8"));

test("projeção pública: só os campos autorizados (nada de notas, níveis, confiança, cursos ou prompts)", () => {
  assert.deepEqual(Object.keys(pub).sort(), ["en", "focus", "path", "pt", "updated"]);
  for (const l of ["pt", "en"]) assert.deepEqual(Object.keys(pub[l]).sort(), ["advisor", "focus", "next", "now"]);
  const text = JSON.stringify([pub.pt, pub.en]);   // só os textos visíveis; os ids do percurso são nomes de competências
  assert.ok(!/\d\s?%|confian|confidence|level|nível|token|custo|cost|prompt|curso|course/i.test(text), "campo sensível ou métrica na projeção");
  assert.ok(!text.includes("—"));
});
test("o foco público coincide com o foco da última análise e pertence ao percurso", () => {
  assert.equal(pub.focus, latest.focus.competency);
  assert.equal(pub.updated, latest.date);
  assert.deepEqual(pub.path, model.competencies.map((c) => c.id));
  assert.ok(pub.path.includes(pub.focus));
});
