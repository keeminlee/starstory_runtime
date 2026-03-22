import type { Metadata } from "next";
import { Libre_Baskerville, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { RootChrome } from "@/components/layout/root-chrome";
import { siteMetadata } from "@/lib/siteMetadata";
import "@/app/globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif-4",
  display: "swap",
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  variable: "--font-libre-baskerville",
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sourceSerif.variable} ${libreBaskerville.variable}`}>
        <RootChrome>{children}</RootChrome>
      </body>
    </html>
  );
}
