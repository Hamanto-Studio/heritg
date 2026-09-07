import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AncestorNode, familyIndex } from "./familyExplorers";
import { fanChildFontSize, fanChildLayout, fanLabelLayout, fanSectorPath } from "./explorerChartGeometry";
import { estimateName, fitFanName, type MeasureName } from "./fanNameLayout";
import { animateFanFocus } from "./familyMotion";
import { personAvatarAppearance } from "./personAvatarAppearance";
import { explorerCopy } from "./explorerCopy";
import type { Person } from "./types";

function FanSegment({ person, label, context, clipId, path, position, center, child = false, fontSize = 12, measure, onExplore }: {
  person?: Person; label: string; context: string; clipId: string; path?: string;
  position: ReturnType<typeof fanLabelLayout>; center: { x: number; y: number };
  child?: boolean; fontSize?: number; measure: MeasureName; onExplore: (id: string, element: SVGGElement, focusRequested: boolean) => void;
}) {
  const color = person ? personAvatarAppearance(person.gender) : undefined;
  const accessibleLabel = `${label} · ${context}`;
  const fitted = useMemo(() => fitFanName(label, { width: position.width, height: position.height }, fontSize, measure), [label, position.width, position.height, fontSize, measure]);
  return <g role={person ? "button" : undefined} tabIndex={person ? 0 : undefined}
    data-chart-person={person?.id} aria-label={accessibleLabel} aria-current={person && !path ? "true" : undefined}
    onClick={person ? (event) => onExplore(person.id, event.currentTarget, event.detail === 0) : undefined}
    onKeyDown={person ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onExplore(person.id, event.currentTarget, true); } } : undefined}
    className={`fan-segment${person ? " is-known" : ""}${child ? " fan-child-segment" : ""}`}>
    <title>{accessibleLabel}</title>
    <defs><clipPath id={clipId}>{path ? <path d={path} /> : <circle cx={center.x} cy={center.y} r={48} />}</clipPath></defs>
    {path ? <path className="fan-shape" d={path} fill={color?.fill ?? "var(--base)"} />
      : <circle className="fan-shape" cx={center.x} cy={center.y} r={52} fill={color?.fill ?? "var(--base)"} />}
    <g clipPath={`url(#${clipId})`}>
      <text style={{ fontSize: fitted.fontSize }} transform={`translate(${position.x} ${position.y}) rotate(${position.rotation})`} textAnchor="middle" dominantBaseline="middle">
        {fitted.lines.map((line, i) => <tspan key={i} x={0} y={(i - (fitted.lines.length - 1) / 2) * fitted.lineHeight}>{line}</tspan>)}
      </text>
    </g>
  </g>;
}

export function FanChart({ nodes, current, children, index, language, scale, context, onExplore }: {
  nodes: AncestorNode[]; current: Person; children: Person[]; index: ReturnType<typeof familyIndex>;
  language: "en" | "id"; scale: number; context: (node: AncestorNode) => string; onExplore: (id: string, focusRequested: boolean) => void;
}) {
  const copy = explorerCopy(language), clipPrefix = useId().replace(/:/g, "");
  const chart = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [renderScale, setRenderScale] = useState(1);
  const [measureName, setMeasureName] = useState<MeasureName>(() => estimateName);
  const transitionStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const previousPerson = useRef(current.id);
  const previousCenter = useRef<{ x: number; y: number } | undefined>(undefined);
  const stopMotion = useRef<(() => void) | undefined>(undefined);
  // Back returns to the same child page, while a newly explored person starts at page one.
  const [childPages, setChildPages] = useState<Record<string, number>>({});
  const depth = Math.max(1, ...nodes.map((node) => node.depth));
  const radius = 72 + depth * 78, width = Math.max(radius, 190) * 2 + 48, cx = width / 2, cy = radius + 24;
  const childFontSize = fanChildFontSize(renderScale);
  const childLayout = fanChildLayout(children.map((child) => child.id), childPages[current.id] ?? 0, cx, cy, radius);
  const height = cy + (children.length ? childLayout.outer : 52) + 24;
  const childRange = copy.childRange.replace("{start}", String(childLayout.offset + 1))
    .replace("{end}", String(childLayout.offset + childLayout.children.length)).replace("{total}", String(children.length));
  const changePage = (page: number) => setChildPages((pages) => ({ ...pages, [current.id]: page }));
  const explore = (id: string, element: SVGGElement, focusRequested: boolean) => {
    if (id === current.id) return;
    const box = (element.querySelector("text") ?? element).getBoundingClientRect();
    transitionStart.current = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    stopMotion.current?.();
    onExplore(id, focusRequested);
  };
  useLayoutEffect(() => {
    let active = true;
    const readFont = () => {
      if (!active || !svg.current || typeof CanvasRenderingContext2D === "undefined") return;
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      context.font = `500 100px ${getComputedStyle(svg.current).fontFamily}`;
      const cache = new Map<string, number>();
      setMeasureName(() => (text: string) => {
        if (!cache.has(text)) cache.set(text, context.measureText(text).width / 100);
        return cache.get(text)!;
      });
    };
    readFont();
    void document.fonts?.ready.then(readFont);
    return () => { active = false; };
  }, []);
  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const next = Math.min(bounds.width / width, bounds.height / height);
      if (next > 0) setRenderScale((previous) => Math.abs(previous - next) < 0.001 ? previous : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height, scale]);
  useLayoutEffect(() => {
    const element = chart.current;
    if (!element) return;
    const center = () => { element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2); };
    center();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(center);
    observer.observe(element);
    return () => observer.disconnect();
  }, [current.id, scale]);
  useLayoutEffect(() => {
    const element = svg.current;
    const root = element?.querySelector('.fan-segment[aria-current="true"] .fan-shape');
    if (!element || !root) return;
    const box = root.getBoundingClientRect();
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    if (previousPerson.current !== current.id) {
      const from = transitionStart.current ?? previousCenter.current ?? center;
      stopMotion.current?.();
      stopMotion.current = animateFanFocus(element, { x: from.x - center.x, y: from.y - center.y }, `${cx / width * 100}% ${cy / height * 100}%`);
    }
    previousPerson.current = current.id;
    previousCenter.current = center;
    transitionStart.current = undefined;
    return () => stopMotion.current?.();
  }, [current.id, cx, cy, width, height]);
  return <div className="fan-family-chart">
    <div ref={chart} className="explorer-chart-scroll" tabIndex={0} role="region" aria-label={copy.fanFamilyChart}>
      <div className="fan-chart-content" style={{ width: `${scale * 100}%` }}>
        <svg ref={svg} className="explorer-fan" style={{ maxHeight: scale === 1 ? "clamp(300px, calc(100dvh - 520px), 560px)" : undefined }}
          viewBox={`0 0 ${width} ${height}`} role="group" aria-label={copy.fanFamilyChart}>
          <g role="group" aria-label={copy.fanAncestors}>
            {nodes.map((node) => {
              const person = node.personId ? index.byId.get(node.personId) : undefined;
              return <FanSegment key={node.key} person={person} label={person?.displayName ?? copy.missingAncestor}
                context={context(node) + (node.repeat ? ` · ${copy.repeatedAncestor}` : "")}
                clipId={`${clipPrefix}-ancestor-${node.key}`} center={{ x: cx, y: cy }}
                path={node.depth ? fanSectorPath(cx, cy, 72 + (node.depth - 1) * 78, 72 + node.depth * 78, node.start, node.end) : undefined}
                fontSize={Math.max(node.depth ? 12 : 16, 12 / Math.max(0.01, renderScale))}
                measure={measureName} position={fanLabelLayout(node, cx, cy)} onExplore={explore} />;
            })}
          </g>
          <g role="group" aria-label={copy.childrenOf.replace("{name}", current.displayName)}>
            {childLayout.children.map((child, i) => <FanSegment key={child.id} person={index.byId.get(child.id)!}
              label={index.byId.get(child.id)!.displayName} context={copy.childOf.replace("{name}", current.displayName)}
              clipId={`${clipPrefix}-child-${i}`} center={{ x: cx, y: cy }} child fontSize={childFontSize}
              measure={measureName} path={child.path} position={child.label} onExplore={explore} />)}
          </g>
        </svg>
      </div>
    </div>
    <div className="fan-children-navigation">
      {childLayout.pageCount > 1 ? <button type="button" aria-label={copy.previousChildren}
        disabled={!childLayout.page} onClick={() => changePage(childLayout.page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button> : null}
      <p role="status" aria-live="polite">{children.length ? childRange : copy.noChildren}</p>
      {childLayout.pageCount > 1 ? <button type="button" aria-label={copy.nextChildren}
        disabled={childLayout.page === childLayout.pageCount - 1} onClick={() => changePage(childLayout.page + 1)}><ChevronRight size={18} aria-hidden="true" /></button> : null}
    </div>
  </div>;
}
