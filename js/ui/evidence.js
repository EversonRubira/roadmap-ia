import { h } from "../dom.js";
import { t, getLang, formatDate, pick } from "../i18n.js";
import * as store from "../store.js";
import { S } from "../store.js";
import { EVIDENCE_TYPES } from "../evidence-groups.js";
import { btn, compName, field, openSheet, run } from "./common.js";

export function renderEvidence() {
  const manual = S.evidence;
  const completed = S.resources.filter((r) => r.status === "completed");
  const available = S.resources.filter((r) => r.status === "available");
  return h("div", { class: "view-evidence" },
    h("section", {}, h("h3", {}, t("evidence.sources")),
      h("ul", { class: "plain" },
        h("li", {}, h("strong", {}, "GitHub"), " · ", t("evidence.githubSoon")),
        h("li", {}, h("strong", {}, t("evidence.manual")), ` · ${manual.length}`))),
    h("div", { class: "actions" }, btn(t("evidence.add"), () => openEvidenceForm({}), "primary")),
    h("section", {}, h("h3", {}, t("evidence.list")),
      manual.length ? h("ul", { class: "ev-list" }, manual.map(item)) : h("p", { class: "hint" }, t("evidence.empty"))),
    h("section", {}, h("h3", {}, t("evidence.completed")),
      completed.length ? h("ul", { class: "plain" }, completed.map((r) => h("li", {}, r.title, h("span", { class: "meta" }, ` · ${r.provider} · ${formatDate(r.completed_at)}`)))) : h("p", { class: "hint" }, t("evidence.noneCompleted"))),
    h("details", { class: "more" }, h("summary", {}, t("evidence.catalog", { n: available.length })),
      h("p", { class: "hint" }, t("evidence.catalogHint")),
      h("ul", { class: "plain" }, available.map((r) => h("li", { class: "res" },
        h("span", {}, r.title, h("span", { class: "meta" }, ` · ${r.provider}${r.hours ? ` · ${r.hours} h` : ""}`)),
        btn(t("evidence.markDone"), () => markDone(r), "ghost small"))))),
    h("section", {}, h("h3", {}, t("evidence.visibility")), h("p", { class: "hint" }, t("evidence.visibilityNote"))));
}

async function markDone(r) {
  const c = r.competency_slugs[0] && store.compBySlug(r.competency_slugs[0]);
  await run(() => store.completeResource(r, c?.id), { done: t("common.saved") });
}

function item(e) {
  const c = store.comp(e.competency_id);
  const p = pick(e, "title");
  return h("li", {}, h("button", { type: "button", class: "ev-item", onclick: () => openEvidenceForm({ evidence: e }) },
    h("span", { class: "ev-title", lang: p.fallback ? (getLang() === "pt-PT" ? "en-GB" : "pt-PT") : getLang() }, p.text),
    h("span", { class: "meta" }, `${t(`evtype.${e.evidence_type}`)} · ${c ? compName(c) : ""} · ${formatDate(e.occurred_at)}`),
    h("span", { class: "meta" }, e.is_client_work ? t("vis.client") : e.visibility === "public" ? t("vis.public") : t("vis.private"),
      e.share_with_ai ? ` · ${t("evidence.aiShared")}` : "")));
}

/** Formulário de evidência (criar/editar). Privada por omissão; trabalho de cliente nunca é público nem enviado à IA. */
export function openEvidenceForm({ competencyId, evidence } = {}) {
  const editing = !!evidence;
  openSheet(editing ? t("evidence.edit") : t("evidence.add"), (close) => {
    const lang = getLang();
    const col = lang === "pt-PT" ? "pt" : "en";
    const type = h("select", {}, EVIDENCE_TYPES.map((x) => h("option", { value: x, selected: x === (evidence?.evidence_type || "implementation") }, t(`evtype.${x}`))));
    const comp = h("select", {}, S.competencies.map((c) => h("option", { value: c.id, selected: c.id === (evidence?.competency_id || competencyId) }, compName(c))));
    const title = h("input", { type: "text", maxlength: 200, required: true, value: evidence?.[`title_${col}`] || "" });
    const desc = h("textarea", { rows: 3, maxlength: 1000 }, evidence?.[`description_${col}`] || "");
    const url = h("input", { type: "url", inputmode: "url", placeholder: "https://", value: evidence?.source_url || "" });
    const date = h("input", { type: "date", required: true, value: evidence?.occurred_at || new Date().toISOString().slice(0, 10) });
    const client = h("input", { type: "checkbox", checked: !!evidence?.is_client_work });
    const vis = (v) => h("input", { type: "radio", name: "vis", value: v, checked: (evidence?.visibility || "private") === v });
    const vPriv = vis("private"), vPub = vis("public");
    const ai = h("input", { type: "checkbox", checked: !!evidence?.share_with_ai });
    const sync = () => { const c = client.checked; vPub.disabled = c; ai.disabled = c; if (c) { vPriv.checked = true; ai.checked = false; } };
    client.addEventListener("change", sync); sync();
    const msg = h("p", { class: "error", role: "alert" });

    return h("form", { onsubmit: async (e) => {
      e.preventDefault();
      if (url.value && !/^https?:\/\//i.test(url.value)) { msg.textContent = t("evidence.badUrl"); return; }
      const row = {
        evidence_type: type.value, competency_id: comp.value, [`title_${col}`]: title.value.trim(), [`description_${col}`]: desc.value.trim() || null,
        source_url: url.value || null, occurred_at: date.value, visibility: vPub.checked ? "public" : "private",
        is_client_work: client.checked, share_with_ai: ai.checked,
      };
      close();
      await run(() => (editing ? store.updateEvidence(evidence.id, row) : store.addEvidence(row)), { done: t("common.saved") });
    } },
    field(t("evidence.type"), type), field(t("evidence.competency"), comp),
    field(t("evidence.title"), title), field(t("evidence.description"), desc),
    field(t("evidence.url"), url), field(t("evidence.date"), date),
    h("label", { class: "choice" }, client, h("span", {}, t("evidence.client"))),
    h("fieldset", { class: "choices" }, h("legend", {}, t("evidence.visibility")),
      h("label", { class: "choice" }, vPriv, h("span", {}, t("vis.private"))),
      h("label", { class: "choice" }, vPub, h("span", {}, t("vis.publicLong")))),
    h("label", { class: "choice" }, ai, h("span", {}, t("evidence.shareAi"))),
    h("p", { class: "hint" }, t("evidence.langHint", { lang: lang === "pt-PT" ? "Português" : "English" })),
    msg,
    h("div", { class: "actions" },
      h("button", { type: "submit", class: "btn primary", disabled: S.busy > 0 || S.offline }, t("common.save")),
      editing ? btn(t("common.delete"), async () => { if (confirm(t("evidence.confirmDelete"))) { close(); await run(() => store.deleteEvidence(evidence.id), { done: t("common.saved") }); } }, "danger") : null));
  });
}
