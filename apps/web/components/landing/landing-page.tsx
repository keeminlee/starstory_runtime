import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import { buildPrimarySignInPath, STARSTORY_DISCORD_INSTALL_URL } from "@/lib/auth/primaryAuth";

export function LandingPage() {
  return (
    <div className="relative min-h-screen selection:bg-primary/30">
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/5 shadow-[0_0_28px_hsla(42,74%,66%,0.12)]">
            <Sparkles className="h-6 w-6 animate-pulse text-primary" />
          </div>
        </div>
        <h1 className="font-heading mt-5 text-7xl tracking-tight md:text-9xl">Starstory</h1>
        <p className="font-body-serif mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-[1.9rem] md:leading-relaxed">
          A living chronicle for your D&amp;D campaigns. A record that deepens with every session.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <a href="#how-it-works" className="button-primary rounded-full px-8 py-4 text-lg font-semibold">
            <span className="inline-flex items-center gap-2">
              Start Your Chronicle
              <ChevronDown className="h-5 w-5" />
            </span>
          </a>
          <Link
            href="/campaigns/demo"
            className="control-button-ghost rounded-full px-8 py-4 text-lg font-semibold text-primary/90"
          >
            See Examples
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl items-center px-6 py-20">
        <div className="w-full">
          <ol className="mx-auto max-w-3xl divide-y divide-border/35 text-left">
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 sm:grid-cols-[3.5rem_1fr] sm:py-7">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/28 bg-primary/10 text-base font-semibold text-primary shadow-[0_0_14px_hsla(42,74%,66%,0.08)] sm:h-10 sm:w-10 sm:text-lg">
                1
              </span>
              <a
                href={STARSTORY_DISCORD_INSTALL_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[1.1rem] leading-8 text-primary underline decoration-primary/45 underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[1.16rem]"
              >
                Invite Discord Bot
              </a>
            </li>
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 text-[1.08rem] leading-8 sm:grid-cols-[3.5rem_1fr] sm:py-7 sm:text-[1.16rem]">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/24 bg-primary/8 text-base font-semibold text-primary/90 sm:h-10 sm:w-10 sm:text-lg">2</span>
              <span>Join your voice channel</span>
            </li>
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 text-[1.08rem] leading-8 sm:grid-cols-[3.5rem_1fr] sm:py-7 sm:text-[1.16rem]">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/24 bg-primary/8 text-base font-semibold text-primary/90 sm:h-10 sm:w-10 sm:text-lg">3</span>
              <span>Run <span className="font-mono text-lg text-primary/95">/starstory awaken</span></span>
            </li>
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 text-[1.08rem] leading-8 sm:grid-cols-[3.5rem_1fr] sm:py-7 sm:text-[1.16rem]">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/24 bg-primary/8 text-base font-semibold text-primary/90 sm:h-10 sm:w-10 sm:text-lg">4</span>
              <span>Play your session as normal</span>
            </li>
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 text-[1.08rem] leading-8 sm:grid-cols-[3.5rem_1fr] sm:py-7 sm:text-[1.16rem]">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/24 bg-primary/8 text-base font-semibold text-primary/90 sm:h-10 sm:w-10 sm:text-lg">5</span>
              <span>Run <span className="font-mono text-lg text-primary/95">/starstory end</span></span>
            </li>
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 text-[1.08rem] leading-8 sm:grid-cols-[3.5rem_1fr] sm:py-7 sm:text-[1.16rem]">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/24 bg-primary/8 text-base font-semibold text-primary/90 sm:h-10 sm:w-10 sm:text-lg">6</span>
              <span>
                Return to Starstory and <Link href={buildPrimarySignInPath("/dashboard")} className="text-primary underline decoration-primary/45 underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background">log in</Link>
              </span>
            </li>
            <li className="grid grid-cols-[3.25rem_1fr] items-start gap-5 py-6 text-[1.08rem] leading-8 sm:grid-cols-[3.5rem_1fr] sm:py-7 sm:text-[1.16rem]">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-primary/24 bg-primary/8 text-base font-semibold text-primary/90 sm:h-10 sm:w-10 sm:text-lg">7</span>
              <span>Starstory learns directly from your edits</span>
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}
