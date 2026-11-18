// Teste de ponta a ponta no Chromium, sem backend: serve a pasta e lê data/*.json. Uso: node tests/e2e/run.mjs
import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

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

let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); } };
const hosts = new Set();

const browser = await chromium.launch();
async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "pt-PT", ...opts });
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("https://fonts.gstatic.com/**", (r) => r.fulfill({ status: 200, body: "" }));
  return ctx;
}
const text = (page) => page.evaluate(() => document.body.innerText);
const go = async (page, r) => { await page.evaluate((x) => { location.hash = `#/${x}`; }, r); await page.waitForTimeout(80); };

console.log("1. Arranque, PT, três áreas");
let ctx = await newCtx();
let page = await ctx.newPage();
page.on("request", (r) => hosts.add(new URL(r.url()).host));
await page.goto(BASE); await page.waitForSelector("#nav:not([hidden])");
let navs = await page.$$eval("#nav a span", (e) => e.map((x) => x.textContent));
ok(JSON.stringify(navs) === JSON.stringify(["Agora", "Competências", "Evolução"]), "navegação PT: Agora, Competências, Evolução", JSON.stringify(navs));
let t = await text(page);
ok(/Agora/i.test(t) && /Retrieval e RAG/.test(t), "Agora: competência em foco");
ok(/Construir um pequeno laboratório independente de Retrieval\/RAG/.test(t) && /Aplicar/i.test(t), "Agora: próximo passo e tipo");
ok(!/recall@3|Porque não outra competência|Há evidências fortes/.test(t), "Agora: detalhes escondidos por omissão (evidência esperada, porquê)");
ok(!/\b22\s?%|5\/23|1\/7|score|pontuação/i.test(t), "sem métricas proibidas");
ok(await page.$$eval("#view details.more", (d) => d.length === 2 && d.every((x) => !x.open)), "dois disclosures fechados: 'Porquê isto agora?' e 'O que preciso demonstrar?'");
const sumTxt = await page.$$eval("#view details.more > summary", (e) => e.map((x) => x.textContent));
ok(sumTxt[0] === "Porquê isto agora?" && sumTxt[1] === "O que preciso demonstrar?", "títulos dos disclosures em PT", JSON.stringify(sumTxt));
await page.screenshot({ path: join(SHOTS, "now-mobile-pt-light.png") });
await page.locator("#view details.more").nth(0).locator("summary").click(); await page.locator("#view details.more").nth(1).locator("summary").click(); await page.waitForTimeout(60);
t = await text(page);
ok(/Há evidências fortes/.test(t) && /Porque não outra competência/.test(t), "'Porquê isto agora?' mostra a justificação completa");
ok(/Pipeline de ingestão e índice/.test(t) && /recall@3/.test(t) && /falha de retrieval documentada/.test(t), "'O que preciso demonstrar?' lista a evidência esperada");
await page.screenshot({ path: join(SHOTS, "now-mobile-pt-expanded.png"), fullPage: true });
await page.reload(); await page.waitForSelector("#nav:not([hidden])");

console.log("2. Competências");
await go(page, "skills");
const rows = await page.$$eval("details.skill", (e) => e.length);
ok(rows === 10, "10 competências", String(rows));
const heads = await page.$$eval(".view-skills > section > h3", (e) => e.map((x) => x.textContent));
ok(JSON.stringify(heads) === JSON.stringify(["Consolidado", "Aplicado", "Conhecimento", "A explorar"]), "agrupadas por estado", JSON.stringify(heads));
const groupSizes = await page.$$eval(".view-skills > section", (e) => e.map((x) => x.querySelectorAll("details.skill").length));
ok(JSON.stringify(groupSizes) === JSON.stringify([3, 3, 1, 3]), "3 · 3 · 1 · 3", JSON.stringify(groupSizes));
t = await text(page);
ok(/Foco atual/.test(t) && await page.$eval(".view-skills > section:last-of-type details.skill .skill-name", (e) => /Retrieval/.test(e.textContent)), "foco atual no topo de 'A explorar'");
ok(!/%/.test(t) && !(await page.$("progress, [role=progressbar], canvas, svg.radar")), "sem percentagens, barras de progresso ou radar");
ok(!/Evidências/.test(await page.$$eval("#nav a", (e) => e.map((x) => x.textContent).join())), "'Evidências' já não está na navegação");
await page.locator("details.skill").first().locator(":scope > summary").click(); await page.waitForTimeout(50);
t = await text(page);
ok(/Consolidado · confiança alta/.test(t) && /Porquê este nível\?/i.test(t) && /TrackCargo/.test(t) && /Máximo de 2 tentativas/.test(t), "detalhe: nível, confiança e evidências por projeto");
ok(!/docs\/ai-test-triage\/adr\/ADR-003\.md/.test(await page.$eval("details.skill[open]", (e) => [...e.querySelectorAll(":scope > .skill-body > :not(details)")].map((x) => x.innerText).join(" "))), "caminho do ficheiro não é informação principal");
await page.locator("details.skill[open] details.src > summary").click(); await page.waitForTimeout(50);
ok(/ADR-003\.md/.test(await text(page)), "'Ver fonte' mostra o caminho como informação secundária");
await page.locator("details.skill").nth(9).locator(":scope > summary").click(); await page.waitForTimeout(50);
ok(/Falta observar/.test(await text(page)) && /Ausência de evidência não significa ausência de conhecimento/.test(await text(page)), "competência sem evidência: gap e aviso");
await page.screenshot({ path: join(SHOTS, "skills-mobile-pt-light.png"), fullPage: true });
await page.locator("details.studies > summary").click(); await page.waitForTimeout(50);
t = await text(page);
ok(/Estudos registados/i.test(t) && /LangChain e Python/.test(t) && await page.$eval('a[href="legacy/"]', (a) => !!a), "estudos e roadmap antigo preservados dentro de Competências");
await go(page, "evidence");
ok(await page.evaluate(() => location.hash.length > 0) && (await text(page)).includes("Competências") && (await page.$$("details.skill")).length === 10, "#/evidence antigo abre Competências");

console.log("3. Evolução");
await go(page, "journey");
t = await text(page);
ok(/PONTO DE PARTIDA/i.test(t) && /Esta é a primeira fotografia do teu percurso/.test(t) && /A evolução aparecerá aqui depois das próximas análises/.test(t), "primeira análise como ponto de partida, sem parecer vazia");
const segs = await page.$$eval(".stack .seg", (e) => e.map((x) => x.textContent));
ok(JSON.stringify(segs) === JSON.stringify(["3", "1", "3", "3"]), "barra empilhada 3 · 1 · 3 · 3 (números dentro dos segmentos)", JSON.stringify(segs));
ok(/Não observado\s*3/.test(t) && /Conhecimento\s*1/.test(t) && /Aplicado\s*3/.test(t) && /Consolidado\s*3/.test(t), "legenda com nomes e números (não depende da cor)");
ok(/3 Não observado, 1 Conhecimento, 3 Aplicado, 3 Consolidado/.test(await page.$eval(".stack", (e) => e.getAttribute("aria-label"))) && await page.$eval(".stack", (e) => e.getAttribute("role") === "img"), "barra com texto alternativo");
await page.screenshot({ path: join(SHOTS, "journey-mobile-pt-light.png"), fullPage: true });

console.log("4. Inglês");
await page.click("#btn-lang"); await page.waitForTimeout(80);
navs = await page.$$eval("#nav a span", (e) => e.map((x) => x.textContent));
ok(JSON.stringify(navs) === JSON.stringify(["Now", "Skills", "Progression"]), "navegação EN: Now, Skills, Progression", JSON.stringify(navs));
ok(await page.evaluate(() => document.documentElement.lang) === "en-GB", "html lang=en-GB");
await go(page, "now"); t = await text(page);
ok(/Now/i.test(t) && /Build a small independent Retrieval\/RAG lab/.test(t) && /Why this now\?/.test(t) && /What do I need to show\?/.test(t), "Now em inglês (conteúdo da análise incluído)");
await page.screenshot({ path: join(SHOTS, "now-mobile-en-light.png") });
await go(page, "skills"); t = await text(page);
ok(/Consolidated/i.test(t) && /To explore/i.test(t) && /Current focus/i.test(t), "Skills em inglês");
await page.locator("details.skill").first().locator(":scope > summary").click(); await page.waitForTimeout(50);
ok(/Consolidated · high confidence/.test(await text(page)) && /Why this level\?/i.test(await text(page)), "detalhe em inglês");
await go(page, "journey"); t = await text(page); ok(/Starting point/i.test(t) && /first snapshot of your journey/.test(t), "Progression em inglês");
await page.screenshot({ path: join(SHOTS, "journey-mobile-en-light.png"), fullPage: true });
await page.click("#btn-lang");

console.log("5. Acessibilidade e mobile");
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const r of ["now", "skills", "journey"]) {
    await go(page, r);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(!over, `sem scroll horizontal a ${w} px (${r})`);
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await go(page, "skills");
const small = await page.$$eval("#nav a, #btn-lang, #sel-theme, details.skill > summary, details.src > summary", (els) => els.filter((e) => { const b = e.getBoundingClientRect(); return b.height && (b.height < 44 || b.width < 44); }).length);
ok(small === 0, "alvos de toque >= 44 px", String(small));
await go(page, "now");
ok(await page.$$eval("#view details.more > summary", (e) => e.every((x) => x.getBoundingClientRect().height >= 44)), "disclosures com alvo >= 44 px");
await page.focus("#view details.more > summary"); await page.keyboard.press("Enter"); await page.waitForTimeout(50);
ok(await page.$eval("#view details.more", (d) => d.open), "disclosure abre com o teclado (Enter)");
ok(await page.evaluate(() => !!document.querySelector("main#view") && !!document.querySelector("nav[aria-label]") && document.querySelectorAll("h1").length === 1), "landmarks e um único h1");
ok(await page.$eval(".skip", (e) => e.getAttribute("href") === "#view"), "ligação 'saltar para o conteúdo'");
const fresh = await (await newCtx()).newPage(); await fresh.goto(BASE); await fresh.waitForSelector("#nav:not([hidden])");
await fresh.keyboard.press("Tab");
ok(await fresh.evaluate(() => document.activeElement && document.activeElement.className.includes("skip")), "primeiro Tab vai para 'saltar para o conteúdo'");
await fresh.close();

console.log("6. Agora cabe no ecrã do telemóvel (390 x 844), sem scroll");
{
  const c6 = await newCtx(); const p6 = await c6.newPage(); await p6.goto(BASE); await p6.waitForSelector("#nav:not([hidden])");
  const r = await p6.evaluate(() => { const q = (s) => document.querySelector(s)?.getBoundingClientRect(); const nav = q("#nav"); return { h2: q("#now-h"), step: q(".next-step"), navTop: nav.top, btn: q("button.btn.primary") }; });
  ok(r.h2 && r.step && r.step.bottom < r.navTop, "competência, descrição e próximo passo visíveis sem scroll", JSON.stringify(r));
  ok(r.btn && r.btn.bottom <= r.navTop, "botão 'Analisar o meu caminho' visível sem scroll", JSON.stringify(r.btn));
  await c6.close();
}

console.log("7. Claro/escuro");
const dark = await newCtx({ colorScheme: "dark" });
const dp = await dark.newPage(); await dp.goto(BASE); await dp.waitForSelector("#nav:not([hidden])");
const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(bg === "rgb(14, 19, 23)", "modo escuro segue o sistema", bg);
await dp.screenshot({ path: join(SHOTS, "now-mobile-pt-dark.png") });
await dark.close();

console.log("8. PWA: manifest, service worker e offline");
const m = await page.evaluate(async () => (await fetch("manifest.webmanifest")).json());
ok(m.display === "standalone" && m.start_url === "./" && m.icons.length >= 3, "manifest instalável");
const iconsOk = await page.evaluate(async (icons) => (await Promise.all(icons.map((i) => fetch(i.src).then((r) => r.ok)))).every(Boolean), m.icons);
ok(iconsOk, "ícones do manifest existem");
const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(reg, "service worker ativo");
await page.reload(); await page.waitForSelector("#nav:not([hidden])");
const cached = await page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith("lj-v")));
ok(cached, "cache lj-v criada");
await ctx.setOffline(true);
await page.reload(); await page.waitForSelector("#nav:not([hidden])", { timeout: 8000 }).catch(() => {});
t = await text(page);
ok(/Retrieval e RAG/.test(t), "offline: mostra a última análise guardada");
ok(/Sem ligação/.test(t), "offline: aviso visível");
await ctx.setOffline(false);

console.log("9. Só leitura, sem serviços externos");
const external = [...hosts].filter((h) => h && !/^localhost/.test(h) && !/fonts\.(googleapis|gstatic)\.com/.test(h));
ok(external.length === 0, "nenhum pedido a servidores além do próprio e das fontes", external.join(","));
ok(!(await page.$("input, textarea, form")), "sem formulários nem campos de escrita");
ok(!(await page.evaluate(() => Object.keys(localStorage).some((k) => /token|key|secret/i.test(k)))), "sem tokens no localStorage");


console.log("10. Evolução entre duas análises");
const ctx2 = await newCtx();
const p2 = await ctx2.newPage();
const base = JSON.parse(readFileSync(join(ROOT, "data/analises/latest.json"), "utf8"));
const next = JSON.parse(JSON.stringify(base));
next.date = "2026-12-20"; next.previous = base.date;
const rag = next.competencies.find((c) => c.id === "retrieval-rag");
rag.level = 2; rag.confidence = "medium"; rag.evidence = [{ location: "rag-lab · README.md", note: { pt: "Pipeline, queries e recall@3.", en: "Pipeline, queries and recall@3." } }];
next.focus.competency = "tool-use-mcp"; next.focus.action = { ...base.focus.action, type: "APRENDER", title: { pt: "Seguir o curso de MCP", en: "Follow the MCP course" } };
await ctx2.route("**/data/analises/latest.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(next) }));
await p2.goto(BASE + "#/journey"); await p2.waitForSelector("article.step");
t = await text(p2);
ok((await p2.$$("article.step")).length === 2, "duas análises na evolução (uma barra por data)");
const bars = await p2.$$eval(".stack", (e) => e.map((x) => x.getAttribute("aria-label")));
ok(/2 Não observado, 1 Conhecimento, 4 Aplicado, 3 Consolidado/.test(bars[0]) && /3 Não observado/.test(bars[1]), "contagens por data (2 · 1 · 4 · 3 contra 3 · 1 · 3 · 3)", JSON.stringify(bars));
ok(/O QUE MUDOU/i.test(t) && /Retrieval e RAG\s*Não observado → Aplicado/.test(t) && /Nova evidência/.test(t) && /Pipeline, queries e recall@3/.test(t), "O que mudou: nível e nova evidência");
ok(/Construir um pequeno laboratório independente de Retrieval\/RAG/.test(t), "mostra o que foi feito (ação anterior)");
ok(!/PONTO DE PARTIDA/i.test(t) && !/aparecerá aqui/.test(t), "ponto de partida só com uma análise");
await p2.screenshot({ path: join(SHOTS, "journey-two-analyses-mobile-pt-light.png"), fullPage: true });
await ctx2.close();

console.log("11. Desktop");
const desk = await newCtx({ viewport: { width: 1280, height: 800 } });
const d = await desk.newPage(); await d.goto(BASE); await d.waitForSelector("#nav:not([hidden])");
await d.screenshot({ path: join(SHOTS, "now-desktop-pt-light.png") });
await go(d, "skills"); await d.locator("details.skill").nth(0).locator(":scope > summary").click(); await d.waitForTimeout(60);
await d.screenshot({ path: join(SHOTS, "skills-desktop-pt-light.png") });
await go(d, "journey");
await d.screenshot({ path: join(SHOTS, "journey-desktop-pt-light.png") });
const navDesk = await d.$eval("#nav", (n) => getComputedStyle(n).position);
ok(navDesk === "fixed", "desktop: navegação lateral");
await desk.close();

console.log("12. Seletor de tema (Sistema / Claro / Escuro)");
{
  const c = await newCtx({ colorScheme: "dark" });
  const p = await c.newPage(); await p.goto(BASE); await p.waitForSelector("#nav:not([hidden])");
  const bgOf = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const opts = await p.$$eval("#sel-theme option", (o) => o.map((x) => x.textContent));
  ok(JSON.stringify(opts) === JSON.stringify(["Sistema", "Claro", "Escuro"]), "opções PT: Sistema, Claro, Escuro", JSON.stringify(opts));
  ok(await p.$eval("#sel-theme", (e) => e.value) === "system" && (await bgOf()) === "rgb(14, 19, 23)", "por omissão segue o sistema (escuro)");
  await p.selectOption("#sel-theme", "light"); await p.waitForTimeout(60);
  ok((await bgOf()) === "rgb(246, 244, 239)", "Claro força o tema claro mesmo com o sistema escuro", await bgOf());
  await p.screenshot({ path: join(SHOTS, "now-mobile-pt-forced-light.png") });
  await p.reload(); await p.waitForSelector("#nav:not([hidden])");
  ok((await bgOf()) === "rgb(246, 244, 239)" && await p.$eval("#sel-theme", (e) => e.value) === "light", "a escolha persiste depois de recarregar");
  await p.selectOption("#sel-theme", "dark"); await p.waitForTimeout(60);
  ok((await bgOf()) === "rgb(14, 19, 23)", "Escuro força o tema escuro");
  await p.selectOption("#sel-theme", "system"); await p.waitForTimeout(60);
  ok(!(await p.evaluate(() => document.documentElement.hasAttribute("data-theme"))) && !(await p.evaluate(() => Object.keys(localStorage).includes("lj-theme"))), "Sistema remove a preferência");
  await p.click("#btn-lang"); await p.waitForTimeout(60);
  ok(JSON.stringify(await p.$$eval("#sel-theme option", (o) => o.map((x) => x.textContent))) === JSON.stringify(["System", "Light", "Dark"]), "opções EN: System, Light, Dark");
  await c.close();
}

console.log("13. Learning Advisor (Supabase simulado)");
{
  const SB = "https://lj-test.supabase.co";
  const c = await newCtx();
  const calls = { analyse: 0, login: 0, auth: [] };
  let latestRow = null, mode = "ok", atype = "APPLY";
  const analysis = (lang, text) => ({ id: "a1", lang, basis: "studies_history", model: "openai/gpt-oss-120b", created_at: "2026-11-17T12:00:00Z", result: { current_focus: "retrieval-rag", reason: "Falta evidência de retrieval e há um curso concluído sem aplicação.", next_action: text, action_type: atype, skills_to_learn: ["embeddings", "chunking"], expected_evidence: ["20 queries", "recall@3"], public_summary: "A aprofundar retrieval.", updated_at: "2026-11-17T12:00:00Z" } });
  // config e CSP de teste: ligam a app ao "Supabase" falso
  await c.route("**/js/config.js**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: `export const CONFIG = { APP_VERSION: "3.2.0", SUPABASE_URL: "${SB}", SUPABASE_KEY: "sb_publishable_test" }; export const advisorEnabled = () => true;` }));
  await c.route(BASE + "index.html", async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("connect-src 'self'", `connect-src 'self' ${SB}`) }); });
  await c.route(BASE, async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("connect-src 'self'", `connect-src 'self' ${SB}`) }); });
  await c.route(`${SB}/**`, async (r) => {
    const u = new URL(r.request().url()), h = r.request().headers(), j = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: j });
    if (u.pathname === "/auth/v1/token") {
      calls.login++; const b = JSON.parse(r.request().postData());
      if (b.password !== "certa") return r.fulfill({ status: 400, headers: j, body: JSON.stringify({ error: "invalid_grant" }) });
      return r.fulfill({ status: 200, headers: j, body: JSON.stringify({ access_token: "jwt-1", refresh_token: "r-1", expires_in: 3600, user: { email: b.email } }) });
    }
    if (u.pathname === "/auth/v1/logout") return r.fulfill({ status: 204, headers: j });
    calls.auth.push(h.authorization);
    if (u.pathname === "/rest/v1/analyses") return r.fulfill({ status: 200, headers: j, body: JSON.stringify(latestRow ? [latestRow] : []) });
    if (u.pathname === "/functions/v1/analyse") {
      calls.analyse++;
      if (mode === "soon") return r.fulfill({ status: 429, headers: { ...j, "Retry-After": "42" }, body: JSON.stringify({ error: "too_soon", retry_after: 42 }) });
      if (mode === "provider") return r.fulfill({ status: 502, headers: j, body: JSON.stringify({ error: "invalid_response" }) });
      await new Promise((x) => setTimeout(x, 400));
      const lang = JSON.parse(r.request().postData()).lang;
      latestRow = analysis(lang, lang === "pt-PT" ? "Construir um laboratório pequeno de retrieval." : "Build a small retrieval lab.");
      return r.fulfill({ status: 200, headers: j, body: JSON.stringify({ analysis: latestRow }) });
    }
    r.fulfill({ status: 404, headers: j, body: "{}" });
  });
  const p = await c.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE); await p.waitForSelector("#nav:not([hidden])");
  let t = await text(p);
  ok(/Análise baseada nos estudos e histórico registados\. A análise dos projetos será adicionada posteriormente\./.test(t), "mostra o aviso: baseada em estudos e histórico, projetos depois");
  ok(/Retrieval e RAG/.test(t) && /Construir um pequeno laboratório independente/.test(t), "a análise real dos repositórios continua visível e intacta");
  ok(calls.analyse === 0 && calls.auth.length === 0, "sem sessão: nenhum pedido ao advisor nem à base de dados");
  ok(!!(await p.$("button.btn.primary")) && !(await p.$("form.login")), "sem sessão: o botão está lá e o formulário de entrada ainda não");
  await p.click("button.btn.primary"); await p.waitForSelector("form.login");
  ok(calls.analyse === 0 && calls.auth.length === 0 && await p.evaluate(() => document.activeElement.id === "lj-email"), "tocar no botão sem sessão abre a entrada (com foco no email), sem chamar o advisor");
  await p.screenshot({ path: join(SHOTS, "now-mobile-pt-signed-out.png"), fullPage: true });

  await p.fill("#lj-email", "eu@exemplo.pt"); await p.fill("#lj-pass", "errada"); await p.click("form.login button[type=submit]"); await p.waitForTimeout(150);
  ok(/Email ou palavra-passe incorretos/.test(await text(p)) && calls.analyse === 0, "login errado mostra erro e não chama o advisor");
  await p.fill("#lj-pass", "certa"); await p.click("form.login button[type=submit]");
  await p.waitForSelector("button.link");
  t = await text(p);
  ok(/Analisar o meu caminho/.test(t) && /Sair \(eu@exemplo\.pt\)/.test(t) && !(await p.$("form.login")), "depois do login o formulário desaparece e aparece o email");
  ok(/Construir um pequeno laboratório independente/.test(t), "sem recomendações guardadas: continua a análise real dos repositórios");
  ok(calls.analyse === 0, "a análise não corre sozinha ao abrir ou entrar");
  ok(await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("lj-session")); return !!s.access_token && !/groq|gsk_/i.test(JSON.stringify(localStorage)); }), "sessão normal guardada, sem token de administração nem chave Groq");

  await p.click("button.btn.primary"); await p.waitForTimeout(120);
  ok(/A analisar o teu percurso/.test(await text(p)) && await p.$eval("button.btn.primary", (b) => b.disabled && b.getAttribute("aria-busy") === "true"), "durante a análise: A analisar o teu percurso… (botão desativado)");
  await p.screenshot({ path: join(SHOTS, "now-mobile-pt-analysing.png"), fullPage: true });
  await p.waitForFunction(() => /Construir um laboratório pequeno de retrieval/.test(document.body.innerText));
  t = await text(p);
  ok(calls.analyse === 1 && calls.auth.every((a) => a === "Bearer jwt-1"), "um único pedido, sempre com a sessão do proprietário");
  ok(/Aplicar/i.test(t) && !/embeddings/.test(t) && !/O QUE APRENDER/i.test(t), "o ecrã Agora passa a mostrar a recomendação do advisor (tipo Aplicar, sem área de aprendizagem)");
  ok(!/pequeno laboratório independente/.test(t), "a recomendação do advisor substitui a do baseline no ecrã, sem duplicar");
  ok(/Porquê isto agora\?/.test(t) && !/Falta evidência de retrieval/.test(t) && !/recall@3/.test(t), "motivo e evidência esperada escondidos nos disclosures");
  await p.click("details.more >> nth=0"); await p.click("details.more >> nth=1"); await p.waitForTimeout(60);
  ok(/Falta evidência de retrieval/.test(await text(p)) && /recall@3/.test(await text(p)), "motivo e evidência esperada visíveis ao abrir");
  await p.screenshot({ path: join(SHOTS, "now-mobile-pt-advisor.png"), fullPage: true });

  await p.click("#btn-lang"); await p.waitForTimeout(80);
  t = await text(p);
  ok(/Generated in Portuguese/.test(t) && /Analysis based on the studies and history recorded\. Project analysis will be added later\./.test(t), "EN: aviso e nota de idioma da recomendação");
  await p.screenshot({ path: join(SHOTS, "now-mobile-en-advisor.png"), fullPage: true });
  await p.click("button.btn.primary"); await p.waitForFunction(() => /Build a small retrieval lab/.test(document.body.innerText));
  ok(true, "EN: nova análise pedida em inglês, texto vem já em inglês");

  atype = "LEARN"; await p.click("button.btn.primary"); await p.waitForFunction(() => /WHAT TO LEARN/i.test(document.body.innerText));
  t = await text(p);
  ok(/embeddings/.test(t) && /chunking/.test(t) && !/Alura|Anthropic Academy/.test(t), "tipo LEARN: 'What to learn' com os temas, sem impor instituição");
  await p.screenshot({ path: join(SHOTS, "now-mobile-en-learn.png"), fullPage: true });
  atype = "APPLY";
  mode = "soon"; await p.click("button.btn.primary"); await p.waitForSelector(".error");
  ok(/Wait 42 seconds/.test(await text(p)), "limite por minuto: mostra os segundos de espera");
  mode = "provider"; await p.click("button.btn.primary"); await p.waitForTimeout(200);
  ok(/did not respond well/.test(await text(p)), "falha do fornecedor: mensagem clara, sem detalhes internos");

  await p.reload(); await p.waitForSelector("button.btn.primary");
  ok(/Build a small retrieval lab/.test(await text(p)), "a recomendação guardada reaparece depois de recarregar");
  await p.click("button.link"); await p.waitForFunction(() => !document.querySelector("button.link"));
  ok(!(await p.evaluate(() => localStorage.getItem("lj-session"))), "Sair apaga a sessão");
  ok(errs.filter((e) => !/Failed to load resource|favicon/.test(e)).length === 0, "sem erros na consola", errs.join(" | "));
  await c.close();
}

await browser.close(); server.close();
console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);