import { h } from "../dom.js";
import { t, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { L, compName, levelLabel } from "./common.js";

function changes(cur, old) {
  const out = [];
  for (const e of cur.competencies) {
    const o = store.entry(old, e.id);
    if (o && o.level !== e.level) { const c = store.comp(e.id); out.push(h("li", {}, h("strong", {}, c ? compName(c) : e.id), `: ${levelLabel(o.level)} → ${levelLabel(e.level)}`)); }
  }
  return out;
}

export function renderJourney() {
  const list = store.S.analyses;
  const items = list.map((a, i) => {
    const old = list[i + 1];
    const f = a.focus, c = store.comp(f.competency), e = store.entry(a, f.competency);
    const diff = old ? changes(a, old) : null;
    return h("article", { class: "step" },
      h("h3", { class: "eyebrow" }, formatDate(a.date)),
      h("p", {}, h("strong", {}, c ? compName(c) : f.competency), e ? ` · ${levelLabel(e.level)}` : ""),
      h("p", { class: "hint" }, `${t("journey.nextAction")}: ${L(f.action.title)}`),
      old ? h("div", {},
        h("p", { class: "hint" }, `${t("journey.did")}: ${L(old.focus.action.title)}`),
        diff.length ? h("div", {}, h("p", { class: "hint" }, `${t("journey.changed")}:`), h("ul", { class: "tight" }, diff)) : h("p", { class: "hint" }, t("journey.noChange")))
        : h("p", { class: "hint" }, t("journey.start")));
  });
  return h("div", { class: "view-journey" },
    h("p", { class: "lede" }, t("journey.intro")),
    items,
    list.length === 1 ? h("p", { class: "hint" }, t("journey.waiting")) : null);
}
