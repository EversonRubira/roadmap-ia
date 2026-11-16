// Migração do Roadmap antigo (localStorage "roadmap-ia-v1") — funções PURAS, testáveis em Node.
// Idempotência: cada recurso usa legacy_id; cada evidência usa source_key "legacy:<id>".
// Nunca apaga o estado antigo nem o backup.
import { LEGACY_CATALOG } from "./legacy-catalog.js";

const KNOWN = new Map(LEGACY_CATALOG.map((c) => [c.id, c]));

/** Lê e valida o estado antigo. `raw` é a string guardada (ou colada pelo utilizador). */
export function parseLegacy(raw) {
  if (!raw) return { ok: false, reason: "empty" };
  let d;
  try { d = JSON.parse(raw); } catch (_e) { return { ok: false, reason: "invalid_json" }; }
  if (!d || !Array.isArray(d.done)) return { ok: false, reason: "invalid_format" };
  const done = [], unknown = [];
  for (const id of new Set(d.done)) (typeof id === "string" && KNOWN.has(id) ? done : unknown).push(id);
  const at = {};
  if (d.at && typeof d.at === "object") for (const id of done) if (Number.isFinite(d.at[id])) at[id] = d.at[id];
  return { ok: true, done, unknown, at, original: d };
}

const iso = (ms) => new Date(ms).toISOString();
const day = (ms) => iso(ms).slice(0, 10);

/**
 * Plano de importação, para mostrar ANTES de gravar.
 * existing: { resourceLegacyIds:Set, evidenceSourceKeys:Set } — o que já está no Supabase.
 */
export function planMigration(parsed, existing = { resourceLegacyIds: new Set(), evidenceSourceKeys: new Set() }, now = Date.now()) {
  const doneSet = new Set(parsed.done);
  const resources = [], evidence = [];
  for (const c of LEGACY_CATALOG) {
    if (c.tag === "cp") continue;                      // checkpoints da Alura não são recursos de aprendizagem
    const completed = doneSet.has(c.id);
    const when = parsed.at[c.id] ?? now;               // sem data guardada: usa a data da migração (marcado como estimada)
    if (!existing.resourceLegacyIds.has(c.id)) {
      resources.push({
        legacy_id: c.id, title: c.title, provider: c.provider, hours: c.hours, resource_type: "course",
        competency_slugs: c.slugs, status: completed ? "completed" : "available",
        completed_at: completed ? iso(when) : null, legacy_note: c.note || null,
      });
    }
    const key = `legacy:${c.id}`;
    if (completed && c.slugs.length && !existing.evidenceSourceKeys.has(key)) {
      evidence.push({
        slug: c.slugs[0], source_key: key, evidence_type: "course", title_pt: `Curso concluído: ${c.title}`, title_en: `Course completed: ${c.title}`,
        occurred_at: day(when), dateEstimated: parsed.at[c.id] == null, visibility: "private", share_with_ai: false, resourceLegacyId: c.id,
      });
    }
  }
  return {
    resources, evidence,
    summary: {
      completed: parsed.done.length, resourcesToCreate: resources.length, evidenceToCreate: evidence.length,
      completedWithoutCompetency: parsed.done.filter((id) => !KNOWN.get(id).slugs.length && KNOWN.get(id).tag !== "cp").length,
      unknownIds: parsed.unknown.length, estimatedDates: evidence.filter((e) => e.dateEstimated).length,
    },
  };
}
