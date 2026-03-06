import { describe, expect, test } from "vitest";
import { formatUserFacingError } from "../errors/formatUserFacingError.js";
import { MeepoError } from "../errors/meepoError.js";

describe("formatUserFacingError", () => {
  test("raw Error maps deterministically to ERR_UNKNOWN", () => {
    const payload = formatUserFacingError(new Error("boom"));
    expect(payload.code).toBe("ERR_UNKNOWN");
    expect(payload.content).toContain("(ERR_UNKNOWN)");
    expect(payload.content).not.toContain("trace=");
  });

  test("MeepoError userMessage is preserved and includes code", () => {
    const payload = formatUserFacingError(
      new MeepoError("ERR_TTS_FAILED", {
        userMessage: "Voice output failed.",
        trace_id: "trace123",
      })
    );

    expect(payload.code).toBe("ERR_TTS_FAILED");
    expect(payload.content).toContain("Voice output failed.");
    expect(payload.content).toContain("(ERR_TTS_FAILED)");
    expect(payload.content).toContain("trace=trace123");
  });

  test("code-only MeepoError gets deterministic fallback + optional trace override", () => {
    const payload = formatUserFacingError(new MeepoError("ERR_LLM_RATE_LIMIT"), {
      trace_id: "trace-override",
    });

    expect(payload.code).toBe("ERR_LLM_RATE_LIMIT");
    expect(payload.content).toContain("(ERR_LLM_RATE_LIMIT)");
    expect(payload.content).toContain("trace=trace-override");
  });
});
