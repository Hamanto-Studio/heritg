import {
  Maximize2,
  PanelLeft,
  Settings2,
  SlidersHorizontal,
  UsersRound
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { availableGenerationLevels } from "./layout";
import { createTranslator } from "./i18n";
import { PeopleDialog } from "./PeopleDialog";
import { PersonEditor } from "./PersonEditor";
import { RelativeDialog } from "./RelativeDialog";
import { SettingsDialog } from "./SettingsDialog";
import { TreeCanvas, type TreeCanvasHandle } from "./TreeCanvas";
import { TreeSidebar } from "./TreeSidebar";
import { useAppStore } from "./store";
import type { GenerationLimits, Person } from "./types";
import { LoadingScreen, Modal } from "./ui";

const unlimited: GenerationLimits = { ancestors: null, descendants: null };

export function App() {
  const store = useAppStore();
  const { data, actions } = store;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationLimitsByTree, setGenerationLimitsByTree] = useState<Record<string, GenerationLimits>>({});
  const [editingPerson, setEditingPerson] = useState<Person | "new">();
  const [relativeTarget, setRelativeTarget] = useState<Person>();
  const [toast, setToast] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const canvasRef = useRef<TreeCanvasHandle>(null);
  const t = createTranslator(data?.language ?? "en");
  const activeTree = data?.trees.find((tree) => tree.id === data.selectedTreeId)
    ?? data?.trees[0];
  const people = useMemo(
    () => data && activeTree
      ? data.people.filter((person) => person.treeId === activeTree.id)
      : [],
    [activeTree, data]
  );
  const relationships = useMemo(
    () => data && activeTree
      ? data.relationships.filter((relationship) => relationship.treeId === activeTree.id)
      : [],
    [activeTree, data]
  );
  const selectedPerson = people.find((person) => person.id === activeTree?.lastSelectedPersonId);
  const generationLimits = activeTree
    ? generationLimitsByTree[activeTree.id] ?? unlimited
    : unlimited;
  const availableLevels = useMemo(
    () => availableGenerationLevels(people, relationships, selectedPerson?.id),
    [people, relationships, selectedPerson?.id]
  );

  useEffect(() => {
    document.documentElement.lang = data?.language === "id" ? "id" : "en";
  }, [data?.language]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (store.isLoading) return <LoadingScreen t={t} />;
  if (!data) {
    return (
      <main className="loading-screen">
        <strong>{t("errorTitle")}</strong>
        <p>{store.error?.message}</p>
        <button className="button primary" onClick={() => location.reload()} type="button">{t("tryAgain")}</button>
      </main>
    );
  }

  const selectAndFocus = (personId: string) => {
    startTransition(() => actions.selectPerson(personId));
    setTimeout(() => canvasRef.current?.focusPerson(personId), 60);
  };

  const addRelativeTo = (personId: string) => {
    const target = people.find((person) => person.id === personId);
    if (!target) return;
    actions.selectPerson(target.id);
    canvasRef.current?.focusPerson(target.id);
    setRelativeTarget(target);
  };

  const editPerson = (personId: string) => {
    const person = people.find((candidate) => candidate.id === personId);
    if (person) setEditingPerson(person);
  };

  const generationOptions = (maximum: number) => [
    <option key="all" value="all">{t("allGenerations")}</option>,
    ...Array.from({ length: maximum }, (_, index) => (
      <option key={index + 1} value={index + 1}>
        {index === 0 ? t("oneGeneration") : t("generations", { count: index + 1 })}
      </option>
    ))
  ];

  const setLimit = (kind: keyof GenerationLimits, value: string) => {
    if (!activeTree) return;
    setGenerationLimitsByTree((current) => ({
      ...current,
      [activeTree.id]: {
        ...(current[activeTree.id] ?? unlimited),
        [kind]: value === "all" ? null : Number(value)
      }
    }));
  };

  return (
    <div className="app-shell">
      <TreeSidebar
        actions={actions}
        data={data}
        onClose={() => {
          setSidebarOpen(false);
          setGenerationOpen(false);
        }}
        onError={setOperationError}
        onImported={() => setToast(t("imported"))}
        open={sidebarOpen}
        t={t}
      />

      <main className="workspace">
        <button
          aria-controls="tree-navigation"
          aria-expanded={sidebarOpen}
          aria-label={t("showTrees")}
          className="icon-button tree-pane-toggle"
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <PanelLeft aria-hidden="true" size={19} />
        </button>

        {!sidebarOpen && (!activeTree || !people.length) ? (
          <div className="tree-pane-hint" aria-hidden="true">
            <svg viewBox="0 0 52 44">
              <path d="M47 39C33 35 19 25 11 7" />
              <path d="M7 17 11 7l10 4" />
            </svg>
            <span>{t("treeMenuHint")}</span>
          </div>
        ) : null}

        {activeTree ? (
          <div className="canvas-frame">
            <TreeCanvas
              generationLimits={generationLimits}
              initialViewport={data.viewports[activeTree.id]}
              key={`${activeTree.id}-${data.language}`}
              language={data.language}
              onAddRelative={addRelativeTo}
              onDeselectPerson={() => actions.selectPerson(undefined)}
              onEditPerson={editPerson}
              onSelectPerson={(personId) => actions.selectPerson(personId)}
              onViewportChange={(viewport) => actions.setViewport(activeTree.id, viewport)}
              people={people}
              ref={canvasRef}
              relationships={relationships}
              selectedPersonId={selectedPerson?.id}
              t={t}
              treeId={activeTree.id}
              treeTitle={activeTree.title}
            />

            <header className="workspace-header">
              <div className="workspace-title">
                <h2>{activeTree.title}</h2>
                <p>{t("peopleCount", { count: people.length })} · {t("relationshipsCount", { count: relationships.length })}</p>
              </div>
              <div className="workspace-tools">
                <button
                  aria-label={t("allPeople")}
                  className="icon-button"
                  onClick={() => {
                    setGenerationOpen(false);
                    setPeopleOpen(true);
                  }}
                  type="button"
                >
                  <UsersRound aria-hidden="true" size={19} />
                </button>
                <button
                  aria-label={t("fitTree")}
                  className="icon-button"
                  disabled={!people.length}
                  onClick={() => canvasRef.current?.fitAll()}
                  type="button"
                >
                  <Maximize2 aria-hidden="true" size={18} />
                </button>
                <div className="tree-menu-wrap desktop-tool">
                  <button
                    aria-expanded={generationOpen}
                    aria-label={t("branchDepth")}
                    className="icon-button"
                    disabled={!selectedPerson}
                    onClick={() => setGenerationOpen((value) => !value)}
                    type="button"
                  >
                    <SlidersHorizontal aria-hidden="true" size={18} />
                  </button>
                  {generationOpen ? (
                    <div className="generation-popover">
                      <strong>{t("branchDepth")}</strong>
                      <label>
                        {t("ancestors")}
                        <select
                          onChange={(event) => setLimit("ancestors", event.target.value)}
                          value={generationLimits.ancestors ?? "all"}
                        >
                          {generationOptions(availableLevels.ancestors)}
                        </select>
                      </label>
                      <label>
                        {t("descendants")}
                        <select
                          onChange={(event) => setLimit("descendants", event.target.value)}
                          value={generationLimits.descendants ?? "all"}
                        >
                          {generationOptions(availableLevels.descendants)}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
                <button
                  aria-label={t("settings")}
                  className="icon-button"
                  onClick={() => {
                    setGenerationOpen(false);
                    setSettingsOpen(true);
                  }}
                  type="button"
                >
                  <Settings2 aria-hidden="true" size={19} />
                </button>
              </div>
            </header>

            {!sidebarOpen && !people.length && !settingsOpen ? (
              <div className="tree-pane-hint settings-pane-hint" aria-hidden="true">
                <span>{t("settingsMenuHint")}</span>
                <svg viewBox="0 0 52 44">
                  <path d="M5 39C19 35 33 25 41 7" />
                  <path d="M31 11 41 7l4 10" />
                </svg>
              </div>
            ) : null}

            {!people.length ? (
              <section className="empty-canvas welcome-canvas">
                <img alt="" aria-hidden="true" className="brand-mark large" height={192} src="/pwa-192.png" width={192} />
                <h3>{t("startTitle")}</h3>
                <p>{t("startDetail")}</p>
                <button className="button primary" onClick={() => setEditingPerson("new")} type="button">
                  {t("addFirstPerson")}
                </button>
              </section>
            ) : null}
          </div>
        ) : (
          <section className="empty-canvas no-tree-state">
            <img alt="" aria-hidden="true" className="brand-mark large" height={192} src="/pwa-192.png" width={192} />
            <h3>{t("newTree")}</h3>
            <p>{t("localOnlyDetail")}</p>
            <button
              className="button primary"
              onClick={() => actions.createTree(data.language === "id" ? "Silsilah Keluarga Saya" : "My Family Tree")}
              type="button"
            >
              {t("createTree")}
            </button>
          </section>
        )}
      </main>

      {activeTree && editingPerson ? (
        <PersonEditor
          actions={actions}
          language={data.language}
          key={editingPerson === "new" ? `new-${activeTree.id}` : editingPerson.id}
          onClose={() => setEditingPerson(undefined)}
          onSaved={(personId) => setTimeout(() => canvasRef.current?.focusPerson(personId), 60)}
          people={people}
          person={editingPerson === "new" ? undefined : editingPerson}
          relationships={relationships}
          t={t}
          treeId={activeTree.id}
        />
      ) : null}

      {relativeTarget ? (
        <RelativeDialog
          actions={actions}
          onClose={() => setRelativeTarget(undefined)}
          onSaved={() => setTimeout(() => canvasRef.current?.focusPerson(relativeTarget.id), 60)}
          people={people}
          relationships={relationships}
          t={t}
          target={relativeTarget}
        />
      ) : null}

      {peopleOpen ? (
        <PeopleDialog
          language={data.language}
          onClose={() => setPeopleOpen(false)}
          onSelect={selectAndFocus}
          people={people}
          relationships={relationships}
          selectedPersonId={selectedPerson?.id}
          t={t}
        />
      ) : null}

      {activeTree && settingsOpen ? (
        <SettingsDialog
          actions={actions}
          data={data}
          exportPng={() => canvasRef.current?.exportPng() ?? Promise.reject(new Error("Canvas is not ready."))}
          exportSvg={() => canvasRef.current?.exportSvg() ?? Promise.reject(new Error("Canvas is not ready."))}
          onClose={() => setSettingsOpen(false)}
          onError={setOperationError}
          onExported={() => setToast(t("exported"))}
          t={t}
          tree={activeTree}
        />
      ) : null}

      {operationError ? (
        <Modal closeLabel={t("close")} onClose={() => setOperationError(undefined)} size="small" title={t("errorTitle")}>
          <p className="dialog-copy" role="alert">{operationError}</p>
        </Modal>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
