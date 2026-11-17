// Tema: Sistema (por omissão), Claro ou Escuro. A preferência fica só neste dispositivo.
export const THEMES = ["system", "light", "dark"];
const KEY = "lj-theme";
const COLORS = { light: "#006B73", dark: "#0E1317" };

export function getTheme() {
  try { const v = localStorage.getItem(KEY); if (THEMES.includes(v)) return v; } catch (_e) { /* ignora */ }
  return "system";
}

export function applyTheme(mode = getTheme()) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode); else root.removeAttribute("data-theme");
  // A barra do navegador acompanha o tema escolhido; em "Sistema" voltam as duas regras por media query.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.media) m.dataset.media = m.getAttribute("media") || "";
    if (mode === "system") { m.setAttribute("media", m.dataset.media); m.setAttribute("content", m.dataset.media.includes("dark") ? COLORS.dark : COLORS.light); }
    else { m.setAttribute("media", "all"); m.setAttribute("content", COLORS[mode]); }
  });
  // Com dois metas "all" iguais o navegador usa o último; ambos têm a mesma cor, por isso é indiferente.
}

export function setTheme(mode) {
  if (!THEMES.includes(mode)) return;
  try { if (mode === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch (_e) { /* ignora */ }
  applyTheme(mode);
}
