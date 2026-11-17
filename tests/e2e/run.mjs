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

console.log("1. Arranque, PT, quatro áreas");
let ctx = await newCtx();
let page = await ctx.newPage();
page.on("request", (r) => hosts.add(new URL(r.url()).host));
await page.goto(BASE); await page.waitForSelector("#nav:not([hidden])");
let navs = await page.$$eval("#nav a span", (e) => e.map((x) => x.textContent));
ok(JSON.stringify(navs) === JSON.stringify(["Agora", "Competências", "Evidências", "Evolução"]), "navegação PT: Agora, Competências, Evidências, Evolução", JSON.stringify(navs));
let t = await text(page);
ok(/Retrieval e RAG/.test(t), "Agora: competência em foco");
ok(/Aplicar/.test(t) && /laboratório independente/i.test(t), "Agora: tipo APLICAR e próxima ação");
ok(/recall@3/.test(t) && /Evidência esperada/i.test(t), "Agora: evidência esperada");
ok(/Análise de 17/.test(t), "Agora: data da análise");
ok(!/\b22\s?%|5\/23|1\/7|score|pontuação/i.test(t), "sem métricas proibidas");
await page.screenshot({ path: join(SHOTS, "now-mobile-pt-light.png") });

console.log("2. Competências");
await go(page, "skills");
const rows = await page.$$eval("details.skill", (e) => e.length);
ok(rows === 10, "10 competências", String(rows));
t = await text(page);
ok(/Não observado/.test(t) && /Consolidado/.test(t) && /Aplicado/.test(t) && /Conhecimento/.test(t), "estados em português");
ok(/confiança (alta|média|baixa)/.test(t), "confiança discreta");
ok(!/%/.test(t), "sem percentagens");
await page.click("details.skill:nth-of-type(1) > summary"); await page.waitForTimeout(50);
await page.locator("details.skill").nth(3).locator("summary").click(); await page.waitForTimeout(50);
t = await text(page);
ok(/Evidência insuficiente/.test(t), "RAG mostra 'Evidência insuficiente'");
await page.screenshot({ path: join(SHOTS, "skills-mobile-pt-light.png"), fullPage: true });

console.log("3. Evidências");
await go(page, "evidence");
t = await text(page);
const evSections = await page.$$eval("details.more", (e) => e.length);
ok(evSections === 7, "7 competências com evidência", String(evSections));
ok(/Sem evidência autorizada/i.test(t) && /Retrieval e RAG/.test(t), "lista sem evidência autorizada");
ok(/Estudos registados/i.test(t) && /LangChain e Python/.test(t), "estudos registados (cursos confirmados)");
ok(await page.$eval('a[href="legacy/"]', (a) => !!a), "ligação ao roadmap antigo (cursos preservados)");
await page.locator("details.more").first().locator("summary").click(); await page.waitForTimeout(50);
ok(/ADR-003/.test(await text(page)), "evidência citável com localização");
await page.screenshot({ path: join(SHOTS, "evidence-mobile-pt-light.png"), fullPage: true });

console.log("4. Evolução");
await go(page, "journey");
t = await text(page);
ok(/17\/11\/2026/.test(t) && /Ponto de partida/.test(t), "primeira análise como ponto de partida");
ok(/pede uma nova análise ao Claude/.test(t), "explica como obter a próxima análise");
await page.screenshot({ path: join(SHOTS, "journey-mobile-pt-light.png"), fullPage: true });

console.log("5. Inglês");
await page.click("#btn-lang"); await page.waitForTimeout(80);
navs = await page.$$eval("#nav a span", (e) => e.map((x) => x.textContent));
ok(JSON.stringify(navs) === JSON.stringify(["Now", "Skills", "Evidence", "Progression"]), "navegação EN", JSON.stringify(navs));
ok(await page.evaluate(() => document.documentElement.lang) === "en-GB", "html lang=en-GB");
await go(page, "now"); t = await text(page);
ok(/In focus/i.test(t) && /Apply/.test(t) && /Build a small independent Retrieval\/RAG lab/.test(t) && /Expected evidence/i.test(t), "Now em inglês (conteúdo da análise incluído)");
await page.screenshot({ path: join(SHOTS, "now-mobile-en-light.png") });
await go(page, "skills"); t = await text(page);
ok(/Not observed/.test(t) && /Consolidated/.test(t) && /medium confidence/.test(t), "Skills em inglês");
await go(page, "evidence"); ok(/No authorised evidence/i.test(await text(page)), "Evidence em inglês");
await go(page, "journey"); ok(/Starting point/.test(await text(page)), "Progression em inglês");
await page.click("#btn-lang");

console.log("6. Acessibilidade e mobile");
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const r of ["now", "skills", "evidence", "journey"]) {
    await go(page, r);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(!over, `sem scroll horizontal a ${w} px (${r})`);
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await go(page, "skills");
const small = await page.$$eval("#nav a, #btn-lang, details.skill > summary", (els) => els.filter((e) => { const b = e.getBoundingClientRect(); return b.height < 44 || b.width < 44; }).length);
ok(small === 0, "alvos de toque >= 44 px", String(small));
ok(await page.evaluate(() => !!document.querySelector("main#view") && !!document.querySelector("nav[aria-label]") && document.querySelectorAll("h1").length === 1), "landmarks e um único h1");
ok(await page.$eval(".skip", (e) => e.getAttribute("href") === "#view"), "ligação 'saltar para o conteúdo'");
const fresh = await (await newCtx()).newPage(); await fresh.goto(BASE); await fresh.waitForSelector("#nav:not([hidden])");
await fresh.keyboard.press("Tab");
ok(await fresh.evaluate(() => document.activeElement && document.activeElement.className.includes("skip")), "primeiro Tab vai para 'saltar para o conteúdo'");

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
ok((await p2.$$("article.step")).length === 2, "duas análises na evolução");
ok(/Retrieval e RAG: Não observado → Aplicado/.test(t), "mostra o que mudou (nível)");
ok(/Construir um pequeno laboratório independente de Retrieval\/RAG/.test(t), "mostra o que foi feito (ação anterior)");
ok(!/pede uma nova análise/.test(t), "mensagem de espera só com uma análise");
await p2.screenshot({ path: join(SHOTS, "journey-two-analyses-mobile-pt-light.png"), fullPage: true });
await ctx2.close();

console.log("11. Desktop");
const desk = await newCtx({ viewport: { width: 1280, height: 800 } });
const d = await desk.newPage(); await d.goto(BASE); await d.waitForSelector("#nav:not([hidden])");
await d.screenshot({ path: join(SHOTS, "now-desktop-pt-light.png") });
await go(d, "skills"); await d.locator("details.skill").nth(3).locator("summary").click(); await d.waitForTimeout(60);
await d.screenshot({ path: join(SHOTS, "skills-desktop-pt-light.png") });
await go(d, "evidence"); await d.locator("details.more").first().locator("summary").click(); await d.waitForTimeout(60);
await d.screenshot({ path: join(SHOTS, "evidence-desktop-pt-light.png") });
const navDesk = await d.$eval("#nav", (n) => getComputedStyle(n).position);
ok(navDesk === "fixed", "desktop: navegação lateral");
await desk.close();

await browser.close(); server.close();
console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
