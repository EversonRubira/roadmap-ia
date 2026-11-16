import type { JsonSchema } from "./schemas.ts";

/** Validador mínimo de JSON Schema (o subconjunto usado em schemas.ts). Devolve lista de erros; vazia = válido. */
export function validate(schema: JsonSchema, value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const actual = typeOf(value);

  if (types.length && !types.some((t) => matches(t, value))) {
    return [`${path}: esperado ${types.join("|")}, recebido ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push(`${path}: valor fora do enum`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) errors.push(`${path}: texto vazio ou curto`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: texto demasiado longo`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: abaixo do mínimo`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: acima do máximo`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: poucos itens`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: itens a mais`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items!, v, `${path}[${i}]`)));
  }
  if (actual === "object" && schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) errors.push(`${path}.${k}: em falta`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties[k];
      if (!sub) { if (schema.additionalProperties === false) errors.push(`${path}.${k}: propriedade não permitida`); continue; }
      errors.push(...validate(sub, v, `${path}.${k}`));
    }
  }
  return errors;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function matches(t: string, v: unknown): boolean {
  switch (t) {
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "null": return v === null;
    case "array": return Array.isArray(v);
    case "object": return typeof v === "object" && v !== null && !Array.isArray(v);
    default: return typeof v === t;
  }
}
