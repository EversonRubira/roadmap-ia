// Gera a projeção pública (data/public.json) a partir da última análise e do modelo de competências.
// Uso: node scripts/public.mjs   (reescreve data/public.json; os textos curados pt/en ficam como estão)
// Regra: só entram competências com evidência de nível 2 ou 3. Nada de níveis em número, confiança, cursos ou notas privadas.
import { readFileSync, writeFileSync } from "node:fs";

const REPOS = { TrackCargo: "https://github.com/EversonRubira/TrackCargo/tree/main/docs/ai-test-triage" };
const LEVEL = { 3: "consolidated", 2: "applied" };

export function derivePublic(model, latest, current) {
  const byId = new Map(model.competencies.map((c) => [c.id, c]));
  const name = (c) => ({ pt: c.name_pt, en: c.name_en });
  const skills = latest.competencies
    .filter((e) => e.level >= 2)
    .map((e) => ({ e, c: byId.get(e.id), order: model.competencies.findIndex((x) => x.id === e.id) }))
    .sort((a, b) => b.e.level - a.e.level || a.order - b.order)
    .map(({ e, c }) => {
      const repo = e.evidence.map((x) => x.location.split(" · ")[0]).map((r) => REPOS[r]).find(Boolean);
      return {
        id: c.id, level: LEVEL[e.level], name: name(c),
        what: { pt: c.description_pt, en: c.description_en },
        evidence: e.evidence.slice(0, 2).map((x) => ({ pt: x.note.pt, en: x.note.en })),
        ...(repo ? { repo } : {}),
      };
    });
  const focus = latest.focus.competency;
  const next = latest.competencies
    .filter((e) => e.level === 0 && e.id !== focus)
    .slice(0, 2)
    .map((e) => ({ id: e.id, name: name(byId.get(e.id)) }));
  return { updated: latest.date, focus, path: model.competencies.map((c) => c.id), pt: current.pt, en: current.en, skills, next };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (p) => JSON.parse(readFileSync(p, "utf8"));
  const out = derivePublic(read("data/competencias.json"), read("data/analises/latest.json"), read("data/public.json"));
  writeFileSync("data/public.json", JSON.stringify(out, null, 2) + "\n");
  console.log("data/public.json atualizado:", out.skills.length, "competências com evidência, foco", out.focus);
}
