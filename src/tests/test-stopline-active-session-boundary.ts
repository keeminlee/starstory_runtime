import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("stopline:active-session-boundary fails when src file mutates active_session_id", () => {
  const tempFile = path.join(process.cwd(), "src", `__active_session_probe_${Date.now()}.ts`);
  const source = [
    "export function probe(): void {",
    "  const sql = \"UPDATE guild_runtime_state SET active_session_id = ? WHERE guild_id = ?\";",
    "  void sql;",
    "}",
    "",
  ].join("\n");

  fs.writeFileSync(tempFile, source, "utf8");

  try {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(command, ["run", "stopline:active-session-boundary"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
    });

    expect(result.status).not.toBe(0);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});
