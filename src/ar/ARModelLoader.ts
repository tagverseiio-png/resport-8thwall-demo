import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelLoadProgress } from "./types";

export type LoadedModel = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Uniform scale that fits the model inside `targetSize` metres. */
  fitScale: number;
  /** Offset that puts the model's base at y = 0. */
  baseOffset: THREE.Vector3;
};

let cachedLoader: GLTFLoader | null = null;
const modelCache = new Map<string, Promise<LoadedModel>>();

function createLoader(renderer?: THREE.WebGLRenderer): GLTFLoader {
  if (cachedLoader) return cachedLoader;
  const loader = new GLTFLoader();

  // Draco compressed geometry.
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  loader.setDRACOLoader(draco);

  // Meshopt compressed geometry.
  loader.setMeshoptDecoder(MeshoptDecoder);

  // Compressed (KTX2 / Basis) textures.
  const ktx2 = new KTX2Loader().setTranscoderPath(
    "https://unpkg.com/three@0.185.1/examples/jsm/libs/basis/",
  );
  if (renderer) ktx2.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  cachedLoader = loader;
  return loader;
}

/** Loads a GLB/glTF asynchronously with progress, caching and mobile-friendly setup. */
export function loadModel(
  url: string,
  options: {
    targetSize?: number;
    renderer?: THREE.WebGLRenderer;
    onProgress?: (progress: ModelLoadProgress) => void;
  } = {},
): Promise<LoadedModel> {
  const { targetSize = 1, renderer, onProgress } = options;
  const cacheKey = `${url}|${targetSize}`;
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;

  const promise = new Promise<LoadedModel>((resolve, reject) => {
    const loader = createLoader(renderer);
    loader.load(
      url,
      (gltf: GLTF) => {
        const scene = gltf.scene;
        scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          const material = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (material && "envMapIntensity" in material) material.envMapIntensity = 1;
        });

        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const largest = Math.max(size.x, size.y, size.z) || 1;
        const fitScale = targetSize / largest;
        const baseOffset = new THREE.Vector3(-center.x, -box.min.y, -center.z);

        resolve({ scene, animations: gltf.animations, fitScale, baseOffset });
      },
      (event: ProgressEvent) => {
        onProgress?.({
          loaded: event.loaded,
          total: event.total,
          ratio: event.total > 0 ? event.loaded / event.total : -1,
        });
      },
      (error: unknown) => {
        modelCache.delete(cacheKey);
        reject(error instanceof Error ? error : new Error("Model failed to load"));
      },
    );
  });

  modelCache.set(cacheKey, promise);
  return promise;
}

/** Frees GPU memory for a model we no longer show. */
export function disposeModel(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.filter(Boolean).forEach((material) => {
      const standard = material as THREE.MeshStandardMaterial;
      standard.map?.dispose();
      standard.normalMap?.dispose();
      standard.roughnessMap?.dispose();
      standard.metalnessMap?.dispose();
      standard.aoMap?.dispose();
      standard.emissiveMap?.dispose();
      standard.dispose();
    });
  });
}

export function clearModelCache(): void {
  modelCache.clear();
}

/** True when the asset actually exists — used to fall back to a placeholder. */
export async function modelExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return false;
    const length = Number(response.headers.get("content-length") ?? "0");
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return false;
    return length === 0 ? true : length > 1000;
  } catch {
    return false;
  }
}
