import { ArrowLeft } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FanChart } from "./FanChart";
import { ancestorNodes, familyIndex, explorerLabels, explorerDescriptions, type ExplorerView } from "./familyExplorers";
import { explorerCopy } from "./explorerCopy";
import { ExplorerPerson, type ExplorerPersonProps } from "./ExplorerPerson";
import type { FamilyRelationship, Person } from "./types";
import "./family-explorers.css";

/** The Fan explores the same archive; navigation never changes relationships. */
export function FamilyExplorer({ mode, people, relationships, initialPersonId, onBackToTree, onInteract, ...props }: {
  mode: ExplorerView; people: Person[]; relationships: FamilyRelationship[]; initialPersonId?: string;
  onBackToTree: () => void; onInteract: () => void;
} & Omit<ExplorerPersonProps, "person">) {
  const index = useMemo(() => familyIndex(people, relationships), [people, relationships]);
  const [anchorId, setAnchorId] = useState(initialPersonId);
  const [observedSelection, setObservedSelection] = useState(props.selectedPersonId);
  const [history, setHistory] = useState<string[]>([]);
  const [generations, setGenerations] = useState(3);
  const [fanScale, setFanScale] = useState(1);
  const [navigationStep, setNavigationStep] = useState(0);
  const focusRequested = useRef(false);
  const scroller = useRef<HTMLElement>(null);
  const anchor = index.byId.has(anchorId ?? "") ? anchorId! : people[0]?.id;
  // Reconcile a selection from elsewhere before painting the chart. Local
  // navigation has already moved the anchor, so its acknowledgement adds no
  // history entry. Clearing selection never moves away from the current family.
  if (observedSelection !== props.selectedPersonId) {
    setObservedSelection(props.selectedPersonId);
    if (props.selectedPersonId && props.selectedPersonId !== anchor && index.byId.has(props.selectedPersonId)) {
      if (anchor) setHistory([...history, anchor]);
      setAnchorId(props.selectedPersonId);
    }
  }
  const current = index.byId.get(anchor ?? "");
  const copy = explorerCopy(props.language);
  const graph = useMemo(() => ancestorNodes(index, anchor ?? "", generations), [index, anchor, generations]);
  const positions = useMemo(() => new Map(graph.nodes.map((node) => [node.key, node])), [graph.nodes]);
  const children = (index.children.get(anchor ?? "") ?? []).map((id) => index.byId.get(id)!);
  const availableHistory = history.filter((id) => index.byId.has(id));
  const moveTo = (id: string, keyboard: boolean) => {
    focusRequested.current = keyboard;
    setAnchorId(id);
    if (props.selectedPersonId !== id) props.onSelect(id);
    setNavigationStep((step) => step + 1);
  };
  const explore = (id: string, keyboard: boolean) => {
    if (!index.byId.has(id) || id === anchor) return;
    if (anchor) setHistory((previous) => [...previous, anchor]);
    moveTo(id, keyboard);
  };
  useLayoutEffect(() => {
    if (!navigationStep || !focusRequested.current) return;
    scroller.current?.querySelector<SVGElement>('.fan-segment[aria-current="true"]')?.focus?.({ preventScroll: true });
  }, [navigationStep]);
  if (!current) return null;
  return <section className="family-explorer" ref={scroller} aria-label={props.t(explorerLabels[mode])} onPointerDown={onInteract}>
    <div className="family-explorer-content">
      <nav className="explorer-nav explorer-navigation" aria-label={props.t("familyView")}>
        <button className="button secondary" type="button" disabled={!availableHistory.length} onClick={(event) => {
          const previous = availableHistory.at(-1);
          if (!previous) return;
          setHistory(availableHistory.slice(0, -1)); moveTo(previous, event.detail === 0);
        }}><ArrowLeft size={16} aria-hidden="true" />{copy.back}</button>
        <button className="explorer-text-button" type="button" onClick={onBackToTree}>{copy.tree}</button>
      </nav>
      <header className="explorer-heading"><h2>{props.t(explorerLabels[mode])}</h2><p>{props.t(explorerDescriptions[mode])}</p></header>
      <div className="explorer-root-controls">
        <label>{copy.generations}<select value={generations} onChange={(event) => setGenerations(Number(event.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option value={n} key={n}>{n}</option>)}
        </select></label>
        <label>{copy.chartScale}<select value={fanScale} onChange={(event) => setFanScale(Number(event.target.value))}>
          <option value={1}>{copy.fitChart}</option><option value={1.5}>150%</option><option value={2}>200%</option>
        </select></label>
      </div>
      {graph.truncated ? <p role="status" className="explorer-note">{copy.chartLimit}</p> : null}
      <FanChart nodes={graph.nodes} current={current} children={children} index={index}
        language={props.language} scale={fanScale} onExplore={explore} context={(node) => {
          const child = positions.get(node.parentKey ?? "");
          const name = index.byId.get(child?.personId ?? "")?.displayName ?? copy.missingAncestor;
          return node.depth ? copy.generationContext.replace("{depth}", String(node.depth)).replace("{name}", name) : copy.startingPerson;
        }} />
      <div className="explorer-selection" aria-label={copy.currentPerson}><ExplorerPerson {...props} person={current} /></div>
      <p className="explorer-note">{copy.chartNavigationHint}</p>
      <p className="explorer-note">{copy.ancestorNote}</p>
    </div>
  </section>;
}
