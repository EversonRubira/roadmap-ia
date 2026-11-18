import { h, $ } from "../dom.js";
import { t, getLang } from "../i18n.js";
import * as store from "../store.js";
import { advisorEnabled } from "../config.js";
import { isSignedIn, userEmail, signIn, signOut, onAuthChange } from "../auth.js";
import { fetchLatestAnalysis, requestAnalysis, AdvisorRequestError } from "../advisor.js";
import { announce } from "./common.js";

// Estado local do bloco "Learning Advisor". A análise nunca corre ao abrir a app: só quando o utilizador toca no botão.
const A = { status: "idle", latest: null, error: "", email: "", fetched: false, login: false };
export const TYPE = { LEARN: "APRENDER", APPLY: "APLICAR", CONSOLIDATE: "CONSOLIDAR", DEMONSTRATE: "DEMONSTRAR" };

onAuthChange(() => { if (!isSignedIn()) { A.latest = null; A.fetched = false; A.status = "idle"; A.error = ""; A.login = false; } store.notify(); });

function errorKey(e) {
  if (!(e instanceof AdvisorRequestError)) return "advisor.err.generic";
  if (e.code === "too_soon") return "advisor.err.tooSoon";
  if (e.code === "daily_limit") return "advisor.err.daily";
  if (e.code === "unauthenticated" || e.status === 401) return "advisor.err.session";
  if (e.code === "not_owner" || e.status === 403) return "advisor.err.forbidden";
  if (e.code === "network") return "advisor.err.network";
  if (e.status === 502) return "advisor.err.provider";
  return "advisor.err.generic";
}

async function loadLatest() {
  A.fetched = true;
  try { A.latest = await fetchLatestAnalysis(); A.error = ""; } catch (e) { A.error = errorKey(e); }
  store.notify();
}

async function run(e) {
  e?.preventDefault?.();
  if (A.status === "running") return;
  A.status = "running"; A.error = ""; store.notify(); announce(t("advisor.running"));
  let retry;
  try { A.latest = await requestAnalysis(getLang()); announce(t("advisor.done")); }
  catch (err) { A.error = errorKey(err); retry = err.retryAfter; A.retry = retry; announce(t(A.error, { s: retry || 60 })); }
  A.status = "idle"; store.notify();
  $("#now-h")?.focus({ preventScroll: false });
}

async function login(e) {
  e.preventDefault();
  const f = e.currentTarget; A.email = f.email.value.trim();
  A.status = "signing"; A.error = ""; store.notify();
  try { await signIn(A.email, f.password.value); A.status = "idle"; A.login = false; }
  catch (err) { A.status = "idle"; A.error = err.status === 400 || err.status === 401 ? "advisor.err.login" : "advisor.err.network"; store.notify(); }
}

function loginForm() {
  const busy = A.status === "signing";
  return h("form", { class: "login", onsubmit: login, "aria-label": t("advisor.signin") },
    h("p", { class: "hint" }, t("advisor.signinHint")),
    h("div", { class: "field" }, h("label", { for: "lj-email" }, t("advisor.email")), h("input", { id: "lj-email", name: "email", type: "email", autocomplete: "username", required: true, value: A.email })),
    h("div", { class: "field" }, h("label", { for: "lj-pass" }, t("advisor.password")), h("input", { id: "lj-pass", name: "password", type: "password", autocomplete: "current-password", required: true })),
    h("div", { class: "actions" }, h("button", { type: "submit", class: "btn", disabled: busy }, busy ? t("common.loading") : t("advisor.signinBtn"))));
}

// Recomendação do advisor (a mais recente guardada), ou null. Só existe depois de o proprietário entrar e pedir uma análise.
export function advisorRec() {
  if (!advisorEnabled() || !isSignedIn()) return null;
  if (!A.fetched) loadLatest();
  return A.latest;
}

// Botão "Analisar o meu caminho" (nunca corre sozinho) e, se ainda não houver sessão, o formulário de entrada por baixo.
export function renderAdvisorActions() {
  if (!advisorEnabled()) return null;
  const signed = isSignedIn(), running = A.status === "running";
  const onclick = signed ? run : () => { A.login = true; store.notify(); $("#lj-email")?.focus(); };
  return h("div", { class: "advisor" },
    h("div", { class: "actions" },
      h("button", { type: "button", class: "btn primary big", disabled: running, "aria-busy": running ? "true" : null, onclick }, running ? t("advisor.running") : t("advisor.run"))),
    A.error ? h("p", { class: "error", role: "alert" }, t(A.error, { s: A.retry || 60 })) : null,
    !signed && A.login ? loginForm() : null);
}

export function renderSignOut() {
  if (!advisorEnabled() || !isSignedIn()) return null;
  return h("button", { type: "button", class: "link small", onclick: () => signOut() }, t("advisor.signout", { email: userEmail() }));
}
