import { h } from "../dom.js";
import { t, getLang, formatDate, pick } from "../i18n.js";
import * as store from "../store.js";
import { S } from "../store.js";
import { groupsOf } from "../evidence-groups.js";
import { btn, compName, compDesc, compCriteria, field, openSheet, run } from "./common.js";
import { openEvidenceForm } from "./evidence.js";

const stateLabel = (c) => t(`status.${c.status}`);

export function renderSkills() {
  const items = S.competencies.map((c) => {
    const pending = store.pendingAssessment(c.id);
    return h("li", {}, h("a", { class: "skill-row", href: `#/skills/${c.slug}` },
      h("span", { class: "skill-name" }, compName(c)),
      h("span", { class: "skill-meta" },
        h("span", {}, stateLabel(c)),
        c.assessment_source !== "default" && c.assessment_confidence ? h("span", {}, ` · ${t("skill.confidenceShort", { v: t(`confidence.${c.assessment_confidence}`) })}`) : null,
        c.is_current_focus ? h("span", { class: "tag" }, t("status.focus")) : null,
        pending ? h("span", { class: "tag soft" }, t("skill.pending")) : null)));
  });
  const u = store.usageToday();
  return h("div", { class: "view-skills" },
    h("p", { class: "lede" }, t("skills.intro")),
    h("ol", { class: "skill-list" }, items),
    h("div", { class: "actions" }, btn(t("skills.analyse"), analyse)),
    h("p", { class: "hint" }, t("skills.analyseHint", { n: u.analysis, max: 2 })));
}

async function analyse() {
  await run(() => store.runFullAnalysis(), { busy: t("skills.analysing"), done: t("skills.analysed") });
}

export function renderSkill(slug) {
  const c = store.compBySlug(slug);
  if (!c) return h("p", {}, t("skill.notFound"), " ", h("a", { href: "#/skills" }, t("skill.back")));
  const evs = S.evidence.filter((e) => e.competency_id === c.id);
  const g = groupsOf(evs);
  const pending = store.pendingAssessment(c.id);
  const aiGaps = (c.gaps && c.gaps[getLang()]) || null;
  const missing = aiGaps && aiGaps.length ? aiGaps : Object.entries(g).filter(([, v]) => !v).map(([k]) => t(`group.${k}`));
  return h("article", { class: "view-skill" },
    h("p", {}, h("a", { class: "back", href: "#/skills" }, `← ${t("skill.back")}`)),
    h("h2", { class: "headline" }, compName(c)),
    h("p", { class: "lede" }, compDesc(c)),
    h("dl", { class: "facts" },
      h("div", {}, h("dt", {}, t("skill.state")), h("dd", {}, stateLabel(c), c.is_current_focus ? ` · ${t("status.focus")}` : "")),
      h("div", {}, h("dt", {}, t("skill.confidence")),
        h("dd", {}, c.assessment_source === "default" ? t("skill.notAssessed") : `${t(`confidence.${c.assessment_confidence}`)} · ${t(`source.${c.assessment_source}`)}`))),
    h("p", { class: "hint" }, t("skill.aiNote")),
    pending ? suggestion(c, pending) : null,
    h("section", {}, h("h3", {}, t("skill.found")),
      evs.length ? h("ul", {}, evs.map((e) => { const p = pick(e, "title"); return h("li", {}, h("span", { lang: p.fallback ? (getLang() === "pt-PT" ? "en-GB" : "pt-PT") : getLang() }, p.text), ` · ${t(`evtype.${e.evidence_type}`)} · ${formatDate(e.occurred_at)}`); }))
        : h("p", { class: "hint" }, t("skill.noEvidence"))),
    h("section", {}, h("h3", {}, t("skill.missing")),
      missing.length ? h("ul", {}, missing.map((m) => h("li", {}, m))) : h("p", { class: "hint" }, t("skill.nothingMissing"))),
    h("section", {}, h("h3", {}, t("skill.demonstrates")), h("ul", {}, compCriteria(c).map((x) => h("li", {}, x)))),
    h("div", { class: "actions" },
      btn(t("skill.addEvidence"), () => openEvidenceForm({ competencyId: c.id }), "primary"),
      btn(t("skill.reanalyse"), analyse),
      btn(t("skill.correct"), () => correctSheet(c))));
}

function suggestion(c, a) {
  const L = a.language;
  return h("section", { class: "block soft", "aria-labelledby": "sg-h" },
    h("h3", { id: "sg-h" }, t("skill.suggestion")),
    h("p", {}, t("skill.suggestionBody", { status: t(`status.${a.suggested_status}`), conf: t(`confidence.${a.suggested_confidence}`) })),
    a.found.length ? h("ul", { lang: L }, a.found.map((x) => h("li", {}, x))) : null,
    a.missing.length ? h("ul", { lang: L }, a.missing.map((x) => h("li", {}, x))) : null,
    h("div", { class: "actions" },
      btn(t("skill.accept"), () => run(() => store.acceptAssessment(a.id), { done: t("common.saved") }), "primary"),
      btn(t("skill.correct"), () => correctSheet(c)),
      btn(t("skill.dismiss"), () => run(() => store.dismissAssessment(a.id), { done: t("common.saved") }))));
}

function select(options, value, labelKey) {
  return h("select", {}, options.map((o) => h("option", { value: o, selected: o === value }, t(`${labelKey}.${o}`))));
}

function correctSheet(c) {
  openSheet(t("skill.correct"), (close) => {
    const status = select(["exploring", "developing", "applied"], c.status, "status");
    const conf = select(["low", "medium", "high"], c.assessment_confidence || "low", "confidence");
    const focus = h("input", { type: "checkbox", checked: c.is_current_focus });
    const pub = h("input", { type: "checkbox", checked: c.is_public });
    const weight = h("select", {}, [1, 2, 3, 4, 5].map((n) => h("option", { value: n, selected: n === c.priority_weight }, String(n))));
    return h("form", { onsubmit: async (e) => {
      e.preventDefault(); close();
      const r = await run(async () => {
        if (status.value !== c.status || conf.value !== (c.assessment_confidence || "low") || c.assessment_source !== "user") await store.correctAssessment(c.slug, status.value, conf.value);
        if (focus.checked !== c.is_current_focus) await store.setFocus(focus.checked ? c.slug : null);
        const patch = {};
        if (pub.checked !== c.is_public) patch.is_public = pub.checked;
        if (Number(weight.value) !== c.priority_weight) patch.priority_weight = Number(weight.value);
        if (Object.keys(patch).length) await store.updateCompetency(c.slug, patch);
      }, { done: t("common.saved") });
      return r;
    } },
    h("p", { class: "hint" }, t("skill.correctHint")),
    field(t("skill.state"), status), field(t("skill.confidence"), conf),
    h("label", { class: "choice" }, focus, h("span", {}, t("skill.setFocus"))),
    h("label", { class: "choice" }, pub, h("span", {}, t("skill.setPublic"))),
    field(t("skill.weight"), weight, t("skill.weightHint")),
    h("div", { class: "actions" }, h("button", { type: "submit", class: "btn primary", disabled: S.busy > 0 || S.offline }, t("common.save"))));
  });
}
