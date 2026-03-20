import type { Metadata } from "next";
import { CANONICAL_ORIGIN } from "@/lib/canonicalOrigin";

export const SITE_TITLE = "Starstory Archive";
export const SITE_DESCRIPTION = "The Starstory archive for campaign sessions, chronicles, and recaps.";
export const SITE_APP_NAME = "Starstory";

export const siteMetadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  applicationName: SITE_APP_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: SITE_APP_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: CANONICAL_ORIGIN,
    siteName: SITE_TITLE,
    type: "website",
  },
};

