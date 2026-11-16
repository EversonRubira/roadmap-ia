import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const SB = "2.119.0", ANTHROPIC = "1.8.0";
const read = (f) => readFileSync(f, "utf8");

test("supabase-js: mesma versão fixa no browser (vendor) e nas Edge Functions", () => {
  const files = readdirSync("js/vendor").filter((f) => f.endsWith(".umd.js"));
  assert.deepEqual(files, [`supabase-js-${SB}.umd.js`], "um só bundle vendorizado");
  assert.ok(read("index.html").includes(`js/vendor/supabase-js-${SB}.umd.js`));
  assert.ok(read("sw.js").includes(`js/vendor/supabase-js-${SB}.umd.js`));
  assert.ok(read("supabase/functions/_shared/runtime.ts").includes(`"npm:@supabase/supabase-js@${SB}"`));
});

test("supabase-js vendorizado: SHA-256 igual ao registado e versão embutida correta", () => {
  const buf = readFileSync(`js/vendor/supabase-js-${SB}.umd.js`);
  const sha = createHash("sha256").update(buf).digest("hex");
  assert.ok(read("js/vendor/README.md").includes(sha), "SHA-256 no js/vendor/README.md");
  assert.ok(buf.toString().includes(`${SB}`), "o bundle refere a versão");
});

test("Anthropic SDK: versão exata nas Edge Functions", () => {
  assert.ok(read("supabase/functions/_shared/runtime.ts").includes(`"npm:@anthropic-ai/sdk@${ANTHROPIC}"`));
});

test("nenhum import npm: sem versão exata (x.y.z)", () => {
  const all = ["_shared/runtime.ts", "analyse-learning-profile/index.ts", "generate-next-step/index.ts", "explain-recommendation/index.ts"]
    .map((f) => read(`supabase/functions/${f}`)).join("\n");
  for (const m of all.matchAll(/"npm:([^"]+)"/g)) assert.match(m[1], /@\d+\.\d+\.\d+$/, m[1]);
});

test("frontend usa o SDK oficial: nenhum fetch manual a /auth/v1 ou /rest/v1", () => {
  const api = read("js/api.js").replace(/(^|\s)\/\/.*$/gm, "");
  assert.ok(!/\/auth\/v1|\/rest\/v1|\bfetch\(/.test(api));
  assert.ok(/signInWithOtp/.test(api) && /verifyOtp/.test(api) && /autoRefreshToken: true/.test(api) && /persistSession: true/.test(api));
});
