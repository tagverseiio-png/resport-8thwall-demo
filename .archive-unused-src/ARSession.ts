import type { CameraPermissionState } from "./types";
import { hasCameraApi } from "@/utils/device";

/**
 * Owns the raw camera feed. Used directly by the mock/demo provider; the WebXR
 * provider lets the browser compositor own the camera instead.
 */
export class ARSession {
  private stream: MediaStream | null = null;

  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  async requestCamera(): Promise<CameraPermissionState> {
    if (!hasCameraApi()) return "unavailable";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      return "granted";
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") return "denied";
      if (name === "NotFoundError" || name === "NotReadableError") return "unavailable";
      return "denied";
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
