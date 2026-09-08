import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  FolderOpen,
  Hand,
  Maximize2,
  Menu,
  Pencil,
  RotateCcw,
  Share2,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundPlus,
  UsersRound,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { availableGenerationLevels } from "./layout";
import { FocusPersonPicker } from "./FocusPersonPicker";
import { FamilyExplorer } from "./FamilyExplorer";
import { explorerViews, explorerLabels, explorerDescriptions, type ExplorerView } from "./familyExplorers";
import { FamilyViewControls } from "./FamilyViewControls";
import { defaultFamilyFocus, focusedFamily, nextFamilyExpansion, sharedParentSiblingIds, type FamilyFocus } from "./focusedFamily";
import { createTranslator } from "./i18n";
import { relationshipLanguageForData } from "./kinship";
import { FamilyPlusMark, FamilyPlusWordmark } from "./FamilyPlusMark";
import { PeopleDialog } from "./PeopleDialog";
import { PersonEditor } from "./PersonEditor";
import { PrivacyPanel } from "./PrivacyPanel";
import { ProPaywallDialog } from "./ProPaywallDialog";
import { PaymentStatusNotice } from "./PaymentStatusNotice";
import { usePro } from "./ProProvider";
import { RelativeDialog } from "./RelativeDialog";
import { ReportBugSheet } from "./ReportBugSheet";
import { SettingsDialog } from "./SettingsDialog";
import { SharePanel } from "./SharePanel";
import { SyncResolutionDialog } from "./SyncResolutionDialog";
import { HelpPanel } from "./HelpPanel";
import { TreeCanvas, type TreeCanvasHandle } from "./TreeCanvas";
import { TreeSidebar } from "./TreeSidebar";
import { useAppStore } from "./store";
import type { GenerationLimits, Person } from "./types";
import { ErrorNotice, LoadingScreen, Modal } from "./ui";
import { saveUiLanguage } from "./uiLanguage";

const unlimited: GenerationLimits = { ancestors: null, descendants: null };
type RightPanel = "people" | "settings" | "share" | "help" | "privacy" | "report";

export function App({ initialPanel }: { initialPanel?: "settings" } = {}) {
  const store = useAppStore();
  const pro = usePro();
  const { data, actions } = store;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel | undefined>(initialPanel);
  const [generationOpen, setGenerationOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [alternateViews, setAlternateViews] = useState<Record<string, ExplorerView | undefined>>({});
  const [familyViews, setFamilyViews] = useState<Record<string, { mode: "focus" | "full"; focus: FamilyFocus }>>({});
  const [generationLimitsByTree, setGenerationLimitsByTree] = useState<Record<string, GenerationLimits>>({});
  const [editingPerson, setEditingPerson] = useState<Person | "new">();
  const [renamingTree, setRenamingTree] = useState<{ id: string; title: string }>();
  const [renameError, setRenameError] = useState<string>();
  const [relativeTarget, setRelativeTarget] = useState<Person>();
  const [toast, setToast] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const canvasRef = useRef<TreeCanvasHandle>(null);
  const t = createTranslator(data?.language ?? "en");
  const uiLanguage = data?.language;
  const activeTree = data?.trees.find((tree) => tree.id === data.selectedTreeId)
    ?? data?.trees[0];
  const activeTreeId = activeTree?.id;
  const alternateView = activeTreeId && alternateViews[activeTreeId] === "fan" ? "fan" : undefined;
  const showAlternate = Boolean(alternateView);
  const allPeople = data?.people;
  const allRelationships = data?.relationships;
  const people = useMemo(
    () => allPeople && activeTreeId
      ? allPeople.filter((person) => person.treeId === activeTreeId)
      : [],
    [activeTreeId, allPeople]
  );
  const relationships = useMemo(
    () => allRelationships && activeTreeId
      ? allRelationships.filter((relationship) => relationship.treeId === activeTreeId)
      : [],
    [activeTreeId, allRelationships]
  );
  const selectedPerson = people.find((person) => person.id === activeTree?.lastSelectedPersonId);
  const familyView = activeTreeId ? familyViews[activeTreeId] : undefined;
  const focusId = selectedPerson?.id
    ?? people.find((person) => person.id === familyView?.focus.personId)?.id
    ?? defaultFamilyFocus(people, relationships);
  const isFocusedView = familyView?.mode === "focus" || (!familyView && Boolean(focusId));
  const familyFocus = useMemo<FamilyFocus | undefined>(() => {
    if (!focusId || familyView?.mode === "full") return undefined;
    return {
      personId: focusId,
      ancestors: familyView?.focus.ancestors ?? 1,
      descendants: familyView?.focus.descendants ?? 1,
      siblings: familyView?.focus.siblings
    };
  }, [familyView, focusId]);
  const focusedPeople = useMemo(() => focusedFamily(people, relationships, familyFocus).people, [people, relationships, familyFocus]);
  const hasFocusSiblings = useMemo(() => Boolean(focusId && sharedParentSiblingIds(people, relationships, focusId).size), [people, relationships, focusId]);
  const familyExpansions = useMemo(() => familyFocus ? {
    ancestors: nextFamilyExpansion(people, relationships, familyFocus, "ancestors"),
    descendants: nextFamilyExpansion(people, relationships, familyFocus, "descendants")
  } : {}, [people, relationships, familyFocus]);
  const generationLimits = activeTree
    ? generationLimitsByTree[activeTree.id] ?? unlimited
    : unlimited;
  const availableLevels = useMemo(
    () => availableGenerationLevels(people, relationships, selectedPerson?.id),
    [people, relationships, selectedPerson?.id]
  );
  const showTreeOnboarding = controlsVisible && !sidebarOpen && (!activeTree || !people.length);
  const showSettingsOnboarding = Boolean(controlsVisible && activeTree && !people.length && !rightPanel);

  useEffect(() => {
    document.documentElement.lang = uiLanguage === "id" ? "id" : "en";
    if (uiLanguage) saveUiLanguage(uiLanguage);
  }, [uiLanguage]);

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

  const relationshipLanguage = relationshipLanguageForData(data);

  const rememberFocus = (personId: string) => {
    if (!activeTreeId) return;
    setFamilyViews((current) => ({ ...current, [activeTreeId]: {
      mode: current[activeTreeId]?.mode ?? "focus",
      focus: { personId,
        ancestors: current[activeTreeId]?.focus.ancestors ?? 1,
        descendants: current[activeTreeId]?.focus.descendants ?? 1,
        siblings: current[activeTreeId]?.focus.siblings }
    } }));
  };
  const updateFamilyView = (mode: "focus" | "full", focus = familyFocus) => {
    if (!activeTreeId) return;
    if (mode === "full") setGenerationLimitsByTree((current) => ({ ...current, [activeTreeId]: unlimited }));
    setFamilyViews((current) => ({ ...current, [activeTreeId]: {
      mode, focus: focus ?? { personId: focusId ?? "",
        ancestors: current[activeTreeId]?.focus.ancestors ?? 1,
        descendants: current[activeTreeId]?.focus.descendants ?? 1,
        siblings: current[activeTreeId]?.focus.siblings }
    } }));
    setGenerationOpen(false);
  };
  const chooseCanvasView = (mode: "focus" | "full") => {
    if (activeTreeId) setAlternateViews((current) => ({ ...current, [activeTreeId]: undefined }));
    updateFamilyView(mode);
  };

  const selectAndFocus = (personId: string) => {
    setGenerationOpen(false);
    rememberFocus(personId);
    actions.selectPerson(personId);
    if (!familyFocus) requestAnimationFrame(() => canvasRef.current?.focusPerson(personId));
  };

  const addRelativeTo = (personId: string) => {
    const target = people.find((person) => person.id === personId);
    if (!target) return;
    setGenerationOpen(false);
    actions.selectPerson(target.id);
    rememberFocus(target.id);
    canvasRef.current?.focusPerson(target.id);
    setRelativeTarget(target);
  };

  const editPerson = (personId: string) => {
    const person = people.find((candidate) => candidate.id === personId);
    if (person) setEditingPerson(person);
  };

  const startRenamingTree = () => {
    if (!activeTree) return;
    setRenameError(undefined);
    setRenamingTree({ id: activeTree.id, title: activeTree.title });
  };

  const saveTreeName = () => {
    if (!renamingTree) return;
    try {
      actions.renameTree(renamingTree.id, renamingTree.title);
      setRenamingTree(undefined);
      setRenameError(undefined);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : t("errorTitle"));
    }
  };

  const generationOptions = (maximum: number) => [
    <option key="all" value="all">{t("allGenerations")}</option>,
    <option key={0} value={0}>{t("zeroGenerations")}</option>,
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

  const dismissCanvasPanels = () => {
    setSidebarOpen(false);
    setRightPanel(undefined);
    setGenerationOpen(false);
  };

  const openFamilyPlus = () => {
    setGenerationOpen(false);
    setRightPanel(undefined);
    pro.openPaywall();
  };

  const emptyWelcome = !people.length ? (
    <section className="welcome-canvas" aria-labelledby="welcome-title">
      <div className="welcome-brand">
        <img alt="" aria-hidden="true" className="brand-mark" height={192} src="/pwa-192.png" width={192} />
        <strong>Heritg</strong>
      </div>
      <h3 id="welcome-title">{t("startTitle")}</h3>
      <p>{t("startDetail")}</p>
      <div className="welcome-actions">
        <button className="welcome-action" onClick={() => setEditingPerson("new")} type="button">
          <UserRoundPlus aria-hidden="true" size={19} />
          <span><strong>{t("addFirstPerson")}</strong><small>{t("welcomeAddDetail")}</small></span>
        </button>
        <button className="welcome-action" onClick={() => setSidebarOpen(true)} type="button">
          <FolderOpen aria-hidden="true" size={19} />
          <span><strong>{t("welcomeOpenTree")}</strong><small>{t("welcomeOpenTreeDetail")}</small></span>
        </button>
        <button className="welcome-action" onClick={() => setRightPanel("help")} type="button">
          <CircleHelp aria-hidden="true" size={19} />
          <span><strong>{t("welcomeHelp")}</strong><small>{t("welcomeHelpDetail")}</small></span>
        </button>
      </div>
      <div className="canvas-move-hint"><Hand aria-hidden="true" size={15} /> {t("canvasMoveHint")}</div>
    </section>
  ) : undefined;

  return (
    <div className="app-shell">
      <TreeSidebar
        account={pro.account.status === "signedIn" ? pro.account.user : undefined}
        actions={actions}
        data={data}
        onClose={() => {
          setSidebarOpen(false);
          setGenerationOpen(false);
        }}
        onError={setOperationError}
        onImported={() => setToast(t("imported"))}
        onShowHelp={() => setRightPanel("help")}
        onShowFamily={openFamilyPlus}
        onShowPrivacy={() => setRightPanel("privacy")}
        onReportBug={() => setRightPanel("report")}
        open={sidebarOpen}
        t={t}
      />

      <main className="workspace">
        {controlsVisible ? <button
          aria-controls="tree-navigation"
          aria-describedby={showTreeOnboarding ? "tree-menu-onboarding" : undefined}
          aria-expanded={sidebarOpen}
          aria-label={t("showTrees")}
          className="icon-button tree-pane-toggle"
          onClick={() => setSidebarOpen(true)}
          type="button"
        >
          <Menu aria-hidden="true" size={19} />
        </button> : null}

        {controlsVisible && !activeTree ? <div className="empty-workspace-tools">
          <button aria-label={t("heritgFamily")} className="button secondary workspace-family-button" onClick={openFamilyPlus} type="button"><FamilyPlusMark size={20} /><FamilyPlusWordmark /></button>
          <button aria-label={t("settings")} className="icon-button" onClick={() => setRightPanel("settings")} type="button"><Settings2 aria-hidden="true" size={19} /></button>
        </div> : null}

        {showTreeOnboarding ? (
          <div className="tree-pane-hint" id="tree-menu-onboarding" role="note">
            <svg aria-hidden="true" viewBox="0 0 64 78">
              <path d="M58 73C39 67 21 40 12 16" />
              <path d="M8 27 12 16l11 4" />
            </svg>
            <span><b className="tutorial-step">1</b>{t("treeMenuHintDetailed")}</span>
          </div>
        ) : null}

        {activeTree ? (
          <div className={`canvas-frame${showAlternate ? " is-explorer" : ""}`}>
            <div className={`canvas-chart-layer${showAlternate && people.length ? " is-hidden" : ""}`} aria-hidden={showAlternate && people.length > 0} inert={showAlternate && people.length > 0}>
            <TreeCanvas
              familyFocus={familyFocus}
              generationLimits={generationLimits}
              emptyContent={emptyWelcome}
              initialViewport={data.viewports[activeTree.id]}
              key={`${activeTree.id}-${data.language}-${relationshipLanguage}`}
              language={data.language}
              relationshipLanguage={relationshipLanguage}
              onAddRelative={addRelativeTo}
              onCanvasInteract={dismissCanvasPanels}
              onDeselectPerson={() => {
                setGenerationOpen(false);
                if (selectedPerson) {
                  updateFamilyView(familyFocus ? "focus" : "full", familyFocus);
                }
                actions.selectPerson(undefined);
              }}
              onEditPerson={editPerson}
              onSelectPerson={selectAndFocus}
              onViewportChange={(viewport) => actions.setViewport(activeTree.id, viewport)}
              people={people}
              ref={canvasRef}
              relationships={relationships}
              selectedPersonId={selectedPerson?.id}
              actionsVisible={controlsVisible}
              t={t}
              treeId={activeTree.id}
              treeTitle={activeTree.title}
            />
            </div>
            {people.length > 0 && alternateView ? <FamilyExplorer key={activeTree.id}
              mode={alternateView} people={people} relationships={relationships} initialPersonId={focusId}
              selectedPersonId={selectedPerson?.id} onSelect={(id) => { rememberFocus(id); actions.selectPerson(selectedPerson?.id === id ? undefined : id); }}
              onEdit={editPerson} onAdd={addRelativeTo} onInteract={dismissCanvasPanels}
              onBackToTree={() => setAlternateViews((current) => ({ ...current, [activeTree.id]: undefined }))}
              actionsVisible={controlsVisible} language={data.language} t={t} /> : null}

            <header className="workspace-header">
              <div className="workspace-title">
                <div className="workspace-title-row">
                  <button
                    aria-label={`${t("renameTree")}: ${activeTree.title}`}
                    className="workspace-title-name"
                    onClick={startRenamingTree}
                    type="button"
                  >
                    <h2>{activeTree.title}</h2>
                  </button>
                  <button
                    aria-label={t("renameTree")}
                    className="icon-button quiet workspace-title-edit"
                    onClick={startRenamingTree}
                    title={t("renameTree")}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={15} />
                  </button>
                </div>
                <p>{t("peopleCount", { count: people.length })} · {t("relationshipsCount", { count: relationships.length })}</p>
              </div>
              {controlsVisible ? <div className="workspace-tools">
                {(pro.subscription.status === "active" || pro.subscription.status === "readOnly") && pro.sync.enabled ? <button
                  aria-label={`${t("automaticSync")}: ${t(pro.sync.phase === "upToDate" ? "syncUpToDate" : pro.sync.phase === "offline" ? "syncOffline" : pro.sync.phase === "error" || pro.sync.phase === "conflict" ? "syncAttention" : "syncing")}`}
                  className={`icon-button sync-workspace-button sync-${pro.sync.phase}`}
                   onClick={() => { setGenerationOpen(false); setRightPanel("settings"); }} type="button"
                 >{pro.sync.phase === "offline" || pro.sync.phase === "error" ? <CloudOff aria-hidden="true" size={19} /> : <Cloud aria-hidden="true" size={19} />}</button> : null}
                 <button aria-label={t("heritgFamily")} className="button secondary workspace-family-button" onClick={openFamilyPlus} type="button"><FamilyPlusMark size={20} /><FamilyPlusWordmark /></button>
                {__SHARING_ENABLED__ ? (
                  <button
                    aria-label={t("shareTree")}
                    className="button secondary workspace-share-button"
                    onClick={() => {
                      setGenerationOpen(false);
                      setRightPanel("share");
                    }}
                    type="button"
                  >
                    <Share2 aria-hidden="true" size={17} />
                    <span>{t("share")}</span>
                  </button>
                ) : null}
                <button
                  aria-describedby={showSettingsOnboarding ? "settings-menu-onboarding" : undefined}
                  aria-label={t("settings")}
                  className="icon-button"
                  onClick={() => {
                    setGenerationOpen(false);
                    setRightPanel("settings");
                  }}
                  type="button"
                >
                  <Settings2 aria-hidden="true" size={19} />
                </button>
              </div> : null}
            </header>

            {controlsVisible && !showAlternate ? <div className="canvas-controls" aria-label={t("canvasControls")} role="toolbar">
              <button
                aria-label={t("allPeople")}
                className="icon-button"
                onClick={() => {
                  setGenerationOpen(false);
                  setRightPanel("people");
                }}
                type="button"
              >
                <UsersRound aria-hidden="true" size={19} />
              </button>
              {!familyFocus ? <div className="tree-menu-wrap">
                <button
                  aria-expanded={generationOpen && Boolean(selectedPerson)}
                  aria-label={t("branchDepth")}
                  className="icon-button"
                  disabled={!selectedPerson}
                  onClick={() => setGenerationOpen((value) => !value)}
                  type="button"
                >
                  <SlidersHorizontal aria-hidden="true" size={18} />
                </button>
                {generationOpen && selectedPerson ? (
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
              </div> : null}
              <button
                aria-label={t("zoomIn")}
                className="icon-button"
                onClick={() => canvasRef.current?.zoomIn()}
                type="button"
              >
                <ZoomIn aria-hidden="true" size={18} />
              </button>
              <button
                aria-label={t("zoomOut")}
                className="icon-button"
                onClick={() => canvasRef.current?.zoomOut()}
                type="button"
              >
                <ZoomOut aria-hidden="true" size={18} />
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
            </div> : null}

            {showSettingsOnboarding ? (
              <div className="tree-pane-hint settings-pane-hint" id="settings-menu-onboarding" role="note">
                <span><b className="tutorial-step">2</b>{t("workspaceToolsHint")}</span>
                <svg aria-hidden="true" viewBox="0 0 64 78">
                  <path d="M6 67C25 62 43 38 52 16" />
                  <path d="m41 20 11-4 4 11" />
                </svg>
              </div>
            ) : null}

            {controlsVisible ? <div className="canvas-utilities" aria-label={t("helpPrivacyHint")} role="toolbar">
              <button aria-label={`${t("privacyProtection")}: ${t("protected")}`} className="privacy-button" onClick={() => setRightPanel("privacy")} type="button">
                <ShieldCheck aria-hidden="true" size={18} />
                <span>{t("protected")}</span>
              </button>
              <button aria-label={t("help")} className="icon-button" onClick={() => setRightPanel("help")} type="button">
                <CircleHelp aria-hidden="true" size={18} />
              </button>
            </div> : null}

            <div className="canvas-view-tools">
            <button
              aria-label={controlsVisible ? t("hideCanvasControls") : t("showCanvasControls")}
              aria-pressed={!controlsVisible}
              className="icon-button canvas-visibility-toggle"
              onClick={() => {
                setControlsVisible((visible) => {
                  if (visible) dismissCanvasPanels();
                  return !visible;
                });
              }}
              title={controlsVisible ? t("hideCanvasControls") : t("showCanvasControls")}
              type="button"
            >
              {controlsVisible ? <Eye aria-hidden="true" size={18} /> : <EyeOff aria-hidden="true" size={18} />}
            </button>
            {controlsVisible ? <FamilyViewControls key={activeTree.id}
              label={t("familyView")} mode={t(alternateView ? explorerLabels[alternateView] : isFocusedView ? "focusedFamily" : "fullTree")}
              shortMode={t(alternateView ? explorerLabels[alternateView] : isFocusedView ? "focusViewShort" : "fullViewShort")}
              describedBy={showSettingsOnboarding && !sidebarOpen ? "family-view-onboarding" : undefined}
              hint={showSettingsOnboarding && !sidebarOpen ? <div className="family-view-hint onboarding-hint" id="family-view-onboarding" role="note">
                <span><b className="tutorial-step">3</b>{t("familyViewHint")}</span>
                <svg aria-hidden="true" viewBox="0 0 76 58"><path d="M66 5C43 5 25 23 20 50" /><path d="m12 40 8 10 9-8" /></svg>
              </div> : undefined}
              personName={!showAlternate && familyFocus ? people.find((person) => person.id === focusId)?.displayName : undefined}>
              <div className="family-view-switch" role="group" aria-label={t("familyView")}>
                <button data-view-option type="button" aria-label={t("focusedFamily")} aria-pressed={!showAlternate && isFocusedView} onClick={() => chooseCanvasView("focus")}>{t("focusViewShort")}</button>
                <button data-view-option type="button" aria-label={t("fullTree")} aria-pressed={!showAlternate && !isFocusedView} onClick={() => chooseCanvasView("full")}>{t("fullViewShort")}</button>
                {explorerViews.map((view) => <button data-view-option type="button" key={view} title={t(explorerDescriptions[view])} aria-pressed={alternateView === view}
                  onClick={() => { setAlternateViews((current) => ({ ...current, [activeTree.id]: view })); setGenerationOpen(false); }}>{t(explorerLabels[view])}</button>)}
              </div>
              {!people.length ? <p className="family-view-empty">{t("familyViewEmpty")}</p> : null}
              {alternateView && people.length > 0 ? <p className="family-view-empty">{t(explorerDescriptions[alternateView])}</p> : null}
              {!showAlternate && familyFocus ? <>
                <FocusPersonPicker people={people} personId={focusId} onSelect={selectAndFocus} t={t} />
                <p className="family-view-count">{t("familyViewCount", { shown: focusedPeople.length, total: people.length })}</p>
                <label className="family-siblings-toggle">
                  <input type="checkbox" checked={Boolean(familyFocus.siblings)}
                    disabled={!hasFocusSiblings && !familyFocus.siblings}
                    onChange={(event) => updateFamilyView("focus", { ...familyFocus, siblings: event.target.checked })} />
                  <span><strong>{t("showSiblings")}</strong><small>{t(hasFocusSiblings ? "sharedParentSiblings" : "noSharedParentSiblings")}</small></span>
                </label>
                <div className="family-expand-controls">
                  <button type="button" disabled={!familyExpansions.ancestors} onClick={() => updateFamilyView("focus", familyExpansions.ancestors)}><ArrowUp aria-hidden="true" size={14} />{t("showMoreAncestors")}</button>
                  <button type="button" disabled={!familyExpansions.descendants} onClick={() => updateFamilyView("focus", familyExpansions.descendants)}><ArrowDown aria-hidden="true" size={14} />{t("showMoreDescendants")}</button>
                  {familyFocus.ancestors > 1 || familyFocus.descendants > 1 || familyFocus.siblings ? <button className="family-view-reset" type="button" aria-label={t("resetFamilyView")} title={t("resetFamilyView")} onClick={() => updateFamilyView("focus", { ...familyFocus, ancestors: 1, descendants: 1, siblings: undefined })}><RotateCcw aria-hidden="true" size={14} /></button> : null}
                </div>
              </> : null}
            </FamilyViewControls> : null}
            </div>

            {showSettingsOnboarding && !showAlternate ? (
              <div className="canvas-controls-hint onboarding-hint" role="note">
                <span><b className="tutorial-step">4</b>{t("canvasToolsHint")}</span>
                <svg aria-hidden="true" viewBox="0 0 76 58">
                  <path d="M5 5c23 4 43 25 57 45" />
                  <path d="m51 46 11 4 4-11" />
                </svg>
              </div>
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

      {renamingTree ? (
        <Modal
          closeLabel={t("close")}
          footer={
            <>
              <button className="button secondary" onClick={() => setRenamingTree(undefined)} type="button">{t("cancel")}</button>
              <button className="button primary" onClick={saveTreeName} type="button">{t("save")}</button>
            </>
          }
          onClose={() => setRenamingTree(undefined)}
          size="small"
          title={t("renameTree")}
        >
          <label className="field">
            {t("treeName")}
            <input
              autoFocus
              maxLength={160}
              onChange={(event) => setRenamingTree({ ...renamingTree, title: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") saveTreeName(); }}
              value={renamingTree.title}
            />
          </label>
          <ErrorNotice message={renameError} />
        </Modal>
      ) : null}

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
          language={data.language}
          onClose={() => setRelativeTarget(undefined)}
          onSaved={() => setTimeout(() => canvasRef.current?.focusPerson(relativeTarget.id), 60)}
          people={people}
          relationships={relationships}
          t={t}
          target={relativeTarget}
        />
      ) : null}

      {rightPanel === "people" ? (
        <PeopleDialog
          language={data.language}
          relationshipLanguage={relationshipLanguage}
          onClose={() => setRightPanel(undefined)}
          onSelect={selectAndFocus}
          people={people}
          relationships={relationships}
          selectedPersonId={selectedPerson?.id}
          t={t}
        />
      ) : null}

      {rightPanel === "settings" && pro.sync.phase !== "conflict" ? (
        <SettingsDialog
          actions={actions}
          data={data}
          onClose={() => setRightPanel(undefined)}
          pro={pro}
          t={t}
        />
      ) : null}

      {pro.paywallOpen ? <ProPaywallDialog pro={pro} t={t} /> : null}
      <PaymentStatusNotice pro={pro} t={t} />
      {pro.sync.phase === "conflict" ? <SyncResolutionDialog pro={pro} t={t} /> : null}

      {activeTree && rightPanel === "share" ? (
        <SharePanel
          data={data}
          exportPng={(privacy) => canvasRef.current?.exportPng(privacy) ?? Promise.reject(new Error("Canvas is not ready."))}
          exportSvg={(privacy) => canvasRef.current?.exportSvg(privacy) ?? Promise.reject(new Error("Canvas is not ready."))}
          onClose={() => setRightPanel(undefined)}
          onCopied={() => setToast(t("shareLinkCopied"))}
          onError={setOperationError}
          onExported={() => setToast(t("exported"))}
          peopleCount={people.length}
          t={t}
          tree={activeTree}
        />
      ) : null}

      {rightPanel === "help" ? (
        <HelpPanel
          onClose={() => setRightPanel(undefined)}
          onReportBug={() => setRightPanel("report")}
          t={t}
        />
      ) : null}

      {rightPanel === "privacy" ? (
        <PrivacyPanel onClose={() => setRightPanel(undefined)} syncEnabled={pro.sync.enabled} t={t} />
      ) : null}

      {rightPanel === "report" ? (
        <ReportBugSheet
          language={data.language}
          onClose={() => setRightPanel(undefined)}
          peopleCount={people.length}
          relationshipCount={relationships.length}
          t={t}
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
