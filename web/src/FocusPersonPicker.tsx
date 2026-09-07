import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Translator } from "./i18n";
import type { Person } from "./types";
import { PersonAvatar } from "./ui";

export function FocusPersonPicker({ people, personId, emptyLabel, label, onSelect, t }: {
  people: Person[];
  personId?: string;
  emptyLabel?: string;
  label?: string;
  onSelect: (personId: string) => void;
  t: Translator;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const current = people.find((person) => person.id === personId);
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return people.filter((person) => person.displayName.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [people, search]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <div className="focus-person-picker" ref={root}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
    <button className="focus-person-trigger" type="button" ref={trigger}
      title={current?.displayName}
      aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? dialogId : undefined}
      aria-label={`${label ?? t("focusOnPerson")}: ${current?.displayName ?? emptyLabel ?? ""}`}
      onClick={() => { setSearch(""); setOpen(!open); }}>
      {current ? <PersonAvatar person={current} size={36} /> : null}
      <span className="focus-person-copy"><span>{label ?? t("focusOnPerson")}</span><strong>{current?.displayName ?? emptyLabel}</strong></span>
      <ChevronsUpDown aria-hidden="true" size={16} />
    </button>
    {open ? <div className="focus-person-popover" id={dialogId} role="dialog" aria-label={label ?? t("focusOnPerson")}>
      <label className="focus-person-search">
        <Search aria-hidden="true" size={17} />
        <input ref={input} type="search" value={search} aria-label={t("searchPeople")} placeholder={t("searchPeople")}
          onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="focus-person-results">
        {matches.map((person) => <button key={person.id} type="button" className="focus-person-option"
          aria-pressed={person.id === personId} onClick={() => {
            onSelect(person.id); setOpen(false); trigger.current?.focus();
          }}>
          <PersonAvatar person={person} size={32} />
          <span>{person.displayName}</span>
          {person.id === personId ? <Check aria-hidden="true" size={16} /> : null}
        </button>)}
        {!matches.length ? <p role="status">{t("noPeopleFound")}</p> : null}
      </div>
    </div> : null}
  </div>;
}
