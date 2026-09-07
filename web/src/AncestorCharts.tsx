import { useLayoutEffect, useMemo, useRef } from "react";
import { ancestorNodes, type AncestorNode, type familyIndex } from "./familyExplorers";
import { chartCard, familyPedigreeLayout } from "./explorerChartGeometry";
import { explorerCopy } from "./explorerCopy";
import { ExplorerPerson, type ExplorerPersonProps } from "./ExplorerPerson";
import { ChartPerson } from "./ChartPerson";
import { FanChart } from "./FanChart";

export function AncestorCharts({ mode, index, anchor, generations, fanScale, onExplore, ...personProps }: {
  mode: "fan" | "ancestors"; index: ReturnType<typeof familyIndex>; anchor: string; generations: number;
  fanScale: number; onExplore: (id: string) => void;
} & Omit<ExplorerPersonProps, "person">) {
  const copy = explorerCopy(personProps.language);
  const chartRef = useRef<HTMLDivElement>(null);
  const { nodes, truncated } = useMemo(() => ancestorNodes(index, anchor, generations), [index, anchor, generations]);
  const current = index.byId.get(anchor)!;
  const children = useMemo(() => (index.children.get(anchor) ?? []).map((id) => index.byId.get(id)!), [index, anchor]);
  const layout = useMemo(() => familyPedigreeLayout(nodes, children.map((person) => person.id)), [nodes, children]);
  const positions = new Map(nodes.map((node) => [node.key, node]));
  useLayoutEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const revealCurrentPerson = () => {
      element.scrollLeft = Math.max(0, layout.rootX + chartCard.width + chartCard.inset - element.clientWidth);
      element.scrollTop = Math.max(0, layout.rootY - element.clientHeight / 2);
    };
    revealCurrentPerson();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(revealCurrentPerson);
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor, generations, mode, layout.rootY, layout.rootX]);
  const context = (node: AncestorNode) => {
    const child = positions.get(node.parentKey ?? "");
    const name = child?.personId ? index.byId.get(child.personId)?.displayName : copy.missingAncestor;
    return node.depth ? copy.generationContext.replace("{depth}", String(node.depth)).replace("{name}", name ?? copy.missingAncestor) : copy.startingPerson;
  };
  const childContext = copy.childOf.replace("{name}", current.displayName);
  return <>
    {truncated ? <p role="status" className="explorer-note">{copy.chartLimit}</p> : null}
    {mode === "fan" ? <FanChart nodes={nodes} current={current} children={children} index={index}
      language={personProps.language} scale={fanScale} onExplore={onExplore} context={context} /> : <>
      <div ref={chartRef} className="explorer-chart-scroll ancestor-chart-scroll" tabIndex={0} role="region" aria-label={personProps.t("ancestorsView")}>
        <div className="explorer-pedigree" style={{ width: layout.width, height: layout.height }}>
          <span className="pedigree-column-label" style={{ left: chartCard.inset }}>{copy.children} · {children.length}</span>
          <span className="pedigree-column-label" style={{ left: layout.rootX }}>{copy.currentPerson}</span>
          <span className="pedigree-column-label" style={{ left: layout.x(1) }}>{copy.parents}</span>
          <svg width="100%" height="100%" aria-hidden="true" className="pedigree-lines">
            {nodes.filter((node) => node.parentKey).map((node) => {
              const child = positions.get(node.parentKey!)!;
              const x1 = layout.x(child.depth) + chartCard.width, y1 = layout.y.get(child.key)!;
              const x2 = layout.x(node.depth), y2 = layout.y.get(node.key)!;
              return <path key={node.key} d={"M" + x1 + " " + y1 + " H" + (x1 + 12) + " V" + y2 + " H" + x2} />;
            })}
            {layout.children.map((child) => <path key={child.id} data-child-connection={child.id}
              d={"M" + layout.rootX + " " + layout.rootY + " H" + (layout.rootX - 12) + " V" + child.y + " H" + (child.x + chartCard.width)} />)}
          </svg>
          {layout.children.map((child) => <div key={child.id} className="pedigree-person pedigree-child"
            style={{ left: child.x, top: child.y - chartCard.height / 2 }}>
            <ChartPerson person={index.byId.get(child.id)!} context={childContext} onExplore={onExplore} />
          </div>)}
          {!children.length ? <div className="pedigree-person pedigree-empty" style={{ left: chartCard.inset, top: layout.rootY - chartCard.height / 2 }}>{copy.noChildren}</div> : null}
          {nodes.map((node) => {
            const person = node.personId ? index.byId.get(node.personId) : undefined;
            return <div key={node.key} className="pedigree-person" style={{ left: layout.x(node.depth), top: layout.y.get(node.key)! - chartCard.height / 2 }}>
              {person ? <ChartPerson person={person} current={!node.depth} context={context(node) + (node.repeat ? " · " + copy.repeatedAncestor : "")} onExplore={onExplore} />
                : <span className="pedigree-unknown" aria-label={copy.missingAncestor + " · " + context(node)}>{copy.missingAncestor}</span>}
            </div>;
          })}
        </div>
      </div>
    </>}
    <div className="explorer-selection" aria-label={copy.currentPerson}>
      <ExplorerPerson {...personProps} person={current} />
    </div>
    <p className="explorer-note">{copy.chartNavigationHint}</p>
    <p className="explorer-note">{copy.ancestorNote}</p>
  </>;
}
