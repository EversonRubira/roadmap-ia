import { $ } from "../dom.js";
import { getLang, t } from "../i18n.js";

export const L = (o) => (o ? (getLang() === "pt-PT" ? o.pt : o.en) || o.pt || o.en || "" : "");
export const compName = (c) => (getLang() === "pt-PT" ? c.name_pt : c.name_en);
export const compDesc = (c) => (getLang() === "pt-PT" ? c.description_pt : c.description_en);
export const levelLabel = (n) => t(`level.${n}`);
export const confLabel = (v) => t("conf.short", { v: t(`conf.${v}`) });

export function announce(msg) {
  const el = $("#live"); if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = msg; }, 30);
}
