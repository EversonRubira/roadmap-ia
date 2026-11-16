import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import pt from "../../js/locales/pt-PT.js";
import en from "../../js/locales/en-GB.js";
import { parseLegacy, planMigration } from "../../js/migration.js";
import { LEGACY_CATALOG } from "../../js/legacy-catalog.js";
import { EVIDENCE_TYPES, groupsOf as clientGroups } from "../../js/evidence-groups.js";
import { groupsOf as serverGroups } from "../../supabase/functions/_shared/candidates.ts";

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const src = walk("js").filter((f) => f.endsWith(".js") && !f.includes("locales") && !f.includes("vendor")).map((f) => readFileSync(f, "utf8")).join("\n");

test("PT e EN têm exatamente as mesmas chaves", () => {
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
  for (const k of Object.keys(pt)) { assert.ok(pt[k].trim() && en[k].trim(), k); assert.deepEqual(pt[k].match(/\{\w+\}/g)?.sort() ?? [], en[k].match(/\{\w+\}/g)?.sort() ?? [], `placeholders de ${k}`); }
});

test("toda a chave usada no código existe (incluindo dinâmicas)", () => {
  const used = new Set([...src.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]));
  for (const k of used) assert.ok(k in pt, `falta ${k}`);
  const dyn = {
    status: ["exploring", "developing", "applied", "focus"], confidence: ["low", "medium", "high"], source: ["default", "ai", "user"],
    kind: ["learn", "apply", "consolidate", "demonstrate"], group: ["theory", "practice", "quality", "showcase"], evtype: EVIDENCE_TYPES,
    reason: ["already_know", "not_relevant", "not_applicable", "too_much_effort", "other_area", "wrong_assessment", "other"],
    "explain.q": ["why", "evidence_used", "shorter_alternative", "need_course", "how_to_know"], nav: ["now", "skills", "evidence", "journey", "label"],
    "migrate.err": ["empty", "invalid_json", "invalid_format"],
  };
  for (const [p, ks] of Object.entries(dyn)) for (const k of ks) assert.ok(`${p}.${k}` in pt, `falta ${p}.${k}`);
});

test("nomes técnicos não são traduzidos e a navegação bate com a especificação", () => {
  assert.deepEqual([pt["nav.now"], pt["nav.skills"], pt["nav.evidence"], pt["nav.journey"]], ["Agora", "Competências", "Evidências", "Percurso"]);
  assert.deepEqual([en["nav.now"], en["nav.skills"], en["nav.evidence"], en["nav.journey"]], ["Now", "Skills", "Evidence", "Journey"]);
  assert.deepEqual([pt["status.exploring"], pt["status.developing"], pt["status.applied"], pt["status.focus"]], ["A explorar", "Em desenvolvimento", "Aplicado", "Foco atual"]);
  assert.deepEqual([en["status.exploring"], en["status.developing"], en["status.applied"], en["status.focus"]], ["Exploring", "Developing", "Applied", "Current focus"]);
  assert.deepEqual([pt["recommendation.accept"], pt["recommendation.alternative"], pt["recommendation.known"], pt["recommendation.defer"]], ["Aceitar etapa", "Ver alternativa", "Já domino isto", "Agora não"]);
  assert.deepEqual([en["recommendation.accept"], en["recommendation.alternative"], en["recommendation.known"], en["recommendation.defer"]], ["Accept step", "See alternative", "I already know this", "Not now"]);
  assert.equal(pt["app.context"], "Engenharia de IA · Sistema pessoal de aprendizagem");
  assert.equal(en["app.context"], "AI Engineering · Personal learning system");
});

test("o código não usa innerHTML nem valores de chaves secretas", () => {
  const code = (src + readFileSync("index.html", "utf8")).replace(/(^|\s)\/\/.*$/gm, "");   // ignora comentários
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code));
  assert.ok(!/sk-ant|service_role|ANTHROPIC_API_KEY|api\.anthropic\.com/.test(code));
});

test("grupos de evidência do cliente = servidor", () => {
  for (const type of EVIDENCE_TYPES) {
    for (const visibility of ["private", "public"]) {
      const c = clientGroups([{ evidence_type: type, visibility }]);
      const s = serverGroups([{ competencyId: "x", type, isPublic: visibility === "public" }]);
      assert.deepEqual(c, s, `${type}/${visibility}`);
    }
  }
});

test("catálogo legado: 54 itens, 23 core, ids únicos, ligados a competências válidas", () => {
  assert.equal(LEGACY_CATALOG.length, 54);
  assert.equal(LEGACY_CATALOG.filter((c) => c.tag === "core").length, 23);
  assert.equal(new Set(LEGACY_CATALOG.map((c) => c.id)).size, 54);
  const valid = new Set(["llm-integration", "context-engineering", "retrieval", "agents-tools", "evals-reliability", "safety-control", "production-ai", "ai-native-engineering"]);
  for (const c of LEGACY_CATALOG) for (const s of c.slugs) assert.ok(valid.has(s), `${c.id}: ${s}`);
});

const T0 = Date.UTC(2026, 0, 10);
test("migração: valida, ignora ids desconhecidos, preserva datas", () => {
  assert.equal(parseLegacy("").ok, false); assert.equal(parseLegacy("{").reason, "invalid_json"); assert.equal(parseLegacy('{"x":1}').reason, "invalid_format");
  const p = parseLegacy(JSON.stringify({ done: ["ea-1-1", "ea-b1", "naoexiste", "at-1"], at: { "ea-1-1": T0, "naoexiste": 1, "at-1": "texto" } }));
  assert.deepEqual(p.done.sort(), ["at-1", "ea-1-1", "ea-b1"]); assert.deepEqual(p.unknown, ["naoexiste"]);
  const plan = planMigration(p);
  const ev = plan.evidence.find((e) => e.source_key === "legacy:ea-1-1");
  assert.equal(ev.occurred_at, "2026-01-10"); assert.equal(ev.dateEstimated, false); assert.equal(ev.visibility, "private"); assert.equal(ev.share_with_ai, false);
  assert.equal(plan.evidence.find((e) => e.source_key === "legacy:at-1").dateEstimated, true);
  assert.equal(plan.summary.completedWithoutCompetency, 1);                      // ea-b1 não mapeia para competência
  assert.ok(!plan.evidence.some((e) => e.source_key === "legacy:ea-b1"));
});

test("migração: cursos incompletos viram catálogo disponível; checkpoints ficam de fora; sem duplicados ao repetir", () => {
  const p = parseLegacy(JSON.stringify({ done: ["ea-1-1"], at: {} }));
  const plan = planMigration(p);
  const avail = plan.resources.filter((r) => r.status === "available");
  assert.ok(avail.length > 40); assert.ok(!plan.resources.some((r) => r.legacy_id.endsWith("-cp")));
  assert.equal(plan.resources.find((r) => r.legacy_id === "ea-1-1").status, "completed");
  const existing = { resourceLegacyIds: new Set(plan.resources.map((r) => r.legacy_id)), evidenceSourceKeys: new Set(plan.evidence.map((e) => e.source_key)) };
  const again = planMigration(p, existing);
  assert.equal(again.resources.length, 0); assert.equal(again.evidence.length, 0);
});
