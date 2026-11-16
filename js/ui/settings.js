import { h } from "../dom.js";
import { t, getLang, setLang, formatDate, formatDateTime } from "../i18n.js";
import * as store from "../store.js";
import { S } from "../store.js";
import * as api from "../api.js";
import { LEGACY_KEY, LEGACY_TOKEN_KEY } from "../legacy-catalog.js";
import { parseLegacy, planMigration } from "../migration.js";
import { btn, field, openSheet, run } from "./common.js";
import { CONFIG } from "../config.js";

export function openSettings() {
  openSheet(t("settings.title"), (close) => {
    const lang = h("select", {}, [["pt-PT", "Português (pt-PT)"], ["en-GB", "English (en-GB)"]].map(([v, l]) => h("option", { value: v, selected: v === getLang() }, l)));
    const goal = h("textarea", { rows: 3, maxlength: 1000 }, S.profile?.professional_goal || "");
    const hours = h("input", { type: "number", min: 1, max: 80, value: S.profile?.weekly_hours || 5, inputmode: "numeric" });
    const u = store.usageToday();
    const cost = S.runs.filter((r) => r.cost_usd).reduce((a, r) => a + Number(r.cost_usd), 0);
    return h("div", {},
      h("form", { onsubmit: async (e) => {
        e.preventDefault();
        const l = lang.value;
        setLang(l);
        const r = await run(() => store.saveProfile({ preferred_language: l, professional_goal: goal.value.trim() || null, weekly_hours: Number(hours.value) || 5 }), { done: t("common.saved") });
        if (r.ok) close();
      } },
      field(t("settings.language"), lang), field(t("settings.goal"), goal, t("settings.goalHint")), field(t("settings.hours"), hours),
      h("div", { class: "actions" }, h("button", { type: "submit", class: "btn primary", disabled: S.busy > 0 }, t("common.save")))),
      h("section", {}, h("h3", {}, t("settings.usage")),
        h("p", { class: "meta" }, t("settings.usageLine", { g: u.generation, e: u.explanation, a: u.analysis })),
        h("p", { class: "meta" }, t("settings.cost", { v: cost.toFixed(2) }))),
      h("section", {}, h("h3", {}, t("settings.data")),
        h("div", { class: "actions" },
          btn(t("settings.migrate"), () => { close(); migrationSheet(); }),
          h("button", { type: "button", class: "btn", onclick: exportData, disabled: !S.loaded }, t("settings.export")))),
      h("section", {}, h("p", { class: "meta" }, `${api.sessionEmail()} · v${CONFIG.APP_VERSION}`),
        h("div", { class: "actions" }, h("button", { type: "button", class: "btn", onclick: async () => { close(); store.clearLocalData(); await api.signOut(); } }, t("settings.signOut")))));
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: { profile: S.profile, competencies: S.competencies, evidence: S.evidence, resources: S.resources } }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `learning-journey-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
}

/** Migração do Roadmap antigo: lê → valida → mostra revisão → só então grava. Nunca apaga o estado antigo. */
function migrationSheet() {
  openSheet(t("migrate.title"), (close) => {
    let raw = null;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch (_e) { /* ignora */ }
    const ta = h("textarea", { rows: 3, placeholder: t("migrate.paste"), "aria-label": t("migrate.paste") }, "");
    const out = h("div", { "aria-live": "polite" });
    const hasToken = (() => { try { return !!localStorage.getItem(LEGACY_TOKEN_KEY); } catch (_e) { return false; } })();

    const review = async (text) => {
      out.textContent = "";
      const parsed = parseLegacy(text);
      if (!parsed.ok) { out.append(h("p", { class: "error" }, t(`migrate.err.${parsed.reason}`))); return; }
      const plan = planMigration(parsed, await store.existingForMigration());
      const s = plan.summary;
      const rmToken = h("input", { type: "checkbox", checked: hasToken });
      out.append(
        h("p", {}, t("migrate.summary", { done: s.completed, res: s.resourcesToCreate, ev: s.evidenceToCreate })),
        s.estimatedDates ? h("p", { class: "hint" }, t("migrate.estimatedDates", { n: s.estimatedDates })) : null,
        s.completedWithoutCompetency ? h("p", { class: "hint" }, t("migrate.noCompetency", { n: s.completedWithoutCompetency })) : null,
        s.unknownIds ? h("p", { class: "hint" }, t("migrate.unknown", { n: s.unknownIds })) : null,
        plan.evidence.length ? h("ul", { class: "plain" }, plan.evidence.map((e) => h("li", {}, (getLang() === "pt-PT" ? e.title_pt : e.title_en), h("span", { class: "meta" }, ` · ${formatDate(e.occurred_at)}${e.dateEstimated ? "*" : ""}`)))) : null,
        h("p", { class: "hint" }, t("migrate.keepsOld")),
        hasToken ? h("label", { class: "choice" }, rmToken, h("span", {}, t("migrate.removeToken"))) : null,
        h("div", { class: "actions" }, btn(t("migrate.confirm"), async () => {
          close();
          const r = await run(() => store.applyMigration(parsed, plan), { busy: t("migrate.running"), done: t("migrate.done") });
          if (r.ok && rmToken.checked) { try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch (_e) { /* ignora */ } }
        }, "primary", { disabled: !plan.resources.length && !plan.evidence.length })),
        !plan.resources.length && !plan.evidence.length ? h("p", { class: "hint" }, t("migrate.nothing")) : null);
    };
    if (raw) review(raw);
    return h("div", {}, S.profile?.legacy_migrated_at ? h("p", { class: "hint" }, t("migrate.already", { date: formatDateTime(S.profile.legacy_migrated_at) })) : null,
      raw ? h("p", { class: "hint" }, t("migrate.found")) : h("p", { class: "hint" }, t("migrate.notFound")),
      h("details", { class: "more", open: !raw }, h("summary", {}, t("migrate.pasteSummary")), ta,
        h("div", { class: "actions" }, h("button", { type: "button", class: "btn", onclick: () => review(ta.value) }, t("migrate.review")))),
      out);
  });
}

/* ── Login por email + password (sem email transacional; a sessão fica guardada pelo SDK) ── */
export function renderLogin({ expired = false } = {}) {
  const email = h("input", { type: "email", autocomplete: "username", inputmode: "email", required: true, id: "email" });
  const pass = h("input", { type: "password", autocomplete: "current-password", required: true, id: "password" });
  const msg = h("p", { class: "error", role: "alert" });
  return h("section", { class: "block login" },
    h("p", { class: "eyebrow" }, expired ? t("login.expired") : t("login.eyebrow")),
    h("h2", { class: "headline" }, t("login.title")),
    h("p", { class: "lede" }, t("login.body")),
    h("form", { onsubmit: async (e) => {
      e.preventDefault(); msg.textContent = "";
      try { await api.signIn(email.value.trim(), pass.value); }
      catch (err) { msg.textContent = err instanceof api.OfflineError ? t("err.offline") : t("login.failed"); }
    } },
    field(t("login.email"), email), field(t("login.password"), pass),
    h("div", { class: "actions" }, h("button", { type: "submit", class: "btn primary" }, t("login.signIn"))), msg));
}
