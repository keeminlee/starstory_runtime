import { afterEach, describe, expect, test } from "vitest";
import {
  RECALL_SAFETY,
  boundedItems,
  checkAndRecordRecallThrottle,
  clearRecallSafetyStateForTests,
} from "../recall/recallSafety.js";

afterEach(() => {
  clearRecallSafetyStateForTests();
});

describe("recall safety", () => {
  test("boundedItems truncates to configured max", () => {
    expect(boundedItems([1, 2, 3], 2)).toEqual([1, 2]);
    expect(boundedItems([1, 2], 5)).toEqual([1, 2]);
    expect(boundedItems([1], 0)).toEqual([]);
  });

  test("per-user throttle blocks after configured burst in window", () => {
    const guildId = "guild-1";
    const actorUserId = "user-1";
    const surface = "text_message" as const;

    const max = RECALL_SAFETY.requestThrottle.perUserMax;
    for (let i = 0; i < max; i++) {
      const result = checkAndRecordRecallThrottle({
        guildId,
        actorUserId,
        surface,
        nowMs: 1_000,
      });
      expect(result.throttled).toBe(false);
    }

    const blocked = checkAndRecordRecallThrottle({
      guildId,
      actorUserId,
      surface,
      nowMs: 1_000,
    });
    expect(blocked.throttled).toBe(true);
    expect(blocked.reason).toBe("user");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  test("per-guild throttle blocks aggregate burst across users", () => {
    const guildId = "guild-2";
    const surface = "voice_utterance" as const;
    const max = RECALL_SAFETY.requestThrottle.perGuildMax;

    for (let i = 0; i < max; i++) {
      const result = checkAndRecordRecallThrottle({
        guildId,
        actorUserId: `user-${i}`,
        surface,
        nowMs: 2_000,
      });
      expect(result.throttled).toBe(false);
    }

    const blocked = checkAndRecordRecallThrottle({
      guildId,
      actorUserId: "user-overflow",
      surface,
      nowMs: 2_000,
    });
    expect(blocked.throttled).toBe(true);
    expect(blocked.reason).toBe("guild");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
