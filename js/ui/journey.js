import { h } from "../dom.js";
import { t, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { L, compName, levelLabel } from "./common.js";

const LEVELS = [0, 1, 2, 3];
const counts = (a) => LEVELS.map((lv) => a.competencies.filter((e) => e.level === lv).length);

// Barra empilhada: Não observado → Consolidado. Os números estão dentro dos segmentos e na legenda, por isso a cor nunca é a única pista.
function bar(a) {
  const n = counts(a);
  const label = `${formatDate(a.date)}: ${LEVELS.map((lv) => `${n[lv]} ${levelLabel(lv)}`).join(", ")}`;
  const stack = h("div", { class: "stack", role: "img", "aria-label": label },
    LEVELS.filter((lv) => n[lv]).map((lv) => { const s = h("span", { class: `seg lv${lv}`, "aria-hidden": "true" }, String(n[lv])); s.style.flexGrow = String(n[lv]); return s; }));
  const legend = h("ul", { class: "legend", "aria-hidden": "true" }, LEVELS.map((lv) => h("li", { class: n[lv] ? "" : "zero" }, h("span", { class: `sw lv${lv}` }), `${levelLabel(lv)} `, h("strong", {}, String(n[lv])))));
  return h("article", { class: "step" }, h("h3", { class: "eyebrow" }, formatDate(a.date)), stack, legend);
}

const evKey = (x) => `${x.location}|${x.note.pt}`;
function changed(cur, old) {
  const out = [];
  for (const e of cur.competencies) {
    const o = store.entry(old, e.id);
    if (!o || o.level === e.level) continue;
    const c = store.comp(e.id), seen = new Set(o.evidence.map(evKey)), fresh = e.evidence.filter((x) => !seen.has(evKey(x)));
    out.push(h("li", { class: "chg" }, h("strong", {}, c ? compName(c) : e.id), h("span", { class: "arrow" }, `${levelLabel(o.level)} → ${levelLabel(e.level)}`),
      fresh.length ? h("span", { class: "hint" }, `${t("journey.newEvidence")}`) : null,
      fresh.length ? h("ul", { class: "tight" }, fresh.map((x) => h("li", {}, L(x.note)))) : null));
  }
  return out;
}

function whatChanged(list) {
  if (list.length < 2) {
    return h("section", { class: "changed start" }, h("h3", { class: "eyebrow" }, t("journey.startK")),
      h("p", { class: "next-step" }, formatDate(list[0].date)), h("p", {}, t("journey.startBody")), h("p", { class: "hint" }, t("journey.waiting")));
  }
  const diff = changed(list[0], list[1]);
  return h("section", { class: "changed" }, h("h3", { class: "eyebrow" }, t("journey.changedK")),
    diff.length ? h("ul", { class: "plain" }, diff) : h("p", { class: "hint" }, t("journey.noChange")),
    h("p", { class: "hint" }, `${t("journey.did")}: ${L(list[1].focus.action.title)}`));
}

export function renderJourney() {
  const list = store.S.analyses;
  return h("div", { class: "view-journey" }, list.map(bar), whatChanged(list));
}
