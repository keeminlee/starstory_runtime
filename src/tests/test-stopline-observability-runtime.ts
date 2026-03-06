import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("stopline:observability-runtime fails on raw console usage in strict runtime zones", () => {
  const runtimeDir = path.join(process.cwd(), "src", "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });

  const tempFile = path.join(runtimeDir, `__observability_probe_${Date.now()}.ts`);
  const source = [
    "export function probe(): void {",
    "  console.log('raw runtime console usage');",
    "}",
    "",
  ].join("\n");

  fs.writeFileSync(tempFile, source, "utf8");

  try {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(command, ["run", "stopline:observability-runtime"], {
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
