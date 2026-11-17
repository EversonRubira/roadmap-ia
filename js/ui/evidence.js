import { h } from "../dom.js";
import { t, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { L, compName } from "./common.js";

export function renderEvidence() {
  const a = store.latest();
  const withEv = a.competencies.filter((e) => e.evidence.length);
  const without = a.competencies.filter((e) => !e.evidence.length);
  const sections = withEv.map((e) => {
    const c = store.comp(e.id);
    return h("details", { class: "more" },
      h("summary", {}, `${c ? compName(c) : e.id} · ${(e.evidence.length === 1 ? t("evidence.one") : t("evidence.count", { n: e.evidence.length }))}`),
      h("ul", { class: "plain" }, e.evidence.map((x) => h("li", {}, h("span", { class: "loc" }, x.location), h("span", { class: "ev-note" }, L(x.note))))));
  });
  const names = without.map((e) => { const c = store.comp(e.id); return c ? compName(c) : e.id; });
  const courses = store.S.courses;
  return h("div", { class: "view-evidence" },
    h("p", { class: "lede" }, t("evidence.intro")),
    sections,
    names.length ? h("section", {}, h("h3", { class: "eyebrow" }, t("evidence.none")), h("p", {}, names.join(" · ")), h("p", { class: "hint" }, t("evidence.noneHint"))) : null,
    h("section", {}, h("h3", { class: "eyebrow" }, t("evidence.studies")),
      courses.length ? h("ul", { class: "plain" }, courses.map((c) => h("li", {}, h("span", { class: "ev-note" }, c.title), h("span", { class: "loc" }, `${c.provider}${c.completed ? ` · ${formatDate(c.completed.length === 7 ? `${c.completed}-01` : c.completed, { year: "numeric", month: "short" })}` : ""}`))))
        : h("p", { class: "hint" }, t("evidence.noStudies")),
      h("p", { class: "hint" }, t("evidence.studiesHint")),
      h("p", {}, h("a", { href: "legacy/" }, t("evidence.legacy")))),
    h("p", { class: "meta" }, t("now.asOf", { date: formatDate(a.date) })));
}
