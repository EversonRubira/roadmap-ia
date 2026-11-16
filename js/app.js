import { $, clear, h } from "./dom.js";
import { t, setLang, getLang, onLangChange, formatDateTime } from "./i18n.js";
import { CONFIG, isConfigured } from "./config.js";
import * as api from "./api.js";
import * as store from "./store.js";
import { S } from "./store.js";
import { announce, errorMessage } from "./ui/common.js";
import { renderNow } from "./ui/now.js";
import { renderSkills, renderSkill } from "./ui/skills.js";
import { renderEvidence } from "./ui/evidence.js";
import { renderJourney } from "./ui/journey.js";
import { renderLogin, openSettings } from "./ui/settings.js";

const ROUTES = ["now", "skills", "evidence", "journey"];
const view = $("#view");
let expired = false, loadError = null, lastKey = "", loading = false;

const route = () => { const [n, arg] = location.hash.replace(/^#\/?/, "").split("/"); return { name: ROUTES.includes(n) ? n : "now", arg }; };

function chrome() {
  $("#app-context").textContent = t("app.context");
  $("#btn-lang").textContent = getLang() === "pt-PT" ? "EN" : "PT";
  $("#btn-lang").setAttribute("aria-label", t("lang.switch"));
  $("#btn-settings").setAttribute("aria-label", t("settings.title"));
  $(".skip").textContent = t("a11y.skip");
  $("#nav").setAttribute("aria-label", t("nav.label"));
  document.querySelectorAll("[data-nav]").forEach((el) => { el.textContent = t(`nav.${el.dataset.nav}`); });
  const r = route().name;
  document.querySelectorAll("#nav a").forEach((a) => { a.toggleAttribute("aria-current", a.dataset.route === r); if (a.dataset.route === r) a.setAttribute("aria-current", "page"); });
}

function banner() {
  const el = $("#banner");
  const offline = S.offline || !navigator.onLine;
  if (api.hasSession() && S.loaded && offline) {
    el.hidden = false; el.dataset.kind = "offline";
    el.textContent = `${t("banner.offline")} · ${t("banner.synced", { date: S.syncedAt ? formatDateTime(S.syncedAt) : "—" })}`;
  } else if (S.busy > 0) { el.hidden = false; el.dataset.kind = "busy"; el.textContent = t("banner.syncing"); }
  else el.hidden = true;
}

function render(force = false) {
  chrome(); banner();
  const authed = api.hasSession();
  $("#nav").hidden = !(authed && S.loaded);
  $("#btn-settings").hidden = !(authed && S.loaded);
  const r = route();
  let key, build;
  if (!isConfigured()) { key = "setup"; build = () => h("section", { class: "block" }, h("h2", { class: "headline" }, t("setup.title")), h("p", { class: "lede" }, t("setup.body"))); }
  else if (!authed) { key = `login:${expired}`; build = () => renderLogin({ expired }); }
  else if (!S.loaded) {
    key = `loading:${!!loadError}`;
    build = () => loadError
      ? h("section", { class: "block" }, h("p", { class: "error", role: "alert" }, errorMessage(loadError)), h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: boot }, t("common.retry"))))
      : h("p", { class: "hint", role: "status" }, t("common.loading"));
  } else { key = `app:${r.name}:${r.arg || ""}`; build = () => (r.name === "now" ? renderNow() : r.name === "skills" ? (r.arg ? renderSkill(r.arg) : renderSkills()) : r.name === "evidence" ? renderEvidence() : renderJourney()); }

  // login/setup não são recriados a cada evento (não perder o que o utilizador escreveu)
  const stable = key.startsWith("login") || key === "setup";
  if (!force && stable && key === lastKey && !render.langChanged) return;
  render.langChanged = false;
  const open = [...view.querySelectorAll("details")].map((d) => d.open);
  clear(view).append(build());
  view.querySelectorAll("details").forEach((d, i) => { if (open[i] && key === lastKey) d.open = true; });
  if (key !== lastKey && key.startsWith("app")) { view.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  lastKey = key;
}

async function boot() {
  if (!api.hasSession() || loading || !isConfigured()) return render();
  loading = true; loadError = null; render();
  try {
    await store.loadAll();
    if (!localStorage.getItem("lj-lang") && S.profile?.preferred_language) setLang(S.profile.preferred_language, { persist: false });
  } catch (e) { loadError = e; }
  loading = false; render(true);
}

/* eventos */
store.subscribe(() => render());
onLangChange(() => { render.langChanged = true; render(true); });
window.addEventListener("hashchange", () => render());
window.addEventListener("online", () => { render(); if (api.hasSession()) store.loadAll().catch(() => {}); });
window.addEventListener("offline", () => render());
// o servidor recusou o token (401): termina a sessão local (o SDK ainda a considerava válida) e pede novo login
window.addEventListener("lj:session-expired", () => { expired = true; store.clearLocalData(); api.signOut().catch(() => {}).finally(() => render(true)); });
api.onSession((s) => { if (s) { expired = false; boot(); } else { if (S.loaded) expired = true; render(true); } });
$("#btn-lang").addEventListener("click", async () => {
  const next = getLang() === "pt-PT" ? "en-GB" : "pt-PT";
  setLang(next);
  if (api.hasSession() && S.loaded && !S.offline) { try { await store.saveProfile({ preferred_language: next }); } catch (_e) { /* a preferência local já vale */ } }
});
$("#btn-settings").addEventListener("click", openSettings);

setLang(getLang(), { persist: false });
(async () => {
  if (isConfigured()) { try { await api.initAuth(); } catch (_e) { /* sem SDK/rede: cai no ecrã de login */ } }
  boot();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
