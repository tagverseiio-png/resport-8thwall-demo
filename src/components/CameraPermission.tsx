import { Camera, ShieldCheck } from "lucide-react";
import { ResortMark } from "./Brand";

type CameraPermissionProps = {
  projectName: string;
  requesting: boolean;
  onAllow: () => void;
  onCancel: () => void;
};

export function CameraPermission({
  projectName,
  requesting,
  onAllow,
  onCancel,
}: CameraPermissionProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-7 text-center">
      <div className="glass-panel animate-rise-in w-full max-w-sm rounded-3xl p-7">
        <span className="gold-surface mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl">
          <Camera className="size-6" />
        </span>
        <h1 className="font-display text-2xl leading-snug">Camera access is required</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          We use your camera to place {projectName} in your surroundings. Nothing is recorded or
          uploaded.
        </p>
        <button
          type="button"
          onClick={onAllow}
          disabled={requesting}
          className="gold-surface mt-7 w-full rounded-full px-6 py-3.5 text-sm font-semibold tracking-[0.14em] uppercase disabled:opacity-70"
        >
          {requesting ? "Requesting…" : "Allow camera"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-full border border-border px-6 py-3 text-sm text-muted-foreground"
        >
          Not now
        </button>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          Processed on your device only
        </p>
      </div>
      <ResortMark className="mt-8" />
    </main>
  );
}
