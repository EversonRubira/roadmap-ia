import { h } from "../dom.js";
import { t, getLang, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { S } from "../store.js";
import { btn, compName, hoursText, openSheet, run, announce } from "./common.js";
import { openEvidenceForm } from "./evidence.js";

const REASONS = ["already_know", "not_relevant", "not_applicable", "too_much_effort", "other_area", "wrong_assessment", "other"];
const QUESTIONS = ["why", "evidence_used", "shorter_alternative", "need_course", "how_to_know"];

export function renderNow() {
  const step = store.inProgressStep();
  const rec = store.activeRec();
  const root = h("div", { class: "view-now" });
  if (step) root.append(inProgress(step));
  else if (rec) root.append(recommendation(rec));
  else root.append(empty());
  return root;
}

function empty() {
  return h("section", { class: "block", "aria-labelledby": "now-h" },
    h("p", { class: "eyebrow" }, t("now.noRec.eyebrow")),
    h("h2", { id: "now-h", class: "headline" }, t("now.noRec.title")),
    h("p", { class: "lede" }, t("now.noRec.body")),
    !S.profile?.professional_goal ? h("p", { class: "hint" }, t("now.noRec.goalHint")) : null,
    h("div", { class: "actions" }, btn(t("now.generate"), () => generate(null), "primary")),
    quotaLine());
}

function quotaLine() {
  const u = store.usageToday();
  return h("p", { class: "hint" }, t("now.quota", { n: u.generation, max: 5 }));
}

async function generate(replaceId) {
  await run(() => store.generate(replaceId), { busy: t("now.generating"), done: t("now.generated") });
}

function recommendation(rec) {
  const c = store.comp(rec.competency_id);
  const wrongLang = rec.language !== getLang();
  const effort = hoursText(rec.estimated_hours_min, rec.estimated_hours_max);
  return h("section", { class: "block", "aria-labelledby": "now-h", lang: rec.language },
    h("p", { class: "eyebrow" }, t("now.next.eyebrow")),
    h("h2", { id: "now-h", class: "headline" }, rec.title),
    h("p", { class: "lede" }, rec.reason),
    wrongLang ? h("div", { class: "notice", role: "note", lang: getLang() },
      h("p", {}, t("now.langMismatch", { lang: rec.language === "pt-PT" ? "Português" : "English" })),
      btn(t("now.regenerate"), () => generate(rec.id), "")) : null,
    !wrongLang && S.profile?.recommendation_stale ? h("div", { class: "notice", role: "note", lang: getLang() },
      h("p", {}, t("now.stale")), btn(t("now.refresh"), () => generate(rec.id))) : null,
    h("dl", { class: "facts", lang: getLang() },
      fact(t("now.focus"), c ? compName(c) : ""),
      fact(t("now.effort"), effort),
      fact(t("now.expected"), (rec.expected_evidence || []).join("; "))),
    h("details", { class: "more" }, h("summary", {}, t("now.criteria")),
      h("ul", { lang: rec.language }, (rec.acceptance_criteria || []).map((x) => h("li", {}, x)))),
    (rec.learning_resources || []).length ? h("details", { class: "more" }, h("summary", {}, t("now.resources")),
      h("ul", { lang: rec.language }, rec.learning_resources.map((r) => h("li", {}, r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.title) : r.title, ` · ${r.provider}`)))) : null,
    h("div", { class: "actions", lang: getLang() },
      btn(t("recommendation.accept"), () => run(() => store.acceptRec(rec.id), { done: t("now.accepted") }), "primary"),
      btn(t("recommendation.alternative"), () => alternativeSheet(rec)),
      btn(t("recommendation.known"), () => known(rec)),
      btn(t("recommendation.defer"), () => defer(rec))),
    h("p", {}, h("button", { type: "button", class: "link", onclick: () => explainSheet(rec) }, t("now.why"))));
}

const fact = (k, v) => h("div", {}, h("dt", {}, k), h("dd", {}, v));

async function known(rec) {
  const r = await run(() => store.feedback(rec.id, "already_known"));
  if (r.ok) await generate(null);
}
async function defer(rec) {
  const r = await run(() => store.feedback(rec.id, "deferred"));
  if (r.ok) await generate(null);
}

function alternativeSheet(rec) {
  openSheet(t("alt.title"), (close) => {
    let chosen = "";
    const group = h("fieldset", { class: "choices" }, h("legend", {}, t("alt.legend")),
      REASONS.filter((r) => r !== "already_know").map((r) => h("label", { class: "choice" },
        h("input", { type: "radio", name: "reason", value: r, onchange: () => { chosen = r; } }), h("span", {}, t(`reason.${r}`)))));
    return h("form", { onsubmit: async (e) => {
      e.preventDefault(); close();
      if (chosen) { const r = await run(() => store.feedback(rec.id, "rejected", chosen)); if (!r.ok) return; await generate(null); }
      else await generate(rec.id);
    } }, h("p", { class: "hint" }, t("alt.hint")), group,
    h("div", { class: "actions" }, h("button", { type: "submit", class: "btn primary", disabled: S.busy > 0 || S.offline }, t("alt.submit"))));
  });
}

function explainSheet(rec) {
  openSheet(t("explain.title"), () => {
    const out = h("div", { class: "explain-out", "aria-live": "polite" });
    const u = store.usageToday();
    const list = h("ul", { class: "plain" }, QUESTIONS.map((q) => h("li", {}, btn(t(`explain.q.${q}`), async () => {
      out.textContent = t("explain.loading");
      const res = await run(() => store.explain(rec.id, q));
      const r = res.ok ? res.value : null;
      out.textContent = "";
      if (!r) { out.append(h("p", { class: "error" }, t("explain.failed"))); return; }
      out.append(h("div", { lang: rec.language }, h("p", {}, r.explanation.answer), h("ul", {}, (r.explanation.points || []).map((p) => h("li", {}, p)))));
    }, "ghost wide"))));
    return h("div", {}, h("p", { class: "hint" }, t("explain.hint", { n: u.explanation, max: 20 })), list, out);
  });
}

function inProgress(step) {
  const c = store.comp(step.competency_id);
  const logs = S.logs.filter((l) => l.step_id === step.id).slice(0, 3);
  return h("section", { class: "block", "aria-labelledby": "now-h", lang: step.language },
    h("p", { class: "eyebrow" }, t("now.progress.eyebrow")),
    h("h2", { id: "now-h", class: "headline" }, step.title),
    h("p", { class: "meta", lang: getLang() }, `${c ? compName(c) : ""} · ${t("now.startedOn", { date: formatDate(step.started_at) })}`),
    logs.length ? h("ul", { class: "log", lang: getLang() }, logs.map((l) => h("li", {}, h("time", {}, formatDate(l.created_at)), ` ${l.note}`))) : null,
    h("div", { class: "actions", lang: getLang() },
      btn(t("step.log"), () => logSheet(step), "primary"),
      btn(t("step.addEvidence"), () => openEvidenceForm({ competencyId: step.competency_id })),
      btn(t("step.complete"), () => completeSheet(step))));
}

function noteSheet(title, label, submit, cta) {
  openSheet(title, (close) => {
    const ta = h("textarea", { rows: 4, maxlength: 1000 });
    return h("form", { onsubmit: async (e) => { e.preventDefault(); close(); await submit(ta.value.trim()); } },
      h("div", { class: "field" }, h("label", { for: "note" }, label), (ta.id = "note", ta)),
      h("div", { class: "actions" }, h("button", { type: "submit", class: "btn primary", disabled: S.busy > 0 || S.offline }, cta)));
  });
}
function logSheet(step) {
  noteSheet(t("step.log"), t("step.logLabel"), (note) => note && run(() => store.logProgress(step.id, note), { done: t("common.saved") }), t("common.save"));
}
function completeSheet(step) {
  noteSheet(t("step.complete"), t("step.completeLabel"), async (note) => {
    const r = await run(() => store.completeStep(step.id, note), { done: t("step.completed") });
    if (r.ok) announce(t("step.completedNext"));
  }, t("step.completeCta"));
}
