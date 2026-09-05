import {
  Building2,
  Images,
  Info,
  LayoutPanelTop,
  Minus,
  PhoneCall,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Play,
} from "lucide-react";

export type ARPanel = "floorplans" | "amenities" | "gallery" | "info" | "contact" | null;

type ARControlsProps = {
  projectName: string;
  activePanel: ARPanel;
  soundOn: boolean;
  videoPlaying: boolean;
  hasVideo: boolean;
  /** Label for the left-most nav item, which re-frames the model. */
  resetLabel: string;
  onOpenPanel: (panel: ARPanel) => void;
  onResetView: () => void;
  /** Yaw the model about its anchor, in radians. */
  onRotate: (radians: number) => void;
  /** Multiply the model's scale about its anchor. */
  onScale: (factor: number) => void;
  onToggleSound: () => void;
  onToggleVideo: () => void;
  onExit: () => void;
};

const ITEMS: { key: Exclude<ARPanel, null> | "exterior"; label: string; Icon: typeof Info }[] = [
  { key: "exterior", label: "Exterior", Icon: Building2 },
  { key: "floorplans", label: "Floor plans", Icon: LayoutPanelTop },
  { key: "amenities", label: "Amenities", Icon: Sparkles },
  { key: "gallery", label: "Gallery", Icon: Images },
  { key: "info", label: "Info", Icon: Info },
  { key: "contact", label: "Contact", Icon: PhoneCall },
];

export function ARControls({
  projectName,
  activePanel,
  soundOn,
  videoPlaying,
  hasVideo,
  resetLabel,
  onOpenPanel,
  onResetView,
  onRotate,
  onScale,
  onToggleSound,
  onToggleVideo,
  onExit,
}: ARControlsProps) {
  return (
    <>
      <header
        id="ar-chrome-header"
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-4 safe-top"
      >
        <div className="glass-panel pointer-events-auto rounded-full px-4 py-2">
          <p className="text-sm font-medium tracking-wide">{projectName}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {hasVideo ? (
            <button
              type="button"
              onClick={onToggleVideo}
              aria-label={videoPlaying ? "Hide AR film" : "Play AR film"}
              className={`glass-panel rounded-full p-2.5 ${videoPlaying ? "text-primary" : "text-muted-foreground"}`}
            >
              <Play className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundOn ? "Mute sound" : "Unmute sound"}
            className={`glass-panel rounded-full p-2.5 ${soundOn ? "text-primary" : "text-muted-foreground"}`}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="Close AR"
            className="glass-panel rounded-full p-2.5 text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="pointer-events-none absolute right-4 bottom-24 z-30 flex flex-col gap-2 safe-bottom">
        <div
          id="ar-chrome-zoom"
          className="glass-panel pointer-events-auto flex flex-col overflow-hidden rounded-2xl"
        >
          <button
            type="button"
            onClick={() => onScale(1.15)}
            aria-label="Make the model larger"
            className="p-3 text-muted-foreground active:text-primary"
          >
            <Plus className="size-4" />
          </button>
          <span className="mx-2 h-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => onScale(1 / 1.15)}
            aria-label="Make the model smaller"
            className="p-3 text-muted-foreground active:text-primary"
          >
            <Minus className="size-4" />
          </button>
        </div>
        <div
          id="ar-chrome-rotate"
          className="glass-panel pointer-events-auto flex flex-col overflow-hidden rounded-2xl"
        >
          <button
            type="button"
            onClick={() => onRotate(-Math.PI / 12)}
            aria-label="Rotate the model left"
            className="p-3 text-muted-foreground active:text-primary"
          >
            <RotateCcw className="size-4" />
          </button>
          <span className="mx-2 h-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => onRotate(Math.PI / 12)}
            aria-label="Rotate the model right"
            className="p-3 text-muted-foreground active:text-primary"
          >
            <RotateCw className="size-4" />
          </button>
        </div>
      </div>

      <nav
        id="ar-chrome-nav"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-3 safe-bottom"
      >
        <ul className="glass-panel pointer-events-auto flex items-center gap-1 overflow-x-auto rounded-2xl p-1.5">
          {ITEMS.map(({ key, label, Icon }) => {
            const active = key !== "exterior" && activePanel === key;
            return (
              <li key={key} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => (key === "exterior" ? onResetView() : onOpenPanel(key as ARPanel))}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.62rem] tracking-wide transition-colors ${
                    active ? "bg-secondary text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" />
                  <span className="truncate">{key === "exterior" ? resetLabel : label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
