// Leitura dos dados versionados no GitHub: data/competencias.json, data/cursos-feitos.json e data/analises/*.json.
// Só leitura. latest.json é uma cópia da análise mais recente; cada análise aponta para a anterior (campo "previous").
export const S = { loaded: false, error: null, competencies: [], analyses: [], courses: [] };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());
export const notify = emit;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HISTORY = 60;

async function getJson(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadAll() {
  S.error = null; emit();
  try {
    const [model, latest, done] = await Promise.all([
      getJson("data/competencias.json"),
      getJson("data/analises/latest.json"),
      getJson("data/cursos-feitos.json").catch(() => ({ courses: [] })),
    ]);
    const analyses = [latest];
    const seen = new Set([latest.date]);
    let prev = latest.previous;
    while (prev && DATE.test(prev) && !seen.has(prev) && analyses.length < MAX_HISTORY) {
      seen.add(prev);
      try { const a = await getJson(`data/analises/${prev}.json`); analyses.push(a); prev = a.previous; } catch (_e) { break; }
    }
    S.competencies = model.competencies; S.analyses = analyses; S.courses = done.courses || []; S.loaded = true;
  } catch (e) { S.error = e; }
  emit();
}

export const latest = () => S.analyses[0] || null;
export const comp = (id) => S.competencies.find((c) => c.id === id) || null;
export const entry = (analysis, id) => (analysis.competencies || []).find((x) => x.id === id) || null;
