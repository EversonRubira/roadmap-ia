// Edge Function "analyse": só o proprietário autenticado a pode usar. A chave da Groq vive apenas aqui (secret GROQ_API_KEY).
import { createClient } from "npm:@supabase/supabase-js@2";
import { AdvisorError, GroqLearningAdvisor } from "./advisor.js";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://eversonrubira.github.io,http://localhost:4173").split(",");
const BASE = Deno.env.get("BASELINE_URL") ?? "https://eversonrubira.github.io/roadmap-ia/";
const DEFAULT_OBJECTIVE = "AI Application Engineer / AI Engineer";
const MIN_INTERVAL_MS = 60_000; // uma análise por minuto
const DAILY_MAX = 10;           // e no máximo 10 por dia: limita o custo mesmo com a sessão comprometida

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const reply = (status: number, body: unknown, origin: string | null, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin), ...extra } });

async function getJson(path: string) {
  const r = await fetch(BASE + path, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED.includes(origin)) return reply(403, { error: "origin_not_allowed" }, null);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" }, origin);

  let lang = "";
  try { lang = (await req.json()).lang; } catch (_e) { /* tratado abaixo */ }
  if (lang !== "pt-PT" && lang !== "en-GB") return reply(400, { error: "invalid_lang" }, origin);

  const auth = req.headers.get("authorization");
  if (!auth) return reply(401, { error: "unauthenticated" }, origin);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await db.auth.getUser();
  if (ue || !u?.user) return reply(401, { error: "unauthenticated" }, origin);

  // Proprietário = quem tem a linha única em profile. O primeiro utilizador autenticado cria-a (registos públicos estão desligados).
  let { data: profile } = await db.from("profile").select("objective").maybeSingle();
  if (!profile) {
    const ins = await db.from("profile").insert({ user_id: u.user.id, objective: DEFAULT_OBJECTIVE }).select("objective").single();
    if (ins.error) return reply(403, { error: "not_owner" }, origin);
    profile = ins.data;
    try { // primeira utilização: copia os cursos já confirmados no roadmap antigo
      const done = await getJson("data/cursos-feitos.json");
      const rows = (done.courses || []).map((c: any) => ({
        name: c.title, platform: c.provider ?? null, competency_id: c.competencies?.[0] ?? null,
        status: "completed", completed_on: c.completed ? `${c.completed}-01`.slice(0, 10) : null,
      }));
      if (rows.length) await db.from("courses").insert(rows);
    } catch (_e) { /* a análise corre na mesma, só sem esses cursos */ }
  }

  const last = await db.from("analyses").select("created_at,result").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last.data) {
    const wait = MIN_INTERVAL_MS - (Date.now() - new Date(last.data.created_at).getTime());
    if (wait > 0) return reply(429, { error: "too_soon", retry_after: Math.ceil(wait / 1000) }, origin, { "Retry-After": String(Math.ceil(wait / 1000)) });
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const day = await db.from("analyses").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((day.count ?? 0) >= DAILY_MAX) return reply(429, { error: "daily_limit" }, origin);

  let model, baseline;
  try {
    [model, baseline] = await Promise.all([getJson("data/competencias.json"), getJson("data/analises/latest.json")]);
  } catch (_e) { return reply(502, { error: "context_unavailable" }, origin); }

  const [courses, history] = await Promise.all([
    db.from("courses").select("name,platform,competency_id,status,completed_on").order("created_at"),
    db.from("learning_history").select("occurred_on,note").order("occurred_on", { ascending: false }).limit(30),
  ]);
  if (courses.error || history.error) return reply(500, { error: "context_failed" }, origin);

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return reply(500, { error: "not_configured" }, origin);
  const advisor = new GroqLearningAdvisor({ apiKey: key, model: Deno.env.get("GROQ_MODEL") ?? undefined });

  try {
    const { result, model: used } = await advisor.analyse({
      lang, objective: profile.objective, competencies: model.competencies, baseline,
      courses: courses.data ?? [], history: history.data ?? [], previous: last.data ?? null,
    });
    const saved = await db.from("analyses").insert({ lang, model: used, result: { ...result, updated_at: new Date().toISOString() } }).select("id,lang,basis,model,result,created_at").single();
    if (saved.error) return reply(500, { error: "save_failed" }, origin);
    return reply(200, { analysis: saved.data }, origin);
  } catch (e) {
    console.error("advisor", e instanceof AdvisorError ? `${e.code}: ${e.detail}` : "unexpected");
    return reply(502, { error: e instanceof AdvisorError ? e.code : "advisor_failed" }, origin);
  }
});
