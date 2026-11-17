import { h } from "../dom.js";
import { t, getLang, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { L, compName } from "./common.js";
import { renderAdvisor } from "./advisor.js";

export function renderNow() {
  const a = store.latest();
  const f = a.focus, act = f.action, c = store.comp(f.competency);
  const ev = (act.expected_evidence?.[getLang() === "pt-PT" ? "pt" : "en"] || act.expected_evidence?.pt || []);
  return h("section", { class: "block", "aria-labelledby": "now-h" },
    h("p", { class: "eyebrow" }, t("now.eyebrow")),
    h("h2", { id: "now-h", class: "headline" }, c ? compName(c) : f.competency),
    h("p", { class: "lede" }, L(f.why)),
    h("h3", { class: "eyebrow" }, t("now.action")),
    h("p", { class: "lede" }, h("strong", {}, L(act.title))),
    h("dl", { class: "facts" },
      h("div", {}, h("dt", {}, t("now.type")), h("dd", {}, `${t(`type.${act.type}`)} · `, h("span", { class: "meta" }, t(`typeDesc.${act.type}`)))),
      h("div", {}, h("dt", {}, t("now.where")), h("dd", {}, t(`where.${act.where.kind}`))),
      h("div", {}, h("dt", {}, t("now.expected")), h("dd", {}, h("ul", { class: "tight" }, ev.map((x) => h("li", {}, x)))))),
    h("details", { class: "more" }, h("summary", {}, t("now.whyWhere")), h("p", { class: "hint" }, L(act.where.reason))),
    f.why_not_others ? h("details", { class: "more" }, h("summary", {}, t("now.whyNotOthers")), h("p", { class: "hint" }, L(f.why_not_others))) : null,
    h("p", { class: "hint" }, L(act.then)),
    h("p", { class: "meta" }, t("now.asOf", { date: formatDate(a.date) })),
    renderAdvisor());
}
