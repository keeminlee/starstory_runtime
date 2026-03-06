import fs from "node:fs";
import path from "node:path";
import { resolveMegameecapOutputDir } from "../tools/megameecap/io.js";
import { buildLegacySessionArtifactStem, buildSessionArtifactStem } from "../dataPaths.js";
import { log } from "../utils/logger.js";

export { buildSessionArtifactStem } from "../dataPaths.js";

const artifactLog = log.withScope("session-artifacts");
const emittedLegacyFallbackKeys = new Set<string>();

export type RecapPassStrategy = "detailed" | "balanced" | "concise";

const KNOWN_FINAL_STRATEGIES: RecapPassStrategy[] = ["detailed", "balanced", "concise"];

export type RecapArtifactPaths = {
  outputDir: string;
  recapPath: string;
  metaPath: string;
};

export type BaseArtifactPaths = {
  outputDir: string;
  basePath: string;
  metaPath: string;
};

export type BaseStatus = {
  exists: boolean;
  sourceHash: string | null;
  baseVersion: string | null;
  createdAtMs: number | null;
  paths: BaseArtifactPaths;
};

export type FinalStatus = {
  exists: boolean;
  style: RecapPassStrategy | null;
  sourceHash: string | null;
  baseVersion: string | null;
  finalVersion: string | null;
  createdAtMs: number | null;
  paths: RecapArtifactPaths | null;
};

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function resolveMegameecapBasePaths(
  guildId: string,
  campaignSlug: string,
  sessionId: string,
  sessionLabel?: string | null
): BaseArtifactPaths {
  const outputDir = resolveMegameecapOutputDir(campaignSlug);
  const baseName = `${buildSessionArtifactStem({ guildId, campaignSlug, sessionId })}-megameecap-base`;
  return {
    outputDir,
    basePath: path.join(outputDir, `${baseName}.md`),
    metaPath: path.join(outputDir, `${baseName}.meta.json`),
  };
}

export function resolveMegameecapFinalPaths(
  guildId: string,
  campaignSlug: string,
  sessionId: string,
  strategy: RecapPassStrategy,
  sessionLabel?: string | null
): RecapArtifactPaths {
  const outputDir = resolveMegameecapOutputDir(campaignSlug);

  const baseName = `${buildSessionArtifactStem({ guildId, campaignSlug, sessionId })}-recap-final-${strategy}`;
  return {
    outputDir,
    recapPath: path.join(outputDir, `${baseName}.md`),
    metaPath: path.join(outputDir, `${baseName}.meta.json`),
  };
}

export function resolveMegameecapRecapPaths(
  guildId: string,
  campaignSlug: string,
  sessionId: string,
  strategy: RecapPassStrategy,
  sessionLabel?: string | null
): RecapArtifactPaths {
  return resolveMegameecapFinalPaths(guildId, campaignSlug, sessionId, strategy, sessionLabel);
}

function maybeEmitLegacyArtifactFallback(args: {
  guildId: string;
  campaignSlug: string;
  sessionId: string;
  artifactType: "megameecap_base" | "recap_final";
  requestedPath: string;
  resolvedLegacyPath: string;
}): void {
  const key = [
    args.guildId,
    args.campaignSlug,
    args.sessionId,
    args.artifactType,
    args.requestedPath,
    args.resolvedLegacyPath,
  ].join("|");
  if (emittedLegacyFallbackKeys.has(key)) return;
  emittedLegacyFallbackKeys.add(key);

  artifactLog.warn("legacy_artifact_path_used", {
    event_type: "legacy_artifact_path_used",
    guild_id: args.guildId,
    campaign_slug: args.campaignSlug,
    session_id: args.sessionId,
    artifact_type: args.artifactType,
    requested_path: args.requestedPath,
    resolved_legacy_path: args.resolvedLegacyPath,
  });
}

function resolveLegacyBaseCandidates(
  outputDir: string,
  sessionId: string,
  sessionLabel?: string | null
): BaseArtifactPaths[] {
  const candidates: BaseArtifactPaths[] = [];
  const labelStem = buildLegacySessionArtifactStem(sessionId, sessionLabel);
  const idStem = buildLegacySessionArtifactStem(sessionId);
  for (const stem of [labelStem, idStem]) {
    if (candidates.some((item) => item.basePath.includes(stem))) continue;
    const baseName = `${stem}-megameecap-base`;
    candidates.push({
      outputDir,
      basePath: path.join(outputDir, `${baseName}.md`),
      metaPath: path.join(outputDir, `${baseName}.meta.json`),
    });
  }
  return candidates;
}

function resolveLegacyFinalCandidates(
  outputDir: string,
  sessionId: string,
  strategy: RecapPassStrategy,
  sessionLabel?: string | null
): RecapArtifactPaths[] {
  const candidates: RecapArtifactPaths[] = [];
  const labelStem = buildLegacySessionArtifactStem(sessionId, sessionLabel);
  const idStem = buildLegacySessionArtifactStem(sessionId);
  for (const stem of [labelStem, idStem]) {
    if (candidates.some((item) => item.recapPath.includes(stem))) continue;
    const baseName = `${stem}-recap-final-${strategy}`;
    candidates.push({
      outputDir,
      recapPath: path.join(outputDir, `${baseName}.md`),
      metaPath: path.join(outputDir, `${baseName}.meta.json`),
    });
  }
  return candidates;
}

export function getBaseStatus(guildId: string, campaignSlug: string, sessionId: string, sessionLabel?: string | null): BaseStatus {
  const primaryPaths = resolveMegameecapBasePaths(guildId, campaignSlug, sessionId, sessionLabel);
  const legacyCandidates = resolveLegacyBaseCandidates(primaryPaths.outputDir, sessionId, sessionLabel);
  const legacyPaths = legacyCandidates.find((candidate) => fs.existsSync(candidate.basePath) && fs.existsSync(candidate.metaPath));
  const primaryExists = fs.existsSync(primaryPaths.basePath) && fs.existsSync(primaryPaths.metaPath);
  const legacyExists = Boolean(legacyPaths);
  const paths = primaryExists ? primaryPaths : legacyPaths ?? primaryPaths;
  const hasBase = primaryExists || legacyExists;

  if (!primaryExists && legacyPaths) {
    maybeEmitLegacyArtifactFallback({
      guildId,
      campaignSlug,
      sessionId,
      artifactType: "megameecap_base",
      requestedPath: primaryPaths.basePath,
      resolvedLegacyPath: legacyPaths.basePath,
    });
  }

  const meta = readJsonFile(paths.metaPath);

  return {
    exists: hasBase,
    sourceHash: typeof meta?.source_hash === "string" ? meta.source_hash : null,
    baseVersion: typeof meta?.base_version === "string" ? meta.base_version : null,
    createdAtMs: typeof meta?.created_at_ms === "number" ? meta.created_at_ms : null,
    paths,
  };
}

export function getFinalStatus(
  guildId: string,
  campaignSlug: string,
  sessionId: string,
  strategy?: RecapPassStrategy,
  sessionLabel?: string | null
): FinalStatus {
  if (strategy) {
    const primaryPaths = resolveMegameecapFinalPaths(guildId, campaignSlug, sessionId, strategy, sessionLabel);
    const legacyCandidates = resolveLegacyFinalCandidates(primaryPaths.outputDir, sessionId, strategy, sessionLabel);
    const legacyPaths = legacyCandidates.find((candidate) => fs.existsSync(candidate.recapPath) && fs.existsSync(candidate.metaPath));
    const primaryExists = fs.existsSync(primaryPaths.recapPath) && fs.existsSync(primaryPaths.metaPath);
    const legacyExists = Boolean(legacyPaths);
    const paths = primaryExists ? primaryPaths : legacyPaths ?? primaryPaths;
    const exists = primaryExists || legacyExists;

    if (!primaryExists && legacyPaths) {
      maybeEmitLegacyArtifactFallback({
        guildId,
        campaignSlug,
        sessionId,
        artifactType: "recap_final",
        requestedPath: primaryPaths.recapPath,
        resolvedLegacyPath: legacyPaths.recapPath,
      });
    }

    const meta = readJsonFile(paths.metaPath);
    return {
      exists,
      style: strategy,
      sourceHash: typeof meta?.source_hash === "string" ? meta.source_hash : null,
      baseVersion: typeof meta?.base_version === "string" ? meta.base_version : null,
      finalVersion: typeof meta?.final_version === "string" ? meta.final_version : null,
      createdAtMs: typeof meta?.created_at_ms === "number" ? meta.created_at_ms : null,
      paths,
    };
  }

  let best: FinalStatus | null = null;

  for (const style of KNOWN_FINAL_STRATEGIES) {
    const status = getFinalStatus(guildId, campaignSlug, sessionId, style, sessionLabel);
    if (!status.exists) continue;
    if (!best || (status.createdAtMs ?? 0) > (best.createdAtMs ?? 0)) {
      best = status;
    }
  }

  return (
    best ?? {
      exists: false,
      style: null,
      sourceHash: null,
      baseVersion: null,
      finalVersion: null,
      createdAtMs: null,
      paths: null,
    }
  );
}

export function getAllFinalStatuses(
  guildId: string,
  campaignSlug: string,
  sessionId: string,
  sessionLabel?: string | null
): FinalStatus[] {
  return KNOWN_FINAL_STRATEGIES.map((style) => getFinalStatus(guildId, campaignSlug, sessionId, style, sessionLabel));
}

export function readMegameecapBaseText(paths: BaseArtifactPaths): string | null {
  if (!fs.existsSync(paths.basePath)) return null;
  return fs.readFileSync(paths.basePath, "utf8");
}

export function readMegameecapFinalText(paths: RecapArtifactPaths): string | null {
  if (!fs.existsSync(paths.recapPath)) return null;
  return fs.readFileSync(paths.recapPath, "utf8");
}
