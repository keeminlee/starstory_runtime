import { describe, expect, test } from "vitest";
import { CANONICAL_HOST, CANONICAL_ORIGIN } from "@/lib/canonicalOrigin";
import { siteMetadata } from "@/lib/siteMetadata";

type SiteIcons = {
  icon?: unknown;
  apple?: unknown;
};

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

  test("publishes favicon, apple icon, and manifest metadata", () => {
    const icons = siteMetadata.icons as SiteIcons;

    expect(siteMetadata.manifest).toBe("/site.webmanifest");
    expect(icons.icon).toEqual([
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon.png", sizes: "64x64", type: "image/png" },
    ]);
    expect(icons.apple).toEqual([
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ]);
  });
});
