import path from "node:path";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function runGit(args: string[]): string | null {
  try {
    const output = execFileSync("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function resolveWebPackageVersion(): string | null {
  try {
    const packageJsonPath = path.join(__dirname, "package.json");
    const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(packageJsonRaw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.length > 0 ? parsed.version : null;
  } catch {
    return null;
  }
}

const resolvedAppVersion =
  runGit(["describe", "--tags", "--abbrev=0"]) ??
  runGit(["rev-parse", "--short", "HEAD"]) ??
  process.env.NEXT_PUBLIC_APP_VERSION ??
  resolveWebPackageVersion() ??
  "dev";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: resolvedAppVersion,
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };

    return config;
  },
};

export default nextConfig;
