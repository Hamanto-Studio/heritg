import { Home, Maximize2, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { loadEncryptedShare, type LoadedShare } from "./encryptedSharing";
import { createTranslator } from "./i18n";
import { TreeCanvas, type TreeCanvasHandle } from "./TreeCanvas";
import type { ViewportState } from "./types";

const initialViewport: ViewportState = { scrollX: 0, scrollY: 0, zoom: 1 };

export function SharedTreeApp() {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedShare>();
  const [error, setError] = useState<string>();
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [viewport, setViewport] = useState(initialViewport);
  const canvasRef = useRef<TreeCanvasHandle>(null);

  useEffect(() => {
    let active = true;
    void loadEncryptedShare().then((result) => {
      if (!active) return;
      setLoaded(result);
      setSelectedPersonId(result.data.trees[0]?.lastSelectedPersonId);
      document.documentElement.lang = result.data.language;
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "This encrypted family tree could not be opened.");
    });
    return () => { active = false; };
  }, [attempt]);

  const language = loaded?.data.language ?? (navigator.language.startsWith("id") ? "id" : "en");
  const t = createTranslator(language);
  const tree = loaded?.data.trees[0];
  const people = useMemo(() => tree && loaded
    ? loaded.data.people.filter((person) => person.treeId === tree.id)
    : [], [loaded, tree]);
  const relationships = useMemo(() => tree && loaded
    ? loaded.data.relationships.filter((relationship) => relationship.treeId === tree.id)
    : [], [loaded, tree]);
  const retry = () => {
    setLoaded(undefined);
    setError(undefined);
    setAttempt((value) => value + 1);
  };

  if (error) {
    return (
      <main className="shared-state">
        <img alt="" aria-hidden="true" className="brand-mark large" height={192} src="/pwa-192.png" width={192} />
        <h1>{t("sharedErrorTitle")}</h1>
        <p role="alert">{error}</p>
        <div className="shared-state-actions">
          <button className="button primary" onClick={retry} type="button">{t("sharedRetry")}</button>
          <a className="button secondary" href="/"><Home aria-hidden="true" size={17} /> {t("openMyTrees")}</a>
        </div>
      </main>
    );
  }

  if (!loaded || !tree) {
    return (
      <main className="shared-state" aria-live="polite">
        <img alt="" aria-hidden="true" className="brand-mark large" height={192} src="/pwa-192.png" width={192} />
        <h1>Heritg</h1>
        <p>{t("sharedLoading")}</p>
      </main>
    );
  }

  const expiry = new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", { dateStyle: "medium" })
    .format(new Date(loaded.expiresAt));

  return (
    <div className="shared-app-shell">
      <main className="shared-workspace">
        <TreeCanvas
          generationLimits={{ ancestors: null, descendants: null }}
          initialViewport={viewport}
          language={language}
          onAddRelative={() => undefined}
          onCanvasInteract={() => undefined}
          onDeselectPerson={() => setSelectedPersonId(undefined)}
          onEditPerson={() => undefined}
          onSelectPerson={setSelectedPersonId}
          onViewportChange={setViewport}
          people={people}
          readOnly
          ref={canvasRef}
          relationships={relationships}
          selectedPersonId={selectedPersonId}
          t={t}
          treeId={tree.id}
          treeTitle={tree.title}
        />

        <header className="shared-header">
          <div className="shared-title">
            <span className="shared-lock"><ShieldCheck aria-hidden="true" size={18} /></span>
            <div>
              <strong>{tree.title}</strong>
              <span>{t("sharedReadOnly")}</span>
            </div>
          </div>
          <a className="button secondary shared-home" href="/"><Home aria-hidden="true" size={17} /> {t("openMyTrees")}</a>
        </header>

        <aside className="shared-notice">
          <strong>{t("sharedReadOnly")}</strong>
          <span>{t("sharedReadOnlyDetail")}</span>
          <small>{t("sharedExpires", { date: expiry })}</small>
        </aside>

        <div className="shared-canvas-controls" aria-label={t("canvasControls")} role="toolbar">
          <button aria-label={t("zoomIn")} className="icon-button" onClick={() => canvasRef.current?.zoomIn()} type="button"><ZoomIn aria-hidden="true" size={18} /></button>
          <button aria-label={t("zoomOut")} className="icon-button" onClick={() => canvasRef.current?.zoomOut()} type="button"><ZoomOut aria-hidden="true" size={18} /></button>
          <button aria-label={t("fitTree")} className="icon-button" disabled={!people.length} onClick={() => canvasRef.current?.fitAll()} type="button"><Maximize2 aria-hidden="true" size={18} /></button>
        </div>
      </main>
    </div>
  );
}
