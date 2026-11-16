// Cliente mínimo de Supabase (Auth OTP por email + PostgREST + Edge Functions) sem dependências.
// Motivo: evita uma biblioteca de ~50 kB e o risco de cache de um CDN; só precisamos de 10 chamadas.
import { CONFIG } from "./config.js";

const SESSION_KEY = "lj-session";
let session = load();
const sessionListeners = new Set();

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export class OfflineError extends Error { constructor() { super("offline"); } }

function load() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_e) { return null; }
}
function save(s) {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (_e) { /* ignora */ }
  sessionListeners.forEach((fn) => fn(s));
}
export const onSession = (fn) => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); };
export const hasSession = () => !!session?.refresh_token;
export const sessionEmail = () => session?.user?.email || "";

const base = () => CONFIG.SUPABASE_URL;
const baseHeaders = () => ({ apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" });

async function raw(url, init) {
  let res;
  try { res = await fetch(url, init); } catch (_e) { throw new OfflineError(); }
  if (res.ok) return res.status === 204 ? null : res.json().catch(() => null);
  let code = "request_failed";
  try { const b = await res.json(); const msg = typeof b?.message === "string" && /^[a-z_]{3,40}$/.test(b.message) ? b.message : null;   // códigos das nossas funções SQL
    code = b?.error?.code || msg || b?.error_code || b?.code || b?.msg || code; } catch (_e) { /* corpo vazio */ }
  throw new ApiError(res.status, String(code).slice(0, 60));    // nunca propagar mensagens longas/stack
}

/* ── Auth ── */
export const requestCode = (email) =>
  raw(`${base()}/auth/v1/otp`, { method: "POST", headers: baseHeaders(), body: JSON.stringify({ email, create_user: false }) });

export async function verifyCode(email, token) {
  const r = await raw(`${base()}/auth/v1/verify`, { method: "POST", headers: baseHeaders(), body: JSON.stringify({ type: "email", email, token }) });
  save(withExpiry(r));
}
const withExpiry = (r) => ({ access_token: r.access_token, refresh_token: r.refresh_token, user: { id: r.user?.id, email: r.user?.email },
  expires_at: r.expires_at ? r.expires_at * 1000 : Date.now() + (r.expires_in || 3600) * 1000 });

let refreshing = null;
async function refresh() {
  if (!session?.refresh_token) throw new ApiError(401, "no_session");
  refreshing ||= raw(`${base()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: baseHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }) })
    .then((r) => save(withExpiry(r)))
    .catch((e) => { if (e instanceof ApiError) save(null); throw e; })   // offline não apaga a sessão
    .finally(() => { refreshing = null; });
  return refreshing;
}
async function token() {
  if (!session) throw new ApiError(401, "no_session");
  if (session.expires_at - Date.now() < 60_000) await refresh();
  return session.access_token;
}
export async function signOut() {
  try { if (session?.access_token) await raw(`${base()}/auth/v1/logout`, { method: "POST", headers: { ...baseHeaders(), Authorization: `Bearer ${session.access_token}` } }); }
  catch (_e) { /* sair localmente mesmo sem rede */ }
  save(null);
}

/* ── Pedidos autenticados (com uma tentativa de refresh em 401) ── */
async function authed(url, init, retry = true) {
  const headers = { ...baseHeaders(), ...(init.headers || {}), Authorization: `Bearer ${await token()}` };
  try { return await raw(url, { ...init, headers }); }
  catch (e) {
    if (e instanceof ApiError && e.status === 401 && retry) { await refresh(); return authed(url, init, false); }
    throw e;
  }
}
export const select = (table, query = "") => authed(`${base()}/rest/v1/${table}?${query}`, { method: "GET" });
export const insert = (table, row) => authed(`${base()}/rest/v1/${table}`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
export const upsert = (table, rows, onConflict) => authed(`${base()}/rest/v1/${table}?on_conflict=${onConflict}`, {
  method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(rows) });
export const update = (table, filter, patch) => authed(`${base()}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
export const remove = (table, filter) => authed(`${base()}/rest/v1/${table}?${filter}`, { method: "DELETE" });
export const rpc = (fn, args = {}) => authed(`${base()}/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
/** Edge Functions: o browser nunca fala com a Claude API; só com estas funções, com o JWT do utilizador. */
export const callFunction = (name, body) => authed(`${base()}/functions/v1/${name}`, { method: "POST", body: JSON.stringify(body) });

/** Projeção pública, lida sem sessão (o que um visitante vê). */
export const fetchPublicJourney = () =>
  raw(`${base()}/rest/v1/public_journey?select=*`, { method: "GET", headers: baseHeaders() });
