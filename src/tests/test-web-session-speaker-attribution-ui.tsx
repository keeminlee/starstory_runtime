// @ts-nocheck
import React from "react";
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeakerAttributionPanel } from "../../apps/web/components/session/speaker-attribution-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("SpeakerAttributionPanel", () => {
  test("renders speaker display names without exposing raw Discord ids", () => {
    const html = renderToStaticMarkup(
      <SpeakerAttributionPanel
        sessionId="session-1"
        campaignSlug="alpha"
        canWrite={true}
        initialState={{
          required: true,
          ready: false,
          pendingCount: 1,
          dmDiscordUserId: null,
          speakers: [
            {
              discordUserId: "123456789012345678",
              displayName: "Jamison",
              firstSeenAt: "2026-03-20T00:00:00.000Z",
              classification: null,
            },
          ],
          availablePcs: [],
        }}
        onBeginRecapGeneration={async () => undefined}
      />
    );

    expect(html).toContain("Jamison");
    expect(html).not.toContain("123456789012345678");
  });
});