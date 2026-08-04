import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@excalidraw/excalidraw/index.css";
import "./base.css";
import "./shell.css";
import "./canvas-actions.css";
import "./dialogs.css";
import "./person-create.css";
import "@daypicker/react/style.css";
import "./date-picker.css";
import "./relationship.css";
import "./responsive.css";
import { App } from "./App";
import { SharedTreeApp } from "./SharedTreeApp";
import { AppProvider } from "./store";

const isSharedRoute = /^\/s\/[^/]+\/?$/u.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      {isSharedRoute ? <SharedTreeApp /> : (
        <App />
      )}
    </AppProvider>
  </StrictMode>
);
