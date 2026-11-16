// Camada fina sobre o @supabase/supabase-js oficial (v2.119.0, vendorizado em js/vendor/).
// Auth (código por email), sessão persistente com refresh automático, PostgREST e Edge Functions
// passam todos pelo SDK. Este módulo só: (1) mantém a interface usada pelo resto da app e
// (2) converte erros do SDK em ApiError/OfflineError com códigos curtos (nunca mensagens do servidor).
import { CONFIG } from "./config.js";

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export class OfflineError extends Error { constructor() { super("offline"); } }

let client = null;
let current = null;                 // sessão em memória (leitura síncrona para a UI)
const listeners = new Set();

function sb() {
  if (!client) {
    if (!window.supabase?.createClient) throw new Error("supabase-js em falta");
    client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
      // storageKey próprio: a origem github.io é partilhada com outras páginas
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "lj-auth" },
    });
  }
  return client;
}

/** Tem de ser chamada uma vez no arranque, antes de usar hasSession(). Recupera a sessão guardada. */
export async function initAuth() {
  const { data } = await sb().auth.getSession();
  current = data?.session || null;
  sb().auth.onAuthStateChange((_event, session) => {
    const had = !!current;
    current = session || null;
    // só notifica quando entra ou sai uma sessão (o SDK repete SIGNED_IN ao voltar ao separador)
    // e adia: dentro deste callback não se deve chamar o SDK de forma síncrona (risco de deadlock)
    if (had !== !!current) setTimeout(() => listeners.forEach((fn) => fn(current)), 0);
  });
}
export const onSession = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const hasSession = () => !!current;
export const sessionEmail = () => current?.user?.email || "";

const NETWORK = /failed to fetch|networkerror|load failed|fetch failed|network request failed|networkrequestfailed/i;

/** Converte o erro do SDK numa exceção nossa. Códigos das funções SQL (ex.: step_already_in_progress) passam como código. */
function fail(error, status) {
  const msg = String(error?.message || "");
  const name = String(error?.name || "");
  if (status === 0 || NETWORK.test(msg) || name === "FunctionsFetchError" || name === "AuthRetryableFetchError") throw new OfflineError();
  const appCode = /^[a-z_]{3,40}$/.test(msg) ? msg : null;
  throw new ApiError(status || error?.status || 500, appCode || String(error?.code || "request_failed").slice(0, 60));
}
function unwrap(res) {
  if (res.error) fail(res.error, res.status);
  return res.data;
}

/* ── Auth ── */
export async function requestCode(email) {
  const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) fail(error);
}
export async function verifyCode(email, token) {
  const { data, error } = await sb().auth.verifyOtp({ email, token, type: "email" });
  if (error) fail(error);
  current = data.session;
}
export async function signOut() {
  const r = await sb().auth.signOut();
  if (r.error) await sb().auth.signOut({ scope: "local" });    // sem rede: sair localmente na mesma
  current = null;
}

/* ── Dados (RLS aplica-se com o JWT do utilizador, que o SDK junta e renova sozinho) ── */
export async function query(table, columns = "*", refine = (q) => q) {
  return unwrap(await refine(sb().from(table).select(columns)));
}
export async function insert(table, row) { return unwrap(await sb().from(table).insert(row).select()); }
export async function upsert(table, rows, onConflict) {
  return unwrap(await sb().from(table).upsert(rows, { onConflict, ignoreDuplicates: true }).select());
}
export async function update(table, match, patch) { return unwrap(await sb().from(table).update(patch).match(match).select()); }
export async function remove(table, match) { return unwrap(await sb().from(table).delete().match(match)); }
export async function rpc(fn, args = {}) { return unwrap(await sb().rpc(fn, args)); }

/** Edge Functions: o browser nunca fala com a Claude API; só com estas funções (o SDK junta o JWT). */
export async function callFunction(name, body) {
  const { data, error } = await sb().functions.invoke(name, { body });
  if (error) {
    if (error.name === "FunctionsHttpError") {
      let code = "request_failed";
      try { code = (await error.context.json())?.error?.code || code; } catch (_e) { /* corpo vazio */ }
      throw new ApiError(error.context?.status || 500, String(code).slice(0, 60));
    }
    fail(error);
  }
  return data;
}

/** Projeção pública lida SEM sessão: cliente anónimo separado, para mostrar exatamente o que um visitante recebe. */
let anon = null;
export async function fetchPublicJourney() {
  anon ||= window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "lj-anon-preview" } });
  return unwrap(await anon.from("public_journey").select("*"));
}
