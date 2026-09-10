import { describe, expect, it, vi } from "vitest";
import { registerStagingWorkerRefresh } from "./stagingWorkerRefresh";

function fixture(initial: ServiceWorker | null = null) {
  const events = new EventTarget();
  const workers = { controller: initial, addEventListener: events.addEventListener.bind(events) };
  const pending = vi.fn(() => false), reload = vi.fn();
  registerStagingWorkerRefresh(workers, pending, reload);
  const change = (controller: ServiceWorker | null) => { workers.controller = controller; events.dispatchEvent(new Event("controllerchange")); };
  return { change, pending, reload };
}
const worker = () => ({}) as ServiceWorker;

describe("staging service worker refresh", () => {
  it("does not reload on first installation, but reloads on a later update", () => {
    const f = fixture();
    f.change(worker());
    expect(f.reload).not.toHaveBeenCalled();
    f.change(worker());
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
  it("defers update reloads while payment is pending", () => {
    const f = fixture(worker());
    f.pending.mockReturnValue(true);
    f.change(worker());
    expect(f.reload).not.toHaveBeenCalled();
  });
  it("ignores unchanged/lost controllers and reloads at most once", () => {
    const original = worker(), f = fixture(original);
    f.change(original);
    expect(f.reload).not.toHaveBeenCalled();
    f.change(null);
    f.change(worker());
    expect(f.reload).not.toHaveBeenCalled();
    f.change(worker());
    f.change(worker());
    expect(f.reload).toHaveBeenCalledTimes(1);
  });
});
