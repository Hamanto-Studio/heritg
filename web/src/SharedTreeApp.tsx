import { CopyPlus, Home, Maximize2, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  loadEncryptedShare,
  ShareDecryptionError,
  SharePasswordRequiredError,
  type LoadedShare
} from "./encryptedSharing";
import { createTranslator } from "./i18n";
import { relationshipLanguageForData } from "./kinship";
import { mergeImportedData } from "./portability";
import { PasswordField } from "./PasswordField";
import { syncDataFingerprint, useAppStore } from "./store";
import { TreeCanvas, type TreeCanvasHandle } from "./TreeCanvas";
import type { AppData, ViewportState } from "./types";

const initialViewport: ViewportState = { scrollX: 0, scrollY: 0, zoom: 1 };
const unlimitedGenerationLimits = { ancestors: null, descendants: null } as const;

export function SharedTreeApp() {
  const store = useAppStore();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedShare>();
  const [error, setError] = useState<string>();
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [passwordError, setPasswordError] = useState<string>();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const viewportRef = useRef(initialViewport);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const canvasRef = useRef<TreeCanvasHandle>(null);
  const requestRef = useRef<AbortController | undefined>(undefined);

  const loadShare = useCallback(async (password?: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await loadEncryptedShare(window.location.pathname, window.location.hash, fetch, controller.signal, password);
      if (controller.signal.aborted) return;
      setLoaded(result);
      setPasswordRequired(false);
      setSharePassword("");
      setPasswordError(undefined);
      setSelectedPersonId(result.data.trees[0]?.lastSelectedPersonId);
      document.documentElement.lang = result.data.language;
    } finally {
      if (requestRef.current === controller) requestRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    setError(undefined);
    setPasswordRequired(false);
    void loadShare().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (reason instanceof SharePasswordRequiredError) {
        setPasswordRequired(true);
        return;
      }
      setError(reason instanceof Error ? reason.message : "This encrypted family tree could not be opened.");
    });
    return () => requestRef.current?.abort();
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
    if (!sharePassword || isUnlocking) return;
    setPasswordError(undefined);
    setIsUnlocking(true);
    void loadShare(sharePassword).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setPasswordError(reason instanceof ShareDecryptionError
        ? t("sharedPasswordInvalid")
        : reason instanceof Error ? reason.message : t("sharedErrorTitle"));
    }).finally(() => setIsUnlocking(false));
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
    void store.actions.replaceDataPersisted(merged, syncDataFingerprint(store.data))
      .then((saved) => {
        if (!saved) throw new Error("Family data changed before the shared copy could be saved.");
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
        <form aria-busy={isUnlocking} className="shared-password-form" onSubmit={unlockShare}>
          <PasswordField
            autoComplete="current-password"
            autoFocus
            disabled={isUnlocking}
            error={passwordError}
            hideLabel={t("hidePassword")}
            id="shared-tree-password"
            label={t("sharedPassword")}
            onChange={(value) => {
              setSharePassword(value);
              setPasswordError(undefined);
            }}
            showLabel={t("showPassword")}
            value={sharePassword}
          />
          <button className="button primary" disabled={!sharePassword || isUnlocking} type="submit">
            {isUnlocking ? t("sharedLoading") : t("unlockShared")}
          </button>
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
          generationLimits={unlimitedGenerationLimits}
          initialViewport={viewportRef.current}
          language={language}
          relationshipLanguage={relationshipLanguageForData(loaded.data)}
          lifeSummaryOptions={loaded.sharedView ? {
            showAge: loaded.sharedView.ages,
            showBirthDate: loaded.sharedView.birthDates,
            ageByPersonId: loaded.sharedView.ageByPersonId
          } : undefined}
          onAddRelative={() => undefined}
          onCanvasInteract={() => undefined}
          onDeselectPerson={() => setSelectedPersonId(undefined)}
          onEditPerson={() => undefined}
          onSelectPerson={setSelectedPersonId}
          onViewportChange={(nextViewport) => {
            viewportRef.current = nextViewport;
          }}
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
