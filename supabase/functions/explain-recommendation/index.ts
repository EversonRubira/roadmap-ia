import { serveFunction } from "../_shared/runtime.ts";
import { parseLang, parseUuid } from "../_shared/http.ts";
import { explain } from "./handler.ts";

serveFunction(
  (b) => ({ recommendationId: parseUuid(b.recommendationId), question: String(b.question ?? ""), language: parseLang(b.language) }),
  explain,
);
