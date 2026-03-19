import { describe, expect, test } from "vitest";
import { CANONICAL_HOST, CANONICAL_ORIGIN } from "@/lib/canonicalOrigin";
import { siteMetadata } from "@/lib/siteMetadata";

describe("web canonical origin", () => {
  test("exports starstory.online as the canonical production origin", () => {
    expect(CANONICAL_HOST).toBe("starstory.online");
    expect(CANONICAL_ORIGIN).toBe("https://starstory.online");
  });

  test("publishes starstory metadata for canonical and Open Graph URLs", () => {
    expect(siteMetadata.metadataBase?.toString()).toBe("https://starstory.online/");
    expect(siteMetadata.alternates?.canonical).toBe("/");
    expect(siteMetadata.openGraph?.url).toBe("https://starstory.online");
  });
});
