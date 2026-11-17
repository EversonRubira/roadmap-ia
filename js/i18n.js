import pt from "./locales/pt-PT.js";
import en from "./locales/en-GB.js";

const DICTS = { "pt-PT": pt, "en-GB": en };
export const LANGS = ["pt-PT", "en-GB"];
const LS = "lj-lang";
let lang = initial();
const listeners = new Set();

function initial() {
  try { const s = localStorage.getItem(LS); if (LANGS.includes(s)) return s; } catch (_e) { /* sem storage */ }
  const nav = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  return nav.some((l) => /^pt/i.test(l || "")) ? "pt-PT" : "en-GB";
}

export const getLang = () => lang;
export const otherLang = () => (lang === "pt-PT" ? "en-GB" : "pt-PT");
export function setLang(l, { persist = true } = {}) {
  if (!LANGS.includes(l)) return;
  lang = l;
  if (persist) { try { localStorage.setItem(LS, l); } catch (_e) { /* ignora */ } }
  if (typeof document !== "undefined") {
    document.documentElement.lang = l;
    document.title = t("app.title");
  }
  listeners.forEach((fn) => fn(l));
}
export const onLangChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Tradução por chave semântica; {nome} é substituído por vars. Chave em falta devolve a própria chave. */
export function t(key, vars) {
  const s = DICTS[lang][key];
  if (s === undefined) { if (typeof console !== "undefined") console.warn("i18n: chave em falta", key); return key; }
  return vars ? s.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}
export const hasKey = (key, l) => DICTS[l][key] !== undefined;
export const dictKeys = (l) => Object.keys(DICTS[l]);

/** Datas respeitam o locale (pt-PT / en-GB). "YYYY-MM-DD" é tratado como data local (sem salto de fuso). */
export function formatDate(v, opts = { dateStyle: "medium" }) {
  if (!v) return "";
  let d;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, dd] = v.split("-").map(Number); d = new Date(y, m - 1, dd); }
  else d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang, opts).format(d);
}
export const formatDateTime = (v) => formatDate(v, { dateStyle: "medium", timeStyle: "short" });

/** Texto bilingue de uma linha da base de dados: prefere o idioma atual; devolve também se foi usado o outro. */
export function pick(row, base) {
  const own = row[`${base}_${lang === "pt-PT" ? "pt" : "en"}`];
  if (own) return { text: own, fallback: false };
  const other = row[`${base}_${lang === "pt-PT" ? "en" : "pt"}`];
  return { text: other || "", fallback: !!other };
}
