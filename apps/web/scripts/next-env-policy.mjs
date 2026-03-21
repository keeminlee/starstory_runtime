import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..", "..");

function resolveMode() {
  const explicit = process.env.MEEPO_ENV_POLICY_MODE?.trim();
  if (explicit === "development-dotenv" || explicit === "production-host" || explicit === "test-hermetic") {
    return explicit;
  }
  if (process.env.NODE_ENV === "production") {
    return "production-host";
  }
  if (process.env.NODE_ENV === "test") {
    return "test-hermetic";
  }
  return "development-dotenv";
}

function relativeRepoPath(filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.basename(filePath);
  }
  return relative.replace(/\\/g, "/");
}

function fingerprint(value) {
  const trimmed = value.trim();
  return {
    present: true,
    fingerprint: crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 8),
    suffix: trimmed.slice(-4),
  };
}

function buildKeyState() {
  const keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "AUTH_SECRET", "DISCORD_TOKEN"];
  return Object.fromEntries(
    keys.map((key) => {
      const value = process.env[key];
      return [key, value && value.trim().length > 0 ? fingerprint(value) : { present: false }];
    })
  );
}

export function getWebEnvPolicyDiagnostics() {
  const candidates = [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.local"),
    path.join(webRoot, ".env"),
    path.join(webRoot, ".env.local"),
  ];
  const detectedFiles = [...new Set(candidates.filter((candidate) => fs.existsSync(candidate)).map(relativeRepoPath))];
  const mode = resolveMode();
  return {
    env_policy_mode: mode,
    env_policy_consumer: "web",
    detected_dotenv_files: detectedFiles,
    loaded_dotenv_files: [],
    ignored_dotenv_files: mode === "development-dotenv" ? [] : detectedFiles,
    forbidden_dotenv_files: mode === "production-host" ? detectedFiles : [],
    llm_provider: process.env.LLM_PROVIDER?.trim() || "openai",
    key_state: buildKeyState(),
  };
}

export function enforceWebEnvPolicy() {
  const diagnostics = getWebEnvPolicyDiagnostics();
  if (diagnostics.env_policy_mode === "production-host" && diagnostics.forbidden_dotenv_files.length > 0) {
    throw new Error(
      `[env-policy] Production host mode forbids repo-local dotenv files: ${diagnostics.forbidden_dotenv_files.join(", ")}. Remove those files from the runtime workspace, or use MEEPO_ENV_POLICY_MODE=development-dotenv only for local non-production runs.`
    );
  }
  return diagnostics;
}