import { estimateCostUsd } from "./cost.ts";
import type { JsonSchema } from "./schemas.ts";
import { toApiSchema } from "./schemas.ts";
import { HttpError, QuotaError } from "./ports.ts";
import type { Deps, LlmResponse, RunKind } from "./ports.ts";

export async function reserveOrThrow(deps: Deps, kind: RunKind): Promise<string> {
  try {
    return await deps.port.reserve(kind, deps.limits[kind]);
  } catch (e) {
    if (e instanceof QuotaError) throw new HttpError(429, "quota_exceeded");
    throw e;
  }
}

type Check<T> = (json: unknown) => { ok: true; value: T } | { ok: false; errors: string[] };

/** Chama Claude, valida a saída e regista a execução. Nada é persistido se a validação falhar. */
export async function callAndCheck<T>(
  deps: Deps, runId: string,
  req: { system: string; user: string; schema: JsonSchema; maxTokens: number; effort: "low" | "medium" | "high" },
  check: Check<T>,
): Promise<{ value: T; res: LlmResponse }> {
  let res: LlmResponse;
  try {
    res = await deps.llm.complete({ ...req, schema: toApiSchema(req.schema) });
  } catch (_e) {
    await deps.port.finishRun(runId, { status: "error", errorCode: "llm_error" });
    throw new HttpError(502, "llm_unavailable");
  }
  const checked = check(res.json);
  if (!checked.ok) {
    await deps.port.finishRun(runId, usage(res, { status: "error", errorCode: "invalid_model_output" }));
    throw new HttpError(502, "invalid_model_output");
  }
  return { value: checked.value, res };
}

export const usage = (res: LlmResponse, extra: { status: "ok" | "error"; errorCode?: string }) => ({
  ...extra, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens,
  costUsd: estimateCostUsd(res.model, res.inputTokens, res.outputTokens), latencyMs: res.latencyMs,
});
