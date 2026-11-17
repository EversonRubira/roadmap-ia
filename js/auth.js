// Sessão do proprietário via Supabase Auth (API REST, sem SDK). Nada de tokens de administração: só a sessão normal,
// com access token curto e refresh token, guardada neste dispositivo. As escritas e a Edge Function exigem este login.
import { CONFIG } from "./config.js";

const KEY = "lj-session";
let session = read();
const listeners = new Set();
export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

function read() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s && s.access_token && s.refresh_token ? s : null; } catch (_e) { return null; }
}
function save(s) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (_e) { /* ignora */ }
  emit();
}
const headers = (token) => ({ "Content-Type": "application/json", apikey: CONFIG.SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const fromToken = (b) => ({ access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at || Math.floor(Date.now() / 1000) + (b.expires_in || 3600), email: b.user?.email || "" });

export const isSignedIn = () => Boolean(session);
export const userEmail = () => session?.email || "";

export async function signIn(email, password) {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: headers(), body: JSON.stringify({ email, password }) });
  if (!r.ok) { const e = new Error("auth"); e.status = r.status; throw e; }
  save(fromToken(await r.json()));
}

export async function signOut() {
  const token = session?.access_token;
  save(null);
  if (token) { try { await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: headers(token) }); } catch (_e) { /* já saiu localmente */ } }
}

/** Access token válido (renova com o refresh token quando faltam menos de 60 s). Sem sessão válida devolve null. */
export async function getToken() {
  if (!session) return null;
  if (session.expires_at - Math.floor(Date.now() / 1000) > 60) return session.access_token;
  try {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: headers(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401 || r.status === 403) save(null); return null; }
    const next = fromToken(await r.json()); next.email = next.email || session.email; save(next);
    return session.access_token;
  } catch (_e) { return null; }   // offline: mantém a sessão, não há token utilizável agora
}
