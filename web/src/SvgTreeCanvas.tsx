import { LoaderCircle, Pencil, Plus } from "lucide-react";
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

import {
  fitSceneRect,
  interpolateViewport,
  panViewport,
  zoomViewportAt,
  type Point,
  type SceneRect
} from "./canvasViewport";
import { buildChartSvg, chartSvgToPng } from "./chartExport";
import { birthOrderLabel } from "./birthOrder";
import type { ControlPlacement } from "./connectionGeometry";
import type { TreeCanvasHandle, TreeCanvasProps } from "./ExcalidrawTreeCanvas";
import { downloadBlob, safeFilename } from "./images";
import { deriveKinshipLabels } from "./kinship";
import { createTreeLayout, LAYOUT_METRICS } from "./layout";
import { formatPersonName } from "./personName";
import { SvgTreeScene } from "./SvgTreeScene";
import type { TreeLayout, ViewportState } from "./types";
import { useTreePreparation } from "./useTreePreparation";

interface PendingWheel {
  deltaX: number;
  deltaY: number;
  pointerX: number;
  pointerY: number;
  zooming: boolean;
}

interface PointerRecord {
  clientX: number;
  clientY: number;
}

interface DragState {
  button: number;
  canPan: boolean;
  moved: boolean;
  personId?: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startViewport: ViewportState;
}

interface PinchState {
  distance: number;
  midpoint: Point;
  viewport: ViewportState;
}

const targetPersonId = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return undefined;
  return target.closest<SVGGElement>("[data-person-id]")?.dataset.personId;
};

const midpoint = (left: PointerRecord, right: PointerRecord): Point => ({
  x: (left.clientX + right.clientX) / 2,
  y: (left.clientY + right.clientY) / 2
});

const pointerDistance = (left: PointerRecord, right: PointerRecord) =>
  Math.hypot(right.clientX - left.clientX, right.clientY - left.clientY);

const sceneRectFromPlan = (bounds: { x: number; y: number; width: number; height: number }): SceneRect => ({
  x: bounds.x,
  y: bounds.y,
  width: bounds.width,
  height: bounds.height
});

function SvgCanvasActions({
  actionsVisible,
  controls,
  emptyContent,
  language,
  onAddRelative,
  onEditPerson,
  onTogglePerson,
  people,
  sceneRef,
  selectedPersonId,
  t
}: Pick<TreeCanvasProps,
  "actionsVisible" | "emptyContent" | "language" | "onAddRelative" | "onEditPerson" | "selectedPersonId" | "t"
> & {
  controls: ControlPlacement[];
  onTogglePerson: (personId: string) => void;
  people: ReturnType<typeof createTreeLayout>["people"];
  sceneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const controlsByPerson = useMemo(
    () => new Map(controls.map((control) => [control.personId, control])),
    [controls]
  );
  return (
    <div
      className="canvas-actions"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {emptyContent ? <div className="canvas-empty-anchor">{emptyContent}</div> : null}
      <div className="canvas-actions-scene" ref={sceneRef}>
        {people.map((person) => {
          const selected = person.id === selectedPersonId;
          const showActions = actionsVisible && (people.length <= 24 || selected);
          const side = controlsByPerson.get(person.id)?.side ?? (person.x <= 0 ? "left" : "right");
          const anchorX = person.x + (side === "left" ? -1 : 1) *
            (LAYOUT_METRICS.avatarRadius + 12);
          const addLabel = showActions ? t("addRelativeTo", { name: person.displayName }) : "";
          const editLabel = selected ? t("editPerson", { name: person.displayName }) : "";
          return (
            <Fragment key={person.id}>
              <button
                aria-label={[
                  person.displayName,
                  t(person.gender),
                  person.birthOrder ? birthOrderLabel(person.birthOrder, language) : undefined
                ].filter(Boolean).join(", ")}
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
                title={person.birthOrder ? birthOrderLabel(person.birthOrder, language) : undefined}
                type="button"
              />
              {showActions ? (
                <div
                  className="canvas-action-group"
                  data-side={side}
                  style={{ left: anchorX, top: person.y } as CSSProperties}
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
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export const SvgTreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(function SvgTreeCanvas({
  treeId,
  treeTitle,
  people,
  relationships,
  selectedPersonId,
  generationLimits,
  language,
  relationshipLanguage = "id",
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
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneGroupRef = useRef<SVGGElement>(null);
  const actionsSceneRef = useRef<HTMLDivElement>(null);
  const viewport = useRef<ViewportState>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const viewportCallback = useRef(onViewportChange);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPersistedViewport = useRef<ViewportState | undefined>(undefined);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wheelFrame = useRef<number | undefined>(undefined);
  const pendingWheel = useRef<PendingWheel | undefined>(undefined);
  const animationFrame = useRef<number | undefined>(undefined);
  const initialized = useRef(false);
  const observedHostSize = useRef<{ width: number; height: number } | undefined>(undefined);
  const wasMobile = useRef(window.innerWidth <= 840);
  const spacePanActive = useRef(false);
  const pointers = useRef(new Map<number, PointerRecord>());
  const drag = useRef<DragState | undefined>(undefined);
  const pinch = useRef<PinchState | undefined>(undefined);
  const gestureMoved = useRef(false);
  const selectionFiltersLayout = generationLimits.ancestors !== null ||
    generationLimits.descendants !== null;
  const layoutSelectionId = selectionFiltersLayout ? selectedPersonId : undefined;
  const { result: preparedTree, isPreparing } = useTreePreparation({
    people,
    relationships,
    layoutSelectionId,
    generationLimits,
    language,
    relationshipLanguage,
    controlsVisible: !readOnly && people.length <= 24
  });
  const geometryLayout = useMemo<TreeLayout>(() => {
    if (!preparedTree) return { people: [], relationships: [], width: 0, height: 0 };
    const peopleById = new Map(people.map((person) => [person.id, person]));
    return {
      ...preparedTree.geometryLayout,
      people: preparedTree.geometryLayout.people.map((positioned) => ({
        ...(peopleById.get(positioned.id) ?? positioned),
        x: positioned.x,
        y: positioned.y,
        role: positioned.role,
        generation: positioned.generation,
        birthOrder: positioned.birthOrder
      }))
    };
  }, [people, preparedTree]);
  const layout = useMemo(() => {
    if (selectionFiltersLayout || !selectedPersonId || geometryLayout.people.length === 1) {
      return geometryLayout;
    }
    const labels = deriveKinshipLabels(
      selectedPersonId,
      people,
      relationships,
      relationshipLanguage
    );
    return {
      ...geometryLayout,
      people: geometryLayout.people.map((person) => ({
        ...person,
        role: labels[person.id] ?? ""
      }))
    };
  }, [geometryLayout, people, relationshipLanguage, relationships, selectedPersonId, selectionFiltersLayout]);
  const connectionPlan = preparedTree?.connectionPlan ?? {
    families: [],
    nonParentRoutes: [],
    obstacles: [],
    controls: [],
    crossings: [],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    failures: [],
    isValid: true
  };

  const updateTransforms = (next: ViewportState, navigating = false) => {
    const transform = `translate3d(${next.scrollX * next.zoom}px, ${next.scrollY * next.zoom}px, 0) scale(${next.zoom})`;
    if (sceneGroupRef.current) {
      sceneGroupRef.current.style.transform = transform;
      sceneGroupRef.current.style.visibility = "visible";
    }
    const actionsScene = actionsSceneRef.current;
    if (!actionsScene) return;
    actionsScene.style.transform = transform;
    actionsScene.style.setProperty(
      "--canvas-hit-scale",
      String(Math.max(1, 44 / (LAYOUT_METRICS.avatarDiameter * next.zoom)))
    );
    const actionScale = Math.min(1, Math.max(0.34, next.zoom));
    actionsScene.style.setProperty("--canvas-action-compensation", String(actionScale / next.zoom));
    if (navigating && !actionsScene.querySelector(":focus-visible")) {
      actionsScene.style.visibility = "hidden";
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
      navigationTimer.current = setTimeout(() => {
        navigationTimer.current = undefined;
        actionsScene.style.visibility = "visible";
      }, 80);
    } else {
      actionsScene.style.visibility = "visible";
    }
  };

  const scheduleViewportPersistence = (next: ViewportState) => {
    pendingPersistedViewport.current = next;
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    viewportTimer.current = setTimeout(() => {
      viewportTimer.current = undefined;
      if (pendingPersistedViewport.current) {
        viewportCallback.current(pendingPersistedViewport.current);
      }
      pendingPersistedViewport.current = undefined;
    }, 220);
  };

  const applyViewport = (next: ViewportState, navigating = true, persist = true) => {
    viewport.current = next;
    updateTransforms(next, navigating);
    if (persist) scheduleViewportPersistence(next);
  };

  const animateViewport = (target: ViewportState, duration: number) => {
    if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
    const start = viewport.current;
    const startedAt = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      applyViewport(interpolateViewport(start, target, eased));
      if (elapsed < 1) animationFrame.current = requestAnimationFrame(step);
      else animationFrame.current = undefined;
    };
    animationFrame.current = requestAnimationFrame(step);
  };

  const cancelViewportAnimation = () => {
    if (animationFrame.current === undefined) return;
    cancelAnimationFrame(animationFrame.current);
    animationFrame.current = undefined;
  };

  const hostSize = () => ({
    width: Math.max(1, hostRef.current?.clientWidth ?? 1),
    height: Math.max(1, hostRef.current?.clientHeight ?? 1)
  });

  const fitAll = (animate = true) => {
    if (!layout.people.length) return;
    const target = fitSceneRect(sceneRectFromPlan(connectionPlan.bounds), hostSize(), {
      viewportFactor: 0.82,
      minZoom: 0.08,
      maxZoom: 1.1
    });
    if (animate) animateViewport(target, 320);
    else applyViewport(target, false, false);
  };

  const personViewport = (personId: string) => {
    const person = layout.people.find((candidate) => candidate.id === personId);
    if (!person) return undefined;
    const nameExtraHeight = formatPersonName(person.displayName).extraHeight;
    const cityExtraHeight = person.city.trim() ? LAYOUT_METRICS.lifeHeight : 0;
    return fitSceneRect({
      x: person.x - LAYOUT_METRICS.labelWidth / 2,
      y: person.y - LAYOUT_METRICS.avatarRadius,
      width: LAYOUT_METRICS.labelWidth,
      height: LAYOUT_METRICS.nodeBottom + LAYOUT_METRICS.avatarRadius + nameExtraHeight +
        cityExtraHeight
    }, hostSize(), {
      viewportFactor: 0.32,
      minZoom: 0.25,
      maxZoom: 1.35
    });
  };

  const focusPerson = (personId: string) => {
    const target = personViewport(personId);
    if (!target) return;
    animateViewport(target, 280);
  };

  const viewportShowsTree = (next: ViewportState) => {
    const scene = sceneRectFromPlan(connectionPlan.bounds);
    const size = hostSize();
    const left = (scene.x + next.scrollX) * next.zoom;
    const top = (scene.y + next.scrollY) * next.zoom;
    const right = (scene.x + scene.width + next.scrollX) * next.zoom;
    const bottom = (scene.y + scene.height + next.scrollY) * next.zoom;
    return right >= 0 && left <= size.width && bottom >= 0 && top <= size.height;
  };

  const zoomBy = (change: number) => {
    cancelViewportAnimation();
    const size = hostSize();
    const nextZoom = Math.round((viewport.current.zoom + change) * 10) / 10;
    applyViewport(zoomViewportAt(viewport.current, {
      x: size.width / 2,
      y: size.height / 2
    }, nextZoom));
  };

  const togglePerson = (personId: string) => {
    if (personId === selectedPersonId) onDeselectPerson();
    else onSelectPerson(personId);
  };

  const exportPng = async (privacy: Parameters<TreeCanvasHandle["exportPng"]>[0]) => {
    downloadBlob(
      await chartSvgToPng(buildChartSvg(
        layout, treeTitle, selectedPersonId, language, connectionPlan, privacy
      )),
      safeFilename(treeTitle, "png")
    );
  };

  const exportSvg = async (privacy: Parameters<TreeCanvasHandle["exportSvg"]>[0]) => {
    const chart = buildChartSvg(
      layout, treeTitle, selectedPersonId, language, connectionPlan, privacy
    );
    downloadBlob(
      new Blob([chart.svg], { type: "image/svg+xml;charset=utf-8" }),
      safeFilename(treeTitle, "svg")
    );
  };

  useImperativeHandle(ref, () => ({
    fitAll: () => fitAll(),
    focusPerson,
    zoomIn: () => zoomBy(0.1),
    zoomOut: () => zoomBy(-0.1),
    exportPng,
    exportSvg
  }));

  useEffect(() => {
    viewportCallback.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initializeOrResize = () => {
      const mobile = window.innerWidth <= 840;
      const size = hostSize();
      if (!initialized.current) {
        if (isPreparing) {
          updateTransforms(viewport.current);
          return;
        }
        initialized.current = true;
        const focusId = layout.people.some(({ id }) => id === selectedPersonId)
          ? selectedPersonId! : layout.people[0]?.id;
        if (!mobile && initialViewport && viewportShowsTree(initialViewport)) {
          applyViewport(initialViewport, false, false);
        } else if (!mobile && layout.people.length) {
          const target = personViewport(focusId!);
          if (target) applyViewport(target, false, false);
        } else if (layout.people.length) {
          fitAll(false);
        } else {
          updateTransforms(viewport.current);
        }
        observedHostSize.current = size;
        wasMobile.current = mobile;
        return;
      }
      const previousSize = observedHostSize.current;
      observedHostSize.current = size;
      const sizeChanged = Boolean(previousSize &&
        (previousSize.width !== size.width || previousSize.height !== size.height));
      const breakpointChanged = mobile !== wasMobile.current;
      if (breakpointChanged || sizeChanged) {
        wasMobile.current = mobile;
        if (breakpointChanged) {
          fitAll(false);
        } else if (previousSize) {
          applyViewport({
            scrollX: viewport.current.scrollX +
              (size.width - previousSize.width) / (2 * viewport.current.zoom),
            scrollY: viewport.current.scrollY +
              (size.height - previousSize.height) / (2 * viewport.current.zoom),
            zoom: viewport.current.zoom
          }, false);
        }
      } else {
        updateTransforms(viewport.current);
      }
    };
    const observer = new ResizeObserver(initializeOrResize);
    observer.observe(host);
    initializeOrResize();
    return () => observer.disconnect();
  // The observer intentionally reads the latest imperative viewport methods.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionPlan.bounds, initialViewport, isPreparing, layout.people.length]);

  useEffect(() => {
    updateTransforms(viewport.current);
  }, [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = host.getBoundingClientRect();
      const zooming = event.ctrlKey || event.metaKey;
      const deltaX = !zooming && event.shiftKey && event.deltaX === 0
        ? event.deltaY
        : event.deltaX;
      const deltaY = !zooming && event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
      const pending = pendingWheel.current;
      if (pending && pending.zooming === zooming) {
        pending.deltaX += deltaX;
        pending.deltaY += deltaY;
        pending.pointerX = event.clientX - bounds.left;
        pending.pointerY = event.clientY - bounds.top;
      } else {
        pendingWheel.current = {
          deltaX,
          deltaY,
          pointerX: event.clientX - bounds.left,
          pointerY: event.clientY - bounds.top,
          zooming
        };
      }
      if (wheelFrame.current !== undefined) return;
      wheelFrame.current = requestAnimationFrame(() => {
        wheelFrame.current = undefined;
        const navigation = pendingWheel.current;
        pendingWheel.current = undefined;
        if (!navigation) return;
        cancelViewportAnimation();
        if (navigation.zooming) {
          applyViewport(zoomViewportAt(
            viewport.current,
            { x: navigation.pointerX, y: navigation.pointerY },
            viewport.current.zoom * Math.pow(2, -navigation.deltaY / 100)
          ));
        } else {
          applyViewport(panViewport(viewport.current, {
            x: -navigation.deltaX,
            y: -navigation.deltaY
          }));
        }
      });
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  });

  useEffect(() => {
    const releaseSpacePan = () => {
      spacePanActive.current = false;
      hostRef.current?.removeAttribute("data-space-pan");
    };
    const handleSpaceDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement || target instanceof HTMLButtonElement ||
          target instanceof HTMLAnchorElement ||
          (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      spacePanActive.current = true;
      hostRef.current?.setAttribute("data-space-pan", "true");
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
    };
  }, []);

  useEffect(() => () => {
    if (viewportTimer.current) clearTimeout(viewportTimer.current);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    if (wheelFrame.current !== undefined) cancelAnimationFrame(wheelFrame.current);
    if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
    const finalViewport = pendingPersistedViewport.current;
    pendingPersistedViewport.current = undefined;
    viewportTimer.current = undefined;
    if (finalViewport) viewportCallback.current(finalViewport);
  }, [treeId]);

  const localPoint = (point: Point) => {
    const bounds = hostRef.current?.getBoundingClientRect();
    return { x: point.x - (bounds?.left ?? 0), y: point.y - (bounds?.top ?? 0) };
  };

  const beginPinch = () => {
    const values = [...pointers.current.values()];
    if (values.length < 2) return;
    const center = midpoint(values[0], values[1]);
    pinch.current = {
      distance: Math.max(1, pointerDistance(values[0], values[1])),
      midpoint: localPoint(center),
      viewport: viewport.current
    };
    gestureMoved.current = true;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    cancelViewportAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointers.current.size >= 2) {
      beginPinch();
      return;
    }
    gestureMoved.current = false;
    drag.current = {
      button: event.button,
      canPan: event.pointerType === "touch" || event.button === 1 || spacePanActive.current,
      moved: false,
      personId: targetPersonId(event.target),
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewport.current
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const values = [...pointers.current.values()];
      const center = localPoint(midpoint(values[0], values[1]));
      const nextZoom = pinch.current.viewport.zoom *
        pointerDistance(values[0], values[1]) / pinch.current.distance;
      const zoomed = zoomViewportAt(pinch.current.viewport, pinch.current.midpoint, nextZoom);
      applyViewport(panViewport(zoomed, {
        x: center.x - pinch.current.midpoint.x,
        y: center.y - pinch.current.midpoint.y
      }));
      return;
    }
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - activeDrag.startClientX;
    const deltaY = event.clientY - activeDrag.startClientY;
    if (Math.hypot(deltaX, deltaY) > 3) {
      activeDrag.moved = true;
      gestureMoved.current = true;
    }
    if (activeDrag.canPan && activeDrag.moved) {
      applyViewport(panViewport(activeDrag.startViewport, { x: deltaX, y: deltaY }));
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pinch.current) {
      pinch.current = undefined;
      const remaining = [...pointers.current.entries()][0];
      drag.current = remaining ? {
        button: 0,
        canPan: true,
        moved: true,
        pointerId: remaining[0],
        startClientX: remaining[1].clientX,
        startClientY: remaining[1].clientY,
        startViewport: viewport.current
      } : undefined;
      return;
    }
    const activeDrag = drag.current;
    drag.current = undefined;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || activeDrag.button !== 0 ||
        activeDrag.moved || gestureMoved.current) return;
    if (activeDrag.personId) togglePerson(activeDrag.personId);
    else onDeselectPerson();
  };

  const handlePointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = undefined;
    drag.current = undefined;
    gestureMoved.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      aria-label={treeTitle}
      className="canvas-host svg-canvas-host"
      onPointerDownCapture={onCanvasInteract}
      ref={hostRef}
      role="region"
    >
      <svg
        aria-hidden="true"
        className="svg-tree-canvas"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        <g className="svg-tree-scene" ref={sceneGroupRef}>
          <SvgTreeScene
            connectionPlan={connectionPlan}
            language={language}
            layout={layout}
            lifeSummaryOptions={lifeSummaryOptions}
            selectedPersonId={selectedPersonId}
          />
        </g>
      </svg>
      <SvgCanvasActions
        actionsVisible={!readOnly && actionsVisible}
        controls={readOnly ? [] : connectionPlan.controls}
        emptyContent={emptyContent}
        language={language}
        onAddRelative={onAddRelative}
        onEditPerson={onEditPerson}
        onTogglePerson={togglePerson}
        people={layout.people}
        sceneRef={actionsSceneRef}
        selectedPersonId={selectedPersonId}
        t={t}
      />
      {isPreparing ? (
        <div aria-live="polite" className="canvas-preparing" role="status">
          <LoaderCircle aria-hidden="true" className="button-loader" size={20} />
          <span>{t("preparingTree")}</span>
        </div>
      ) : null}
    </div>
  );
});
