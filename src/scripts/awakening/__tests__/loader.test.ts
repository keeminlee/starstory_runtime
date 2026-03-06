import { describe, expect, it } from "vitest";
import { loadAwakenScript } from "../_loader.js";
import { validateAwakenScript } from "../_schema.js";

describe("awakening script loader", () => {
  it("loads latest meepo_awaken script successfully", async () => {
    const script = await loadAwakenScript("meepo_awaken");

    expect(script.id).toBe("meepo_awaken");
    expect(script.version).toBe(3);
    expect(script.start_scene).toBe("cold_open");
  });

  it("fails if start_scene is missing from scenes", () => {
    expect(() =>
      validateAwakenScript({
        id: "meepo_awaken",
        version: 1,
        start_scene: "cold_open",
        scenes: {
          dm_role: {
            say: "hello",
          },
        },
      }),
    ).toThrow(/start_scene/);
  });

  it("fails if next points to unknown scene", () => {
    expect(() =>
      validateAwakenScript({
        id: "meepo_awaken",
        version: 1,
        start_scene: "cold_open",
        scenes: {
          cold_open: {
            say: "hello",
            next: "missing_scene",
          },
        },
      }),
    ).toThrow(/unknown scene/);
  });
});
