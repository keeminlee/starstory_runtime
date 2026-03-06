export type RecallSurface = "text_message" | "voice_utterance";

export const RECALL_SAFETY = {
  requestThrottle: {
    perUserWindowMs: 60_000,
    perUserMax: 8,
    perGuildWindowMs: 20_000,
    perGuildMax: 20,
  },
  shape: {
    maxRegistryMatches: 5,
    maxEventsPerMatch: 25,
    maxUniqueEvents: 60,
    maxSessionsWithEvents: 4,
    maxBeatsPerSession: 4,
    maxTotalBeats: 12,
    maxTranscriptLines: 80,
  },
} as const;

type ThrottleResult = {
  throttled: boolean;
  retryAfterMs: number;
  reason: "user" | "guild" | null;
};

const requestTimestampsByUserKey = new Map<string, number[]>();
const requestTimestampsByGuildKey = new Map<string, number[]>();

function pruneWindow(timestamps: number[], nowMs: number, windowMs: number): number[] {
  return timestamps.filter((ts) => nowMs - ts < windowMs);
}

function toUserThrottleKey(args: {
  guildId: string;
  actorUserId: string;
  surface: RecallSurface;
}): string {
  return [
    args.guildId.trim().toLowerCase(),
    args.actorUserId.trim().toLowerCase(),
    args.surface,
  ].join("|");
}

function toGuildThrottleKey(args: {
  guildId: string;
  surface: RecallSurface;
}): string {
  return [args.guildId.trim().toLowerCase(), args.surface].join("|");
}

export function checkAndRecordRecallThrottle(args: {
  guildId: string;
  actorUserId: string;
  surface: RecallSurface;
  nowMs?: number;
}): ThrottleResult {
  const nowMs = args.nowMs ?? Date.now();
  const userKey = toUserThrottleKey(args);
  const guildKey = toGuildThrottleKey(args);

  const userTimestamps = pruneWindow(
    requestTimestampsByUserKey.get(userKey) ?? [],
    nowMs,
    RECALL_SAFETY.requestThrottle.perUserWindowMs
  );
  if (userTimestamps.length >= RECALL_SAFETY.requestThrottle.perUserMax) {
    const oldestInWindow = userTimestamps[0] ?? nowMs;
    return {
      throttled: true,
      retryAfterMs: Math.max(1, RECALL_SAFETY.requestThrottle.perUserWindowMs - (nowMs - oldestInWindow)),
      reason: "user",
    };
  }

  const guildTimestamps = pruneWindow(
    requestTimestampsByGuildKey.get(guildKey) ?? [],
    nowMs,
    RECALL_SAFETY.requestThrottle.perGuildWindowMs
  );
  if (guildTimestamps.length >= RECALL_SAFETY.requestThrottle.perGuildMax) {
    const oldestInWindow = guildTimestamps[0] ?? nowMs;
    return {
      throttled: true,
      retryAfterMs: Math.max(1, RECALL_SAFETY.requestThrottle.perGuildWindowMs - (nowMs - oldestInWindow)),
      reason: "guild",
    };
  }

  userTimestamps.push(nowMs);
  guildTimestamps.push(nowMs);
  requestTimestampsByUserKey.set(userKey, userTimestamps);
  requestTimestampsByGuildKey.set(guildKey, guildTimestamps);

  return {
    throttled: false,
    retryAfterMs: 0,
    reason: null,
  };
}

export function boundedItems<T>(items: T[], maxItems: number): T[] {
  if (maxItems <= 0) return [];
  if (items.length <= maxItems) return items;
  return items.slice(0, maxItems);
}

export function clearRecallSafetyStateForTests(): void {
  requestTimestampsByUserKey.clear();
  requestTimestampsByGuildKey.clear();
}
