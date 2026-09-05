import { buildSceneViewerUrl } from "@/ar/deviceGate";

type ARSceneViewerButtonProps = {
  modelUrl: string;
  title: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Android "View in your space" — Google Scene Viewer, i.e. the
 * `scene-viewer` ar-mode from the google/model-viewer matrix, hand-rolled as
 * an intent URL so we don't ship the model-viewer bundle (our hotspot and
 * anchor UI needs the custom R3F scene anyway).
 *
 * The intent escapes even in-app webviews into real AR. Renders nothing when
 * there is no public https:// GLB (localhost previews, http hosts).
 */
export function ARSceneViewerButton({
  modelUrl,
  title,
  className,
  children,
}: ARSceneViewerButtonProps) {
  const href = buildSceneViewerUrl(modelUrl, title);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
