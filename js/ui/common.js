import { h, $ } from "../dom.js";
import { t, getLang } from "../i18n.js";
import { ApiError, OfflineError } from "../api.js";
import { S } from "../store.js";

export const compName = (c) => (getLang() === "pt-PT" ? c.name_pt : c.name_en);
export const compDesc = (c) => (getLang() === "pt-PT" ? c.description_pt : c.description_en);
export const compCriteria = (c) => (getLang() === "pt-PT" ? c.criteria_pt : c.criteria_en);

/** Região aria-live: anuncia sincronização e respostas assíncronas. */
export function announce(msg, kind = "info") {
  const el = $("#live");
  if (!el) return;
  el.dataset.kind = kind;
  el.textContent = "";
  setTimeout(() => { el.textContent = msg; }, 30);       // força leitura mesmo com texto repetido
  clearTimeout(announce.t);
  announce.t = setTimeout(() => { el.textContent = ""; }, 6000);
}

/** Traduz erros técnicos em mensagens claras (sem stack traces, sem mensagens do servidor). */
export function errorMessage(e) {
  if (e instanceof OfflineError) return t("err.offline");
  if (e instanceof ApiError) {
    if (e.status === 401 || e.code === "no_session") return t("err.session");
    const key = `err.${e.code}`;
    const msg = t(key);
    return msg === key ? t("err.generic") : msg;
  }
  return t("err.generic");
}

/** Executa uma ação com mensagem de progresso. Devolve { ok, value }; falha => aviso visível e nada fica "guardado". */
export async function run(fn, { busy, done } = {}) {
  if (busy) announce(busy);
  try {
    const value = await fn();
    if (done) announce(done);
    return { ok: true, value };
  } catch (e) {
    announce(errorMessage(e), "error");
    if (e instanceof ApiError && e.status === 401) window.dispatchEvent(new Event("lj:session-expired"));
    return { ok: false };
  }
}

export function openSheet(title, build) {
  const opener = document.activeElement;
  const id = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  const dlg = h("dialog", { class: "sheet", "aria-labelledby": id });
  const close = () => dlg.close();
  const body = h("div", { class: "sheet-body" });
  dlg.append(h("div", { class: "sheet-head" }, h("h2", { id }, title),
    h("button", { type: "button", class: "icon-btn", "aria-label": t("common.close"), onclick: close }, "×")), body);
  body.append(build(close));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener("close", () => { dlg.remove(); if (opener && opener.isConnected) opener.focus(); });
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

/** Botão de ação que altera dados: desativado offline ou enquanto outra operação decorre. */
export function btn(label, onclick, cls = "", extra = {}) {
  const { disabled, ...rest } = extra;
  return h("button", { type: "button", class: `btn ${cls}`.trim(), onclick, disabled: S.busy > 0 || S.offline || disabled, ...rest }, label);
}

export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), control, hint ? h("p", { class: "hint" }, hint) : null);
}
export function hoursText(min, max) {
  return min === max ? t("hours.one", { n: min }) : t("hours.range", { min, max });
}
