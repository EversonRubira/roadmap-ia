// Backend Supabase simulado em memória (Auth OTP + PostgREST + Edge Functions) para testar a UI sem rede.
import { randomUUID } from "node:crypto";

const SLUGS = [["llm-integration", "LLM Integration", 5], ["context-engineering", "Context Engineering", 4], ["retrieval", "Retrieval", 4], ["agents-tools", "Agents & Tools", 5],
  ["evals-reliability", "Evals & Reliability", 5], ["safety-control", "Safety & Control", 4], ["production-ai", "Production AI", 4], ["ai-native-engineering", "AI-Native Software Engineering", 3]];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (uid, ttl = 3600) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + ttl })}.sig`;
const sessionBody = (uid, email) => ({ access_token: fakeJwt(uid), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "ref-" + Math.random().toString(36).slice(2),
  user: { id: uid, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } });

export function createBackend() {
  const uid = randomUUID();
  const db = {
    profiles: [{ id: uid, preferred_language: "pt-PT", public_language: "pt-PT", professional_goal: null, weekly_hours: 5, recommendation_stale: true, legacy_migrated_at: null,
      public_focus_description_pt: null, public_focus_description_en: null, public_next_direction_pt: null, public_next_direction_en: null }],
    competencies: SLUGS.map(([slug, name, w], i) => ({ id: randomUUID(), user_id: uid, slug, name_pt: name === "Evals & Reliability" ? "Evals & Fiabilidade" : name, name_en: name,
      description_pt: `Descrição PT de ${name}`, description_en: `EN description of ${name}`, status: "exploring", is_current_focus: false, assessment_confidence: null, assessment_source: "default",
      gaps: {}, criteria_pt: ["Critério PT 1", "Critério PT 2"], criteria_en: ["Criterion EN 1", "Criterion EN 2"], priority_weight: w, sort_order: i + 1, is_public: false })),
    evidence: [], learning_resources: [], recommendations: [], learning_steps: [], learning_step_logs: [], competency_assessments: [], analysis_runs: [], legacy_backups: [],
  };
  const log = [];            // pedidos recebidos (para verificar que não há chamadas à Claude no browser)
  const q = { fail: null, genLimit: 50, unauth: false };  // falha forçada para testar erros
  const runs = (kind) => db.analysis_runs.push({ kind, status: "ok", cost_usd: 0.01, created_at: new Date().toISOString() });
  const comp = (slug) => db.competencies.find((c) => c.slug === slug);

  function candidatesFor(lang) {
    db.recommendations = db.recommendations.filter((r) => r.status !== "candidate");
    [...db.competencies].sort((a, b) => b.priority_weight - a.priority_weight).forEach((c, i) => {
      if (db.recommendations.some((r) => r.competency_id === c.id && ["active", "accepted"].includes(r.status))) return;
      db.recommendations.push({ id: randomUUID(), user_id: uid, competency_id: c.id, kind: i === 0 ? "apply" : "learn", status: "candidate", score: 10 - i, score_factors: {}, language: null, title: null, created_at: new Date().toISOString() });
    });
  }

  function handle(method, path, query, body) {
    if (q.unauth && path.startsWith("/functions/")) return [401, { error: { code: "invalid_token" } }];
    if (q.fail && path.includes(q.fail)) return [500, { error: { code: "internal_error" } }];
    if (path === "/auth/v1/otp") return [200, {}];
    if (path === "/auth/v1/verify") return body.token === "123456" ? [200, sessionBody(uid, body.email)] : [403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }];
    if (path === "/auth/v1/logout") return [204, null];
    if (path === "/auth/v1/token") return [200, sessionBody(uid, "dono@example.com")];
    if (path === "/rest/v1/public_journey") return [200, [{ contract_version: 1, applied_competencies: db.competencies.filter((c) => c.is_public && c.status === "applied"), public_evidence: db.evidence.filter((e) => e.visibility === "public"), last_updated_at: new Date().toISOString() }]];

    let m = path.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) return rpc(m[1], body);
    m = path.match(/^\/rest\/v1\/(\w+)$/);
    if (m) return table(method, m[1], query, body);
    m = path.match(/^\/functions\/v1\/([\w-]+)$/);
    if (m) return fn(m[1], body);
    return [404, { error: { code: "not_found" } }];
  }

  function table(method, name, query, body) {
    const rows = db[name]; if (!rows) return [404, {}];
    if (method === "GET") {
      let out = rows;
      const st = query.get("status"); if (st?.startsWith("in.(")) { const set = st.slice(4, -1).split(","); out = out.filter((r) => set.includes(r.status)); }
      if (st?.startsWith("eq.")) out = out.filter((r) => r.status === st.slice(3));
      if (query.get("state")?.startsWith("eq.")) out = out.filter((r) => r.state === query.get("state").slice(3));
      return [200, structuredClone(out)];
    }
    if (method === "POST") {
      const list = Array.isArray(body) ? body : [body]; const onConflict = query.get("on_conflict");
      const made = [];
      for (const r of list) {
        if (onConflict) { const keys = onConflict.split(","); if (rows.some((x) => keys.every((k) => x[k] === r[k]))) continue; }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...r }; rows.push(row); made.push(row);
        if (name === "evidence") db.profiles[0].recommendation_stale = true;
      }
      return [201, made];
    }
    if (method === "PATCH") {
      const [col, raw] = [...query.entries()].find(([k]) => k !== "select") || [null, ""];
      const val = raw.slice(3);
      const hit = rows.filter((r) => col && String(r[col]) === val); hit.forEach((r) => Object.assign(r, body));
      return [200, hit];
    }
    if (method === "DELETE") { const [col, val] = [[...query.keys()][0], [...query.values()][0].slice(3)]; db[name] = rows.filter((r) => String(r[col]) !== val); return [204, null]; }
    return [405, {}];
  }

  function rpc(name, a) {
    const rec = () => db.recommendations.find((r) => r.id === a.p_rec);
    switch (name) {
      case "bootstrap_owner": return [200, uid];
      case "record_feedback": { const r = rec(); r.status = a.p_feedback; db.profiles[0].recommendation_stale = true; db.recommendations.push({ id: randomUUID(), _fb: a.p_feedback, _reason: a.p_reason, status: "feedback-log", competency_id: r.competency_id }); return [200, null]; }
      case "accept_recommendation": { const r = rec(); r.status = "accepted"; db.learning_steps.push({ id: randomUUID(), user_id: uid, recommendation_id: r.id, competency_id: r.competency_id, title: r.title, language: r.language, status: "in_progress", started_at: new Date().toISOString() }); return [200, null]; }
      case "complete_step": { const s = db.learning_steps.find((x) => x.id === a.p_step); s.status = "completed"; db.recommendations.find((r) => r.id === s.recommendation_id).status = "completed"; db.profiles[0].recommendation_stale = true; return [200, null]; }
      case "set_current_focus": db.competencies.forEach((c) => { c.is_current_focus = c.slug === a.p_slug; }); return [200, null];
      case "correct_assessment": Object.assign(comp(a.p_slug), { status: a.p_status, assessment_confidence: a.p_confidence, assessment_source: "user" }); return [200, null];
      default: return [404, {}];
    }
  }

  function fn(name, b) {
    const lang = b.language;
    if (name === "analyse-learning-profile") { candidatesFor(lang); if (b.mode === "full") runs("analysis"); return [200, { candidates: [], needsReview: [], assessments: 0 }]; }
    if (name === "generate-next-step") {
      const active = db.recommendations.find((r) => r.status === "active");
      if (active && !b.replaceId && active.language === lang) return [200, { recommendationId: active.id, reused: true }];
      if (active) active.status = "superseded";
      const cand = db.recommendations.filter((r) => r.status === "candidate").sort((x, y) => y.score - x.score)[0];
      if (!cand) return [409, { error: { code: "no_candidates" } }];
      if (db.analysis_runs.filter((r) => r.kind === "generation").length >= q.genLimit) return [429, { error: { code: "quota_exceeded" } }];
      const pt = lang === "pt-PT"; runs("generation");
      Object.assign(cand, { status: "active", language: lang, title: pt ? "Criar uma avaliação reproduzível para uma funcionalidade com LLM" : "Build a reproducible evaluation for an LLM feature",
        reason: pt ? "As evidências atuais mostram testes de software mas não um processo repetível de avaliação." : "Current evidence shows software testing but no repeatable evaluation process.",
        action_type: "project", estimated_hours_min: 4, estimated_hours_max: 6, expected_evidence: [pt ? "Dataset de avaliação, runner e resultados documentados" : "Evaluation dataset, runner and documented results"],
        acceptance_criteria: [pt ? "O runner executa sem intervenção" : "The runner runs unattended"], learning_resources: [], confidence: "medium", explanations: {} });
      db.profiles[0].recommendation_stale = false;
      return [200, { recommendationId: cand.id, reused: false }];
    }
    if (name === "explain-recommendation") { runs("explanation"); return [200, { explanation: { answer: b.language === "pt-PT" ? "Porque falta um baseline." : "Because a baseline is missing.", points: ["a"] }, cached: false }]; }
    return [404, {}];
  }
  return { db, log, q, handle, uid };
}
