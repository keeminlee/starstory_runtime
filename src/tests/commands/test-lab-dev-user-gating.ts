import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  cfg: {
    access: { devUserIds: ["dev-user"] },
    logging: { level: "warn", scopes: [], format: "pretty" },
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/lab dev user gating", () => {
  test("non-dev user is denied with ephemeral response", async () => {
    const { lab } = await import("../../commands/lab.js");
    const reply = vi.fn(async () => {});

    await lab.execute(
      {
        user: { id: "someone-else" },
        options: {
          getSubcommandGroup: () => "actions",
          getSubcommand: () => "tail",
        },
        reply,
      } as any,
      null
    );

    expect(reply).toHaveBeenCalledWith({
      content: "Not authorized. /lab is restricted to development allowlists.",
      ephemeral: true,
    });
  });

  test("dev user passes dev gate", async () => {
    const { lab } = await import("../../commands/lab.js");
    const reply = vi.fn(async () => {});

    await lab.execute(
      {
        user: { id: "dev-user" },
        options: {
          getSubcommandGroup: () => "unknown",
          getSubcommand: () => "noop",
        },
        reply,
      } as any,
      null
    );

    expect(reply).toHaveBeenCalledWith({
      content: "Unknown /lab family: unknown",
      ephemeral: true,
    });
  });
});
