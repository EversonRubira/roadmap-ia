import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateResult, resultSchema, ACTION_TYPES } from "../../supabase/functions/analyse/schema.js";
import { buildMessages } from "../../supabase/functions/analyse/prompt.js";
import { GroqLearningAdvisor, AdvisorError } from "../../supabase/functions/analyse/advisor.js";

const model = JSON.parse(readFileSync("data/competencias.json", "utf8"));
const baseline = JSON.parse(readFileSync("data/analises/latest.json", "utf8"));
const ids = model.competencies.map((c) => c.id);
const good = { current_focus: "retrieval-rag", reason: "Falta evidência de retrieval.", next_action: "Construir um laboratório pequeno.", action_type: "APPLY", skills_to_learn: ["embeddings"], expected_evidence: ["recall@3"], public_summary: "A aprofundar retrieval." };
const ctx = (lang = "pt-PT") => ({ lang, objective: "AI Application Engineer", competencies: model.competencies, baseline, courses: [{ name: "LangChain", platform: "Alura", competency_id: "llm-integration", status: "completed", completed_on: "2026-05-01" }], history: [], previous: null });

test("validação aceita uma resposta correta e remove campos desconhecidos", () => {
  const v = validateResult({ ...good, extra: "x" }, ids);
  assert.ok(v.ok); assert.ok(!("extra" in v.value));
});
test("validação rejeita competência fora da lista, tipo inválido, listas vazias e texto longo", () => {
  for (const bad of [{ current_focus: "outra" }, { action_type: "STUDY" }, { expected_evidence: [] }, { reason: "x".repeat(701) }, { skills_to_learn: "embeddings" }, { next_action: "  " }]) {
    assert.equal(validateResult({ ...good, ...bad }, ids).ok, false, JSON.stringify(bad));
  }
  assert.equal(validateResult(null, ids).ok, false);
  assert.equal(validateResult([good], ids).ok, false);
});
test("schema estrito: todos os campos obrigatórios, sem propriedades extra, foco limitado às competências", () => {
  const s = resultSchema(ids);
  assert.equal(s.additionalProperties, false);
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
  assert.deepEqual(s.properties.current_focus.enum, ids);
  assert.deepEqual(s.properties.action_type.enum, ACTION_TYPES);
});
test("prompt: idioma pedido, níveis reais e aviso de que não vê repositórios", () => {
  const pt = buildMessages(ctx("pt-PT")); const en = buildMessages(ctx("en-GB"));
  assert.match(pt[0].content, /European Portuguese/); assert.match(en[0].content, /British English/);
  assert.match(pt[0].content, /do NOT see the person's code repositories/);
  assert.match(pt[1].content, /retrieval-rag \(Retrieval e RAG\): nível 0\/3/);
  assert.match(en[1].content, /retrieval-rag \(Retrieval & RAG\)/);
  assert.match(pt[1].content, /LangChain/);
});
test("prompt não contém segredos nem pede alteração dos níveis registados", () => {
  const p = buildMessages(ctx()).map((m) => m.content).join("\n");
  assert.ok(!/api[_-]?key|service_role/i.test(p));
  assert.match(p, /Do not change or contradict them/);
});

const groq = (...contents) => { let i = 0; const calls = []; const f = async (url, init) => { calls.push({ url, init }); const c = contents[Math.min(i++, contents.length - 1)]; return c instanceof Error ? Promise.reject(c) : new Response(JSON.stringify(c.status ? c.body ?? {} : { choices: [{ message: { content: typeof c === "string" ? c : JSON.stringify(c) } }] }), { status: c.status || 200 }); }; return { f, calls }; };

test("advisor Groq: envia json_schema estrito, Bearer só no servidor e devolve resultado validado", async () => {
  const { f, calls } = groq(good);
  const r = await new GroqLearningAdvisor({ apiKey: "k", fetchImpl: f }).analyse(ctx());
  assert.equal(r.result.current_focus, "retrieval-rag"); assert.equal(r.model, "openai/gpt-oss-120b");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.response_format.type, "json_schema"); assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(calls[0].init.headers.Authorization, "Bearer k");
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
});
test("advisor Groq: repete uma vez quando a resposta não cumpre o contrato", async () => {
  const { f, calls } = groq({ ...good, action_type: "STUDY" }, good);
  const r = await new GroqLearningAdvisor({ apiKey: "k", fetchImpl: f }).analyse(ctx());
  assert.equal(r.result.action_type, "APPLY"); assert.equal(calls.length, 2);
});
test("advisor Groq: duas respostas inválidas ou erro do fornecedor dão erro controlado", async () => {
  await assert.rejects(new GroqLearningAdvisor({ apiKey: "k", fetchImpl: groq("não é json").f }).analyse(ctx()), (e) => e instanceof AdvisorError && e.code === "invalid_response");
  await assert.rejects(new GroqLearningAdvisor({ apiKey: "k", fetchImpl: groq({ status: 429 }).f }).analyse(ctx()), (e) => e instanceof AdvisorError && e.code === "provider_error");
});
