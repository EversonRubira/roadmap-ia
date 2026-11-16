// Candidatos de próxima etapa — regras DETERMINÍSTICAS.
//
// A pontuação serve apenas para ORDENAR candidatos. Não é uma medida científica
// nem uma avaliação da pessoa. Claude interpreta e explica os melhores
// candidatos; não decide sozinho entre todas as opções possíveis.

export type Kind = "learn" | "apply" | "consolidate" | "demonstrate";

export interface CompetencyIn {
  id: string; slug: string; status: "exploring" | "developing" | "applied";
  priorityWeight: number;         // 1..5 (relevância profissional)
  isCurrentFocus: boolean;
}
export interface EvidenceIn { competencyId: string; type: string; isPublic: boolean }
export interface ResourceIn { competencySlugs: string[]; status: string; hours: number | null }
export interface FeedbackIn {
  competencyId: string; kind: Kind;
  feedback: "accepted" | "rejected" | "deferred" | "already_known" | "completed";
  reason: string | null; createdAt: string;
}
export interface PastRecIn { competencyId: string; kind: Kind; status: string; createdAt: string }

export interface Candidate {
  competencyId: string; slug: string; kind: Kind; score: number;
  factors: Factors; missingGroups: Group[];
}
export interface Factors {
  knowledge_gap: number; professional_relevance: number; project_applicability: number;
  evidence_value: number; estimated_effort: number; recent_recommendations: number; user_feedback: number;
}
export type Group = "theory" | "practice" | "quality" | "showcase";

// Pesos (ajustáveis; documentados em docs/ARCHITECTURE.md)
export const WEIGHTS = {
  knowledge_gap: 3, professional_relevance: 2, project_applicability: 1.5,
  evidence_value: 1.5, estimated_effort: 1, recent_recommendations: -2, user_feedback: -3,
} as const;

const THEORY = new Set(["course"]);
const PRACTICE = new Set(["implementation", "production", "personal_project", "professional_experience", "experiment"]);
const QUALITY = new Set(["tests", "llm_evaluation", "documentation", "architecture_decision"]);

export const KIND_HOURS: Record<Kind, [number, number]> = {
  learn: [8, 12], apply: [4, 8], consolidate: [3, 6], demonstrate: [2, 4],
};
const DAY = 86_400_000;

export function groupsOf(evidence: EvidenceIn[]): Record<Group, boolean> {
  return {
    theory: evidence.some((e) => THEORY.has(e.type)),
    practice: evidence.some((e) => PRACTICE.has(e.type)),
    quality: evidence.some((e) => QUALITY.has(e.type)),
    showcase: evidence.some((e) => e.isPublic) || evidence.some((e) => e.type === "presentation"),
  };
}

/** Tipo de recomendação que falta (ou null se não falta nada de relevante). */
export function eligibleKinds(g: Record<Group, boolean>, hasResources: boolean): Kind[] {
  const kinds: Kind[] = [];
  if (!g.practice) {
    kinds.push(g.theory ? "apply" : "learn");
    if (!g.theory) kinds.push("apply"); // uma implementação pequena pode valer mais do que outro curso
  } else if (!g.quality) {
    kinds.push("consolidate");
    if (!g.theory && hasResources) kinds.push("learn");
  } else if (!g.showcase) {
    kinds.push("demonstrate");
  }
  return kinds;
}

export interface Input {
  now: Date;
  weeklyHours: number;
  competencies: CompetencyIn[];
  evidence: EvidenceIn[];
  resources: ResourceIn[];
  feedback: FeedbackIn[];
  pastRecs: PastRecIn[];
}
export interface Result { candidates: Candidate[]; needsReview: string[] }

export function buildCandidates(input: Input): Result {
  const { now } = input;
  const anyPracticeElsewhere = (cid: string) =>
    input.evidence.some((e) => e.competencyId !== cid && PRACTICE.has(e.type));
  const needsReview: string[] = [];
  const all: Candidate[] = [];

  for (const c of input.competencies) {
    const ev = input.evidence.filter((e) => e.competencyId === c.id);
    const g = groupsOf(ev);
    const hasResources = input.resources.some((r) => r.status === "available" && r.competencySlugs.includes(c.slug));
    const fb = input.feedback.filter((f) => f.competencyId === c.id);

    // "avaliação incorreta": não recomendar nada até o utilizador rever a competência
    if (fb.some((f) => f.reason === "wrong_assessment" && age(f.createdAt, now) < 30)) { needsReview.push(c.slug); continue; }

    const known = fb.some((f) => f.feedback === "already_known" || f.reason === "already_know");
    let kinds = eligibleKinds(g, hasResources);
    // "Já domino": deixa de sugerir base teórica e primeira implementação desta competência
    if (known) kinds = kinds.filter((k) => k === "consolidate" || k === "demonstrate");
    if (known && kinds.length === 0) kinds = !g.quality ? ["consolidate"] : !g.showcase ? ["demonstrate"] : [];

    const covered = Object.values(g).filter(Boolean).length;
    let best: Candidate | null = null;
    for (const kind of kinds) {
      const factors = factorsFor(c, kind, ev, g, covered, input, fb, anyPracticeElsewhere(c.id));
      const score = round(
        Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * factors[k as keyof Factors], 0),
      );
      const missing = (Object.keys(g) as Group[]).filter((k) => !g[k]);
      const cand: Candidate = { competencyId: c.id, slug: c.slug, kind, score, factors, missingGroups: missing };
      if (!best || cand.score > best.score) best = cand;
    }
    if (best) all.push(best);
  }
  all.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return { candidates: all, needsReview };
}

function factorsFor(
  c: CompetencyIn, kind: Kind, ev: EvidenceIn[], g: Record<Group, boolean>, covered: number,
  input: Input, fb: FeedbackIn[], practiceElsewhere: boolean,
): Factors {
  const { now } = input;
  const knowledge_gap = 1 - covered / 4;
  const professional_relevance = Math.min(1, (c.priorityWeight - 1) / 4 + (c.isCurrentFocus ? 0.15 : 0));
  const project_applicability = kind === "learn" ? 0.5
    : kind === "apply" ? (g.practice || practiceElsewhere ? 1 : 0.5) : 1;
  const base = { learn: 0.4, apply: 0.8, consolidate: 0.9, demonstrate: 1 }[kind];
  const evidence_value = base * (1 - Math.min(ev.length, 5) / 10);

  const [lo, hi] = KIND_HOURS[kind];
  const mid = (lo + hi) / 2;
  const tooMuchEffort = fb.some((f) => f.reason === "too_much_effort" && f.kind === kind && age(f.createdAt, now) < 30);
  const estimated_effort = Math.max(0, 1 - Math.min(mid / (tooMuchEffort ? 10 : 20), 1));

  const recent = input.pastRecs.filter((r) => r.competencyId === c.id && r.kind === kind && r.status !== "candidate");
  const newest = recent.reduce((m, r) => Math.min(m, age(r.createdAt, now)), Infinity);
  const recent_recommendations = newest < 7 ? 1 : newest < 14 ? 0.5 : 0;

  let user_feedback = 0;
  for (const f of fb) {
    const w = age(f.createdAt, now) < 30 ? 1 : 0.5;
    if (f.feedback === "rejected") {
      if (f.reason === "not_relevant") user_feedback += 1 * w;
      else if (f.reason === "not_applicable" && f.kind === kind) user_feedback += 1 * w;
      else if (f.reason === "other_area") user_feedback += 0.6 * w;
      else if (f.reason === "too_much_effort" && f.kind === kind) user_feedback += 0.3 * w;
      else if (f.kind === kind) user_feedback += 0.3 * w;
    } else if (f.feedback === "deferred" && age(f.createdAt, now) < 7) {
      user_feedback += 0.5;
    }
  }
  return {
    knowledge_gap: round(knowledge_gap), professional_relevance: round(professional_relevance),
    project_applicability: round(project_applicability), evidence_value: round(evidence_value),
    estimated_effort: round(estimated_effort), recent_recommendations,
    user_feedback: round(Math.min(user_feedback, 1.5)),
  };
}

const age = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / DAY;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Guarda determinística: "Applied" exige evidência prática; um curso nunca chega. */
export function capSuggestedStatus(
  suggested: "exploring" | "developing" | "applied", g: Record<Group, boolean>,
): { status: "exploring" | "developing" | "applied"; capped: boolean } {
  if (suggested === "applied" && !(g.practice && g.quality)) return { status: g.practice || g.theory ? "developing" : "exploring", capped: true };
  if (suggested === "developing" && !g.practice && !g.theory) return { status: "exploring", capped: true };
  return { status: suggested, capped: false };
}
