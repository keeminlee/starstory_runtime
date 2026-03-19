import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEPRECATED_KEYS = ["DEBUG_LATCH", "DB_PATH", "TTS_MAX_CHARS_PER_CHUNK"] as const;
const mutableEnv = process.env as Record<string, string | undefined>;

const emptyDotenvPath = path.join(os.tmpdir(), "meepo-vitest-empty.env");
if (!fs.existsSync(emptyDotenvPath)) {
  fs.writeFileSync(emptyDotenvPath, "", "utf8");
}

mutableEnv.DOTENV_CONFIG_PATH = emptyDotenvPath;
mutableEnv.DOTENV_CONFIG_OVERRIDE = "false";

for (const key of DEPRECATED_KEYS) {
  if (mutableEnv[key] !== undefined) {
    delete mutableEnv[key];
  }
}

mutableEnv.MIGRATIONS_SILENT = "1";
mutableEnv.NODE_ENV = "test";
mutableEnv.DISCORD_TOKEN ??= "test-token";
mutableEnv.OPENAI_API_KEY ??= "test-openai-key";
