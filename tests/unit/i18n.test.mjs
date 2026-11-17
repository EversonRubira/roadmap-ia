import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pt from "../../js/locales/pt-PT.js";
import en from "../../js/locales/en-GB.js";

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test("PT e EN têm exatamente as mesmas chaves e nenhum texto vazio", () => {
  assert.deepEqual(Object.keys(pt).sort(), Object.keys(en).sort());
  for (const d of [pt, en]) for (const [k, v] of Object.entries(d)) assert.ok(String(v).trim(), k);
});

test("placeholders {x} coincidem entre PT e EN", () => {
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const k of Object.keys(pt)) assert.equal(ph(pt[k]), ph(en[k]), k);
});

test("todas as chaves usadas no código existem", () => {
  const used = new Set();
  for (const f of walk("js").filter((x) => x.endsWith(".js") && !x.includes("locales"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
  }
  for (const k of used) assert.ok(k in pt, `falta ${k}`);
  for (const lv of [0, 1, 2, 3]) assert.ok(`level.${lv}` in pt);
  for (const ty of ["APRENDER", "APLICAR", "CONSOLIDAR", "DEMONSTRAR"]) assert.ok(`type.${ty}` in pt && `typeDesc.${ty}` in pt);
  for (const k of ["lab", "project", "study"]) assert.ok(`where.${k}` in pt);
});

test("sem travessões nos textos", () => {
  for (const d of [pt, en]) for (const [k, v] of Object.entries(d)) assert.ok(!v.includes("—"), k);
});

test("segredos nunca chegam ao browser: sem chave da Groq, service role nem Anthropic API", () => {
  const code = [...walk("js"), "index.html", "sw.js", "manifest.webmanifest"].map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(!/GROQ_API_KEY|api\.groq\.com|service_role|ANTHROPIC_API_KEY|gsk_/i.test(code));
  const cfg = readFileSync("js/config.js", "utf8");
  const key = cfg.match(/SUPABASE_KEY: "([^"]*)"/)[1];
  assert.ok(key === "" || /^sb_publishable_/.test(key), "só a chave publicável pode estar no config");
});
