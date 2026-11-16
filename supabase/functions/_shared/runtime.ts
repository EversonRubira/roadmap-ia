// Ligação ao mundo real (Deno / Supabase Edge Functions). Não é importado pelos testes.
// @ts-nocheck — tipos de npm:/Deno resolvidos em runtime pelo Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";          // fixar a versão após o primeiro deploy (ver docs/DEPLOY.md)
import { corsHeaders, errorResponse, json, readBody } from "./http.ts";
import { HttpError, QuotaError } from "./ports.ts";
import type { Deps, Llm, Port, RecRow, Lang } from "./ports.ts";

const env = (k: string, d?: string) => Deno.env.get(k) ?? d ?? "";
const num = (k: string, d: number) => { const n = Number(env(k)); return Number.isFinite(n) && n > 0 ? n : d; };

export const ALLOWED_ORIGINS = env("ALLOWED_ORIGINS", "https://eversonrubira.github.io").split(",").map((s) => s.trim()).filter(Boolean);

/** Valida o JWT no servidor (não confia só no gateway) e devolve o utilizador. */
async function authenticate(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "missing_token");
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, "invalid_token");
  const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  });
  return { userId: data.user.id as string, admin, user };
}

class AnthropicLlm implements Llm {
  client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  model = env("CLAUDE_MODEL", "claude-opus-5-5");
  async complete(req) {
    const t0 = Date.now();
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: req.effort, format: { type: "json_schema", schema: req.schema } },
    });
    if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") throw new Error(`stop:${msg.stop_reason}`);
    const block = msg.content.find((b) => b.type === "text");
    if (!block) throw new Error("no_text");
    return {
      json: JSON.parse(block.text), model: msg.model ?? this.model,
      inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, latencyMs: Date.now() - t0,
    };
  }
}

function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw new Error(String((r.error as { message?: string }).message ?? "db_error"));
  return r.data;
}

function makePort(userId: string, admin, user): Port {
  const recSelect = "id, competency_id, kind, status, score, score_factors, language, title, reason, action_type, estimated_hours_min, estimated_hours_max, expected_evidence, acceptance_criteria, learning_resources, confidence, explanations, competencies(slug)";
  const toRec = (r): RecRow => ({
    id: r.id, competencyId: r.competency_id, slug: r.competencies?.slug, kind: r.kind, status: r.status, score: Number(r.score),
    factors: r.score_factors ?? {}, language: r.language, title: r.title, reason: r.reason, actionType: r.action_type,
    hoursMin: r.estimated_hours_min, hoursMax: r.estimated_hours_max, expectedEvidence: r.expected_evidence,
    acceptanceCriteria: r.acceptance_criteria, learningResources: r.learning_resources, confidence: r.confidence,
    explanations: r.explanations ?? {},
  });
  return {
    async getProfile() {
      const { data, error } = await user.from("profiles").select("professional_goal, weekly_hours, recommendation_stale").maybeSingle();
      if (error || !data) throw new HttpError(403, "forbidden");
      return { goal: data.professional_goal, weeklyHours: data.weekly_hours, stale: data.recommendation_stale };
    },
    async getCompetencies() {
      const rows = ok(await user.from("competencies").select("id, slug, name_pt, name_en, status, priority_weight, is_current_focus, assessment_source").order("sort_order"));
      return rows.map((r) => ({ id: r.id, slug: r.slug, name: { "pt-PT": r.name_pt, "en-GB": r.name_en }, status: r.status,
        priorityWeight: r.priority_weight, isCurrentFocus: r.is_current_focus, assessmentSource: r.assessment_source }));
    },
    async getEvidence(lang: Lang) {
      const rows = ok(await user.from("evidence").select("competency_id, evidence_type, visibility, share_with_ai, is_client_work, title_pt, title_en, description_pt, description_en, occurred_at"));
      const pick = (pt, en) => (lang === "pt-PT" ? pt ?? en : en ?? pt) ?? null;
      return rows.map((r) => {
        const share = r.share_with_ai && !r.is_client_work;       // só o que foi autorizado sai da base de dados
        return { competencyId: r.competency_id, type: r.evidence_type, isPublic: r.visibility === "public", shareWithAi: share,
          title: share ? pick(r.title_pt, r.title_en) : null, description: share ? pick(r.description_pt, r.description_en) : null, occurredAt: r.occurred_at };
      });
    },
    async getResources() {
      const rows = ok(await user.from("learning_resources").select("id, title, provider, url, hours, competency_slugs, status"));
      return rows.map((r) => ({ id: r.id, title: r.title, provider: r.provider, url: r.url, hours: r.hours, competencySlugs: r.competency_slugs, status: r.status }));
    },
    async getFeedback() {
      const rows = ok(await user.from("recommendation_feedback").select("feedback, reason, created_at, recommendations(competency_id, kind)"));
      return rows.filter((r) => r.recommendations).map((r) => ({ competencyId: r.recommendations.competency_id, kind: r.recommendations.kind,
        feedback: r.feedback, reason: r.reason, createdAt: r.created_at }));
    },
    async getPastRecs() {
      const rows = ok(await user.from("recommendations").select("competency_id, kind, status, created_at").neq("status", "candidate"));
      return rows.map((r) => ({ competencyId: r.competency_id, kind: r.kind, status: r.status, createdAt: r.created_at }));
    },
    async getActiveRec() {
      const r = ok(await user.from("recommendations").select(recSelect).eq("status", "active").maybeSingle());
      return r ? toRec(r) : null;
    },
    async getRec(id) {
      const r = ok(await user.from("recommendations").select(recSelect).eq("id", id).maybeSingle());
      return r ? toRec(r) : null;
    },
    async getTopCandidates(n) {
      const rows = ok(await user.from("recommendations").select(recSelect).eq("status", "candidate").order("score", { ascending: false }).limit(n));
      return rows.map(toRec);
    },
    async replaceCandidates(c) {
      ok(await admin.from("recommendations").delete().eq("user_id", userId).eq("status", "candidate"));
      if (!c.length) return;
      ok(await admin.from("recommendations").insert(c.map((x) => ({
        user_id: userId, competency_id: x.competencyId, kind: x.kind, status: "candidate", score: x.score, score_factors: x.factors }))));
    },
    async reserve(kind, limit) {
      const { data, error } = await admin.rpc("reserve_ai_quota", { p_user: userId, p_kind: kind, p_limit: limit });
      if (error) { if (String(error.message).includes("quota_exceeded")) throw new QuotaError(); throw new Error(error.message); }
      return data as string;
    },
    async finishRun(id, r) {
      ok(await admin.from("analysis_runs").update({ status: r.status, model: r.model ?? null, input_tokens: r.inputTokens ?? null,
        output_tokens: r.outputTokens ?? null, cost_usd: r.costUsd ?? null, latency_ms: r.latencyMs ?? null, error_code: r.errorCode ?? null }).eq("id", id));
    },
    async activate(id, replaceId, content, runId) {
      ok(await admin.rpc("activate_recommendation", { p_user: userId, p_id: id, p_replace: replaceId, p_content: content, p_run: runId }));
    },
    async insertAssessments(rows, runId) {
      ok(await admin.from("competency_assessments").update({ state: "dismissed" }).eq("user_id", userId).eq("state", "suggested").in("competency_id", rows.map((r) => r.competencyId)));
      ok(await admin.from("competency_assessments").insert(rows.map((r) => ({ user_id: userId, competency_id: r.competencyId, language: r.language,
        suggested_status: r.status, suggested_confidence: r.confidence, found: r.found, missing: r.missing, run_id: runId }))));
    },
    async setExplanation(recId, key, value) {
      const cur = ok(await admin.from("recommendations").select("explanations").eq("id", recId).eq("user_id", userId).single());
      ok(await admin.from("recommendations").update({ explanations: { ...(cur.explanations ?? {}), [key]: value } }).eq("id", recId).eq("user_id", userId));
    },
  };
}

/** Cria o handler HTTP de uma função: CORS → JWT → corpo → lógica → resposta segura. */
export function serveFunction<B>(parse: (body: Record<string, unknown>) => B, run: (deps: Deps, body: B) => Promise<unknown>) {
  Deno.serve(async (req: Request) => {
    const cors = corsHeaders(req, ALLOWED_ORIGINS);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const origin = req.headers.get("origin");
      if (origin && !ALLOWED_ORIGINS.includes(origin)) throw new HttpError(403, "origin_not_allowed");
      const { userId, admin, user } = await authenticate(req);
      const body = parse(await readBody(req));
      const deps: Deps = {
        port: makePort(userId, admin, user), llm: new AnthropicLlm(), now: () => new Date(),
        limits: { analysis: num("LIMIT_ANALYSIS_PER_DAY", 2), generation: num("LIMIT_GENERATION_PER_DAY", 5), explanation: num("LIMIT_EXPLANATION_PER_DAY", 20) },
      };
      return json(await run(deps, body), 200, cors);
    } catch (e) {
      return errorResponse(e, cors);
    }
  });
}
