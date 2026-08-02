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
import { Pencil, Plus } from "lucide-react";
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";

import { downloadBlob, safeFilename } from "./images";
import { buildChartSvg, chartSvgToPng } from "./chartExport";
import { createConnectionPlan } from "./connectionPlan";
import type { ControlPlacement } from "./connectionGeometry";
import type { Translator } from "./i18n";
import { createTreeLayout, LAYOUT_METRICS } from "./layout";
import { projectLayoutToScene } from "./scene";
import type {
  AppData,
  FamilyRelationship,
  GenerationLimits,
  Person,
  PositionedPerson,
  ViewportState
} from "./types";

export interface TreeCanvasHandle {
  fitAll: () => void;
  focusPerson: (personId: string) => void;
  exportPng: () => Promise<void>;
  exportSvg: () => Promise<void>;
}

interface TreeCanvasProps {
  treeId: string;
  treeTitle: string;
  people: Person[];
  relationships: FamilyRelationship[];
  selectedPersonId?: string;
  generationLimits: GenerationLimits;
  language: AppData["language"];
  initialViewport?: ViewportState;
  t: Translator;
  onAddRelative: (personId: string) => void;
  onEditPerson: (personId: string) => void;
  onSelectPerson: (personId: string) => void;
  onDeselectPerson: () => void;
  onViewportChange: (viewport: ViewportState) => void;
}

type CanvasViewport = Pick<AppState, "scrollX" | "scrollY" | "zoom">;
type CanvasTransform = CanvasViewport
  & Pick<AppState, "offsetLeft" | "offsetTop">
  & { hostLeft: number; hostTop: number; hostWidth: number };

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
  host: HTMLDivElement,
  viewport?: CanvasViewport
): CanvasTransform => {
  const appState = api.getAppState();
  const bounds = host.getBoundingClientRect();
  return {
    scrollX: viewport?.scrollX ?? appState.scrollX,
    scrollY: viewport?.scrollY ?? appState.scrollY,
    zoom: viewport?.zoom ?? appState.zoom,
    offsetLeft: appState.offsetLeft,
    offsetTop: appState.offsetTop,
    hostLeft: bounds.left,
    hostTop: bounds.top,
    hostWidth: bounds.width
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
  onTogglePerson
}: CanvasActionsProps) {
  const [transform, setTransform] = useState<CanvasTransform>();

  useEffect(() => {
    const host = hostRef.current;
    if (!api || !host) return;
    let resizeFrame: number | undefined;
    const update = (viewport?: CanvasViewport) => {
      setTransform(readCanvasTransform(api, host, viewport));
    };
    const scheduleResizeUpdate = () => {
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => update());
    };
    const unsubscribe = api.onScrollChange((scrollX, scrollY, zoom) => {
      update({ scrollX, scrollY, zoom });
    });
    const observer = new ResizeObserver(scheduleResizeUpdate);
    observer.observe(host);
    window.addEventListener("resize", scheduleResizeUpdate);
    scheduleResizeUpdate();
    return () => {
      unsubscribe();
      observer.disconnect();
      window.removeEventListener("resize", scheduleResizeUpdate);
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    };
  }, [api, hostRef]);

  if (!transform) return null;
  const hideUnselectedActions = Boolean(selectedPersonId) &&
    people.length > 24 && transform.zoom.value < 0.16;
  const hitSize = Math.max(44, LAYOUT_METRICS.avatarDiameter * transform.zoom.value);
  const controlsByPerson = new Map(controls.map((control) => [control.personId, control]));
  const screenPeople = people.map((person) => {
    const center = sceneCoordsToViewportCoords({
      sceneX: person.x,
      sceneY: person.y
    }, transform);
    const centerX = center.x - transform.hostLeft;
    const centerY = center.y - transform.hostTop;
    return {
      person,
      centerX,
      centerY
    };
  });

  return (
    <div
      className="canvas-actions"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {screenPeople.map(({ person, centerX, centerY }) => {
        const selected = person.id === selectedPersonId;
        const showActions = !hideUnselectedActions || selected;
        const side = controlsByPerson.get(person.id)?.side ?? (person.x <= 0 ? "left" : "right");
        const anchor = sceneCoordsToViewportCoords({
          sceneX: person.x + (side === "left" ? -1 : 1) *
            (LAYOUT_METRICS.avatarRadius + 12),
          sceneY: person.y
        }, transform);
        const addLabel = t("addRelativeTo", { name: person.displayName });
        const editLabel = t("editPerson", { name: person.displayName });
        return (
          <Fragment key={person.id}>
            <button
              aria-label={person.displayName}
              aria-pressed={selected}
              className="canvas-person-hit"
              data-canvas-person={person.id}
              onClick={() => onTogglePerson(person.id)}
              style={{
                height: hitSize,
                left: centerX - hitSize / 2,
                top: centerY - hitSize / 2,
                width: hitSize
              }}
              type="button"
            />
            {showActions ? <div
              className="canvas-action-group"
              data-side={side}
              style={{
                left: anchor.x - transform.hostLeft,
                top: anchor.y - transform.hostTop
              }}
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
  );
}

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(function TreeCanvas({
  treeId,
  treeTitle,
  people,
  relationships,
  selectedPersonId,
  generationLimits,
  language,
  initialViewport,
  t,
  onAddRelative,
  onEditPerson,
  onSelectPerson,
  onDeselectPerson,
  onViewportChange
}, ref) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI>();
  const canvasHost = useRef<HTMLDivElement>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingViewport = useRef<ViewportState | undefined>(undefined);
  const viewportCallback = useRef(onViewportChange);
  const didInitialMobileFit = useRef(false);
  const layout = useMemo(
    () => createTreeLayout(people, relationships, selectedPersonId, generationLimits, language),
    [generationLimits, language, people, relationships, selectedPersonId]
  );
  const connectionPlan = useMemo(
    () => createConnectionPlan(layout, language),
    [language, layout]
  );
  const scene = useMemo(
    () => projectLayoutToScene(layout, selectedPersonId, language, connectionPlan),
    [connectionPlan, language, layout, selectedPersonId]
  );

  useEffect(() => {
    viewportCallback.current = onViewportChange;
  }, [onViewportChange]);

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
    else {
      onSelectPerson(personId);
      focusPerson(personId);
    }
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

  const exportPng = async () => {
    downloadBlob(
      await chartSvgToPng(buildChartSvg(
        layout, treeTitle, selectedPersonId, language, connectionPlan
      )),
      safeFilename(treeTitle, "png")
    );
  };

  const exportSvg = async () => {
    const chart = buildChartSvg(layout, treeTitle, selectedPersonId, language, connectionPlan);
    downloadBlob(
      new Blob([chart.svg], { type: "image/svg+xml;charset=utf-8" }),
      safeFilename(treeTitle, "svg")
    );
  };

  useImperativeHandle(ref, () => ({ fitAll, focusPerson, exportPng, exportSvg }));

  useEffect(() => {
    if (!api) return;
    api.addFiles(Object.values(scene.files));
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
    if (pendingViewport.current) viewportCallback.current(pendingViewport.current);
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

  const restoreViewport = window.innerWidth > 840 ? initialViewport : undefined;
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
    <div className="canvas-host" aria-label={treeTitle} ref={canvasHost} role="region">
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
        viewModeEnabled
      />
      <CanvasActions
        api={api}
        controls={connectionPlan.controls}
        hostRef={canvasHost}
        onAddRelative={onAddRelative}
        onEditPerson={onEditPerson}
        onTogglePerson={togglePerson}
        people={layout.people}
        selectedPersonId={selectedPersonId}
        t={t}
      />
    </div>
  );
});
