import { ArrowLeft, ArrowRight, ChevronUp, GitFork } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { directRelationshipLabel } from "./kinship";
import { PersonAvatar } from "./ui";
import type { Translator } from "./i18n";
import type { FamilyRelationship, Person, RelationshipLanguage } from "./types";

export function directCanvasConnections(people: readonly Person[], relationships: readonly FamilyRelationship[],
  selectedId: string, language: RelationshipLanguage) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const entries = new Map<string, { person: Person; labels: Set<string>; order: number }>();
  for (const edge of relationships) {
    const relativeId = edge.fromPersonId === selectedId ? edge.toPersonId : edge.toPersonId === selectedId ? edge.fromPersonId : undefined;
    const person = relativeId && byId.get(relativeId);
    if (!person || person.id === selectedId) continue;
    const order = edge.kind === "parent" ? (edge.fromPersonId === selectedId ? 2 : 0) : edge.kind === "partner" ? 1 : 3;
    const entry = entries.get(person.id) ?? { person, labels: new Set<string>(), order };
    const label = directRelationshipLabel(person, selectedId, [edge], language);
    if (label) entry.labels.add(label);
    entry.order = Math.min(entry.order, order); entries.set(person.id, entry);
  }
  return [...entries.values()].sort((a, b) => a.order - b.order || a.person.displayName.localeCompare(b.person.displayName, language.startsWith("en") ? "en" : "id") || a.person.id.localeCompare(b.person.id));
}

function ConnectionMenu({ person, entries, onNavigate, t }: {
  person: Person; entries: ReturnType<typeof directCanvasConnections>; onNavigate: (id: string) => void; t: Translator;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId(), titleId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className="canvas-connections-menu" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  }}>
    <button type="button" className="canvas-connections-trigger" ref={trigger} aria-expanded={open}
      aria-label={t("connectionsOf", { name: person.displayName })} aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(!open)}><GitFork size={16} aria-hidden="true" /><span>{t("canvasConnections")}</span>
      <ChevronUp size={14} aria-hidden="true" /></button>
    {open ? <section id={panelId} className="canvas-connections-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t("connectionsOf", { name: person.displayName })}</h2>
      <p>{t("connectionNavigationHint")}</p>
      {entries.length ? <ul>{entries.map(({ person: relative, labels }) => <li key={relative.id}>
        <button type="button" onClick={() => { setOpen(false); onNavigate(relative.id); }}
          aria-label={`${t("goToRelative", { name: relative.displayName })} · ${[...labels].join(" · ")}`}>
          <PersonAvatar person={relative} size={32} /><span><strong>{relative.displayName}</strong><small>{[...labels].join(" · ")}</small></span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </li>)}</ul> : <p>{t("noRecordedConnections")}</p>}
    </section> : null}
  </div>;
}

/** This is a selected-person route guide, not global people search. */
export function CanvasConnections({ people, relationships, selectedPersonId, language, onNavigate, t }: {
  people: Person[]; relationships: FamilyRelationship[]; selectedPersonId?: string;
  language: RelationshipLanguage; onNavigate: (id: string) => void; t: Translator;
}) {
  const [history, setHistory] = useState<{ at?: string; trail: string[] }>({ trail: [] });
  const root = useRef<HTMLElement>(null);
  const person = people.find((candidate) => candidate.id === selectedPersonId);
  const entries = useMemo(() => directCanvasConnections(people, relationships, selectedPersonId ?? "", language),
    [people, relationships, selectedPersonId, language]);
  const trail = history.at === selectedPersonId ? history.trail.filter((id) => people.some((candidate) => candidate.id === id)) : [];
  const previous = people.find((candidate) => candidate.id === trail.at(-1));
  const keyboardNavigation = useRef(false);
  useEffect(() => {
    if (keyboardNavigation.current) root.current?.querySelector<HTMLButtonElement>(".canvas-connections-trigger")?.focus({ preventScroll: true });
    keyboardNavigation.current = false;
  }, [selectedPersonId]);
  if (!person) return null;
  const navigate = (id: string, back = false) => {
    keyboardNavigation.current = Boolean(root.current?.contains(document.activeElement));
    setHistory({ at: id, trail: back ? trail.slice(0, -1) : [...trail, person.id].slice(-20) });
    onNavigate(id);
  };
  return <nav ref={root} className="canvas-connections" aria-label={t("canvasConnections")}>
    {previous ? <button type="button" className="canvas-connections-back" aria-label={t("backToRelative", { name: previous.displayName })}
      title={t("backToRelative", { name: previous.displayName })} onClick={() => navigate(previous.id, true)}><ArrowLeft size={16} aria-hidden="true" /></button> : null}
    <ConnectionMenu key={person.id} person={person} entries={entries} onNavigate={navigate} t={t} />
  </nav>;
}
