import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("css/app.css", "utf8");
const vars = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = vars(css.match(/:root \{([\s\S]*?)\n\}/)[1]);
const dark = vars(css.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/)[1]);
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// WCAG 2.2 AA: 4.5:1 para texto normal; 3:1 para componentes de UI e foco
const TEXT = [["ink", "bg"], ["ink", "surface"], ["ink-2", "bg"], ["ink-2", "surface"], ["ink-2", "soft"], ["accent", "bg"], ["accent", "soft"], ["accent", "accent-soft"],
  ["accent-ink", "accent"], ["danger", "bg"], ["ink", "accent-soft"]];
const UI = [["focus", "bg"], ["focus", "surface"], ["ctl", "bg"], ["ctl", "surface"]];  // bordas de controlos e foco >= 3:1 (WCAG 1.4.11)
for (const [name, p] of [["claro", light], ["escuro", dark]]) {
  test(`contraste AA (${name})`, () => {
    for (const [a, b] of TEXT) assert.ok(ratio(p[a], p[b]) >= 4.5, `${a} sobre ${b}: ${ratio(p[a], p[b]).toFixed(2)}`);
    for (const [a, b] of UI) assert.ok(ratio(p[a], p[b]) >= 3, `${a} sobre ${b}: ${ratio(p[a], p[b]).toFixed(2)}`);
  });
}

// Barra de evolução: números sobre o segmento "Aplicado" (mistura 50 % de accent com surface) e sobre "Consolidado"
const mix = (a, b) => "#" + [1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0")).join("");
for (const [name, p] of [["claro", light], ["escuro", dark]]) {
  test(`barra de evolução legível (${name})`, () => {
    assert.ok(ratio(p.ink, mix(p.accent, p.surface)) >= 4.5, "ink sobre Aplicado");
    assert.ok(ratio(p["accent-ink"], p.accent) >= 4.5, "texto sobre Consolidado");
    assert.ok(ratio(p.ink, p["accent-soft"]) >= 4.5, "ink sobre Conhecimento");
    assert.ok(ratio(p["ink-2"], p.bg) >= 3, "contorno da barra");
  });
}
