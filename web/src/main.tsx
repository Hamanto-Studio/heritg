import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "./base.css";
import "./shell.css";
import "./canvas-actions.css";
import "./svg-canvas.css";
import "./dialogs.css";
import "./person-create.css";
import "@daypicker/react/style.css";
import "./date-picker.css";
import "./relationship.css";
import "./responsive.css";
import { App } from "./App";
import { SharedTreeApp } from "./SharedTreeApp";
import { ProProvider } from "./ProProvider";
import { AppProvider, useAppStore } from "./store";

if (/^\/auth\/email\/?$/u.test(window.location.pathname)) {
  window.history.replaceState(window.history.state, "", "/");
}

const isSharedRoute = /^\/s\/[^/]+\/?$/u.test(window.location.pathname);
const isStaging = __DEPLOYMENT_ENV__ === "staging";

function ConnectedProProvider({ children }: { children: ReactNode }) {
  return <ProProvider appStore={useAppStore()}>{children}</ProProvider>;
}

function Application() {
  return (
    <AppProvider>
      {isSharedRoute ? <SharedTreeApp /> : (
        <ConnectedProProvider>
          <App />
        </ConnectedProProvider>
      )}
    </AppProvider>
  );
}

const application = <Application />;

if (isStaging) {
  document.title = "Heritg Staging | Test Data Only";
  document.documentElement.dataset.deploymentEnvironment = "staging";
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isStaging ? (
      <div className="staging-shell">
        <aside className="staging-banner" role="note">
          <strong>Heritg Staging</strong>
          <span>Test data only. Data may be reset. Do not use this as your family archive.</span>
        </aside>
        <div className="staging-content">{application}</div>
      </div>
    ) : application}
  </StrictMode>
);
