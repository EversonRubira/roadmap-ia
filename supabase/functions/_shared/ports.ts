// Contratos entre os handlers (lógica) e a infraestrutura (Supabase, Claude).
// Os handlers só dependem destas interfaces => testáveis sem rede.
import type { Candidate, FeedbackIn, Kind, PastRecIn } from "./candidates.ts";
import type { JsonSchema } from "./schemas.ts";

export type Lang = "pt-PT" | "en-GB";
export type RunKind = "analysis" | "generation" | "explanation";

export interface ProfileRow { goal: string | null; weeklyHours: number; stale: boolean }
export interface CompRow {
  id: string; slug: string; name: Record<Lang, string>; status: "exploring" | "developing" | "applied";
  priorityWeight: number; isCurrentFocus: boolean; assessmentSource: "default" | "ai" | "user";
}
export interface EvRow {
  competencyId: string; type: string; isPublic: boolean; shareWithAi: boolean;
  title: string | null; description: string | null; occurredAt: string;  // já no idioma pedido (ou null)
}
export interface ResRow { id: string; title: string; provider: string; url: string | null; hours: number | null; competencySlugs: string[]; status: string }
export interface RecRow {
  id: string; competencyId: string; slug: string; kind: Kind; status: string; score: number;
  factors: Record<string, number>; language: Lang | null; title: string | null; reason: string | null;
  actionType: string | null; hoursMin: number | null; hoursMax: number | null;
  expectedEvidence: string[] | null; acceptanceCriteria: string[] | null;
  learningResources: { title: string; provider: string; url: string | null }[] | null;
  confidence: string | null; explanations: Record<string, unknown>;
}
export interface RunResult {
  status: "ok" | "error"; model?: string; inputTokens?: number; outputTokens?: number;
  costUsd?: number; latencyMs?: number; errorCode?: string;
}

export interface Port {
  getProfile(): Promise<ProfileRow>;
  getCompetencies(): Promise<CompRow[]>;
  getEvidence(lang: Lang): Promise<EvRow[]>;
  getResources(): Promise<ResRow[]>;
  getFeedback(): Promise<FeedbackIn[]>;
  getPastRecs(): Promise<PastRecIn[]>;
  getActiveRec(): Promise<RecRow | null>;
  getRec(id: string): Promise<RecRow | null>;
  getTopCandidates(n: number): Promise<RecRow[]>;
  replaceCandidates(c: Candidate[]): Promise<void>;
  reserve(kind: RunKind, limit: number): Promise<string>;     // lança QuotaError
  finishRun(id: string, r: RunResult): Promise<void>;
  activate(id: string, replaceId: string | null, content: unknown, runId: string): Promise<void>;
  insertAssessments(rows: AssessmentInsert[], runId: string): Promise<void>;
  setExplanation(recId: string, key: string, value: unknown): Promise<void>;
}
export interface AssessmentInsert {
  competencyId: string; language: Lang; status: string; confidence: string; found: string[]; missing: string[];
}

export interface LlmRequest { system: string; user: string; schema: JsonSchema; maxTokens: number; effort: "low" | "medium" | "high" }
export interface LlmResponse { json: unknown; model: string; inputTokens: number; outputTokens: number; latencyMs: number }
export interface Llm { complete(req: LlmRequest): Promise<LlmResponse> }

export interface Limits { analysis: number; generation: number; explanation: number }
export interface Deps { port: Port; llm: Llm; limits: Limits; now: () => Date }

export class QuotaError extends Error { constructor() { super("quota_exceeded"); } }
export class HttpError extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
