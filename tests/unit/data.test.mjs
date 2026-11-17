import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const model = read("data/competencias.json");
const ids = model.competencies.map((c) => c.id);
const files = readdirSync("data/analises").filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const TYPES = ["APRENDER", "APLICAR", "CONSOLIDAR", "DEMONSTRAR"];
const bilingual = (o, where) => { assert.ok(o && o.pt && o.en, `${where}: falta pt/en`); };

test("competencias.json tem as dez competências, bilingues", () => {
  assert.equal(ids.length, 10);
  for (const c of model.competencies) { assert.ok(c.name_pt && c.name_en && c.description_pt && c.description_en, c.id); }
});

test("latest.json é igual à análise datada mais recente", () => {
  assert.ok(files.length >= 1);
  assert.equal(readFileSync("data/analises/latest.json", "utf8"), readFileSync(`data/analises/${files.at(-1)}`, "utf8"));
});

for (const f of files) {
  test(`análise ${f}: esquema, níveis e uma única próxima ação`, () => {
    const a = read(`data/analises/${f}`);
    assert.equal(`${a.date}.json`, f);
    assert.ok(a.previous === null || files.includes(`${a.previous}.json`), "previous aponta para uma análise existente");
    assert.deepEqual(a.competencies.map((c) => c.id).sort(), [...ids].sort());
    for (const c of a.competencies) {
      assert.ok([0, 1, 2, 3].includes(c.level), `${c.id}: nível`);
      assert.ok(["low", "medium", "high"].includes(c.confidence), `${c.id}: confiança`);
      bilingual(c.gap, `${c.id}.gap`);
      if (c.level > 0) assert.ok(c.evidence.length > 0, `${c.id}: nível ${c.level} sem evidência citada`);
      for (const e of c.evidence) { assert.ok(e.location, `${c.id}: evidência sem localização`); bilingual(e.note, `${c.id}.note`); }
    }
    assert.ok(ids.includes(a.focus.competency));
    assert.ok(TYPES.includes(a.focus.action.type));
    bilingual(a.focus.why, "focus.why"); bilingual(a.focus.action.title, "action.title"); bilingual(a.focus.action.where.reason, "where.reason");
    assert.ok(a.focus.action.expected_evidence.pt.length > 0 && a.focus.action.expected_evidence.pt.length === a.focus.action.expected_evidence.en.length);
  });
}

test("cursos-feitos.json: só cursos com id, título e fornecedor", () => {
  const d = read("data/cursos-feitos.json");
  for (const c of d.courses) { assert.ok(c.id && c.title && c.provider, c.id); for (const k of c.competencies) assert.ok(ids.includes(k), k); }
});

test("nenhuma métrica de cursos, percentagens ou pontuação nos textos da interface", () => {
  const text = ["js/locales/pt-PT.js", "js/locales/en-GB.js", "index.html"].map((p) => readFileSync(p, "utf8")).join("\n");
  assert.ok(!/\b22\s?%|5\/23|1\/7|\bscore\b|pontuação/i.test(text));
});
