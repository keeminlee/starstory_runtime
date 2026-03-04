import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AwakenScriptId = "meepo_awaken";

const AWAKEN_SCRIPT_REGISTRY: Record<AwakenScriptId, Record<number, string>> = {
  meepo_awaken: {
    1: path.join(__dirname, "meepo_awaken.v1.yaml"),
  },
};

export function listAwakenScriptVersions(scriptId: string): number[] {
  const versionsMap = (AWAKEN_SCRIPT_REGISTRY as Record<string, Record<number, string> | undefined>)[scriptId];
  if (!versionsMap) {
    return [];
  }
  return Object.keys(versionsMap)
    .map((value) => Number(value))
    .sort((a, b) => a - b);
}

export function getLatestAwakenVersion(scriptId: string): number {
  const versions = listAwakenScriptVersions(scriptId);
  if (versions.length === 0) {
    throw new Error(`Unknown awakening script id: ${scriptId}`);
  }
  return versions[versions.length - 1]!;
}

export function getAwakenScriptPath(scriptId: string, version?: number): string {
  const resolvedVersion = version ?? getLatestAwakenVersion(scriptId);
  const versionsMap = (AWAKEN_SCRIPT_REGISTRY as Record<string, Record<number, string> | undefined>)[scriptId];

  if (!versionsMap) {
    throw new Error(`Unknown awakening script id: ${scriptId}`);
  }

  const scriptPath = versionsMap[resolvedVersion];
  if (!scriptPath) {
    const available = listAwakenScriptVersions(scriptId).join(", ");
    throw new Error(`Unknown awakening script version: ${scriptId}.v${resolvedVersion} (available: ${available || "none"})`);
  }

  return scriptPath;
}
