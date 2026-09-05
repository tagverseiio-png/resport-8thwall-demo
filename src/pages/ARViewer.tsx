import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAR } from "@/hooks/useAR";
import { useModel } from "@/hooks/useModel";
import { useProject } from "@/hooks/useProject";
import { trackEvent } from "@/ar/analytics";
import { devicePerformanceTier } from "@/utils/device";
import { notifyUserInteraction } from "@/ar/motion";
import type { HotspotData } from "@/models/Hotspot";
import type { Vec3, ARAnchorData } from "@/ar/types";
import { ARCanvas } from "@/components/scene/ARCanvas";
import { EighthWallView } from "@/components/scene/EighthWallView";
import { ARControls, type ARPanel } from "@/components/ARControls";
import { ARInstructions } from "@/components/ARInstructions";
import { Amenities } from "@/components/Amenities";
import { BottomSheet } from "@/components/BottomSheet";
import { CameraPermission } from "@/components/CameraPermission";
import { ContactPanel } from "@/components/ContactPanel";
import { DesktopFallback } from "@/components/DesktopFallback";
import { ErrorScreen } from "@/components/ErrorScreen";
import { FloorPlans } from "@/components/FloorPlans";
import { Gallery } from "@/components/Gallery";
import { HotspotCard } from "@/components/HotspotCard";
import { IntroScreen } from "@/components/IntroScreen";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PlacementIndicator } from "@/components/PlacementIndicator";
import { ProjectInfo } from "@/components/ProjectInfo";
import { SurfaceScanner } from "@/components/SurfaceScanner";
import { ARDebugPanel } from "@/components/ARDebugPanel";
import { isARDebugEnabled, setARDebugEnabled } from "@/ar/debug";

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
/** How long to let the tracker look for a plane before offering advice. */
const SCAN_TIMEOUT_MS = 22_000;
/** Weak GPUs rarely converge a strict lock — fail faster into assisted mode. */
const SCAN_TIMEOUT_MS_WEAK = 10_000;

export function ARViewer({ projectSlug }: { projectSlug?: string }) {
  const project = useProject(projectSlug);
  const { flow, capabilities, planesDetected, scanStats, fallbackSignal, anchor, error, ar } =
    useAR();

  const [panel, setPanel] = useState<ARPanel>(null);
  const [hotspot, setHotspot] = useState<HotspotData | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [videoVisible, setVideoVisible] = useState(false);
  const [desktopOverride, setDesktopOverride] = useState(false);
  const [justPlaced, setJustPlaced] = useState(false);
  const [previewResetKey, setPreviewResetKey] = useState(0);
  /** Rendered GLB "scene state". Swaps on hotspot tap; the anchor is untouched. */
  const [sceneId, setSceneId] = useState<string | null>(null);
  /** SLAM debug layer. Persisted so a reload keeps it on while diagnosing. */
  const [debug, setDebug] = useState<boolean>(() => isARDebugEnabled());

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mode = capabilities?.mode ?? null;
  // The 8th Wall engine owns its own canvas + camera loop, so the HTML
  // overlay renders normally on top — no dom-overlay indirection needed.
  const isXR = mode === "eighthwall" && flow !== "PREVIEW";
  const inScene = flow === "AR_EXPLORATION" || flow === "PREVIEW";

  const activeScene = project.scenes?.find((s) => s.id === sceneId) ?? null;
  const activeModelUrl = activeScene?.modelUrl ?? project.modelUrl;

  const {
    status: modelStatus,
    progress,
    model,
  } = useModel(activeModelUrl, anchor !== null, project.realWorldSize);

  /* Funnel analytics: scan → surface → place. Edge-triggered on transitions. */
  const prevFlowRef = useRef(flow);
  useEffect(() => {
    const prev = prevFlowRef.current;
    prevFlowRef.current = flow;
    if (flow === prev) return;
    if (flow === "SURFACE_SCANNING") trackEvent("scan_started", { project: project.slug });
    if (flow === "SURFACE_DETECTED") trackEvent("surface_detected", { project: project.slug });
    if (flow === "AR_EXPLORATION" && prev === "MODEL_LOADING") {
      trackEvent("model_placed", { project: project.slug, scene: sceneId });
    }
  }, [flow, project.slug, sceneId]);

  /* Capability detection once. The 8th Wall gate covers every device, so a
     failed/absent engine simply routes to the honest 3D preview. */
  useEffect(() => {
    void ar.detectCapabilities();
    return () => {
      ar.stopAR();
    };
  }, [ar]);

  /* If the tracker finds nothing at all, say so — with what it actually saw.
     Weak devices get one automatic assisted retry first: they are
     statistically unlikely to converge a strict lock, so waiting the full
     timeout twice would just waste the visit. */
  const weakDevice = devicePerformanceTier() === "low";
  const assistedAutoTried = useRef(false);
  useEffect(() => {
    if (flow === "SCAN_INSTRUCTIONS" || flow === "INTRO") assistedAutoTried.current = false;
  }, [flow]);
  useEffect(() => {
    if (flow !== "SURFACE_SCANNING") return;
    const timer = window.setTimeout(
      () => {
        if (weakDevice && !assistedAutoTried.current) {
          assistedAutoTried.current = true;
          trackEvent("assisted_auto_retry", { project: project.slug });
          ar.startSurfaceScan();
          ar.allowAssistedPlacement();
          return;
        }
        const stats = ar.getState().scanStats;
        const waitedSec = Math.round((weakDevice ? SCAN_TIMEOUT_MS_WEAK : SCAN_TIMEOUT_MS) / 1000);
        let detail: string | undefined;
        if (!stats || stats.hitTestCalls === 0) {
          detail = `The tracker produced no data in ${waitedSec} seconds — the camera feed may be blocked or too dark. Check the lens and the browser camera permission.`;
        } else if (stats.hitTestErrors > stats.hitTestCalls / 2) {
          detail = `The tracker errored on most attempts${stats.lastError ? ` (last: ${stats.lastError})` : ""}. Restart the phone browser and try again in good light.`;
        } else if (stats.confidentHit) {
          detail =
            "A surface was briefly seen but slipped away. Rescan while sweeping very slowly over the same textured spot.";
        } else if (stats.anyHit) {
          detail =
            "The camera sees texture but no stable plane formed. Hold 1–2 m back, keep the whole table in frame, and sweep side to side. Glossy or reflective floors often never lock — try a matte surface.";
        }
        ar.fail("SURFACE_NOT_DETECTED", detail);
      },
      weakDevice ? SCAN_TIMEOUT_MS_WEAK : SCAN_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ar, flow, weakDevice, project.slug]);

  /* Model load outcome drives the state machine. */
  useEffect(() => {
    if (flow !== "MODEL_LOADING") return;
    if (modelStatus === "ready" || modelStatus === "placeholder") ar.modelReady();
    if (modelStatus === "error") ar.fail("MODEL_LOAD_FAILED");
  }, [ar, flow, modelStatus]);

  /* Ambient sound. */
  useEffect(() => {
    if (!project.audioUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(project.audioUrl);
      audio.loop = true;
      audio.volume = 0.35;
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (soundOn && inScene) void audio.play().catch(() => undefined);
    else audio.pause();
    return () => audio.pause();
  }, [project.audioUrl, soundOn, inScene]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  /* Tap-to-place with a fresh SLAM hit at the tap point (8th Wall path). */
  const placeAt = useCallback(
    (position: Vec3, via: ARAnchorData["placedVia"] = "strict") => {
      const state = ar.getState();
      if (state.flow !== "SURFACE_SCANNING" && state.flow !== "SURFACE_DETECTED") return;
      if (state.anchor) return;
      notifyUserInteraction();
      ar.placeModel(position, 1, via);
      setJustPlaced(true);
      window.setTimeout(() => setJustPlaced(false), 2200);
    },
    [ar],
  );

  const rotate = useCallback(
    (radians: number) => {
      const current = ar.getState().anchor;
      if (current) {
        notifyUserInteraction();
        ar.transformModel({ rotationY: current.rotationY + radians });
      }
    },
    [ar],
  );

  const rescale = useCallback(
    (factor: number) => {
      const current = ar.getState().anchor;
      if (!current) return;
      notifyUserInteraction();
      ar.transformModel({
        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor)),
      });
    },
    [ar],
  );

  const exit = useCallback(() => {
    // Unmounting the engine view stops the camera loop (see its cleanup).
    ar.stopAR();
  }, [ar]);

  const resetView = useCallback(() => {
    setPanel(null);
    setHotspot(null);
    setSceneId(null);
    notifyUserInteraction();
    ar.transformModel({ rotationY: 0, scale: 1 });
    setPreviewResetKey((value) => value + 1);
  }, [ar]);

  /* Hotspot tap: open the card, and swap the rendered GLB scene state when the
     hotspot carries one. Placement/session/anchor are never touched. */
  const selectHotspot = useCallback(
    (next: HotspotData | null) => {
      setHotspot(next);
      if (!next) return;
      notifyUserInteraction();
      trackEvent("hotspot_tap", { id: next.id, type: next.type ?? null, scene: sceneId });
      if (next.sceneId && next.sceneId !== sceneId) {
        setSceneId(next.sceneId);
        trackEvent("scene_swap", { from: sceneId ?? "resort", to: next.sceneId });
      }
    },
    [sceneId],
  );

  const openPanel = useCallback((next: ARPanel) => {
    setPanel(next);
    if (next) {
      notifyUserInteraction();
      trackEvent("panel_open", { panel: next });
    }
  }, []);

  const toggleDebug = useCallback(() => {
    setDebug((current) => {
      const next = !current;
      setARDebugEnabled(next);
      return next;
    });
  }, []);

  // Weak GPUs rarely converge a strict plane lock — offer the assisted escape
  // hatch much sooner instead of grinding through a hopeless scan.
  const fallbackAfterCalls = devicePerformanceTier() === "low" ? 120 : 240;

  const panelContent = useMemo(() => {
    switch (panel) {
      case "floorplans":
        return {
          title: "Floor plans",
          subtitle: "Choose a configuration",
          node: <FloorPlans plans={project.floorPlans} />,
        };
      case "amenities":
        return {
          title: "Amenities",
          subtitle: `${project.amenities.length} curated spaces`,
          node: <Amenities amenities={project.amenities} />,
        };
      case "gallery":
        return {
          title: "Gallery",
          subtitle: project.name,
          node: <Gallery items={project.gallery} />,
        };
      case "info":
        return {
          title: project.name,
          subtitle: project.location,
          node: <ProjectInfo project={project} />,
        };
      case "contact":
        return {
          title: "Talk to us",
          subtitle: project.developer,
          node: (
            <ContactPanel
              project={project}
              sceneId={sceneId}
              source={flow === "PREVIEW" ? "preview" : "ar"}
              onRestart={() => {
                setPanel(null);
                ar.restart();
              }}
            />
          ),
        };
      default:
        return null;
    }
  }, [panel, project, ar, sceneId, flow]);

  if (flow === "ERROR" && error) {
    return (
      <ErrorScreen
        error={error}
        onRetry={() => {
          if (error.retryState === "SURFACE_SCANNING") ar.startSurfaceScan();
          else if (error.retryState === "PREVIEW") ar.enterPreview();
          else if (error.retryState === "CAMERA_PERMISSION") ar.setFlow("CAMERA_PERMISSION");
          else ar.setFlow(error.retryState);
        }}
        secondaryAction={
          // Dead-end escape hatch: back to scanning with assisted placement,
          // so the next tap plants the model on tables/printed plans even
          // without a converged SLAM plane.
          error.code === "SURFACE_NOT_DETECTED"
            ? {
                label: "Place on table anyway",
                onClick: () => {
                  ar.startSurfaceScan();
                  ar.allowAssistedPlacement();
                },
              }
            : null
        }
        onExit={exit}
      />
    );
  }

  if (flow === "INTRO") {
    if (capabilities && !capabilities.isMobile && !desktopOverride) {
      return (
        <DesktopFallback project={project} onContinueAnyway={() => setDesktopOverride(true)} />
      );
    }
    return <IntroScreen project={project} capability={mode} onStart={() => ar.beginExperience()} />;
  }

  if (flow === "CAMERA_PERMISSION") {
    return (
      <CameraPermission
        projectName={project.name}
        requesting={false}
        onAllow={() => ar.acceptCameraNotice()}
        onCancel={exit}
      />
    );
  }

  /* One overlay definition. The 8th Wall engine draws on its own canvas, so
     this HTML always renders inline on top — in AR and in 3D preview alike. */
  const overlay = (
    <>
      {flow === "SCAN_INSTRUCTIONS" ? (
        <ARInstructions onContinue={() => ar.startSurfaceScan()} />
      ) : null}

      {flow === "SURFACE_SCANNING" || flow === "SURFACE_DETECTED" ? (
        <>
          <SurfaceScanner
            detected={flow === "SURFACE_DETECTED"}
            planesDetected={planesDetected}
            scanStats={scanStats}
            assisted={ar.getState().placementMode === "assisted"}
          />
          {flow === "SURFACE_SCANNING" &&
          !anchor &&
          (scanStats?.hitTestCalls ?? 0) > fallbackAfterCalls ? (
            <div className="pointer-events-none absolute inset-x-0 top-72 z-20 flex justify-center px-8">
              <button
                type="button"
                onClick={() => ar.requestFallbackPlacement()}
                className="glass-panel pointer-events-auto rounded-full px-5 py-2.5 text-xs font-semibold text-primary"
              >
                Can&apos;t find a surface? Place anyway
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {flow === "MODEL_LOADING" ? (
        <LoadingScreen
          title={`Loading ${project.name}`}
          subtitle={modelStatus === "checking" ? "Preparing assets" : "Streaming the 3D model"}
          {...(modelStatus === "loading" ? { progress } : {})}
          variant="overlay"
        />
      ) : null}

      {justPlaced && flow === "AR_EXPLORATION" ? <PlacementIndicator /> : null}

      {inScene ? (
        <>
          <ARControls
            projectName={project.name}
            activePanel={panel}
            soundOn={soundOn}
            videoPlaying={videoVisible}
            hasVideo={Boolean(project.arVideoUrl)}
            resetLabel={flow === "PREVIEW" ? "Recentre" : "Exterior"}
            onOpenPanel={openPanel}
            onResetView={resetView}
            onRotate={rotate}
            onScale={rescale}
            onToggleSound={() => setSoundOn((value) => !value)}
            onToggleVideo={() => setVideoVisible((value) => !value)}
            onExit={exit}
          />
          {hotspot ? (
            <HotspotCard
              hotspot={hotspot}
              sceneLabel={activeScene?.label ?? null}
              onBackToResort={activeScene ? () => setSceneId(null) : null}
              onClose={() => setHotspot(null)}
            />
          ) : null}
          {flow === "PREVIEW" ? (
            <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex flex-col items-center gap-2 px-6">
              <p className="glass-panel rounded-xl px-4 py-2 text-center text-xs text-muted-foreground">
                3D preview — drag to orbit, pinch to zoom. This device cannot run the AR engine.
              </p>
            </div>
          ) : null}
          {modelStatus === "placeholder" ? (
            <p className="glass-panel pointer-events-none absolute inset-x-6 top-32 z-20 rounded-xl px-4 py-2 text-center text-xs text-muted-foreground">
              Showing a massing preview — add {project.modelUrl.split("/").pop()} to see the final
              model.
            </p>
          ) : null}
        </>
      ) : null}

      {panelContent ? (
        <BottomSheet
          open
          title={panelContent.title}
          subtitle={panelContent.subtitle}
          onClose={() => setPanel(null)}
        >
          {panelContent.node}
        </BottomSheet>
      ) : null}
    </>
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-background select-none">
      {isXR ? (
        <EighthWallView
          project={project}
          flow={flow}
          anchor={anchor}
          model={model}
          showPlaceholder={modelStatus === "placeholder"}
          activeHotspotId={hotspot?.id ?? null}
          onSelectHotspot={selectHotspot}
          videoVisible={videoVisible}
          soundOn={soundOn}
          onPlaceAt={placeAt}
          debug={debug}
          fallbackSignal={fallbackSignal}
        />
      ) : (
        <ARCanvas
          project={project}
          anchor={anchor}
          model={model}
          showPlaceholder={modelStatus === "placeholder"}
          activeHotspotId={hotspot?.id ?? null}
          onSelectHotspot={selectHotspot}
          videoVisible={videoVisible}
          soundOn={soundOn}
          previewResetKey={previewResetKey}
        />
      )}

      {flow === "AR_INITIALIZING" ? (
        <LoadingScreen
          title="Starting AR"
          subtitle="Allow camera access in the prompt to continue"
          variant="overlay"
        />
      ) : null}

      {overlay}

      {isXR ? (
        <button
          type="button"
          id="ar-dbg-chip"
          onClick={toggleDebug}
          aria-pressed={debug}
          title="Toggle SLAM debug layer (?ar-debug=1)"
          className={`absolute bottom-40 left-3 z-30 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-widest uppercase backdrop-blur ${
            debug
              ? "border-cyan-300 bg-cyan-400/20 text-cyan-100"
              : "border-white/20 bg-black/40 text-white/60"
          }`}
        >
          DBG
        </button>
      ) : null}
      {isXR && debug ? <ARDebugPanel onClose={toggleDebug} /> : null}
    </main>
  );
}
