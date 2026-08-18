import {
  CaptureUpdateAction,
  Excalidraw,
  sceneCoordsToViewportCoords
} from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
  PointerDownState
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { Pencil, Plus } from "lucide-react";
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from "react";

import { downloadBlob, safeFilename } from "./images";
import { createCircularAvatarCache } from "./avatar";
import { buildChartSvg, chartSvgToPng } from "./chartExport";
import { createConnectionPlan } from "./connectionPlan";
import type { ControlPlacement } from "./connectionGeometry";
import type { ExportPrivacySelection } from "./exportPrivacy";
import type { Translator } from "./i18n";
import { deriveKinshipLabels, effectiveKinshipLanguage } from "./kinship";
import { createTreeLayout, LAYOUT_METRICS } from "./layout";
import {
  projectConnectionPlanToElements,
  projectLayoutToScene
} from "./scene";
import type {
  AppData,
  FamilyRelationship,
  GenerationLimits,
  Person,
  PositionedPerson,
  RelationshipTerminology,
  SceneLifeSummaryOptions,
  ViewportState
} from "./types";

export interface TreeCanvasHandle {
  fitAll: () => void;
  focusPerson: (personId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  exportPng: (privacy: ExportPrivacySelection) => Promise<void>;
  exportSvg: (privacy: ExportPrivacySelection) => Promise<void>;
}

export interface TreeCanvasProps {
  treeId: string;
  treeTitle: string;
  people: Person[];
  relationships: FamilyRelationship[];
  selectedPersonId?: string;
  generationLimits: GenerationLimits;
  language: AppData["language"];
  relationshipTerminology?: RelationshipTerminology;
  initialViewport?: ViewportState;
  t: Translator;
  onAddRelative: (personId: string) => void;
  onEditPerson: (personId: string) => void;
  onSelectPerson: (personId: string) => void;
  onDeselectPerson: () => void;
  onCanvasInteract: () => void;
  onViewportChange: (viewport: ViewportState) => void;
  emptyContent?: ReactNode;
  readOnly?: boolean;
  actionsVisible?: boolean;
  lifeSummaryOptions?: SceneLifeSummaryOptions;
}

type CanvasViewport = Pick<AppState, "scrollX" | "scrollY" | "zoom">;
type CanvasTransform = CanvasViewport
  & Pick<AppState, "offsetLeft" | "offsetTop">
  & { hostLeft: number; hostTop: number };

type CanvasHostBounds = Pick<DOMRect, "left" | "top">;

interface CanvasActionsProps {
  api?: ExcalidrawImperativeAPI;
  controls: ControlPlacement[];
  hostRef: RefObject<HTMLDivElement | null>;
  people: PositionedPerson[];
  selectedPersonId?: string;
  t: Translator;
  onAddRelative: (personId: string) => void;
  onEditPerson: (personId: string) => void;
  onTogglePerson: (personId: string) => void;
  onWheelNavigation: (event: WheelEvent) => void;
  emptyContent?: ReactNode;
  actionsVisible: boolean;
}

const personIdFromHit = (pointerDownState: PointerDownState) => {
  const customData = pointerDownState.hit.element?.customData as
    | { personId?: unknown }
    | undefined;
  return typeof customData?.personId === "string" ? customData.personId : undefined;
};

const zoomValue = (value: number) => value as NormalizedZoomValue;

const readCanvasTransform = (
  api: ExcalidrawImperativeAPI,
  bounds: CanvasHostBounds,
  viewport?: CanvasViewport
): CanvasTransform => {
  const appState = api.getAppState();
  return {
    scrollX: viewport?.scrollX ?? appState.scrollX,
    scrollY: viewport?.scrollY ?? appState.scrollY,
    zoom: viewport?.zoom ?? appState.zoom,
    offsetLeft: appState.offsetLeft,
    offsetTop: appState.offsetTop,
    hostLeft: bounds.left,
    hostTop: bounds.top
  };
};

function CanvasActions({
  api,
  controls,
  hostRef,
  people,
  selectedPersonId,
  t,
  onAddRelative,
  onEditPerson,
  onTogglePerson,
  onWheelNavigation,
  emptyContent,
  actionsVisible
}: CanvasActionsProps) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const sceneLayerRef = useRef<HTMLDivElement>(null);
  const controlsByPerson = useMemo(
    () => new Map(controls.map((control) => [control.personId, control])),
    [controls]
  );

  useEffect(() => {
    const actions = actionsRef.current;
    if (!actions) return;
    actions.addEventListener("wheel", onWheelNavigation, { passive: false });
    return () => actions.removeEventListener("wheel", onWheelNavigation);
  }, [onWheelNavigation]);

  useEffect(() => {
    const host = hostRef.current;
    const sceneLayer = sceneLayerRef.current;
    if (!api || !host || !sceneLayer) return;
    let frame: number | undefined;
    let bounds = host.getBoundingClientRect();
    let pendingViewport: CanvasViewport | undefined;
    let refreshBounds = false;
    let navigationTimer: number | undefined;
    let navigating = false;
    const update = () => {
      frame = undefined;
      if (navigating) return;
      if (refreshBounds) {
        bounds = host.getBoundingClientRect();
        refreshBounds = false;
      }
      const transform = readCanvasTransform(api, bounds, pendingViewport);
      pendingViewport = undefined;
      const origin = sceneCoordsToViewportCoords({ sceneX: 0, sceneY: 0 }, transform);
      const zoom = transform.zoom.value;
      const actionScale = Math.min(1, Math.max(0.34, zoom));
      sceneLayer.style.transform = `translate3d(${origin.x - transform.hostLeft}px, ${origin.y - transform.hostTop}px, 0) scale(${zoom})`;
      sceneLayer.style.visibility = "visible";
      sceneLayer.style.setProperty("--canvas-hit-scale", String(Math.max(1, 44 / (LAYOUT_METRICS.avatarDiameter * zoom))));
      sceneLayer.style.setProperty("--canvas-action-compensation", String(actionScale / zoom));
    };
    const scheduleUpdate = (viewport?: CanvasViewport, resized = false) => {
      if (viewport) pendingViewport = viewport;
      refreshBounds ||= resized;
      if (navigating) return;
      if (frame === undefined) frame = requestAnimationFrame(update);
    };
    const unsubscribe = api.onScrollChange((scrollX, scrollY, zoom) => {
      pendingViewport = { scrollX, scrollY, zoom };
      if (sceneLayer.querySelector(":focus-visible")) {
        navigating = false;
        if (navigationTimer !== undefined) window.clearTimeout(navigationTimer);
        scheduleUpdate(pendingViewport);
        return;
      }
      navigating = true;
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }
      if (sceneLayer.style.visibility !== "hidden") {
        sceneLayer.style.visibility = "hidden";
      }
      if (navigationTimer !== undefined) window.clearTimeout(navigationTimer);
      navigationTimer = window.setTimeout(() => {
        navigating = false;
        scheduleUpdate(pendingViewport);
      }, 80);
    });
    const scheduleResizeUpdate = () => scheduleUpdate(undefined, true);
    const observer = new ResizeObserver(scheduleResizeUpdate);
    observer.observe(host);
    window.addEventListener("resize", scheduleResizeUpdate);
    scheduleResizeUpdate();
    const settledUpdate = window.setTimeout(scheduleResizeUpdate, 180);
    return () => {
      unsubscribe();
      observer.disconnect();
      window.removeEventListener("resize", scheduleResizeUpdate);
      window.clearTimeout(settledUpdate);
      if (navigationTimer !== undefined) window.clearTimeout(navigationTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [api, hostRef]);

  return (
    <div
      className="canvas-actions"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      ref={actionsRef}
    >
      {emptyContent ? (
        <div className="canvas-empty-anchor">
          {emptyContent}
        </div>
      ) : null}
      <div className="canvas-actions-scene" ref={sceneLayerRef}>
        {people.map((person) => {
          const selected = person.id === selectedPersonId;
          const showActions = actionsVisible && (people.length <= 24 || selected);
          const side = controlsByPerson.get(person.id)?.side ?? (person.x <= 0 ? "left" : "right");
          const anchorX = person.x + (side === "left" ? -1 : 1) *
            (LAYOUT_METRICS.avatarRadius + 12);
          const addLabel = showActions
            ? t("addRelativeTo", { name: person.displayName })
            : "";
          const editLabel = selected ? t("editPerson", { name: person.displayName }) : "";
          return (
            <Fragment key={person.id}>
              <button
                aria-label={person.displayName}
                aria-pressed={selected}
                className="canvas-person-hit"
                data-canvas-person={person.id}
                onClick={() => onTogglePerson(person.id)}
                style={{
                  height: LAYOUT_METRICS.avatarDiameter,
                  left: person.x,
                  top: person.y,
                  width: LAYOUT_METRICS.avatarDiameter
                }}
                type="button"
              />
              {showActions ? <div
                className="canvas-action-group"
                data-side={side}
                style={{
                  left: anchorX,
                  top: person.y
                } as CSSProperties}
              >
                <button
                  aria-label={addLabel}
                  className="canvas-action-button add"
                  data-canvas-action="add"
                  data-person-id={person.id}
                  onClick={() => onAddRelative(person.id)}
                  title={addLabel}
                  type="button"
                >
                  <Plus aria-hidden="true" size={16} strokeWidth={2.6} />
                </button>
                {selected ? (
                  <button
                    aria-label={editLabel}
                    className="canvas-action-button edit"
                    data-canvas-action="edit"
                    data-person-id={person.id}
                    onClick={() => onEditPerson(person.id)}
                    title={editLabel}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={14} strokeWidth={2.4} />
                  </button>
                ) : null}
              </div> : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export const ExcalidrawTreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(function ExcalidrawTreeCanvas({
  treeId,
  treeTitle,
  people,
  relationships,
  selectedPersonId,
  generationLimits,
  language,
  relationshipTerminology = "id",
  initialViewport,
  t,
  onAddRelative,
  onEditPerson,
  onSelectPerson,
  onDeselectPerson,
  onCanvasInteract,
  onViewportChange,
  emptyContent,
  readOnly = false,
  actionsVisible = true,
  lifeSummaryOptions
}, ref) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingViewport = useRef<ViewportState | undefined>(undefined);
  const viewportCallback = useRef(onViewportChange);
  const didInitialMobileFit = useRef(false);
  const registeredFileIds = useRef(new Set<string>());
  const wheelFrame = useRef<number | undefined>(undefined);
  const pendingWheel = useRef<{
    deltaX: number;
    deltaY: number;
    pointerX: number;
    pointerY: number;
    zooming: boolean;
  } | undefined>(undefined);
  const resolveAvatar = useMemo(() => createCircularAvatarCache(), []);
  const spacePanActive = useRef(false);
  const [touchNavigation, setTouchNavigation] = useState(() =>
    window.matchMedia("(pointer: coarse)").matches
  );
  const selectionFiltersLayout = generationLimits.ancestors !== null ||
    generationLimits.descendants !== null;
  const layoutSelectionId = selectionFiltersLayout ? selectedPersonId : undefined;
  const geometryLayout = useMemo(
    () => createTreeLayout(
      people,
      relationships,
      layoutSelectionId,
      generationLimits,
      effectiveKinshipLanguage(language, relationshipTerminology)
    ),
    [generationLimits, language, layoutSelectionId, people, relationshipTerminology, relationships]
  );
  const layout = useMemo(() => {
    if (selectionFiltersLayout || !selectedPersonId || geometryLayout.people.length === 1) {
      return geometryLayout;
    }
    const labels = deriveKinshipLabels(
      selectedPersonId,
      people,
      relationships,
      effectiveKinshipLanguage(language, relationshipTerminology)
    );
    return {
      ...geometryLayout,
      people: geometryLayout.people.map((person) => ({
        ...person,
        role: labels[person.id] ?? ""
      }))
    };
  }, [geometryLayout, language, people, relationshipTerminology, relationships, selectedPersonId, selectionFiltersLayout]);
  const routingLayout = useMemo(() => ({
    ...geometryLayout,
    people: geometryLayout.people.map((person) => ({ ...person, role: " " }))
  }), [geometryLayout]);
  const connectionPlan = useMemo(
    () => createConnectionPlan(
      routingLayout,
      language,
      undefined,
      !readOnly && people.length <= 24
    ),
    [language, people.length, readOnly, routingLayout]
  );
  const connectionElements = useMemo(
    () => projectConnectionPlanToElements(connectionPlan),
    [connectionPlan]
  );
  const scene = useMemo(
    () => projectLayoutToScene(
      layout,
      selectedPersonId,
      language,
      connectionPlan,
      resolveAvatar,
      connectionElements,
      lifeSummaryOptions
    ),
    [connectionElements, connectionPlan, language, layout, lifeSummaryOptions, resolveAvatar, selectedPersonId]
  );
  useEffect(() => {
    viewportCallback.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const updateTouchNavigation = () => setTouchNavigation(coarsePointer.matches);
    coarsePointer.addEventListener("change", updateTouchNavigation);
    return () => coarsePointer.removeEventListener("change", updateTouchNavigation);
  }, []);

  useEffect(() => {
    if (!api) return;
    const releaseSpacePan = () => {
      if (!spacePanActive.current) return;
      spacePanActive.current = false;
      api.setActiveTool({ type: "selection" });
    };
    const handleSpaceDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      spacePanActive.current = true;
      api.setActiveTool({ type: "hand" });
    };
    const handleSpaceUp = (event: KeyboardEvent) => {
      if (event.code === "Space") releaseSpacePan();
    };
    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);
    window.addEventListener("blur", releaseSpacePan);
    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
      window.removeEventListener("blur", releaseSpacePan);
      spacePanActive.current = false;
    };
  }, [api]);

  const personElements = (personId: string) => scene.elements.filter((element) => {
    const customData = element.customData as { personId?: unknown } | undefined;
    return customData?.personId === personId;
  });

  const focusPerson = (personId: string) => {
    const elements = personElements(personId);
    if (!elements.length) return;
    api?.scrollToContent(elements, {
      animate: true,
      duration: 280,
      fitToViewport: true,
      maxZoom: 1.35,
      minZoom: 0.25,
      viewportZoomFactor: 0.32
    });
  };

  const togglePerson = (personId: string) => {
    if (personId === selectedPersonId) onDeselectPerson();
    else onSelectPerson(personId);
  };

  const fitAll = () => {
    if (!scene.elements.length) return;
    api?.scrollToContent(scene.elements, {
      animate: true,
      duration: 320,
      fitToViewport: true,
      maxZoom: 1.1,
      minZoom: 0.08,
      viewportZoomFactor: 0.82
    });
  };

  const zoomBy = (change: number) => {
    if (!api) return;
    const appState = api.getAppState();
    const currentZoom = appState.zoom.value;
    const nextZoom = Math.min(
      1.8,
      Math.max(0.08, Math.round((currentZoom + change) * 10) / 10)
    );
    if (nextZoom === currentZoom) return;
    const centerX = appState.width / 2;
    const centerY = appState.height / 2;
    api.updateScene({
      appState: {
        scrollX: appState.scrollX + centerX * (1 / nextZoom - 1 / currentZoom),
        scrollY: appState.scrollY + centerY * (1 / nextZoom - 1 / currentZoom),
        zoom: { value: zoomValue(nextZoom) }
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY
    });
  };

  const zoomIn = () => zoomBy(0.1);
  const zoomOut = () => zoomBy(-0.1);

  const handleOverlayWheel = (event: WheelEvent) => {
    if (!api) return;
    event.preventDefault();
    event.stopPropagation();
    const zooming = event.ctrlKey || event.metaKey;
    const deltaX = !zooming && event.shiftKey && event.deltaX === 0
      ? event.deltaY
      : event.deltaX;
    const deltaY = !zooming && event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
    const pending = pendingWheel.current;
    if (pending && pending.zooming === zooming) {
      pending.deltaX += deltaX;
      pending.deltaY += deltaY;
      pending.pointerX = event.clientX;
      pending.pointerY = event.clientY;
    } else {
      pendingWheel.current = {
        deltaX,
        deltaY,
        pointerX: event.clientX,
        pointerY: event.clientY,
        zooming
      };
    }
    if (wheelFrame.current !== undefined) return;
    wheelFrame.current = requestAnimationFrame(() => {
      wheelFrame.current = undefined;
      const navigation = pendingWheel.current;
      pendingWheel.current = undefined;
      if (!navigation) return;
      const appState = api.getAppState();
      const currentZoom = appState.zoom.value;
      if (navigation.zooming) {
        const nextZoom = Math.min(
          1.8,
          Math.max(0.08, currentZoom * Math.pow(2, -navigation.deltaY / 100))
        );
        const pointerX = navigation.pointerX - appState.offsetLeft;
        const pointerY = navigation.pointerY - appState.offsetTop;
        api.updateScene({
          appState: {
            scrollX: appState.scrollX + pointerX * (1 / nextZoom - 1 / currentZoom),
            scrollY: appState.scrollY + pointerY * (1 / nextZoom - 1 / currentZoom),
            zoom: { value: zoomValue(nextZoom) }
          },
          captureUpdate: CaptureUpdateAction.EVENTUALLY
        });
        return;
      }
      api.updateScene({
        appState: {
          scrollX: appState.scrollX - navigation.deltaX / currentZoom,
          scrollY: appState.scrollY - navigation.deltaY / currentZoom
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY
      });
    });
  };

  useEffect(() => () => {
    if (wheelFrame.current !== undefined) cancelAnimationFrame(wheelFrame.current);
  }, []);

  const exportPng = async (privacy: ExportPrivacySelection) => {
    downloadBlob(
      await chartSvgToPng(buildChartSvg(
        layout, treeTitle, selectedPersonId, language, connectionPlan, privacy
      )),
      safeFilename(treeTitle, "png")
    );
  };

  const exportSvg = async (privacy: ExportPrivacySelection) => {
    const chart = buildChartSvg(
      layout, treeTitle, selectedPersonId, language, connectionPlan, privacy
    );
    downloadBlob(
      new Blob([chart.svg], { type: "image/svg+xml;charset=utf-8" }),
      safeFilename(treeTitle, "svg")
    );
  };

  useImperativeHandle(ref, () => ({ fitAll, focusPerson, zoomIn, zoomOut, exportPng, exportSvg }));

  useEffect(() => {
    if (!api) return;
    const newFiles = Object.entries(scene.files)
      .filter(([fileId]) => !registeredFileIds.current.has(fileId))
      .map(([, file]) => file);
    if (newFiles.length) {
      api.addFiles(newFiles);
      Object.keys(scene.files).forEach((fileId) => registeredFileIds.current.add(fileId));
    }
    api.updateScene({
      elements: scene.elements,
      appState: {
        selectedElementIds: {},
        viewBackgroundColor: scene.appState.viewBackgroundColor
      },
      captureUpdate: CaptureUpdateAction.NEVER
    });
  }, [api, scene]);

  useEffect(() => {
    if (!api || didInitialMobileFit.current || window.innerWidth > 840 || !scene.elements.length) return;
    didInitialMobileFit.current = true;
    const timer = setTimeout(() => api.scrollToContent(scene.elements, {
      animate: true,
      duration: 320,
      fitToViewport: true,
      maxZoom: 1.1,
      minZoom: 0.08,
      viewportZoomFactor: 0.82
    }), 100);
    return () => clearTimeout(timer);
  }, [api, scene]);

  useEffect(() => () => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    const finalViewport = pendingViewport.current;
    pendingViewport.current = undefined;
    viewportTimer.current = undefined;
    if (finalViewport) viewportCallback.current(finalViewport);
  }, [treeId]);

  useEffect(() => {
    let wasMobile = window.innerWidth <= 840;
    const handleResize = () => {
      const isMobile = window.innerWidth <= 840;
      if (isMobile !== wasMobile) {
        wasMobile = isMobile;
        setTimeout(fitAll, 80);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  const persistViewport = (scrollX: number, scrollY: number, zoom: { value: number }) => {
    pendingViewport.current = { scrollX, scrollY, zoom: zoom.value };
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      if (pendingViewport.current) viewportCallback.current(pendingViewport.current);
      pendingViewport.current = undefined;
    }, 220);
  };

  const handlePointerUp = (_tool: unknown, pointerDownState: PointerDownState) => {
    if (pointerDownState.drag.hasOccurred) return;
    const personId = personIdFromHit(pointerDownState);
    if (!personId) {
      onDeselectPerson();
      return;
    }
    togglePerson(personId);
  };

  const restoreViewport = window.innerWidth > 840 && scene.elements.length
    ? initialViewport
    : undefined;
  const initialAppState = {
    viewBackgroundColor: scene.appState.viewBackgroundColor,
    showWelcomeScreen: false,
    ...(restoreViewport ? {
      scrollX: restoreViewport.scrollX,
      scrollY: restoreViewport.scrollY,
      zoom: { value: zoomValue(restoreViewport.zoom) }
    } : {})
  };

  return (
    <div
      className="canvas-host"
      aria-label={treeTitle}
      onPointerDownCapture={onCanvasInteract}
      ref={canvasHost}
      role="region"
    >
      <Excalidraw
        autoFocus={false}
        detectScroll={false}
        excalidrawAPI={setApi}
        handleKeyboardGlobally={false}
        initialData={{
          elements: scene.elements,
          files: scene.files,
          appState: initialAppState,
          scrollToContent: !restoreViewport && scene.elements.length > 0
        }}
        langCode={language === "id" ? "id-ID" : "en"}
        name={treeTitle}
        onLinkOpen={(element, event) => {
          event.preventDefault();
          const customData = element.customData as { personId?: unknown } | undefined;
          if (typeof customData?.personId === "string") {
            togglePerson(customData.personId);
          }
        }}
        onPointerUp={handlePointerUp}
        onScrollChange={persistViewport}
        theme="light"
        viewModeEnabled={touchNavigation}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false
          },
          tools: { image: false }
        }}
      />
      {readOnly ? emptyContent : (
        <CanvasActions
          api={api}
          controls={connectionPlan.controls}
          hostRef={canvasHost}
          onAddRelative={onAddRelative}
          onEditPerson={onEditPerson}
          onTogglePerson={togglePerson}
          onWheelNavigation={handleOverlayWheel}
          people={layout.people}
          selectedPersonId={selectedPersonId}
          t={t}
          emptyContent={emptyContent}
          actionsVisible={actionsVisible}
        />
      )}
    </div>
  );
});
