import { $, clear, h } from "./dom.js";
import { t, setLang, getLang, onLangChange } from "./i18n.js";
import * as store from "./store.js";
import { S } from "./store.js";
import { announce } from "./ui/common.js";
import { renderNow } from "./ui/now.js";
import { renderSkills } from "./ui/skills.js";
import { renderJourney } from "./ui/journey.js";
import { THEMES, getTheme, setTheme, applyTheme } from "./theme.js";

const ROUTES = { now: renderNow, skills: renderSkills, journey: renderJourney };
const ALIAS = { evidence: "skills" };   // links antigos para #/evidence abrem Competências, onde as evidências passaram a viver
const view = $("#view");
let lastKey = "";

const route = () => { const n = location.hash.replace(/^#\/?/, "").split("/")[0]; const r = ALIAS[n] || n; return r in ROUTES ? r : "now"; };

function chrome() {
  $("#app-context").textContent = t("app.context");
  $("#lnk-home").textContent = t("nav.home");
  $("#lnk-home").setAttribute("aria-label", t("nav.home.label"));
  $("#btn-lang").textContent = getLang() === "pt-PT" ? "EN" : "PT";
  $("#btn-lang").setAttribute("aria-label", t("lang.switch"));
  $(".skip").textContent = t("a11y.skip");
  const sel = $("#sel-theme");
  sel.setAttribute("aria-label", t("theme.label"));
  if (sel.options.length !== THEMES.length) THEMES.forEach((m) => sel.add(new Option("", m)));
  [...sel.options].forEach((o) => { o.textContent = t(`theme.${o.value}`); });
  sel.value = getTheme();
  $("#nav").setAttribute("aria-label", t("nav.label"));
  document.querySelectorAll("[data-nav]").forEach((el) => { el.textContent = t(`nav.${el.dataset.nav}`); });
  const r = route();
  document.querySelectorAll("#nav a").forEach((a) => { if (a.dataset.route === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}

function banner() {
  const el = $("#banner");
  el.hidden = navigator.onLine;
  if (!el.hidden) { el.dataset.kind = "offline"; el.textContent = t("banner.offline"); }
}

function render(force = false, moved = false) {
  chrome(); banner();
  $("#nav").hidden = !S.loaded;
  let key, build;
  if (S.loaded) { key = `app:${route()}`; build = () => ROUTES[route()](); }
  else if (S.error) { key = "error"; build = () => h("section", { class: "block" }, h("p", { class: "error", role: "alert" }, t("err.load")), h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: () => store.loadAll() }, t("common.retry")))); }
  else { key = "loading"; build = () => h("p", { class: "hint", role: "status" }, t("common.loading")); }
  if (!force && key === lastKey) return;
  const open = [...view.querySelectorAll("details")].map((d) => d.open);
  clear(view).append(build());
  if (key === lastKey) view.querySelectorAll("details").forEach((d, i) => { if (open[i]) d.open = true; });
  if (moved && key !== lastKey && key.startsWith("app")) { view.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  lastKey = key;
}

store.subscribe(() => render(true));
onLangChange(() => render(true));
window.addEventListener("hashchange", () => render(false, true));
window.addEventListener("online", () => { banner(); store.loadAll(); });
window.addEventListener("offline", () => { banner(); announce(t("banner.offline")); });
$("#sel-theme").addEventListener("change", (e) => setTheme(e.target.value));
$("#btn-lang").addEventListener("click", () => setLang(getLang() === "pt-PT" ? "en-GB" : "pt-PT"));

applyTheme();
setLang(getLang(), { persist: false });
render(true);
store.loadAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
