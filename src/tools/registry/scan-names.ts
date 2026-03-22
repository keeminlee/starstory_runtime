import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import yaml from "yaml";
import { loadRegistry, normKey } from "../../registry/loadRegistry.js";
import { getRegistryDirForCampaign } from "../../registry/scaffold.js";
import { resolveCampaignSlug } from "../../campaign/guildConfig.js";
import { getDefaultCampaignSlug } from "../../campaign/defaultCampaign.js";
import { getEnv } from "../../config/rawEnv.js";
import { resolveCampaignDbPath } from "../../dataPaths.js";
import {
  pickTranscriptRows,
  scanNamesCorePerSession,
  type PendingCandidate,
  type KnownHitSummary,
  type ScanSourceRow,
  type SessionScanInput,
} from "../../registry/scanNamesCore.js";

/**
 * Phase 1B: Name Scanner (campaign-scoped, per-session)
 *
 * Scans bronze_transcript (preferred) or ledger_entries per-session for
 * proper-name candidates, filters against registry, and outputs
 * decisions.pending.yml in the campaign's registry folder.
 *
 * Usage:
 *   npx tsx src/tools/registry/scan-names.ts --campaign faeterra-main
 *   npx tsx src/tools/registry/scan-names.ts --campaign auto --guild 123456789012345678
 *   npx tsx src/tools/registry/scan-names.ts --rebuild
 *   npx tsx src/tools/registry/scan-names.ts  # uses DEFAULT_CAMPAIGN_SLUG or "default"
 */

type PendingDecisionsYaml = {
  version: number;
  generated_at: string;
  source: {
    db: string;
    guildId: string | null;
    campaignSlug: string;
    primaryOnly: boolean;
    minCount: number;
    sessionCount: number;
    transcriptSource: "bronze_transcript" | "ledger_entries" | "per_session";
  };
  pending: PendingCandidate[];
  knownHits: KnownHitSummary[];
};

/**
 * Parse command-line arguments (dependency-free).
 */
function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function resolveCampaignFromArgs(args: Record<string, string | boolean>): string {
  const campaignOpt = (args.campaign as string) ?? "auto";
  const guildId = args.guild as string | undefined;
  if (campaignOpt !== "auto" && campaignOpt && String(campaignOpt).trim() !== "") {
    return String(campaignOpt).trim();
  }
  if (guildId) {
    return resolveCampaignSlug({ guildId });
  }
  return getDefaultCampaignSlug();
}

/**
 * Load transcript rows for a single session, preferring bronze_transcript
 * over ledger_entries.
 */
function loadSessionTranscriptRows(
  db: Database.Database,
  sessionId: string,
  primaryOnly: boolean,
): { rows: ScanSourceRow[]; source: "bronze_transcript" | "ledger_entries" } {
  const bronzeRows = db
    .prepare(
      `SELECT bt.content, bt.source_type as source, 'primary' as narrative_weight
       FROM bronze_transcript bt
       WHERE bt.session_id = ?
         AND bt.content IS NOT NULL
         AND TRIM(bt.content) <> ''`,
    )
    .all(sessionId) as ScanSourceRow[];

  if (bronzeRows.length > 0) {
    return { rows: bronzeRows, source: "bronze_transcript" };
  }

  const ledgerWhereParts = [
    "le.session_id = ?",
    "le.content IS NOT NULL",
    "TRIM(le.content) <> ''",
  ];
  if (primaryOnly) {
    ledgerWhereParts.push("le.narrative_weight IN ('primary', 'elevated')");
  }

  const ledgerRows = db
    .prepare(
      `SELECT le.content, le.source, le.narrative_weight
       FROM ledger_entries le
       WHERE ${ledgerWhereParts.join(" AND ")}`,
    )
    .all(sessionId) as ScanSourceRow[];

  return { rows: ledgerRows, source: "ledger_entries" };
}

function scanNames(): void {
  const args = parseArgs();

  const guildId = (args.guild as string | undefined)?.trim() || null;
  const campaignSlug = resolveCampaignFromArgs(args);
  const rebuild = args.rebuild === true;
  console.log(`Campaign: ${campaignSlug}`);

  if (guildId) {
    console.log(`Guild scope override: ${guildId}`);
  } else {
    console.log("Guild scope: campaign-wide");
  }

  const registryDir = getRegistryDirForCampaign(campaignSlug);
  const dbPath =
    (args.db as string) ||
    resolveCampaignDbPath(campaignSlug) ||
    getEnv("DATA_DB_PATH") ||
    getEnv("DB_PATH") ||
    "./data/bot.sqlite";
  const minCount = parseInt((args.minCount as string) || "3", 10);
  const primaryOnly = args.primaryOnly === true || args.primaryOnly === "true";
  const maxExamples = parseInt((args.maxExamples as string) || "3", 10);
  const pendingPath = (args.pendingOut as string) || path.join(registryDir, "decisions.pending.yml");
  // Known-hit tracking is now on by default
  const includeKnown = args.noKnown !== true;

  if (rebuild) {
    console.log("[scan-names] --rebuild: wiping existing pending decisions...");
    if (fs.existsSync(pendingPath)) {
      fs.unlinkSync(pendingPath);
      console.log(`[scan-names] Deleted ${pendingPath}`);
    }
  }

  console.log(`[scan-names] Loading registry...`);
  const registry = loadRegistry({ campaignSlug });

  console.log(`[scan-names] Connecting to ${dbPath}...`);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true });

  const sessionWhereParts = [
    "s.label IS NOT NULL",
    "TRIM(s.label) <> ''",
    "LOWER(TRIM(s.label)) NOT LIKE '%test%'",
    "LOWER(TRIM(s.label)) NOT LIKE '%chat%'",
  ];
  const sessionParams: unknown[] = [];
  if (guildId) {
    sessionWhereParts.push("s.guild_id = ?");
    sessionParams.push(guildId);
  }

  const sessionWhere = sessionWhereParts.join(" AND ");
  const sessionRows = db
    .prepare(
      `SELECT s.session_id, s.label
       FROM sessions s
       WHERE ${sessionWhere}`,
    )
    .all(...sessionParams) as Array<{ session_id: string; label: string | null }>;

  if (sessionRows.length === 0) {
    console.log("[scan-names] No labeled non-test/non-chat sessions found for this scope.");
  } else {
    console.log(`[scan-names] Session scope size: ${sessionRows.length}`);
  }

  // ── Per-session transcript loading (bronze-first) ─────────────────
  const sessionInputs: SessionScanInput[] = [];
  let totalRows = 0;
  for (const session of sessionRows) {
    const { rows } = loadSessionTranscriptRows(db, session.session_id, primaryOnly);
    if (rows.length > 0) {
      sessionInputs.push({ sessionId: session.session_id, rows });
      totalRows += rows.length;
    }
  }

  console.log(
    `[scan-names] Loaded ${totalRows} transcript rows across ${sessionInputs.length} sessions, extracting candidates...`,
  );

  const scanResult = scanNamesCorePerSession({
    sessionRows: sessionInputs,
    registry,
    minCount,
    maxExamples,
    includeKnown,
  });

  db.close();

  const filtered = scanResult.pending;
  const knownHitsList = scanResult.knownHits;

  console.log(`[scan-names] Found ${filtered.length} candidates (minCount=${minCount})`);

  // Console output
  console.log("\n=== TOP UNKNOWN NAMES ===\n");
  for (const cand of filtered) {
    const sessionLabel = cand.sessions ? ` [${cand.sessions.length} sessions]` : "";
    const initLabel = cand.sentenceInitialCount > 0 ? `, ${cand.sentenceInitialCount} sentence-initial` : "";
    console.log(`${cand.display} (${cand.count} total, ${cand.primaryCount} primary${initLabel}${sessionLabel})`);
    for (const ex of cand.examples) {
      console.log(`  > ${ex}`);
    }
    console.log("");
  }

  if (includeKnown && knownHitsList.length > 0) {
    console.log("\n=== KNOWN NAMES HIT COUNTS ===\n");
    for (const hit of knownHitsList) {
      const sessionLabel = hit.sessions ? ` [${hit.sessions.length} sessions]` : "";
      console.log(`${hit.canonical_name} (${hit.count} total, ${hit.primaryCount} primary${sessionLabel})`);
    }
    console.log("");
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Sessions scanned: ${sessionInputs.length}`);
  console.log(`Candidates: ${filtered.length}`);
  if (includeKnown) {
    console.log(`Known hits: ${knownHitsList.length}`);
  }

  // Write pending decisions file
  const pendingData: PendingDecisionsYaml = {
    version: 2,
    generated_at: new Date().toISOString(),
    source: {
      db: dbPath,
      guildId,
      campaignSlug,
      primaryOnly,
      minCount,
      sessionCount: sessionInputs.length,
      transcriptSource: "per_session",
    },
    pending: filtered,
    knownHits: includeKnown ? knownHitsList : [],
  };

  const pendingDir = path.dirname(pendingPath);
  if (!fs.existsSync(pendingDir)) {
    fs.mkdirSync(pendingDir, { recursive: true });
  }
  fs.writeFileSync(pendingPath, yaml.stringify(pendingData));
  console.log(`\n✅ Pending decisions written to ${pendingPath}`);
}

// Main
try {
  scanNames();
} catch (err) {
  console.error("[scan-names] ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
}
