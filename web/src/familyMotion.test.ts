import { afterEach, describe, expect, it, vi } from "vitest";
import { animateFanFocus, FAMILY_MOTION_MS } from "./familyMotion";

afterEach(() => vi.unstubAllGlobals());
describe('family navigation motion', () => {
  it('carries the tapped relative to center and cancels immediately for interrupted navigation', () => {
    const cancel = vi.fn(), animate = vi.fn(() => ({ cancel, onfinish: null }));
    const element = { animate } as unknown as SVGSVGElement;
    const stop = animateFanFocus(element, { x: 80, y: 120 }, '50% 60%');
    expect(animate.mock.calls[0]).toEqual([
      [{ transform: 'translate(80px, 120px) scale(0.92)', transformOrigin: '50% 60%', opacity: 0.45 },
        { transform: 'translate(0, 0) scale(1)', transformOrigin: '50% 60%', opacity: 1 }],
      { duration: FAMILY_MOTION_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
    ]);
    stop(); expect(cancel).toHaveBeenCalledOnce();
  });
  it('skips motion for reduced-motion preferences and unsupported browsers', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const animate = vi.fn();
    animateFanFocus({ animate } as unknown as SVGSVGElement, { x: 40, y: 20 }, '50% 50%');
    expect(animate).not.toHaveBeenCalled();
    expect(() => animateFanFocus({} as SVGSVGElement, { x: 0, y: 0 }, '50% 50%')).not.toThrow();
  });
  it('stops an active transition if reduced motion is enabled', () => {
    let changed: (() => void) | undefined;
    const remove = vi.fn(), preference = { matches: false, addEventListener: (_: string, callback: () => void) => { changed = callback; }, removeEventListener: remove };
    vi.stubGlobal('matchMedia', () => preference);
    const cancel = vi.fn();
    animateFanFocus({ animate: () => ({ cancel }) } as unknown as SVGSVGElement, { x: 0, y: 80 }, '50% 50%');
    preference.matches = true; changed?.();
    expect(cancel).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalled();
  });
});
