import type { Metadata } from "next";
import { CANONICAL_ORIGIN } from "@/lib/canonicalOrigin";

export const SITE_TITLE = "Starstory Archive";
export const SITE_DESCRIPTION = "The Starstory archive for campaign sessions, chronicles, and recaps.";

export const siteMetadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: CANONICAL_ORIGIN,
    siteName: SITE_TITLE,
    type: "website",
  },
};
