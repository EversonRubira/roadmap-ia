// Cliente do Learning Advisor. Não fala com a Groq: pede à Edge Function protegida e lê as análises guardadas.
// A interface do advisor (analyse(context)) está no servidor, onde o fornecedor se pode trocar sem mexer aqui.
import { CONFIG } from "./config.js";
import { getToken } from "./auth.js";

export class AdvisorRequestError extends Error {
  constructor(code, status, retryAfter) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}

async function authed(path, init = {}) {
  const token = await getToken();
  if (!token) throw new AdvisorRequestError("unauthenticated", 401);
  let r;
  try { r = await fetch(`${CONFIG.SUPABASE_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${token}`, ...(init.headers || {}) } }); }
  catch (_e) { throw new AdvisorRequestError("network", 0); }
  return r;
}

/** Última análise do advisor guardada, ou null. */
export async function fetchLatestAnalysis() {
  const r = await authed("/rest/v1/analyses?select=id,lang,basis,model,result,created_at&order=created_at.desc&limit=1");
  if (!r.ok) throw new AdvisorRequestError("load_failed", r.status);
  const rows = await r.json();
  return rows[0] || null;
}

/** Pede uma nova análise (só acontece quando o utilizador toca no botão). Devolve a análise guardada. */
export async function requestAnalysis(lang) {
  const r = await authed("/functions/v1/analyse", { method: "POST", body: JSON.stringify({ lang }) });
  let body = {};
  try { body = await r.json(); } catch (_e) { /* sem corpo */ }
  if (!r.ok) throw new AdvisorRequestError(body.error || "failed", r.status, Number(r.headers.get("Retry-After")) || body.retry_after);
  return body.analysis;
}
