import { StrictMode } from "react";
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
import { FamilyProvider } from "./FamilyProvider";
import { AppProvider } from "./store";

const isSharedRoute = /^\/s\/[^/]+\/?$/u.test(window.location.pathname);
const isStaging = __DEPLOYMENT_ENV__ === "staging";
const application = (
  <AppProvider>
    {isSharedRoute ? <SharedTreeApp /> : <FamilyProvider><App /></FamilyProvider>}
  </AppProvider>
);

if (isStaging) {
  document.title = "Heritg Staging | Test Data Only";
  document.documentElement.dataset.deploymentEnvironment = "staging";
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
