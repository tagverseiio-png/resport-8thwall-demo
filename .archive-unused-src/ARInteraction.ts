/**
 * Touch gesture recognition for the placed model.
 *
 * Gestures ONLY produce local scale / yaw deltas. They never touch the anchor
 * position, so the world lock cannot be broken by interaction.
 */
export type GestureHandlers = {
  onTap?: (x: number, y: number) => void;
  onPinch?: (scaleFactor: number) => void;
  onTwist?: (radians: number) => void;
};

export class ARInteraction {
  private handlers: GestureHandlers = {};
  private element: HTMLElement | null = null;
  private startDistance = 0;
  private startAngle = 0;
  private tapCandidate: { x: number; y: number; t: number } | null = null;
  private multitouch = false;

  attach(element: HTMLElement, handlers: GestureHandlers): void {
    this.detach();
    this.element = element;
    this.handlers = handlers;
    element.addEventListener("touchstart", this.onTouchStart, { passive: true });
    element.addEventListener("touchmove", this.onTouchMove, { passive: false });
    element.addEventListener("touchend", this.onTouchEnd, { passive: true });
    element.addEventListener("click", this.onClick);
  }

  detach(): void {
    const element = this.element;
    if (!element) return;
    element.removeEventListener("touchstart", this.onTouchStart);
    element.removeEventListener("touchmove", this.onTouchMove);
    element.removeEventListener("touchend", this.onTouchEnd);
    element.removeEventListener("click", this.onClick);
    this.element = null;
  }

  private onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      this.multitouch = true;
      this.startDistance = this.distance(event);
      this.startAngle = this.angle(event);
      return;
    }
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (!touch) return;
      this.tapCandidate = { x: touch.clientX, y: touch.clientY, t: performance.now() };
    }
  };

  private onTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const distance = this.distance(event);
    const angle = this.angle(event);
    if (this.startDistance > 0) {
      this.handlers.onPinch?.(distance / this.startDistance);
      this.startDistance = distance;
    }
    let delta = angle - this.startAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.handlers.onTwist?.(delta);
    this.startAngle = angle;
  };

  private onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length === 0 && this.multitouch) {
      this.multitouch = false;
      this.tapCandidate = null;
      return;
    }
    const candidate = this.tapCandidate;
    if (!candidate || this.multitouch) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const moved = Math.hypot(touch.clientX - candidate.x, touch.clientY - candidate.y);
    if (moved < 12 && performance.now() - candidate.t < 400) {
      this.handlers.onTap?.(touch.clientX, touch.clientY);
    }
    this.tapCandidate = null;
  };

  /** Desktop / demo support. */
  private onClick = (event: MouseEvent) => {
    if (this.multitouch) return;
    if (event.detail === 0) return;
    this.handlers.onTap?.(event.clientX, event.clientY);
  };

  private distance(event: TouchEvent): number {
    const a = event.touches[0];
    const b = event.touches[1];
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private angle(event: TouchEvent): number {
    const a = event.touches[0];
    const b = event.touches[1];
    if (!a || !b) return 0;
    return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
  }
}
