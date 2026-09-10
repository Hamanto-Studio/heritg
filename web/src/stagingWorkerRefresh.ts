type WorkerContainer = Pick<ServiceWorkerContainer, "controller" | "addEventListener">;

/** Keep staging fresh without interrupting first use or an in-flight payment. */
export function registerStagingWorkerRefresh(
  workers: WorkerContainer,
  paymentPending: () => boolean,
  reload: () => void
) {
  let previousController = workers.controller;
  let refreshing = false;
  workers.addEventListener("controllerchange", () => {
    const nextController = workers.controller;
    const replacingController = previousController !== null && nextController !== null && previousController !== nextController;
    previousController = nextController;
    // First installation needs no reload. A pending purchase must keep its
    // redirect/status flow; the new worker is used on the next navigation.
    if (!replacingController || refreshing || paymentPending()) return;
    refreshing = true;
    reload();
  });
}
