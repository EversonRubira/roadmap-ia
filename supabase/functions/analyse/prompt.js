// Constrói as mensagens para o modelo. O contexto vem sempre do servidor (nunca do browser).
const LANG_NAME = { "pt-PT": "European Portuguese (Portugal)", "en-GB": "British English" };

const pick = (o, lang) => (o ? (lang === "pt-PT" ? o.pt : o.en) || o.pt || o.en || "" : "");

export function buildMessages(ctx) {
  const { lang, objective, competencies, baseline, courses, history, previous } = ctx;
  const levels = new Map((baseline?.competencies || []).map((c) => [c.id, c]));
  const compLines = competencies.map((c) => {
    const b = levels.get(c.id);
    const name = lang === "pt-PT" ? c.name_pt : c.name_en;
    return `- ${c.id} (${name}): nível ${b ? b.level : "?"}/3, confiança ${b ? b.confidence : "?"}${b?.gap ? `; falta observar: ${pick(b.gap, lang)}` : ""}`;
  }).join("\n");

  const system = [
    "You are the Learning Advisor of a personal learning journey toward AI Application Engineer / AI Engineer.",
    "You recommend. The person decides. You never judge intelligence, talent, professional worth or seniority, and you never produce scores or percentages.",
    "You only see: the stated professional objective, the registered courses, the learning history, the previous analysis and the competency levels already recorded.",
    "You do NOT see the person's code repositories in this phase. Never claim or imply knowledge about their projects beyond the recorded competency levels.",
    "The recorded competency levels come from a real inspection of the repositories. Treat them as given. Do not change or contradict them.",
    "Principles: projects are evidence; courses are resources and never raise a level on their own; absence of evidence is not absence of knowledge.",
    "Never recommend adding a technology (RAG, MCP, agents, vector database, observability...) to an existing project just to fill a competency. Prefer a course, documentation, a lab, a POC, an experiment or a small separate project.",
    "action_type rules: LEARN if foundation is missing; APPLY if there is knowledge but no application (if a course was completed and the level did not rise, prefer APPLY); CONSOLIDATE if there is an implementation but it lacks robustness; DEMONSTRATE if the competence probably exists but verifiable evidence is thin.",
    "Choose ONE current_focus (a competency id from the list) and ONE next_action. Be concrete and short. expected_evidence lists verifiable artefacts, not intentions.",
    "public_summary is one or two neutral sentences suitable for a public portfolio: no private notes, no course names that are private, no confidence, no costs.",
    `Write every text field directly in ${LANG_NAME[lang]}. Do not mix languages. Respond only with the JSON object.`,
  ].join("\n");

  const user = [
    `Professional objective: ${objective}`,
    "",
    "Competencies and recorded levels (0 not observed, 1 knowledge, 2 applied, 3 consolidated):",
    compLines,
    "",
    baseline ? `Last real analysis (${baseline.date}) focus: ${baseline.focus?.competency}. Its recorded reason: ${pick(baseline.focus?.why, lang)}` : "No real analysis recorded.",
    "",
    "Registered courses:",
    courses.length ? courses.map((c) => `- ${c.name} (${c.platform || "?"}) competency=${c.competency_id || "none"} status=${c.status}${c.completed_on ? ` completed=${c.completed_on}` : ""}`).join("\n") : "- none",
    "",
    "Learning history (most recent first):",
    history.length ? history.map((x) => `- ${x.occurred_on}: ${x.note}`).join("\n") : "- none",
    "",
    previous ? `Previous advisor recommendation (${previous.created_at.slice(0, 10)}): focus=${previous.result.current_focus}, type=${previous.result.action_type}, action=${previous.result.next_action}` : "No previous advisor recommendation.",
  ].join("\n");

  return [{ role: "system", content: system }, { role: "user", content: user }];
}
