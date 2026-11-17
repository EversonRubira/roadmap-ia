import { h, $ } from "../dom.js";
import { t, getLang, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { advisorEnabled } from "../config.js";
import { isSignedIn, userEmail, signIn, signOut, onAuthChange } from "../auth.js";
import { fetchLatestAnalysis, requestAnalysis, AdvisorRequestError } from "../advisor.js";
import { announce, compName } from "./common.js";

// Estado local do bloco "Learning Advisor". A análise nunca corre ao abrir a app: só quando o utilizador toca no botão.
const A = { status: "idle", latest: null, error: "", email: "", fetched: false };
const TYPE = { LEARN: "APRENDER", APPLY: "APLICAR", CONSOLIDATE: "CONSOLIDAR", DEMONSTRATE: "DEMONSTRAR" };

onAuthChange(() => { if (!isSignedIn()) { A.latest = null; A.fetched = false; A.status = "idle"; A.error = ""; } store.notify(); });

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
  $("#advisor-h")?.focus({ preventScroll: false });
}

async function login(e) {
  e.preventDefault();
  const f = e.currentTarget; A.email = f.email.value.trim();
  A.status = "signing"; A.error = ""; store.notify();
  try { await signIn(A.email, f.password.value); A.status = "idle"; }
  catch (err) { A.status = "idle"; A.error = err.status === 400 || err.status === 401 ? "advisor.err.login" : "advisor.err.network"; store.notify(); }
}

function recommendation(a) {
  const r = a.result, c = store.comp(r.current_focus), type = TYPE[r.action_type];
  return h("div", { class: "advice" },
    h("h3", { id: "advisor-h", class: "headline small", tabindex: "-1" }, c ? compName(c) : r.current_focus),
    h("p", { class: "lede" }, h("strong", {}, r.next_action)),
    h("dl", { class: "facts" },
      h("div", {}, h("dt", {}, t("now.type")), h("dd", {}, `${t(`type.${type}`)} · `, h("span", { class: "meta" }, t(`typeDesc.${type}`)))),
      h("div", {}, h("dt", {}, t("now.expected")), h("dd", {}, h("ul", { class: "tight" }, r.expected_evidence.map((x) => h("li", {}, x))))),
      r.skills_to_learn?.length ? h("div", {}, h("dt", {}, t("advisor.skills")), h("dd", {}, h("ul", { class: "tight" }, r.skills_to_learn.map((x) => h("li", {}, x))))) : null),
    h("details", { class: "more" }, h("summary", {}, t("advisor.why")), h("p", { class: "hint" }, r.reason)),
    h("p", { class: "meta" }, t("advisor.when", { date: formatDate(a.created_at) }), a.lang !== getLang() ? ` ${t("advisor.otherLang", { lang: t(`lang.${a.lang}`) })}` : ""));
}

function loginForm() {
  const busy = A.status === "signing";
  return h("form", { class: "login", onsubmit: login, "aria-label": t("advisor.signin") },
    h("p", { class: "hint" }, t("advisor.signinHint")),
    h("div", { class: "field" }, h("label", { for: "lj-email" }, t("advisor.email")), h("input", { id: "lj-email", name: "email", type: "email", autocomplete: "username", required: true, value: A.email })),
    h("div", { class: "field" }, h("label", { for: "lj-pass" }, t("advisor.password")), h("input", { id: "lj-pass", name: "password", type: "password", autocomplete: "current-password", required: true })),
    h("div", { class: "actions" }, h("button", { type: "submit", class: "btn", disabled: busy }, busy ? t("common.loading") : t("advisor.signinBtn"))));
}

export function renderAdvisor() {
  if (!advisorEnabled()) return null;
  const signed = isSignedIn();
  if (signed && !A.fetched) loadLatest();
  const running = A.status === "running";
  return h("section", { class: "block soft advisor", "aria-labelledby": "advisor-eyebrow" },
    h("p", { id: "advisor-eyebrow", class: "eyebrow" }, t("advisor.eyebrow")),
    signed && A.latest ? recommendation(A.latest) : null,
    signed && !A.latest && A.fetched && !A.error ? h("p", { class: "hint" }, t("advisor.empty")) : null,
    h("p", { class: "hint" }, t("advisor.basis")),
    A.error ? h("p", { class: "error", role: "alert" }, t(A.error, { s: A.retry || 60 })) : null,
    signed
      ? h("div", { class: "actions" },
        h("button", { type: "button", class: "btn primary", disabled: running, "aria-busy": running ? "true" : null, onclick: run }, running ? t("advisor.running") : t("advisor.run")),
        h("button", { type: "button", class: "link", onclick: () => signOut() }, t("advisor.signout", { email: userEmail() })))
      : loginForm());
}
