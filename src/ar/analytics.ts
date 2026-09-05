/**
 * Funnel analytics (plan: scan → place → hotspot tap → booking).
 *
 * Privacy-first by design: events stay in memory and are re-broadcast as a
 * window CustomEvent (`"aurelia-analytics"`) so any tag manager can forward
 * them. No third-party SDK, no cookies, no fingerprinting. Set
 * ANALYTICS_WEBHOOK_URL (Vite env `VITE_ANALYTICS_WEBHOOK_URL`) to also POST
 * each event to your own collector.
 */
export type FunnelEvent =
  | "scan_started"
  | "surface_detected"
  | "model_placed"
  | "hotspot_tap"
  | "scene_swap"
  | "panel_open"
  | "booking_click"
  | "lead_submitted"
  | "assisted_auto_retry";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const seen: Array<{ event: FunnelEvent; props: AnalyticsProps; at: string }> = [];

export function trackEvent(event: FunnelEvent, props: AnalyticsProps = {}): void {
  const entry = { event, props, at: new Date().toISOString() };
  seen.push(entry);
  if (seen.length > 200) seen.shift();
  try {
    window.dispatchEvent(new CustomEvent("aurelia-analytics", { detail: entry }));
  } catch {
    /* non-DOM context (SSR) — memory log still holds the funnel */
  }
  if (typeof process !== "undefined" && process.env?.["NODE_ENV"] !== "production") {
    console.debug("[analytics]", event, props);
  }
  const webhook =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string> }).env?.[
          "VITE_ANALYTICS_WEBHOOK_URL"
        ]
      : undefined;
  if (webhook && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(webhook, JSON.stringify(entry));
    } catch {
      /* analytics must never break the experience */
    }
  }
}

/** Read-only copy of this session's funnel, useful for debugging. */
export function readFunnel(): Array<{ event: FunnelEvent; props: AnalyticsProps; at: string }> {
  return [...seen];
}
