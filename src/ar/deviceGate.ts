import { isAndroid, isIOS } from "@/utils/device";

/**
 * Entry gate — our equivalent of `XR8.XrDevice.isDeviceBrowserCompatible()`.
 *
 * ```text
 * Load page
 *   → gate verdict
 *     → WebXR AR (native browsers with immersive-ar)
 *     → OS-viewer AR (iOS Quick Look / Android Scene Viewer —
 *       also rescues most in-app webviews, which lack WebXR bindings)
 *     → non-AR fallback (Three.js orbit viewer)
 *       — only for the genuine minority: desktops, very old devices,
 *         denied permissions, or no public URL for the OS viewers
 * ```
 *
 * Plain `navigator.xr.isSessionSupported` misroutes one large group: in-app
 * webviews (Instagram, WhatsApp, TikTok, …). They report "no WebXR" but the
 * device itself is AR-capable, so the gate also sniffs the host app and —
 * on iOS, where even Quick Look is unreliable inside foreign webviews —
 * asks the user to open the page in Safari instead of silently degrading.
 * That "unsupported browser" hint is the same job as 8th Wall's
 * LandingPage pipeline module.
 */

export type OSKind = "ios" | "android" | "desktop" | "other";

export function getOSKind(): OSKind {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  if (typeof navigator !== "undefined" && /Windows|Macintosh|Linux|X11/i.test(navigator.userAgent))
    return "desktop";
  return "other";
}

type InAppPattern = { id: string; label: string; test: RegExp };

const IN_APP_PATTERNS: InAppPattern[] = [
  { id: "instagram", label: "Instagram", test: /Instagram/i },
  { id: "facebook", label: "Facebook", test: /FBAN|FBAV|FB_IAB/i },
  { id: "messenger", label: "Messenger", test: /Messenger|MESSENGER/i },
  { id: "whatsapp", label: "WhatsApp", test: /WhatsApp/i },
  { id: "tiktok", label: "TikTok", test: / musical_ly|Bytedance|TikTok|musically/i },
  { id: "snapchat", label: "Snapchat", test: /Snapchat/i },
  { id: "twitter", label: "X (Twitter)", test: /Twitter/i },
  { id: "line", label: "LINE", test: / Line\//i },
  { id: "wechat", label: "WeChat", test: /MicroMessenger/i },
  { id: "pinterest", label: "Pinterest", test: /Pinterest/i },
  { id: "linkedin", label: "LinkedIn", test: /LinkedInApp/i },
  { id: "telegram", label: "Telegram", test: /Telegram/i },
  { id: "slack", label: "Slack", test: /Slack/i },
  { id: "discord", label: "Discord", test: /Discord/i },
  // Generic webview markers last: they also match some valid browsers' UAs.
  { id: "webview-android", label: "in-app browser", test: /; wv\)/i },
  { id: "webview-ios", label: "in-app browser", test: /CriOS.*Safari/i },
];

export type InAppBrowser = { id: string; label: string };

/** Host-app sniffing. Null = genuine native browser. UA-based, best effort. */
export function detectInAppBrowser(ua?: string): InAppBrowser | null {
  const source = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!source) return null;
  // iOS WKWebView shells that don't brand themselves: no Safari version token.
  const iosUnbrandedWebView =
    isIOS() &&
    /AppleWebKit/i.test(source) &&
    !/Safari/i.test(source) &&
    !/CriOS|FxiOS|EdgiOS/i.test(source);
  for (const pattern of IN_APP_PATTERNS) {
    if (pattern.test.test(source)) return { id: pattern.id, label: pattern.label };
  }
  if (iosUnbrandedWebView) return { id: "webview-ios", label: "in-app browser" };
  return null;
}

/**
 * True when the page must be reopened in the OS browser for AR to work:
 * iOS in-app webviews (no WebXR, and Quick Look `rel="ar"` is unreliable
 * inside foreign WKWebViews). Android in-app browsers are NOT included —
 * the Scene Viewer intent escapes the webview into real AR.
 */
export function needsExternalBrowser(os: OSKind, inApp: InAppBrowser | null): boolean {
  return os === "ios" && inApp !== null;
}

/** Per-app hint for the "open in your browser" sheet. */
export function externalBrowserHint(os: OSKind, appLabel: string): string[] {
  if (os === "ios") {
    return [
      `You opened this link inside ${appLabel}, which cannot run AR.`,
      "Tap the ••• or share icon, then choose “Open in Safari”.",
      "The resort will then anchor in your room at true scale.",
    ];
  }
  return [
    `You opened this link inside ${appLabel}.`,
    "Tap the ••• menu and choose “Open in Chrome” for the full AR experience.",
  ];
}

/**
 * Google Scene Viewer URL — the `scene-viewer` ar-mode from the
 * google/model-viewer matrix, without shipping the model-viewer bundle
 * (our hotspot/anchor UI needs the custom R3F scene anyway).
 * Requires a public https:// GLB — returns null on localhost/http.
 */
export function buildSceneViewerUrl(modelUrl: string, title: string): string | null {
  if (typeof window === "undefined") return null;
  let file: string;
  try {
    file = new URL(modelUrl, window.location.href).toString();
  } catch {
    return null;
  }
  if (!file.startsWith("https://")) return null;
  const url = new URL("https://arvr.google.com/scene-viewer/1.0");
  url.searchParams.set("file", file);
  url.searchParams.set("mode", "ar_only");
  url.searchParams.set("title", title);
  return url.toString();
}
