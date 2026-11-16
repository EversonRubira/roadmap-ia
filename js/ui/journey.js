import { h } from "../dom.js";
import { t, getLang, formatDate } from "../i18n.js";
import * as store from "../store.js";
import { S } from "../store.js";
import * as api from "../api.js";
import { btn, compName, field, openSheet, run } from "./common.js";

export function renderJourney() {
  const applied = S.competencies.filter((c) => c.status === "applied");
  const focus = S.competencies.find((c) => c.is_current_focus);
  const step = store.inProgressStep();
  const rec = store.activeRec();
  const dirs = store.candidates().slice(0, 3);
  const nowTitle = step?.title || rec?.title || null;
  return h("div", { class: "view-journey" },
    h("p", { class: "lede" }, t("journey.intro")),
    h("section", {}, h("h3", { class: "eyebrow" }, t("journey.applied")),
      applied.length ? h("ul", { class: "plain" }, applied.map((c) => h("li", {}, compName(c)))) : h("p", { class: "hint" }, t("journey.noneApplied"))),
    h("section", {}, h("h3", { class: "eyebrow" }, t("journey.now")),
      focus ? h("p", {}, h("strong", {}, compName(focus))) : h("p", { class: "hint" }, t("journey.noFocus")),
      nowTitle ? h("p", { lang: (step || rec).language }, nowTitle) : null),
    h("section", {}, h("h3", { class: "eyebrow" }, t("journey.next")),
      h("p", { class: "hint" }, t("journey.nextHint")),
      dirs.length ? h("ul", { class: "plain" }, dirs.map((d) => { const c = store.comp(d.competency_id); return h("li", {}, h("strong", {}, c ? compName(c) : ""), ` · ${t(`kind.${d.kind}`)}`); }))
        : h("p", { class: "hint" }, t("journey.noDirections"))),
    h("section", {}, h("h3", { class: "eyebrow" }, t("journey.public")),
      h("p", { class: "hint" }, t("journey.publicHint")),
      h("div", { class: "actions" }, btn(t("journey.editPublic"), publicTextSheet), h("button", { type: "button", class: "btn", onclick: previewSheet, disabled: S.offline }, t("journey.preview")))));
}

function publicTextSheet() {
  openSheet(t("journey.editPublic"), (close) => {
    const p = S.profile;
    const f = (id, v, max) => h("textarea", { id, rows: 2, maxlength: max }, v || "");
    const focusPt = f("fpt", p.public_focus_description_pt, 400), focusEn = f("fen", p.public_focus_description_en, 400);
    const nextPt = f("npt", p.public_next_direction_pt, 200), nextEn = f("nen", p.public_next_direction_en, 200);
    const lang = h("select", {}, ["pt-PT", "en-GB"].map((l) => h("option", { value: l, selected: l === p.public_language }, l)));
    return h("form", { onsubmit: async (e) => {
      e.preventDefault(); close();
      await run(() => store.saveProfile({
        public_focus_description_pt: focusPt.value.trim() || null, public_focus_description_en: focusEn.value.trim() || null,
        public_next_direction_pt: nextPt.value.trim() || null, public_next_direction_en: nextEn.value.trim() || null, public_language: lang.value }), { done: t("common.saved") });
    } },
    h("p", { class: "hint" }, t("journey.publicTextHint")),
    field(t("journey.focusPt"), focusPt), field(t("journey.focusEn"), focusEn),
    field(t("journey.nextPt"), nextPt), field(t("journey.nextEn"), nextEn),
    field(t("journey.publicLang"), lang),
    h("div", { class: "actions" }, h("button", { type: "submit", class: "btn primary", disabled: S.busy > 0 || S.offline }, t("common.save"))));
  });
}

/** Mostra exatamente o que um visitante anónimo recebe (pedido feito SEM sessão). */
function previewSheet() {
  openSheet(t("journey.preview"), () => {
    const pre = h("pre", { class: "json", tabindex: 0, "aria-label": t("journey.previewLabel") }, t("common.loading"));
    api.fetchPublicJourney().then((r) => { pre.textContent = JSON.stringify(r?.[0] ?? null, null, 2); })
      .catch(() => { pre.textContent = t("err.generic"); });
    return h("div", {}, h("p", { class: "hint" }, t("journey.previewHint")), pre);
  });
}
