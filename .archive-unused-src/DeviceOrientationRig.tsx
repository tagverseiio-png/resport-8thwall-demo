import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { arManager } from "@/ar/ARManager";
import { isMobileDevice } from "@/utils/device";

const DEG = Math.PI / 180;

/**
 * Drives the *camera* on ALL phones. The world (and therefore the anchored
 * building) never moves — only the viewer's orientation changes.
 *
 * World-lock rules (every phone, not just Samsung):
 * - Camera position is pinned to the origin every frame. Only the quaternion
 *   changes, so the placed model stays on the floor/table while you move.
 * - Gyro path (gyro present): mapping compensates for screen orientation
 *   (portrait/landscape), otherwise pitching the phone up makes the model swim.
 * - Touch-look path (no gyro / permission denied / desktop UA on a phone):
 *   single-finger drag rotates yaw/pitch. Taps (<12px) still place the model.
 */
export function DeviceOrientationRig({ enabled }: { enabled: boolean }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const euler = useRef(new THREE.Euler());
  const quaternion = useRef(new THREE.Quaternion());
  const screenAdjust = useRef(new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)));
  const orientFix = useRef(new THREE.Quaternion());
  const zAxis = useRef(new THREE.Vector3(0, 0, 1));
  const orientAngle = useRef(0);
  // Touch-look fallback: start aimed at the floor target (0,-0.65,-1.4).
  const lookYaw = useRef(0);
  const lookPitch = useRef(-0.42);

  useEffect(() => {
    const update = () => {
      // screen.orientation.angle is 0/90/-90/180; fallback to window.orientation.
      const angle =
        (screen.orientation as ScreenOrientation | undefined)?.angle ??
        (window.orientation as unknown as number | undefined) ??
        0;
      orientAngle.current = (angle * DEG) as number;
    };
    update();
    window.addEventListener("orientationchange", update);
    screen.orientation?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      screen.orientation?.removeEventListener?.("change", update);
    };
  }, []);

  useFrame(() => {
    if (!enabled) return;
    // Pin position in every non-XR path — translation is not tracked in
    // gyro/touch (3DoF) mode, so any leftover orbit offset would make the
    // model swim with the camera.
    camera.position.set(0, 0, 0);
    if (arManager.tracking.hasData) {
      const { alpha, beta, gamma } = arManager.tracking.sample;
      euler.current.set(beta * DEG, alpha * DEG, -gamma * DEG, "YXZ");
      quaternion.current.setFromEuler(euler.current);
      quaternion.current.multiply(screenAdjust.current);
      orientFix.current.setFromAxisAngle(zAxis.current, -orientAngle.current);
      quaternion.current.multiply(orientFix.current);
      camera.quaternion.slerp(quaternion.current, 0.5);
      return;
    }
    // No gyro on this phone → touch-look fallback (updated by drag handler).
    euler.current.set(lookPitch.current, lookYaw.current, 0, "YXZ");
    quaternion.current.setFromEuler(euler.current);
    camera.quaternion.copy(quaternion.current);
  });

  // Single-finger drag = look around (all phones without gyro). Taps under
  // 12px are ignored here so ARInteraction tap-to-place keeps working.
  useEffect(() => {
    if (!isMobileDevice()) return;
    const element = gl.domElement;
    let tracking = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      tracking = true;
      lastX = touch.clientX;
      lastY = touch.clientY;
      moved = 0;
    };
    const onMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - lastX;
      const dy = touch.clientY - lastY;
      lastX = touch.clientX;
      lastY = touch.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 12) return; // still a tap candidate → don't rotate, don't block
      event.preventDefault();
      lookYaw.current -= dx * 0.005;
      lookPitch.current = Math.min(0.6, Math.max(-1.2, lookPitch.current - dy * 0.005));
    };
    const onEnd = () => {
      tracking = false;
    };
    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd, { passive: true });
    element.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
  }, [gl]);

  return null;
}
