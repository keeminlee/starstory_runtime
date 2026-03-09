import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");
const require = createRequire(import.meta.url);

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function resolvePackageVersion() {
  try {
    const packageJsonPath = path.join(webRoot, "package.json");
    const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(packageJsonRaw);
    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : "";
  } catch {
    return "";
  }
}

function resolveAppVersion() {
  return (
    runGit(["describe", "--tags", "--abbrev=0"]) ||
    runGit(["rev-parse", "--short", "HEAD"]) ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    resolvePackageVersion() ||
    "dev"
  );
}

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error("[version] missing command to run");
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
};

console.log(`[version] NEXT_PUBLIC_APP_VERSION=${env.NEXT_PUBLIC_APP_VERSION}`);

let executable = command;
let executableArgs = args;

if (command === "next") {
  const nextCli = require.resolve("next/dist/bin/next", { paths: [webRoot] });
  executable = process.execPath;
  executableArgs = [nextCli, ...args];
}

const child = spawn(executable, executableArgs, {
  cwd: webRoot,
  env,
  stdio: "inherit",
  shell: false,
});

child.on("error", (error) => {
  console.error(`[version] failed to launch '${command}':`, error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
