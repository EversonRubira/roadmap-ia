import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const sw = readFileSync("sw.js", "utf8");
const version = sw.match(/var VERSION = "([^"]+)"/)[1];
const shell = new Function("VERSION", "return [" + sw.match(/var SHELL = \[([\s\S]*?)\];/)[1] + "]")(version);
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test("service worker: todos os ficheiros do shell existem (um 404 faria falhar a instalação)", () => {
  for (const f of shell) { const p = f.split("?")[0]; if (p !== "./") assert.ok(existsSync(p), `falta ${p}`); }
});
test("service worker: todos os módulos JS estão no shell (offline completo)", () => {
  const listed = new Set(shell.map((f) => f.split("?")[0]));
  for (const f of walk("js").filter((x) => x.endsWith(".js"))) assert.ok(listed.has(f), `${f} fora do shell`);
});
test("versão do cache coincide com a do index.html e do config", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(html.includes(`css/app.css?v=${version}`) && html.includes(`js/app.js?v=${version}`));
  assert.ok(readFileSync("js/config.js", "utf8").includes(`APP_VERSION: "${version}"`));
  assert.ok(shell.includes(`css/app.css?v=${version}`) && shell.includes(`js/app.js?v=${version}`));
});
test("cache nova não coincide com a antiga e só apaga caches próprias", () => {
  assert.notEqual(`lj-v${version}`, "roadmap-ia-v1");
  assert.match(sw, /OURS = \/\^\(roadmap-ia-\|lj-\)\//);
});
test("service worker não intercepta outras origens (Supabase)", () => {
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/);
});
test("manifest preserva id, start_url, scope e ícones (instalação existente)", () => {
  const m = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
  assert.equal(m.id, "./"); assert.equal(m.start_url, "./"); assert.equal(m.scope, "./"); assert.equal(m.display, "standalone");
  for (const i of m.icons) assert.ok(existsSync(i.src.replace(/^\.?\//, "")), i.src);
});
test("rotas e caminhos são relativos (GitHub Pages em /roadmap-ia/)", () => {
  const html = readFileSync("index.html", "utf8");
  assert.ok(!/(?:href|src)="\/(?!\/)/.test(html), "caminho absoluto no index.html");
  for (const f of walk("js").filter((x) => x.endsWith(".js") && !x.includes("vendor"))) assert.ok(!/from "\/[^/]/.test(readFileSync(f, "utf8")), f);
});
