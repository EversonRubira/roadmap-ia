import { serveFunction } from "../_shared/runtime.ts";
import { parseLang, parseUuid } from "../_shared/http.ts";
import { generateNextStep } from "./handler.ts";

serveFunction(
  (b) => ({ language: parseLang(b.language), replaceId: b.replaceId == null ? null : parseUuid(b.replaceId) }),
  generateNextStep,
);
