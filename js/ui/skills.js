import { h } from "../dom.js";
import { t, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { L, compName, compDesc, levelLabel, confLabel } from "./common.js";

const project = (loc) => loc.split(" · ")[0];

function detail(c, e, focus) {
  const lv = e ? e.level : 0;
  return h("li", {}, h("details", { class: "skill" },
    h("summary", { class: "skill-row" }, h("span", { class: "skill-name" }, compName(c)), focus ? h("span", { class: "tag" }, t("skills.focus")) : null),
    h("div", { class: "skill-body" },
      h("p", { class: "meta" }, `${levelLabel(lv)}${e ? ` · ${confLabel(e.confidence)}` : ""}`),
      h("p", {}, compDesc(c)),
      e && e.evidence.length
        ? h("div", {}, h("h4", { class: "mini" }, t("skills.why")),
          h("ul", { class: "ev" }, e.evidence.map((x) => h("li", {}, h("strong", {}, project(x.location)), h("span", { class: "ev-note" }, L(x.note))))))
        : h("p", { class: "hint" }, t("skills.noEvidence")),
      e ? h("p", { class: "hint" }, h("strong", {}, `${t("skills.gap")}: `), L(e.gap)) : null,
      e && e.evidence.length ? h("details", { class: "src" }, h("summary", {}, t("skills.source")), h("ul", { class: "plain" }, e.evidence.map((x) => h("li", {}, h("span", { class: "loc" }, x.location))))) : null)));
}

function studies() {
  const courses = store.S.courses;
  return h("details", { class: "more studies" }, h("summary", {}, t("evidence.studies")),
    h("div", { class: "disc-body" },
      courses.length ? h("ul", { class: "plain" }, courses.map((c) => h("li", {}, h("span", { class: "ev-note" }, c.title), h("span", { class: "loc" }, `${c.provider}${c.completed ? ` · ${formatDate(c.completed.length === 7 ? `${c.completed}-01` : c.completed, { year: "numeric", month: "short" })}` : ""}`))))
        : h("p", { class: "hint" }, t("evidence.noStudies")),
      h("p", { class: "hint" }, t("evidence.studiesHint")),
      h("p", {}, h("a", { href: "legacy/" }, t("evidence.legacy")))));
}

export function renderSkills() {
  const a = store.latest(), focusId = a.focus.competency;
  const rows = store.S.competencies.map((c) => ({ c, e: store.entry(a, c.id) }));
  const groups = [3, 2, 1, 0].map((lv) => {
    const list = rows.filter((r) => (r.e ? r.e.level : 0) === lv).sort((x, y) => (y.c.id === focusId) - (x.c.id === focusId));
    if (!list.length) return null;
    return h("section", { class: "group", "aria-label": lv === 0 ? t("skills.explore") : levelLabel(lv) },
      h("h3", { class: "eyebrow" }, lv === 0 ? t("skills.explore") : levelLabel(lv)),
      h("ul", { class: "skill-list" }, list.map((r) => detail(r.c, r.e, r.c.id === focusId))));
  });
  return h("div", { class: "view-skills" }, groups, studies());
}
