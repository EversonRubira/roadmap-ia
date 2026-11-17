import { h } from "../dom.js";
import { t } from "../i18n.js";
import * as store from "../store.js";
import { L, compName, compDesc, levelLabel, confLabel } from "./common.js";

export function renderSkills() {
  const a = store.latest();
  const rows = store.S.competencies.map((c) => {
    const e = store.entry(a, c.id);
    const focus = a.focus.competency === c.id;
    return h("li", {}, h("details", { class: "skill" },
      h("summary", { class: "skill-row" },
        h("span", { class: "skill-name" }, compName(c)),
        h("span", { class: "skill-meta" },
          h("span", {}, e ? levelLabel(e.level) : levelLabel(0)),
          e ? h("span", {}, ` · ${confLabel(e.confidence)}`) : null,
          focus ? h("span", { class: "tag" }, t("skills.focus")) : null)),
      h("div", { class: "skill-body" },
        h("p", {}, compDesc(c)),
        e ? h("p", { class: "hint" }, h("strong", {}, `${t("skills.gap")}: `), L(e.gap)) : null,
        e && e.evidence.length ? h("p", { class: "meta" }, (e.evidence.length === 1 ? t("skills.evidenceOne") : t("skills.evidenceCount", { n: e.evidence.length }))) : null)));
  });
  return h("div", { class: "view-skills" },
    h("p", { class: "lede" }, t("skills.intro")),
    h("ul", { class: "skill-list" }, rows));
}
