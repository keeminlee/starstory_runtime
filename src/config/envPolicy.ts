import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";
import type {
  EnvPolicyConsumer,
  EnvPolicyMode,
  EnvPolicySecretDiagnostic,
  EnvPolicySnapshot,
  LlmProvider,
  SttProvider,
} from "./types.js";

type InitializeEnvPolicyOptions = {
  consumer?: EnvPolicyConsumer;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  mode?: EnvPolicyMode;
  repoRoot?: string;
  webRoot?: string;
  forceReload?: boolean;
};

type EnvStartupDiagnostics = {
  env_policy_mode: EnvPolicyMode;
  env_policy_consumer: EnvPolicyConsumer;
  llm_provider?: LlmProvider;
  stt_provider?: SttProvider;
  detected_dotenv_files: string[];
  loaded_dotenv_files: string[];
  ignored_dotenv_files: string[];
  forbidden_dotenv_files: string[];
  key_state: Record<string, EnvPolicySecretDiagnostic>;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(moduleDir, "..", "..");
const DEFAULT_WEB_ROOT = path.join(DEFAULT_REPO_ROOT, "apps", "web");
const SECRET_KEYS = [
  "DISCORD_TOKEN",
  "OPENAI_API_KEY",
  "DEEPGRAM_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "AUTH_SECRET",
] as const;

let cachedSnapshot: EnvPolicySnapshot | null = null;
let cachedKey: string | null = null;
let startupDiagnosticsEmitted = false;

function normalizeForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function relativeRepoPath(repoRoot: string, filePath: string): string {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return path.basename(filePath);
  }
  return relative.replace(/\\/g, "/");
}

function resolveMode(env: NodeJS.ProcessEnv): EnvPolicyMode {
  const explicit = env.MEEPO_ENV_POLICY_MODE?.trim();
  if (explicit === "development-dotenv" || explicit === "production-host" || explicit === "test-hermetic") {
    return explicit;
  }

  const nodeEnv = env.NODE_ENV?.trim();
  if (nodeEnv === "test") {
    return "test-hermetic";
  }
  if (nodeEnv === "production") {
    return "production-host";
  }
  return "development-dotenv";
}

function resolveConsumer(cwd: string, webRoot: string): EnvPolicyConsumer {
  const normalizedCwd = normalizeForCompare(cwd);
  const normalizedWebRoot = normalizeForCompare(webRoot);
  return normalizedCwd === normalizedWebRoot || normalizedCwd.startsWith(`${normalizedWebRoot}/`)
    ? "web"
    : "runtime";
}

function buildCandidatePaths(args: {
  consumer: EnvPolicyConsumer;
  cwd: string;
  repoRoot: string;
  webRoot: string;
}): string[] {
  const candidates = [
    path.join(args.repoRoot, ".env"),
    path.join(args.repoRoot, ".env.local"),
  ];

  if (args.consumer === "web") {
    candidates.push(path.join(args.webRoot, ".env"), path.join(args.webRoot, ".env.local"));
  }

  candidates.push(path.join(args.cwd, ".env"), path.join(args.cwd, ".env.local"));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeForCompare(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(candidate);
  }
  return out;
}

function loadDotenvFile(filePath: string, env: NodeJS.ProcessEnv): void {
  const parsed = parseDotenv(fs.readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] !== undefined) {
      continue;
    }
    env[key] = value;
  }
}

function fingerprintSecret(secret: string): EnvPolicySecretDiagnostic {
  const trimmed = secret.trim();
  return {
    present: true,
    fingerprint: crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 8),
    suffix: trimmed.slice(-4),
  };
}

function collectSecretState(env: NodeJS.ProcessEnv): Record<string, EnvPolicySecretDiagnostic> {
  const state: Record<string, EnvPolicySecretDiagnostic> = {};
  for (const key of SECRET_KEYS) {
    const value = env[key];
    state[key] = value && value.trim().length > 0 ? fingerprintSecret(value) : { present: false };
  }
  return state;
}

function buildSnapshot(args: {
  mode: EnvPolicyMode;
  consumer: EnvPolicyConsumer;
  env: NodeJS.ProcessEnv;
  cwd: string;
  repoRoot: string;
  webRoot: string;
}): EnvPolicySnapshot {
  const existingCandidates = buildCandidatePaths(args).filter((candidate) => fs.existsSync(candidate));
  const detectedFiles = existingCandidates.map((candidate) => relativeRepoPath(args.repoRoot, candidate));
  const snapshot: EnvPolicySnapshot = {
    mode: args.mode,
    consumer: args.consumer,
    detectedFiles,
    loadedFiles: [],
    ignoredFiles: [],
    forbiddenFiles: [],
    secretState: {},
  };

  if (args.mode === "development-dotenv") {
    for (const candidate of existingCandidates) {
      loadDotenvFile(candidate, args.env);
      snapshot.loadedFiles.push(relativeRepoPath(args.repoRoot, candidate));
    }
  } else {
    snapshot.ignoredFiles = [...detectedFiles];
    if (args.mode === "production-host") {
      snapshot.forbiddenFiles = [...detectedFiles];
    }
  }

  snapshot.secretState = collectSecretState(args.env);
  return snapshot;
}

export function initializeEnvPolicy(options: InitializeEnvPolicyOptions = {}): EnvPolicySnapshot {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const webRoot = options.webRoot ?? DEFAULT_WEB_ROOT;
  const consumer = options.consumer ?? resolveConsumer(cwd, webRoot);
  const mode = options.mode ?? resolveMode(env);
  const cacheKey = [mode, consumer, normalizeForCompare(cwd), normalizeForCompare(repoRoot), normalizeForCompare(webRoot)].join("|");

  if (!options.forceReload && env === process.env && cachedSnapshot && cachedKey === cacheKey) {
    return cachedSnapshot;
  }

  const snapshot = buildSnapshot({ mode, consumer, env, cwd, repoRoot, webRoot });

  if (env === process.env || options.forceReload) {
    cachedSnapshot = snapshot;
    cachedKey = cacheKey;
  }

  if (mode === "production-host" && snapshot.forbiddenFiles.length > 0) {
    throw new Error(
      `[env-policy] Production host mode forbids repo-local dotenv files: ${snapshot.forbiddenFiles.join(", ")}. Remove those files from the runtime workspace, or use MEEPO_ENV_POLICY_MODE=development-dotenv only for local non-production runs.`
    );
  }

  return snapshot;
}

export function getEnvPolicySnapshot(): EnvPolicySnapshot {
  return cachedSnapshot ?? initializeEnvPolicy();
}

export function buildEnvStartupDiagnostics(input: {
  llmProvider?: LlmProvider;
  sttProvider?: SttProvider;
}): EnvStartupDiagnostics {
  const snapshot = getEnvPolicySnapshot();
  return {
    env_policy_mode: snapshot.mode,
    env_policy_consumer: snapshot.consumer,
    ...(input.llmProvider ? { llm_provider: input.llmProvider } : {}),
    ...(input.sttProvider ? { stt_provider: input.sttProvider } : {}),
    detected_dotenv_files: snapshot.detectedFiles,
    loaded_dotenv_files: snapshot.loadedFiles,
    ignored_dotenv_files: snapshot.ignoredFiles,
    forbidden_dotenv_files: snapshot.forbiddenFiles,
    key_state: snapshot.secretState,
  };
}

export function emitEnvStartupDiagnostics(input: {
  llmProvider?: LlmProvider;
  sttProvider?: SttProvider;
}): void {
  if (startupDiagnosticsEmitted || process.env.NODE_ENV === "test") {
    return;
  }
  startupDiagnosticsEmitted = true;
  console.info("[env-policy] Startup diagnostics", buildEnvStartupDiagnostics(input));
}