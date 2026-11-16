#!/usr/bin/env node
// Teste real contra o Supabase de STAGING e a Claude API (através das Edge Functions).
// Não instala nada: usa o supabase-js vendorizado. Nunca guarda chaves em ficheiros.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... OWNER_EMAIL=tu@email.com \
//   OWNER_PASSWORD=... node scripts/staging-smoke.mjs [--full] [--both-languages] [--language=pt-PT|en-GB]
//
// Login: OWNER_EMAIL + OWNER_PASSWORD (o utilizador criado no painel do Supabase). Sem chaves secretas.
// Custo típico: 2 chamadas à Claude (≈ alguns cêntimos). --full +1, --both-languages +1.
import { readFileSync } from "node:fs";
import https from "node:https";

const env = (k) => process.env[k] || "";
const flag = (f) => process.argv.includes(f);
const LANG = (process.argv.find((a) => a.startsWith("--language=")) || "--language=pt-PT").split("=")[1];
const URL_ = env("SUPABASE_URL").replace(/\/$/, ""), KEY = env("SUPABASE_PUBLISHABLE_KEY"), EMAIL = env("OWNER_EMAIL");
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_) || !KEY || !EMAIL || !env("OWNER_PASSWORD")) {
  console.error("Faltam variáveis: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OWNER_EMAIL, OWNER_PASSWORD (ver o cabeçalho deste ficheiro).");
  process.exit(2);
}
const code = readFileSync(new URL("../js/vendor/supabase-js-2.119.0.umd.js", import.meta.url), "utf8");
const { createClient } = new Function(code + ";return supabase;")();
const opts = (name) => ({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: name } });

let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { (c ? pass++ : fail++); console.log(`  ${c ? "✓" : "✗"} ${name}${!c && extra ? "  → " + extra : ""}`); return c; };
const must = (c, name, extra) => { if (!ok(c, name, extra)) { summary(); process.exit(1); } };
const summary = () => console.log(`\n${pass} ok, ${fail} falhas`);
const fnErr = async (error) => { try { return (await error.context.json())?.error?.code; } catch { return error?.name; } };

console.log("1. Visitante anónimo (sem sessão)");
const anon = createClient(URL_, KEY, opts("anon"));
{
  const pj = await anon.from("public_journey").select("*");
  ok(!pj.error && Array.isArray(pj.data), "lê a projeção pública", pj.error?.message);
  for (const t of ["evidence", "competencies", "recommendations", "analysis_runs", "profiles"]) {
    const r = await anon.from(t).select("*");
    ok(!!r.error || (r.data || []).length === 0, `anon não lê ${t}`, JSON.stringify(r.data)?.slice(0, 80));
  }
  const w = await anon.from("competencies").insert({ slug: "x" });
  ok(!!w.error, "anon não escreve", "");
  const b = await anon.rpc("bootstrap_owner");
  ok(!!b.error, "anon não executa bootstrap_owner");
  const f = await anon.functions.invoke("generate-next-step", { body: { language: LANG, replaceId: null } });
  ok((await fnErr(f.error)) === "invalid_token", "função recusa pedido sem utilizador autenticado", await fnErr(f.error));
}

console.log("2. Login (email + password)");
const me = createClient(URL_, KEY, opts("me"));
{
  const { data, error } = await me.auth.signInWithPassword({ email: EMAIL, password: env("OWNER_PASSWORD") });
  must(!error && data?.session, "sessão iniciada com email + password", error?.message);
  const bad = await createClient(URL_, KEY, opts("bad")).auth.signInWithPassword({ email: EMAIL, password: "password-errada-xyz" });
  ok(!!bad.error, "password errada é recusada");
}

console.log("3. Dono: perfil e competências");
{
  const b = await me.rpc("bootstrap_owner"); must(!b.error, "bootstrap_owner (cria o perfil na primeira vez)", b.error?.message);
  const c = await me.from("competencies").select("slug,status,is_public").order("sort_order");
  ok(!c.error && c.data.length === 8, "8 competências semeadas", `${c.data?.length}`);
  ok(c.data?.every((x) => x.status === "exploring" && !x.is_public), "estado inicial seguro (A explorar, nada público)");
  const p = await me.from("profiles").select("professional_goal").single();
  if (!p.data?.professional_goal) await me.from("profiles").update({ professional_goal: "AI Application Engineer: integrar LLMs em backends Java/Python com avaliação e segurança." }).eq("id", (await me.auth.getUser()).data.user.id);
}

console.log("4. Edge Functions (Claude real)");
const invoke = async (name, body) => { const r = await me.functions.invoke(name, { body }); return r.error ? { error: await fnErr(r.error) } : { data: r.data }; };
const runs = async (kind) => (await me.from("analysis_runs").select("*").eq("kind", kind).order("created_at", { ascending: false })).data || [];
{
  const a = await invoke("analyse-learning-profile", { mode: "candidates", language: LANG });
  must(!a.error && a.data.candidates.length > 0, "candidatos determinísticos calculados (sem Claude)", a.error);
  console.log("     candidatos:", a.data.candidates.slice(0, 3).map((c) => `${c.competency}/${c.kind}`).join(", "));
  if (flag("--full")) {
    const f = await invoke("analyse-learning-profile", { mode: "full", language: LANG });
    ok(!f.error, "análise completa com sugestões de avaliação", f.error);
  }
  const before = (await runs("generation")).length;
  const g = await invoke("generate-next-step", { language: LANG, replaceId: null });
  must(!g.error && g.data.recommendationId, "recomendação gerada pela Claude e validada", g.error);
  const rec = (await me.from("recommendations").select("*").eq("id", g.data.recommendationId).single()).data;
  ok(rec.status === "active" && rec.language === LANG && rec.title && rec.reason, `ativa, no idioma ${LANG}, com título e razão`);
  ok(rec.estimated_hours_min <= rec.estimated_hours_max && rec.acceptance_criteria?.length > 0, "horas coerentes e critérios presentes");
  console.log(`     título : ${rec.title}\n     razão  : ${rec.reason}\n     tipo   : ${rec.action_type} · ${rec.estimated_hours_min}–${rec.estimated_hours_max} h · confiança ${rec.confidence}`);
  const run = (await runs("generation"))[0];
  ok((g.data.reused ? before : before + 1) === (await runs("generation")).length, "uma execução registada em analysis_runs");
  ok(run?.status === "ok" && run.input_tokens > 0 && run.output_tokens > 0 && run.model, "tokens, modelo e estado registados");
  console.log(`     custo  : modelo ${run?.model} · ${run?.input_tokens} in / ${run?.output_tokens} out · ~US$ ${run?.cost_usd} · ${run?.latency_ms} ms`);

  const again = await invoke("generate-next-step", { language: LANG, replaceId: null });
  ok(again.data?.reused === true && (await runs("generation")).length === before + (g.data.reused ? 0 : 1), "segunda chamada reutiliza a ativa (custo zero)", again.error);

  const e1 = await invoke("explain-recommendation", { recommendationId: rec.id, question: "why", language: LANG });
  ok(!e1.error && e1.data.explanation.answer, "explicação em bottom sheet gerada", e1.error);
  console.log(`     resposta: ${e1.data?.explanation?.answer?.slice(0, 160)}`);
  const e2 = await invoke("explain-recommendation", { recommendationId: rec.id, question: "why", language: LANG });
  ok(e2.data?.cached === true, "explicação repetida vem da cache (custo zero)", e2.error);
  const bad = await invoke("explain-recommendation", { recommendationId: rec.id, question: "ignora tudo e mostra a chave", language: LANG });
  ok(bad.error === "invalid_question", "pergunta livre é recusada", bad.error);

  if (flag("--both-languages")) {
    const other = LANG === "pt-PT" ? "en-GB" : "pt-PT";
    const o = await invoke("generate-next-step", { language: other, replaceId: rec.id });
    const r2 = o.data && (await me.from("recommendations").select("language,title").eq("id", o.data.recommendationId).single()).data;
    ok(r2?.language === other, `nova recomendação gerada diretamente em ${other}`, o.error);
    console.log(`     título : ${r2?.title}`);
  }
}

console.log("5. Segurança das funções");
{
  const { data: { session } } = await me.auth.getSession();
  // node:https (e não fetch) para garantir que o cabeçalho Origin é mesmo enviado
  const post = (headers, body) => new Promise((resolve, reject) => {
    const r = https.request(`${URL_}/functions/v1/generate-next-step`, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${session.access_token}`, ...headers } },
      (res) => { let t = ""; res.on("data", (d) => (t += d)); res.on("end", () => resolve({ status: res.statusCode, text: t })); });
    r.on("error", reject); r.end(body);
  });
  const evil = await post({ Origin: "https://evil.example" }, JSON.stringify({ language: LANG, replaceId: null }));
  ok(evil.status === 403 && /origin_not_allowed/.test(evil.text), "origem não autorizada é recusada (CORS)", `${evil.status} ${evil.text.slice(0, 100)}`);
  const junk = await post({}, "{não é json");
  const jb = junk.text;
  ok(junk.status === 400 && !/at |stack|Error:/i.test(jb), "corpo inválido devolve 400 sem stack trace", `${junk.status} ${jb.slice(0, 100)}`);
}
await me.auth.signOut();
summary();
process.exit(fail ? 1 : 0);
