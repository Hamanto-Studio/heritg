import { CopyPlus, Home, Maximize2, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { loadEncryptedShare, SharePasswordRequiredError, type LoadedShare } from "./encryptedSharing";
import { saveAppData } from "./db";
import { createTranslator } from "./i18n";
import { mergeImportedData } from "./portability";
import { useAppStore } from "./store";
import { TreeCanvas, type TreeCanvasHandle } from "./TreeCanvas";
import type { AppData, ViewportState } from "./types";

const initialViewport: ViewportState = { scrollX: 0, scrollY: 0, zoom: 1 };

export function SharedTreeApp() {
  const store = useAppStore();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedShare>();
  const [error, setError] = useState<string>();
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [passwordError, setPasswordError] = useState<string>();
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [viewport, setViewport] = useState(initialViewport);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const canvasRef = useRef<TreeCanvasHandle>(null);

  const loadShare = useCallback(async (password?: string) => {
    let active = true;
    const controller = new AbortController();
    try {
      const result = await loadEncryptedShare(window.location.pathname, window.location.hash, fetch, controller.signal, password);
      if (!active) return;
      setLoaded(result);
      setPasswordRequired(false);
      setPasswordError(undefined);
      setSelectedPersonId(result.data.trees[0]?.lastSelectedPersonId);
      document.documentElement.lang = result.data.language;
    } finally {
      active = false;
      controller.abort();
    }
  }, []);

  useEffect(() => {
    setError(undefined);
    setPasswordRequired(false);
    void loadShare().catch((reason: unknown) => {
      if (reason instanceof SharePasswordRequiredError) {
        setPasswordRequired(true);
        return;
      }
      setError(reason instanceof Error ? reason.message : "This encrypted family tree could not be opened.");
    });
  }, [attempt, loadShare]);

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

  const unlockShare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sharePassword) return;
    setPasswordError(undefined);
    void loadShare(sharePassword).catch((reason: unknown) => {
      setPasswordError(reason instanceof Error ? reason.message : t("sharedErrorTitle"));
    });
  };

  const saveCopy = () => {
    if (!loaded || !tree || !store.data || isSaving) return;
    setSaveError(undefined);
    setIsSaving(true);
    let merged: AppData;
    try {
      const copied: AppData = {
        ...loaded.data,
        trees: loaded.data.trees.map((item) => item.id === tree.id
          ? { ...item, title: `${item.title} — ${t("sharedCopySuffix")}` }
          : item)
      };
      merged = mergeImportedData(copied, { into: store.data });
    } catch (reason) {
      setIsSaving(false);
      setSaveError(reason instanceof Error ? reason.message : t("errorTitle"));
      return;
    }
    void saveAppData(merged)
      .then(() => {
        store.actions.replaceData(merged);
        window.location.assign("/");
      })
      .catch((reason: unknown) => {
        setIsSaving(false);
        setSaveError(reason instanceof Error ? reason.message : t("errorTitle"));
      });
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

  if (passwordRequired) {
    return (
      <main className="shared-state">
        <img alt="" aria-hidden="true" className="brand-mark large" height={192} src="/pwa-192.png" width="192" />
        <h1>{t("sharedPasswordTitle")}</h1>
        <p>{t("sharedPasswordDetail")}</p>
        <form className="shared-password-form" onSubmit={unlockShare}>
          <label className="field">
            {t("sharedPassword")}
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setSharePassword(event.target.value)}
              type="password"
              value={sharePassword}
            />
          </label>
          {passwordError ? <p className="danger-text" role="alert">{passwordError}</p> : null}
          <button className="button primary" disabled={!sharePassword} type="submit">{t("unlockShared")}</button>
        </form>
        <div className="shared-state-actions">
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
          <div className="shared-header-actions">
            <button aria-label={t("saveSharedCopy")} className="button primary shared-save" disabled={!store.ready || isSaving} onClick={saveCopy} type="button">
              <CopyPlus aria-hidden="true" size={17} /> <span>{isSaving ? t("savingSharedCopy") : t("saveSharedCopy")}</span>
            </button>
            <a className="button secondary shared-home" href="/"><Home aria-hidden="true" size={17} /> {t("openMyTrees")}</a>
          </div>
        </header>

        <aside className="shared-notice">
          <strong>{t("sharedReadOnly")}</strong>
          <span>{t("sharedReadOnlyDetail")}</span>
          <span>{t("sharedCopyDetail")}</span>
          <small>{t("sharedExpires", { date: expiry })}</small>
          {saveError ? <small className="danger-text" role="alert">{saveError}</small> : null}
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
