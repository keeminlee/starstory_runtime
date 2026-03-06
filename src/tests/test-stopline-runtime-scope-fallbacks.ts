import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("stopline:runtime-scope-fallbacks fails when runtime command uses loadRegistry() fallback", () => {
  const tempFile = path.join(process.cwd(), "src", "commands", `__scope_probe_${Date.now()}.ts`);
  const source = [
    'import { loadRegistry } from "../registry/loadRegistry.js";',
    "export function probe(): void {",
    "  loadRegistry();",
    "}",
    "",
  ].join("\n");

  fs.writeFileSync(tempFile, source, "utf8");

  try {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(command, ["run", "stopline:runtime-scope-fallbacks"], {
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
