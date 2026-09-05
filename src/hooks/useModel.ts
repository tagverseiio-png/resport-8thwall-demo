import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { disposeModel, loadModel, modelExists, type LoadedModel } from "@/ar/ARModelLoader";

export type ModelStatus = "idle" | "checking" | "loading" | "ready" | "placeholder" | "error";

/**
 * Loads the project GLB lazily — only once the user has actually placed the
 * property, so the intro screen stays light.
 */
export function useModel(url: string, enabled: boolean, targetSize = 1) {
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [model, setModel] = useState<LoadedModel | null>(null);
  const loadedRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus("checking");
    setProgress(0);

    (async () => {
      const exists = await modelExists(url);
      if (cancelled) return;
      if (!exists) {
        setStatus("placeholder");
        return;
      }
      setStatus("loading");
      try {
        const result = await loadModel(url, {
          targetSize,
          onProgress: ({ ratio }) => {
            if (!cancelled) setProgress(ratio < 0 ? 0.5 : ratio);
          },
        });
        if (cancelled) return;
        loadedRef.current = result.scene;
        setModel(result);
        setProgress(1);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, enabled, targetSize]);

  useEffect(
    () => () => {
      if (loadedRef.current) disposeModel(loadedRef.current);
    },
    [],
  );

  return { status, progress, model, retry: () => setStatus("idle") };
}
