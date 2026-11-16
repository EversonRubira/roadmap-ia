import { HttpError } from "./ports.ts";

export function corsHeaders(req: Request, allowed: string[]): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** Converte qualquer erro em resposta segura: só um código curto, nunca mensagem interna ou stack. */
export function errorResponse(e: unknown, cors: Record<string, string>): Response {
  if (e instanceof HttpError) return json({ error: { code: e.code } }, e.status, cors);
  console.error("internal_error:", e instanceof Error ? e.message : "unknown");
  return json({ error: { code: "internal_error" } }, 500, cors);
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
  try {
    const text = await req.text();
    if (text.length > 20_000) throw new HttpError(413, "payload_too_large");
    const v = JSON.parse(text || "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new HttpError(400, "invalid_body");
    return v as Record<string, unknown>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "invalid_body");
  }
}

export const parseLang = (v: unknown) => {
  if (v !== "pt-PT" && v !== "en-GB") throw new HttpError(400, "invalid_language");
  return v;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const parseUuid = (v: unknown) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, "invalid_id");
  return v;
};
