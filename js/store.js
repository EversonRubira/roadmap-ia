// Estado da app. Supabase é a fonte única de verdade: nada é "guardado" no ecrã antes de o servidor confirmar.
// O snapshot em localStorage serve apenas para LEITURA offline e vem sempre rotulado com a data da última sincronização.
import * as api from "./api.js";
import { getLang } from "./i18n.js";
import { planMigration } from "./migration.js";

const SNAP = "lj-snapshot-v1";
export const S = {
  loaded: false, offline: false, syncedAt: null, busy: 0,
  profile: null, competencies: [], evidence: [], resources: [], recs: [], steps: [], logs: [], assessments: [], runs: [],
};
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => fn(S));

// [chave do estado, tabela, colunas, refinamento da query]
const PARTS = [
  ["competencies", "competencies", "*", (q) => q.order("sort_order")],
  ["evidence", "evidence", "*", (q) => q.order("occurred_at", { ascending: false }).order("created_at", { ascending: false })],
  ["resources", "learning_resources", "*", (q) => q.order("title")],
  ["recs", "recommendations", "*", (q) => q.in("status", ["candidate", "active", "accepted"]).order("score", { ascending: false })],
  ["steps", "learning_steps", "*", (q) => q.order("started_at", { ascending: false }).limit(20)],
  ["logs", "learning_step_logs", "*", (q) => q.order("created_at", { ascending: false }).limit(50)],
  ["assessments", "competency_assessments", "*", (q) => q.eq("state", "suggested").order("created_at", { ascending: false })],
  ["runs", "analysis_runs", "kind,status,cost_usd,created_at", (q) => q.order("created_at", { ascending: false }).limit(60)],
];

export async function loadAll() {
  try {
    let profile = (await api.query("profiles"))[0];
    if (!profile) { await api.rpc("bootstrap_owner"); profile = (await api.query("profiles"))[0]; }
    const res = await Promise.all(PARTS.map(([, table, cols, refine]) => api.query(table, cols, refine)));
    S.profile = profile; PARTS.forEach(([key], i) => { S[key] = res[i]; });
    S.offline = false; S.syncedAt = new Date().toISOString(); S.loaded = true;
    snapshotSave();
  } catch (e) {
    if (e instanceof api.OfflineError && snapshotLoad()) { S.offline = true; S.loaded = true; }
    else throw e;
  }
  emit();
}

function snapshotSave() {
  try { localStorage.setItem(SNAP, JSON.stringify({ at: S.syncedAt, uid: S.profile?.id, data: pickData() })); } catch (_e) { /* quota: sem offline */ }
}
function snapshotLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(SNAP) || "null");
    if (!s?.data) return false;
    Object.assign(S, s.data); S.syncedAt = s.at; return true;
  } catch (_e) { return false; }
}
const pickData = () => ({ profile: S.profile, competencies: S.competencies, evidence: S.evidence, resources: S.resources, recs: S.recs,
  steps: S.steps, logs: S.logs, assessments: S.assessments, runs: S.runs });
export function clearLocalData() {
  try { localStorage.removeItem(SNAP); } catch (_e) { /* ignora */ }
  Object.assign(S, { loaded: false, profile: null, competencies: [], evidence: [], resources: [], recs: [], steps: [], logs: [], assessments: [], runs: [] });
  emit();
}

/** Executa uma mutação: só atualiza a vista depois de o servidor confirmar. Offline => erro explícito. */
export async function mutate(fn) {
  if (S.offline) throw new api.OfflineError();
  S.busy++; emit();
  try { const r = await fn(); await loadAll(); return r; }
  finally { S.busy--; emit(); }
}

/* ── seletores ── */
export const comp = (id) => S.competencies.find((c) => c.id === id);
export const compBySlug = (slug) => S.competencies.find((c) => c.slug === slug);
export const activeRec = () => S.recs.find((r) => r.status === "active") || null;
export const inProgressStep = () => S.steps.find((s) => s.status === "in_progress") || null;
export const candidates = () => S.recs.filter((r) => r.status === "candidate");
export const pendingAssessment = (compId) => S.assessments.find((a) => a.competency_id === compId) || null;
export function usageToday() {
  const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(d));
  const today = day(Date.now());
  const out = { analysis: 0, generation: 0, explanation: 0 };
  S.runs.filter((r) => day(r.created_at) === today).forEach((r) => { out[r.kind]++; });
  return out;
}

/* ── perfil / competências ── */
export const saveProfile = (patch) => mutate(() => api.update("profiles", { id: S.profile.id }, patch));
export const updateCompetency = (slug, patch) => mutate(() => api.update("competencies", { slug }, patch));
export const setFocus = (slug) => mutate(() => api.rpc("set_current_focus", { p_slug: slug }));
export const correctAssessment = (slug, status, confidence) => mutate(() => api.rpc("correct_assessment", { p_slug: slug, p_status: status, p_confidence: confidence }));
export const acceptAssessment = (id) => mutate(() => api.rpc("accept_assessment", { p_id: id }));
export const dismissAssessment = (id) => mutate(() => api.rpc("dismiss_assessment", { p_id: id }));

/* ── evidências e recursos ── */
const cleanEvidence = (e) => {
  const row = { ...e };
  if (row.is_client_work) { row.visibility = "private"; row.share_with_ai = false; }   // regra também aplicada pela BD
  return row;
};
export const addEvidence = (e) => mutate(() => api.insert("evidence", { ...cleanEvidence(e), user_id: S.profile.id }));
export const updateEvidence = (id, patch) => mutate(() => api.update("evidence", { id }, cleanEvidence(patch)));
export const deleteEvidence = (id) => mutate(() => api.remove("evidence", { id }));
export const completeResource = (r, competencyId) => mutate(async () => {
  const when = new Date();
  await api.update("learning_resources", { id: r.id }, { status: "completed", completed_at: when.toISOString() });
  if (competencyId) {
    await api.upsert("evidence", [{ user_id: S.profile.id, competency_id: competencyId, evidence_type: "course", title_pt: `Curso concluído: ${r.title}`,
      title_en: `Course completed: ${r.title}`, occurred_at: when.toISOString().slice(0, 10), learning_resource_id: r.id, source_key: `resource:${r.id}` }], "user_id,source_key");
  }
});

/* ── recomendações (Claude só é chamado por estas ações, nunca ao abrir a app) ── */
export const refreshCandidates = () => api.callFunction("analyse-learning-profile", { mode: "candidates", language: getLang() });
export const runFullAnalysis = () => mutate(() => api.callFunction("analyse-learning-profile", { mode: "full", language: getLang() }));
export const generate = (replaceId = null) => mutate(async () => {
  await refreshCandidates();
  return api.callFunction("generate-next-step", { language: getLang(), replaceId });
});
export const feedback = (rec, kind, reason = null, note = null) => mutate(() => api.rpc("record_feedback", { p_rec: rec, p_feedback: kind, p_reason: reason, p_note: note }));
export const acceptRec = (rec) => mutate(() => api.rpc("accept_recommendation", { p_rec: rec }));
export const logProgress = (stepId, note) => mutate(() => api.insert("learning_step_logs", { user_id: S.profile.id, step_id: stepId, note }));
export const completeStep = (stepId, note) => mutate(() => api.rpc("complete_step", { p_step: stepId, p_note: note || null }));
export const explain = (recId, question) => api.callFunction("explain-recommendation", { recommendationId: recId, question, language: getLang() })
  .then(async (r) => { if (!r.cached) await loadAll(); return r; });

/* ── migração do Roadmap antigo ── */
export async function existingForMigration() {
  return {
    resourceLegacyIds: new Set(S.resources.filter((r) => r.legacy_id).map((r) => r.legacy_id)),
    evidenceSourceKeys: new Set(S.evidence.filter((e) => e.source_key).map((e) => e.source_key)),
  };
}
export const applyMigration = (parsed, plan) => mutate(async () => {
  // 1) backup integral ANTES de qualquer escrita
  await api.insert("legacy_backups", { user_id: S.profile.id, payload: { ...parsed.original, _migratedAt: new Date().toISOString() } });
  const uid = S.profile.id;
  if (plan.resources.length) await api.upsert("learning_resources", plan.resources.map((r) => ({ ...r, user_id: uid })), "user_id,legacy_id");
  const res = await api.query("learning_resources", "id,legacy_id", (q) => q.not("legacy_id", "is", null));
  const byLegacy = new Map(res.map((r) => [r.legacy_id, r.id]));
  const comps = new Map(S.competencies.map((c) => [c.slug, c.id]));
  const rows = plan.evidence.map((e) => ({
    user_id: uid, competency_id: comps.get(e.slug), evidence_type: e.evidence_type, title_pt: e.title_pt, title_en: e.title_en,
    occurred_at: e.occurred_at, visibility: "private", share_with_ai: false, source_key: e.source_key, learning_resource_id: byLegacy.get(e.resourceLegacyId) || null,
  })).filter((r) => r.competency_id);
  if (rows.length) await api.upsert("evidence", rows, "user_id,source_key");
  await api.update("profiles", { id: uid }, { legacy_migrated_at: new Date().toISOString() });
});
export { planMigration };
