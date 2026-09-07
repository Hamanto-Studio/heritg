export const FAMILY_MOTION_MS = 360;
export const reducedFamilyMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Move the newly centered fan from the tapped relative's old screen position. */
export function animateFanFocus(element: SVGSVGElement, offset: { x: number; y: number }, origin: string) {
  if (reducedFamilyMotion() || typeof element.animate !== "function") return () => {};
  const animation = element.animate([
    { transform: `translate(${offset.x}px, ${offset.y}px) scale(0.92)`, transformOrigin: origin, opacity: 0.45 },
    { transform: "translate(0, 0) scale(1)", transformOrigin: origin, opacity: 1 }
  ], { duration: FAMILY_MOTION_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const stop = () => { animation.cancel(); preference?.removeEventListener?.("change", onPreference); };
  const onPreference = () => { if (preference?.matches) stop(); };
  preference?.addEventListener?.("change", onPreference);
  animation.onfinish = () => preference?.removeEventListener?.("change", onPreference);
  return stop;
}
