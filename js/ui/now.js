import { h } from "../dom.js";
import { t, getLang, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { L, compName } from "./common.js";
import { advisorRec, renderAdvisorActions, renderSignOut, TYPE } from "./advisor.js";

// Uma só recomendação à vista: a do advisor, se o proprietário já pediu uma análise; senão a análise real dos repositórios (ponto de partida).
function current() {
  const adv = advisorRec();
  if (adv) {
    const r = adv.result;
    return { id: r.current_focus, title: r.next_action, type: TYPE[r.action_type], expected: r.expected_evidence || [], learn: r.skills_to_learn || [],
      why: [{ text: r.reason }], date: adv.created_at, otherLang: adv.lang !== getLang() ? adv.lang : null };
  }
  const a = store.latest(), f = a.focus, act = f.action, pt = getLang() === "pt-PT";
  const ev = act.expected_evidence?.[pt ? "pt" : "en"] || act.expected_evidence?.pt || [];
  return { id: f.competency, title: L(act.title), type: act.type, expected: ev, learn: [], date: a.date, otherLang: null,
    why: [{ text: L(f.why) }, f.why_not_others ? { label: t("now.whyNotOthers"), text: L(f.why_not_others) } : null, { label: t("now.whyWhere"), text: L(act.where.reason) }, { text: L(act.then), quiet: true }].filter(Boolean) };
}

const disclosure = (title, ...body) => h("details", { class: "more" }, h("summary", {}, title), h("div", { class: "disc-body" }, body));

export function renderNow() {
  const n = current(), c = store.comp(n.id);
  return h("section", { class: "block now", "aria-labelledby": "now-h" },
    h("p", { class: "eyebrow" }, t("now.eyebrow")),
    h("h2", { id: "now-h", class: "headline", tabindex: "-1" }, c ? compName(c) : n.id),
    h("p", { class: "lede soft" }, t(`typeDesc.${n.type}`).replace(/^./, (x) => x.toUpperCase()) + "."),
    h("p", { class: "eyebrow step-k" }, t("now.action")),
    h("p", { class: "next-step" }, n.title),
    h("p", { class: "meta type" }, t(`type.${n.type}`)),
    renderAdvisorActions(),
    h("div", { class: "disclosures" },
      disclosure(t("now.why"), n.why.map((w) => h("p", { class: w.quiet ? "meta" : "hint" }, w.label ? h("strong", {}, `${w.label} `) : null, w.text))),
      n.expected.length ? disclosure(t("now.show"), h("ul", { class: "tight" }, n.expected.map((x) => h("li", {}, x)))) : null),
    n.type === "APRENDER" && n.learn.length
      ? h("section", { class: "learn" },
        h("h3", { class: "eyebrow" }, t("now.learn")),
        h("p", { class: "hint" }, t("now.learnIntro")),
        h("ul", { class: "tight" }, n.learn.map((x) => h("li", {}, x)))) : null,
    h("p", { class: "meta foot" }, t("now.asOf", { date: formatDate(n.date) }), n.otherLang ? ` ${t("advisor.otherLang", { lang: t(`lang.${n.otherLang}`) })}` : "", " ", t("advisor.basis")),
    renderSignOut());
}
