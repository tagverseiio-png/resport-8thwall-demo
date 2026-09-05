import { useState } from "react";
import { ArrowRight, Copy, Check, ExternalLink } from "lucide-react";
import { externalBrowserHint } from "@/ar/deviceGate";
import type { OSKind } from "@/ar/deviceGate";
import { ResortMark } from "./Brand";

type OpenInBrowserPromptProps = {
  projectName: string;
  heroImage: string;
  os: OSKind;
  appLabel: string;
  shareUrl: string;
  onContinueAnyway: () => void;
};

/**
 * The "unsupported browser" hint — same job as 8th Wall's LandingPage
 * pipeline module. Shown when the page runs inside an iOS in-app webview,
 * where neither WebXR nor Quick Look can anchor anything.
 */
export function OpenInBrowserPrompt({
  projectName,
  heroImage,
  os,
  appLabel,
  shareUrl,
  onContinueAnyway,
}: OpenInBrowserPromptProps) {
  const [copied, setCopied] = useState(false);
  const steps = externalBrowserHint(os, appLabel);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the URL is still visible below */
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <img
        src={heroImage}
        alt={`${projectName} at dusk`}
        width={1088}
        height={1920}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="cinematic-veil absolute inset-0" />

      <div className="relative flex min-h-screen flex-col justify-between px-6 safe-top safe-bottom">
        <header className="flex items-center justify-between">
          <ResortMark />
          <span className="rounded-full border border-glass-border px-3 py-1 text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
            WebAR
          </span>
        </header>

        <section className="animate-rise-in max-w-md">
          <p className="flex items-center gap-2 text-xs tracking-[0.22em] text-primary uppercase">
            <ExternalLink className="size-3.5" />
            One quick step
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.1]">Open in Safari for AR</h1>
          <ul className="mt-4 space-y-2">
            {steps.map((step) => (
              <li key={step} className="text-sm leading-relaxed text-muted-foreground">
                {step}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={copyLink}
            className="gold-surface mt-8 flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-sm font-semibold tracking-[0.16em] uppercase"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Link copied" : "Copy experience link"}
            <ArrowRight className="size-4" />
          </button>
          <p className="mt-3 truncate text-center text-xs text-muted-foreground">{shareUrl}</p>
          <button
            type="button"
            onClick={onContinueAnyway}
            className="mt-4 w-full rounded-full border border-glass-border px-6 py-3 text-xs tracking-[0.16em] text-muted-foreground uppercase"
          >
            Continue to 3D without AR
          </button>
        </section>
      </div>
    </main>
  );
}
