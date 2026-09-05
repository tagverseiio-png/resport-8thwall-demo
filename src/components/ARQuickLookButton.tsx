import { useCallback, useRef, type ReactNode } from "react";

type ARQuickLookButtonProps = {
  /** Static .usdz URL. Blob URLs do NOT work with rel="ar". */
  usdzUrl: string;
  /** Thumbnail the AR anchor must contain — WebKit requires a single <img> child. */
  posterUrl: string;
  className?: string;
  children: ReactNode;
};

/**
 * Launches iOS AR Quick Look — the only route to real ARKit world tracking from
 * Safari on iPhone.
 *
 * WebKit only intercepts `rel="ar"` anchors whose sole child is an <img>, so the
 * anchor is kept hidden and clicked programmatically from a real button (the
 * click still happens inside the user gesture, which Safari requires).
 */
export function ARQuickLookButton({
  usdzUrl,
  posterUrl,
  className,
  children,
}: ARQuickLookButtonProps) {
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const launch = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    // Let the OS share sheet point back at this page rather than the raw asset.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams({ canonicalWebPageURL: window.location.href });
      anchor.href = `${usdzUrl}#${params.toString()}`;
    }
    anchor.click();
  }, [usdzUrl]);

  return (
    <>
      <a ref={anchorRef} rel="ar" href={usdzUrl} className="hidden" aria-hidden tabIndex={-1}>
        <img src={posterUrl} alt="" width={1} height={1} />
      </a>
      <button type="button" onClick={launch} className={className}>
        {children}
      </button>
    </>
  );
}
