// Teste de ponta a ponta no Chromium com Supabase simulado. Uso: node tests/e2e/run.mjs
import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { createBackend } from "./mock-backend.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = new URL("../../", import.meta.url).pathname;
const SHOTS = join(ROOT, "tests/e2e/shots"); mkdirSync(SHOTS, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = normalize(join(ROOT, p));
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" }).end(readFileSync(f));
}).listen(4173);
const BASE = "http://localhost:4173/";

const be = createBackend();
const seen = [];
let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-PT", deviceScaleFactor: 1 });
await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
await ctx.route("https://fonts.gstatic.com/**", (r) => r.fulfill({ status: 200, body: "" }));
await ctx.route("**/js/config.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript",
  body: 'export const CONFIG={SUPABASE_URL:"https://mock.supabase.co",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test_key_1234567890",APP_VERSION:"2.1.0"};export const isConfigured=()=>true;' }));
await ctx.route("https://mock.supabase.co/**", async (route) => {
  const req = route.request(); const u = new URL(req.url());
  seen.push(`${req.method()} ${u.pathname}`);
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  let body = null; try { body = req.postDataJSON(); } catch (_e) { /* sem corpo */ }
  const [status, data] = be.handle(req.method(), u.pathname, u.searchParams, body);
  await route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: data === null ? "" : JSON.stringify(data) });
});
const page = await ctx.newPage();
page.on("request", (r) => seen.push(`REQ ${new URL(r.url()).host}`));
page.on("pageerror", (e) => { fail++; console.log("  ✗ erro de página:", e.message); });
const text = () => page.locator("body").innerText();
const settle = async () => { await page.waitForTimeout(250); await page.waitForFunction(() => document.querySelector("#banner").hidden, null, { timeout: 8000 }); await page.waitForTimeout(100); };
const click = (name, opts = {}) => page.getByRole("button", { name, exact: true, ...opts }).click();

console.log("1. Visitante não autenticado");
await page.goto(BASE);
await page.getByRole("heading", { name: "Entrar" }).waitFor();
ok(await page.locator("#nav").isHidden(), "navegação escondida sem sessão");
ok(await page.locator("#btn-settings").isHidden(), "definições escondidas sem sessão");
ok(!(await text()).includes("Aceitar etapa"), "nenhuma ação de edição visível");
ok(!seen.some((s) => s.includes("/rest/v1/")), "nenhum pedido de dados antes do login");

console.log("2. Login por código");
await page.getByLabel("Email", { exact: true }).fill("dono@example.com"); await click("Enviar código");
await page.getByLabel("Código recebido por email").fill("000000"); await click("Entrar");
await page.getByText("Código inválido ou expirado.").waitFor();
ok(true, "código errado é recusado");
await page.getByLabel("Código recebido por email").fill("123456"); await click("Entrar");
await page.getByRole("heading", { name: "Ainda sem recomendação" }).waitFor();
ok(await page.locator("#nav").isVisible(), "navegação com 4 destinos");
ok((await page.locator("#nav a").allInnerTexts()).join("|") === "Agora|Competências|Evidências|Percurso", "nav em PT");
ok((await page.locator("#app-context").innerText()) === "Engenharia de IA · Sistema pessoal de aprendizagem", "linha contextual PT");
ok(!seen.some((s) => s.includes("/functions/")), "abrir a app NÃO chama funções de IA");

console.log("3. Gerar recomendação (PT)");
await click("Gerar recomendação");
await page.getByRole("heading", { name: /Criar uma avaliação reproduzível/ }).waitFor();
let t = await text();
ok(t.includes("PRÓXIMA ETAPA") || t.toUpperCase().includes("PRÓXIMA ETAPA"), "eyebrow PRÓXIMA ETAPA");
for (const b of ["Aceitar etapa", "Ver alternativa", "Já domino isto", "Agora não"]) ok(await page.getByRole("button", { name: b, exact: true }).isVisible(), `botão "${b}"`);
ok(t.includes("4 a 6 horas"), "esforço PT");
await page.screenshot({ path: join(SHOTS, "now-pt-light.png") });

console.log("4. Idioma EN e persistência");
await click("EN", { exact: true }).catch(() => page.locator("#btn-lang").click());
await page.getByText("Accept step").waitFor();
t = await text();
ok(!t.includes("Aceitar etapa") && !t.includes("Competências"), "sem mistura de idiomas na interface");
ok(t.includes("This recommendation was written in Português"), "aviso de recomendação noutro idioma");
await click("Generate in this language");
await page.getByRole("heading", { name: /Build a reproducible evaluation/ }).waitFor();
t = await text(); ok(t.includes("4–6 hours") && t.includes("Evaluation dataset, runner and documented results"), "recomendação gerada diretamente em EN");
ok((await page.locator("#nav a").allInnerTexts()).join("|") === "Now|Skills|Evidence|Journey", "nav em EN");
await page.reload(); await page.getByText("Accept step").waitFor();
ok((await page.locator("#app-context").innerText()) === "AI Engineering · Personal learning system", "idioma EN persiste após refresh");
ok(be.db.profiles[0].preferred_language === "en-GB", "preferred_language gravado no perfil");
await page.screenshot({ path: join(SHOTS, "now-en-light.png") });

console.log("5. Aceitar, avanço e concluir");
await click("Accept step");
await page.getByText("In progress", { exact: false }).first().waitFor();
ok(be.db.learning_steps.length === 1 && be.db.learning_steps[0].status === "in_progress", "etapa criada em andamento");
await click("Log progress"); await page.getByLabel("What did you move forward?").fill("Dataset com 20 casos"); await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByText("Dataset com 20 casos").waitFor();
ok(be.db.learning_step_logs.length === 1, "avanço registado");
await page.screenshot({ path: join(SHOTS, "progress-en.png") });
await click("Complete step"); await page.getByRole("button", { name: "Complete", exact: true }).click();
await page.getByRole("heading", { name: "No recommendation yet" }).waitFor();
ok(be.db.learning_steps[0].status === "completed", "etapa concluída");

console.log("6. Alternativa e 'Já domino'");
await click("Generate recommendation"); await page.getByRole("button", { name: "See alternative" }).waitFor();
const first = (await page.locator("h2.headline").innerText());
await click("See alternative"); await page.getByRole("dialog").getByRole("button", { name: "Show another" }).click();
await settle(); await page.getByRole("button", { name: "See alternative" }).waitFor();
ok(be.db.recommendations.some((r) => r.status === "superseded"), "alternativa substitui a ativa");
await click("I already know this"); await settle();
await page.getByRole("button", { name: "I already know this" }).waitFor();
ok(be.db.recommendations.some((r) => r._fb === "already_known"), "'Já domino' registado como feedback");
await click("See alternative");
await page.getByRole("dialog").getByLabel("Too much effort").check(); await page.getByRole("dialog").getByRole("button", { name: "Show another" }).click(); await settle();
await page.getByRole("button", { name: "See alternative" }).waitFor();
ok(be.db.recommendations.some((r) => r._fb === "rejected" && r._reason === "too_much_effort"), "rejeição guarda o motivo");

console.log("6b. Limite diário de gerações");
be.q.genLimit = be.db.analysis_runs.filter((r) => r.kind === "generation").length;
await click("See alternative"); await page.getByRole("dialog").getByRole("button", { name: "Show another" }).click(); await settle();
ok((await text()).includes("Daily limit reached"), "quota excedida mostra mensagem clara");
ok(await page.getByRole("button", { name: "See alternative" }).isVisible(), "recomendação ativa mantém-se após falha de quota");
be.q.genLimit = 50;
console.log("7. Porquê esta etapa? (explicação)");
await page.getByRole("button", { name: "Why this step?" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Why this step?" }).click();
await page.getByText("Because a baseline is missing.").waitFor(); ok(true, "explicação em bottom sheet");
await page.keyboard.press("Escape");

console.log("8. Competências");
await page.getByRole("link", { name: "Skills" }).click();
await page.locator(".skill-list li").first().waitFor(); ok((await page.locator(".skill-list li").count()) === 8, "oito competências");
ok(!/%|score|ranking/i.test(await text()), "sem percentagens/score/ranking");
await page.getByRole("link", { name: /Evals & Reliability/ }).click();
await page.getByRole("heading", { name: "Evals & Reliability", level: 2 }).waitFor();
t = await text(); ok(t.includes("Exploring") && t.includes("Criterion EN 1") && t.includes("Correct assessment"), "ficha da competência em EN");
await click("Correct assessment"); await page.getByRole("dialog").getByLabel("Status").selectOption("developing"); await page.getByRole("dialog").getByLabel("Evidence confidence").selectOption("medium");
await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
await page.getByText("Developing").first().waitFor();
ok(be.db.competencies.find((c) => c.slug === "evals-reliability").assessment_source === "user", "correção do utilizador guardada como 'user'");

console.log("9. Evidências, datas por locale e privacidade por omissão");
await page.getByRole("link", { name: "Evidence" }).click();
await click("Add evidence");
const dlg = page.getByRole("dialog");
ok(await dlg.getByLabel("Private").isChecked(), "visibilidade Privada por omissão");
await dlg.getByLabel("Title").fill("AI Test Triage"); await dlg.getByLabel("Date").fill("2026-11-16"); await dlg.getByLabel("Skill").selectOption({ label: "Evals & Reliability" });
await dlg.getByLabel("Client work (never public, never sent to the AI)").check();
ok(await dlg.getByLabel("Public on Learning Journey").isDisabled(), "trabalho de cliente bloqueia 'Pública'");
await dlg.getByRole("button", { name: "Save" }).click();
await page.getByText("16 Nov 2026").waitFor(); ok(true, "data en-GB");
const ev = be.db.evidence[0]; ok(ev.visibility === "private" && ev.is_client_work && !ev.share_with_ai, "cliente: privado e sem partilha com IA");
await page.locator("#btn-lang").click(); await page.getByText("16/11/2026").waitFor(); ok(true, "data pt-PT");
await page.locator("#btn-lang").click(); await page.getByText("Accept step").or(page.getByText("Evidence found")).first().waitFor().catch(() => {});

console.log("10. Percurso");
await page.getByRole("link", { name: "Journey" }).click();
await page.getByRole("heading", { name: "Possible next directions" }).waitFor(); t = await text(); ok(/possible next directions/i.test(t) && !/faltam|\d+ of \d+ courses|22%/i.test(t), "percurso adaptativo, sem contagens de cursos");
await click("Preview what is public"); await page.getByRole("dialog").locator("pre").waitFor();
const pj = await page.getByRole("dialog").locator("pre").innerText(); ok(!pj.includes("AI Test Triage"), "evidência privada não aparece na projeção pública");
await page.keyboard.press("Escape");

console.log("11. Migração do Roadmap antigo (idempotente)");
await page.evaluate(() => { localStorage.setItem("roadmap-ia-v1", JSON.stringify({ done: ["ea-b1", "ea-1-1", "at-1", "x-desconhecido"], at: { "ea-1-1": 1767225600000 } })); localStorage.setItem("roadmap-gh-token", "ghp_x"); });
await page.locator("#btn-settings").click(); await page.getByRole("dialog").getByRole("button", { name: "Import old Roadmap" }).click();
await page.getByText(/3 completed courses/).waitFor(); ok(true, "revisão antes de importar");
await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
await page.getByText("Import complete.").waitFor();
const nRes = be.db.learning_resources.length, nEv = be.db.evidence.length;
ok(nRes > 40 && be.db.learning_resources.filter((r) => r.status === "completed").length === 3, "recursos criados; incompletos ficam no catálogo");
ok(be.db.evidence.filter((e) => e.source_key?.startsWith("legacy:")).length === 2, "evidências de curso (só as mapeadas a competências)");
ok(be.db.legacy_backups.length === 1, "backup guardado antes de migrar");
ok(await page.evaluate(() => !!localStorage.getItem("roadmap-ia-v1") && !localStorage.getItem("roadmap-gh-token")), "estado antigo preservado; token do GitHub removido");
await page.locator("#btn-settings").click(); await page.getByRole("dialog").getByRole("button", { name: "Import old Roadmap" }).click();
await page.getByText("Nothing new to import").waitFor();
ok(be.db.learning_resources.length === nRes && be.db.evidence.length === nEv, "segunda migração não duplica");
await page.keyboard.press("Escape");

console.log("12. Erros não expõem detalhes técnicos");
be.q.fail = "analyse-learning-profile";
await page.getByRole("link", { name: "Now" }).click();
await click("Generate recommendation").catch(() => {});
await page.waitForTimeout(400);
be.q.fail = null;
t = await text(); ok(!/stack|TypeError|at .*\.js|internal_error/i.test(t), "sem stack traces no ecrã");

console.log("13. Offline = só leitura, com data de sincronização");
await page.getByRole("link", { name: "Now" }).click();
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 8000 }).catch(() => {});
await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload(); await page.waitForSelector("#banner:not([hidden])", { timeout: 8000 });
const ban = await page.locator("#banner").innerText(); ok(/Offline · Last synced on/.test(ban), "banner Offline + data", ban);
ok(await page.getByRole("button", { name: "Accept step" }).isDisabled().catch(() => true), "ações de escrita desativadas offline");
await page.screenshot({ path: join(SHOTS, "offline-en.png") });
await ctx.setOffline(false);

console.log("14. Segurança do bundle e rede");
const hosts = new Set(seen.filter((s) => s.startsWith("REQ ")).map((s) => s.slice(4)));
ok(![...hosts].some((h) => /anthropic/.test(h)), "o browser nunca contacta a Claude API", [...hosts].join(","));
const bundle = ["index.html", "js/app.js", "js/api.js", "js/store.js", "js/config.js", "sw.js"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n").replace(/(^|\s)\/\/.*$/gm, "");
ok(!/sk-ant|service_role|eyJhbGciOi/.test(bundle), "sem chaves secretas no frontend (comentários ignorados)");

console.log("15. Layout a 320 px e temas");
await page.setViewportSize({ width: 320, height: 640 });
for (const r of ["now", "skills", "evidence", "journey"]) {
  await page.goto(`${BASE}#/${r}`); await page.waitForTimeout(250);
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(w[0] <= w[1], `sem scroll horizontal a 320 px (${r})`, String(w));
}
await page.setViewportSize({ width: 390, height: 844 });
for (const scheme of ["light", "dark"]) {
  await page.emulateMedia({ colorScheme: scheme });
  for (const r of ["now", "skills", "evidence", "journey"]) { await page.goto(`${BASE}#/${r}`); await page.waitForTimeout(250); await page.screenshot({ path: join(SHOTS, `${r}-${scheme}.png`) }); }
}
const small = await page.evaluate(() => [...document.querySelectorAll("button,a,input,select,textarea,summary")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5) && !e.closest("[hidden]"); }).map((e) => e.tagName + ":" + (e.textContent || e.name || "").slice(0, 20)));
ok(small.length === 0, "alvos de toque >= 44 px", small.join(", "));

console.log("15b. Sessão expirada (401 do servidor)");
await page.goto(BASE + "#/now"); await page.getByRole("link", { name: "Now" }).waitFor(); await page.waitForTimeout(300);
be.q.unauth = true;
if (await page.getByRole("button", { name: "Generate recommendation" }).count()) await click("Generate recommendation");
else { await page.getByRole("button", { name: "Update recommendation" }).or(page.getByRole("button", { name: "I already know this" })).first().click(); }
await page.getByRole("heading", { name: "Sign in" }).waitFor();
ok((await text()).toLowerCase().includes("session expired"), "401 mostra 'Sessão expirada' e pede novo login");
ok(await page.locator("#nav").isHidden(), "dados privados escondidos após expirar");
be.q.unauth = false;
await page.getByLabel("Email", { exact: true }).fill("dono@example.com"); await click("Send code");
await page.getByLabel("Code received by email").fill("123456"); await click("Sign in");
await page.locator("#nav").waitFor(); ok(true, "novo login recupera a app");

console.log("16. Sessão: persistência pelo SDK e terminar sessão");
await page.goto(BASE + "#/now"); await page.getByRole("link", { name: "Now" }).waitFor();
ok(await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("lj-auth") || "null"); return !!(v && v.access_token && v.refresh_token); }), "sessão guardada pelo supabase-js (lj-auth)");
await page.locator("#btn-settings").click(); await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
await page.getByRole("heading", { name: "Sign in" }).waitFor();
ok(await page.evaluate(() => !localStorage.getItem("lj-auth") && !localStorage.getItem("lj-snapshot-v1")), "terminar sessão apaga sessão e snapshot locais");
ok(!(await text()).includes("Session expired"), "terminar sessão não é tratado como sessão expirada");
ok(await page.locator("#nav").isHidden(), "navegação escondida depois de sair");

await browser.close(); server.close();
console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
