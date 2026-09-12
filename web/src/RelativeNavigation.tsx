import type { AppLanguage } from "./locale";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { PersonAvatar } from "./ui";
import { explorerCopy } from "./explorerCopy";
import type { Person } from "./types";

/** Direct, read-only generation hops. Choices contain recorded relatives only. */
export function RelativeNavigation({ person, parents, children, language, onNavigate }: {
  person: Person; parents: Person[]; children: Person[]; language: AppLanguage;
  onNavigate: (id: string) => void;
}) {
  const copy = explorerCopy(language);
  const [direction, setDirection] = useState<"parents" | "children">();
  const container = useRef<HTMLDivElement>(null);
  const parentsButton = useRef<HTMLButtonElement>(null), childrenButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const relatives = direction === "parents" ? parents : children;
  const label = (kind: "parents" | "children") =>
    (kind === "parents" ? copy.parentsOf : copy.childrenOf).replace("{name}", person.displayName);
  useEffect(() => {
    if (!direction) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setDirection(undefined);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [direction]);
  return <div className="relative-navigation" ref={container} onKeyDown={(event) => {
    if (event.key !== "Escape" || !direction) return;
    event.stopPropagation();
    (direction === "parents" ? parentsButton : childrenButton).current?.focus();
    setDirection(undefined);
  }}>
    <div className="relative-navigation-bar">
      <div className="relative-navigation-person" aria-live="polite" aria-atomic="true">
        <PersonAvatar person={person} size={32} />
        <span><small>{copy.relativesOf}</small><strong title={person.displayName}>{person.displayName}</strong></span>
      </div>
      <div className="relative-navigation-actions">
        <button ref={parentsButton} type="button" disabled={!parents.length} aria-expanded={direction === "parents"}
          aria-controls={direction === "parents" ? panelId : undefined} aria-label={label("parents")}
          title={!parents.length ? copy.noParents : label("parents")} onClick={() => setDirection(direction === "parents" ? undefined : "parents")}>
          <ArrowUp size={16} aria-hidden="true" /><span>{copy.parents}</span><span className="relative-count">{parents.length}</span>
        </button>
        <button ref={childrenButton} type="button" disabled={!children.length} aria-expanded={direction === "children"}
          aria-controls={direction === "children" ? panelId : undefined} aria-label={label("children")}
          title={!children.length ? copy.noChildren : label("children")} onClick={() => setDirection(direction === "children" ? undefined : "children")}>
          <ArrowDown size={16} aria-hidden="true" /><span>{copy.children}</span><span className="relative-count">{children.length}</span>
        </button>
      </div>
    </div>
    {direction ? <div id={panelId} className="relative-navigation-choices" role="region" aria-label={label(direction)}>
      <ul>{relatives.map((relative) => <li key={relative.id}>
        <button type="button" aria-label={copy.goToPerson.replace("{name}", relative.displayName)} onClick={() => {
          setDirection(undefined); onNavigate(relative.id);
        }}>
          <PersonAvatar person={relative} size={32} /><strong>{relative.displayName}</strong><ChevronRight size={16} aria-hidden="true" />
        </button>
      </li>)}</ul>
    </div> : null}
  </div>;
}
