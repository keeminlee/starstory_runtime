import fs from "node:fs";
import path from "node:path";

type Match = {
  filePath: string;
  lineNumber: number;
  line: string;
};

const repoRoot = process.cwd();

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function relativePath(filePath: string): string {
  return normalizePath(path.relative(repoRoot, filePath));
}

function walkFiles(startPath: string): string[] {
  if (!fs.existsSync(startPath)) {
    return [];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(startPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(startPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(entryPath));
      continue;
    }
    if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}

function getTsFilesUnder(relativeDir: string): string[] {
  const absoluteDir = path.join(repoRoot, relativeDir);
  return walkFiles(absoluteDir).filter((filePath) => filePath.endsWith(".ts"));
}

function findMatches(filePaths: string[], pattern: RegExp): Match[] {
  const matches: Match[] = [];

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      pattern.lastIndex = 0;
      if (!pattern.test(line)) {
        continue;
      }
      matches.push({
        filePath,
        lineNumber: index + 1,
        line: line.trim(),
      });
    }
  }

  return matches;
}

function printMatches(header: string, matches: Match[], limit: number): void {
  console.log(header);
  for (const match of matches.slice(0, limit)) {
    console.log(`- ${relativePath(match.filePath)}:${match.lineNumber} ${match.line}`);
  }
}

function failWithMatches(header: string, matches: Match[], limit: number, message: string): never {
  printMatches(header, matches, limit);
  throw new Error(message);
}

function runNoGetDbRuntime(): void {
  const files = getTsFilesUnder("src").filter((filePath) => {
    const normalized = relativePath(filePath);
    return normalized !== "src/db.ts"
      && !normalized.startsWith("src/tools/")
      && !normalized.startsWith("src/tests/");
  });

  const usageMatches = findMatches(files, /\bgetDb\s*\(/);
  if (usageMatches.length > 0) {
    failWithMatches(
      "getDb() usage offenders (first 10):",
      usageMatches,
      10,
      "getDb() usage found outside src/db.ts or src/tools.",
    );
  }

  const importMatches = findMatches(files, /\bimport\b[^\n]*\bgetDb\b[^\n]*\bfrom\s+['"].*\/db\.js['" ]/);
  if (importMatches.length > 0) {
    failWithMatches(
      "getDb import offenders (first 10):",
      importMatches,
      10,
      "getDb import found outside src/db.ts or src/tools.",
    );
  }

  console.log("PASS: no getDb runtime usage/import found outside src/db.ts or src/tools");
}

function runActiveSessionBoundary(): void {
  const files = getTsFilesUnder("src").filter((filePath) => {
    const normalized = relativePath(filePath);
    return !normalized.startsWith("src/tests/") && !normalized.startsWith("src/tools/");
  });

  const forbiddenSetterMatches = findMatches(files, /\b(setActiveSessionId|clearActiveSessionId)\b/);
  if (forbiddenSetterMatches.length > 0) {
    failWithMatches(
      "Forbidden active session runtime imports detected (first 10):",
      forbiddenSetterMatches,
      10,
      "Use session lifecycle boundary APIs from sessionRuntime.ts instead of raw active-session setters.",
    );
  }

  const sqlMutationMatches = findMatches(
    files,
    /\bUPDATE\s+guild_runtime_state\s+SET\s+active_session_id\b|\bINSERT\s+(OR\s+REPLACE\s+)?INTO\s+guild_runtime_state\b[^\n]*\bactive_session_id\b/i,
  );
  const allowlist = new Set([
    "src/sessions/sessionruntime.ts",
    "src/meepo/personastate.ts",
  ]);
  const violations = sqlMutationMatches.filter((match) => !allowlist.has(relativePath(match.filePath).toLowerCase()));

  if (violations.length > 0) {
    failWithMatches(
      "Forbidden active_session_id SQL mutations detected (first 10):",
      violations,
      10,
      "active_session_id mutations must stay inside approved runtime boundary modules.",
    );
  }

  const personaStatePath = "src/meepo/personastate.ts";
  const personaStateViolations = sqlMutationMatches.filter(
    (match) => relativePath(match.filePath).toLowerCase() === personaStatePath && /\bUPDATE\s+guild_runtime_state\s+SET\s+active_session_id\b/i.test(match.line),
  );

  if (personaStateViolations.length > 0) {
    failWithMatches(
      "Forbidden semantic active_session_id updates in personaState.ts (first 10):",
      personaStateViolations,
      10,
      "personaState.ts may shape runtime rows only; active_session_id truth is owned by session lifecycle/reconciliation.",
    );
  }

  console.log("PASS: active session runtime mutation boundary");
}

function runRecapServiceBoundary(): void {
  const commandFiles = getTsFilesUnder(path.join("src", "commands"));

  const forbiddenImportMatches = findMatches(commandFiles, /recapEngine\.js/);
  if (forbiddenImportMatches.length > 0) {
    failWithMatches(
      "Forbidden recapEngine import detected in command/lifecycle surfaces (first 10):",
      forbiddenImportMatches,
      10,
      "Command/lifecycle recap generation must use recapService boundary, not recapEngine imports.",
    );
  }

  const forbiddenCallMatches = findMatches(commandFiles, /\bgenerateSessionRecap\s*\(|\bregenerateSessionRecap\s*\(/);
  if (forbiddenCallMatches.length > 0) {
    failWithMatches(
      "Forbidden direct recap generation calls detected in command/lifecycle surfaces (first 10):",
      forbiddenCallMatches,
      10,
      "Command/lifecycle recap generation must call recapService contract methods.",
    );
  }

  console.log("PASS: recap service boundary enforced for command/lifecycle surfaces");
}

function runRuntimeScopeFallbacks(): void {
  const runtimeFiles = getTsFilesUnder("src").filter((filePath) => {
    const normalized = relativePath(filePath);
    return normalized === "src/bot.ts"
      || normalized.startsWith("src/commands/")
      || normalized.startsWith("src/overlay/")
      || normalized.startsWith("src/voice/");
  });

  const registryFallbackMatches = findMatches(runtimeFiles, /\bloadRegistry\s*\(/);
  if (registryFallbackMatches.length > 0) {
    failWithMatches(
      "Forbidden runtime registry fallback callsites (first 10):",
      registryFallbackMatches,
      10,
      "Runtime zones must use loadRegistryForScope({ guildId, campaignSlug }) instead of loadRegistry().",
    );
  }

  const legacyEventScopeMatches = findMatches(runtimeFiles, /searchEventsByTitleScoped\s*\(\s*\{[^\}]*\bguildId\b/i);
  if (legacyEventScopeMatches.length > 0) {
    failWithMatches(
      "Forbidden legacy event scope callsites (first 10):",
      legacyEventScopeMatches,
      10,
      "Runtime zones must pass explicit scope object: searchEventsByTitleScoped({ term, scope: { guildId, campaignSlug } }).",
    );
  }

  console.log("PASS: runtime scope fallback stopline");
}

function runObservabilityRuntime(): void {
  const includePatterns = [
    /^src\/commands\//,
    /^src\/sessions\//,
    /^src\/voice\//,
    /^src\/ledger\//,
    /^src\/overlay\//,
    /^src\/context\//,
    /^src\/runtime\//,
    /^src\/bot\.ts$/,
  ];
  const excludePatterns = [
    /^src\/commands\/deploy-commands\.ts$/,
    /^src\/commands\/deploy-dev\.ts$/,
    /^src\/commands\/meepoLegacy\.ts$/,
    /^src\/commands\/session\.ts$/,
    /^src\/sessions\/meecap\.ts$/,
    /^src\/voice\/audioFx\.ts$/,
    /^src\/voice\/stt\/debug\.ts$/,
    /^src\/voice\/stt\/provider\.ts$/,
    /^src\/voice\/tts\/provider\.ts$/,
    /^src\/voice\/tts\/noop\.ts$/,
    /^src\/ledger\/meepoActionLogging\.ts$/,
    /^src\/ledger\/awakeningStateRepo\.ts$/,
    /^src\/ledger\/scaffoldLabel\.ts$/,
    /^src\/ledger\/scaffoldMetrics\.ts$/,
  ];

  const strictFiles = getTsFilesUnder("src").filter((filePath) => {
    const normalized = relativePath(filePath);
    const included = includePatterns.some((pattern) => pattern.test(normalized));
    return included && !excludePatterns.some((pattern) => pattern.test(normalized));
  });

  const consoleMatches = findMatches(strictFiles, /\bconsole\.(log|warn|error|debug|info)\s*\(/i);
  if (consoleMatches.length > 0) {
    failWithMatches(
      "Forbidden raw console.* usage detected in strict runtime zones (first 20):",
      consoleMatches,
      20,
      "Stopline violation: use structured logger in strict runtime zones instead of raw console.*",
    );
  }

  console.log("PASS: observability runtime stopline (strict zones use structured logger path)");
}

function runNoRawEnv(): void {
  const strictFiles = getTsFilesUnder("src").filter((filePath) => {
    const normalized = relativePath(filePath);
    return normalized === "src/bot.ts" || normalized.startsWith("src/voice/");
  });

  const matches = findMatches(strictFiles, /process\.env/);
  if (matches.length > 0) {
    const paths = [...new Set(matches.map((match) => relativePath(match.filePath)))];
    throw new Error(`process.env found in config-only runtime path(s): ${paths.join(", ")}`);
  }

  console.log("PASS: no process.env usage found in config-only runtime paths");
}

function runRuntimeDotenvBoundary(): void {
  const srcFiles = getTsFilesUnder("src").filter((filePath) => {
    const normalized = relativePath(filePath);
    return !normalized.startsWith("src/tools/")
      && !normalized.startsWith("src/tests/")
        && normalized !== "src/commands/deploy-commands.ts"
        && normalized !== "src/config/envPolicy.ts";
  });
  const webFiles = walkFiles(path.join(repoRoot, "apps", "web"))
    .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx") || filePath.endsWith(".mts") || filePath.endsWith(".cts"))
    .filter((filePath) => {
      const normalized = relativePath(filePath);
      return !normalized.startsWith("apps/web/.next/") && !normalized.startsWith("apps/web/node_modules/");
    });
  const strictFiles = [...srcFiles, ...webFiles];

  const dotenvImportMatches = findMatches(strictFiles, /import\s+["']dotenv\/config["']|from\s+["']dotenv["']/);
  if (dotenvImportMatches.length > 0) {
    failWithMatches(
      "Forbidden runtime/web dotenv imports detected (first 20):",
      dotenvImportMatches,
      20,
      "Runtime and web entrypoints must use src/config/envPolicy.ts instead of dotenv imports.",
    );
  }

  const dotenvConfigMatches = findMatches(strictFiles, /dotenv\.config\s*\(|config\s*\([^\)]*override\s*:\s*true/i);
  if (dotenvConfigMatches.length > 0) {
    failWithMatches(
      "Forbidden runtime/web dotenv config usage detected (first 20):",
      dotenvConfigMatches,
      20,
      "Runtime and web entrypoints must not call dotenv.config() or enable override=true.",
    );
  }

  console.log("PASS: runtime dotenv boundary");
}

function runRepoHygiene(): void {
  const violations: string[] = [];

  const oldOrNotNowFiles = walkFiles(path.join(repoRoot, "src", "tools", "old_or_not_now"));
  for (const filePath of oldOrNotNowFiles) {
    violations.push(relativePath(filePath));
  }

  const oneOffFiles = walkFiles(path.join(repoRoot, "tools", "_oneoffs"))
    .filter((filePath) => path.basename(filePath) !== "README.md");
  for (const filePath of oneOffFiles) {
    violations.push(relativePath(filePath));
  }

  if (violations.length > 0) {
    console.log("Repo hygiene violations detected:");
    for (const violation of violations) {
      console.log(`- ${violation}`);
    }
    throw new Error("Legacy or one-off scripts detected. Move to docs/old or remove before merge.");
  }

  console.log("PASS: repo hygiene stopline");
}

const runners: Record<string, () => void> = {
  "no-getdb-runtime": runNoGetDbRuntime,
  "active-session-boundary": runActiveSessionBoundary,
  "recap-service-boundary": runRecapServiceBoundary,
  "runtime-scope-fallbacks": runRuntimeScopeFallbacks,
  "observability-runtime": runObservabilityRuntime,
  "no-raw-env": runNoRawEnv,
  "runtime-dotenv-boundary": runRuntimeDotenvBoundary,
  "repo-hygiene": runRepoHygiene,
};

const stoplineName = process.argv[2];

if (!stoplineName || !(stoplineName in runners)) {
  console.error(`Unknown or missing stopline. Expected one of: ${Object.keys(runners).join(", ")}`);
  process.exit(1);
}

try {
  runners[stoplineName]();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
