import { serveFunction } from "../_shared/runtime.ts";
import { parseLang } from "../_shared/http.ts";
import { HttpError } from "../_shared/ports.ts";
import { analyse } from "./handler.ts";

serveFunction(
  (b) => {
    if (b.mode !== "candidates" && b.mode !== "full") throw new HttpError(400, "invalid_mode");
    return { mode: b.mode as "candidates" | "full", language: parseLang(b.language) };
  },
  analyse,
);
