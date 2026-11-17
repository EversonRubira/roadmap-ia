// Interface mínima: um advisor recebe o contexto e devolve uma recomendação validada.
//   analyse(context) -> { result, model }
// Para trocar de fornecedor (por exemplo Claude) basta escrever outra classe com o mesmo método.
import { buildMessages } from "./prompt.js";
import { resultSchema, validateResult } from "./schema.js";

export class AdvisorError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

export class GroqLearningAdvisor {
  constructor({ apiKey, model = "openai/gpt-oss-120b", fetchImpl = fetch, timeoutMs = 45000 }) {
    this.apiKey = apiKey; this.model = model; this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
  }

  async #call(messages, ids) {
    const res = await this.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        messages,
        response_format: { type: "json_schema", json_schema: { name: "learning_recommendation", strict: true, schema: resultSchema(ids) } },
      }),
    });
    if (!res.ok) throw new AdvisorError("provider_error", `groq ${res.status}`);
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    try { return JSON.parse(content); } catch (_e) { return null; }
  }

  /** Uma tentativa e uma repetição se a resposta não cumprir o contrato. */
  async analyse(context) {
    const ids = context.competencies.map((c) => c.id);
    const messages = buildMessages(context);
    let last = ["resposta vazia"];
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.#call(messages, ids);
      const v = validateResult(raw, ids);
      if (v.ok) return { result: v.value, model: this.model };
      last = v.errors;
    }
    throw new AdvisorError("invalid_response", last.join("; "));
  }
}
