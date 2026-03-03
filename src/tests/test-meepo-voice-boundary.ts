import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Hit = { file: string; line: number; text: string };

function scanFile(filePath: string): Hit[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hits: Hit[] = [];

  const patterns = [
    /interaction\.(reply|editReply|followUp)\(\s*['"`]/,
    /interaction\.(reply|editReply|followUp)\(\s*\{\s*content\s*:\s*['"`]/,
    /\b(reply|editReply|followUp)\(\s*['"`]/,
    /\b(reply|editReply|followUp)\(\s*\{\s*content\s*:\s*['"`]/,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("metaMeepoVoice.")) {
      continue;
    }

    if (patterns.some((pattern) => pattern.test(line))) {
      hits.push({ file: filePath, line: index + 1, text: line.trim() });
    }
  }

  return hits;
}

describe("meepo app-facing strings boundary", () => {
  it("does not allow raw literal replies in meepo command handlers", () => {
    const root = process.cwd();
    const files = [
      path.join(root, "src", "commands", "meepo.ts"),
      path.join(root, "src", "commands", "index.ts"),
    ];

    const hits = files.flatMap((filePath) => scanFile(filePath));

    expect(hits, hits.map((hit) => `${hit.file}:${hit.line} ${hit.text}`).join("\n")).toEqual([]);
  });
});
