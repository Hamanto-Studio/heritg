import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";

import type { AppData, Person } from "./types";
import type { Translator } from "./i18n";
import { personLifeSummary } from "./lifeSummary";
import { PersonAvatar } from "./ui";

export function PersonPicker({
  people,
  selectedId,
  onSelect,
  label,
  language,
  t,
  noneLabel
}: {
  people: Person[];
  selectedId: string;
  onSelect: (personId: string) => void;
  label: string;
  language: AppData["language"];
  t: Translator;
  noneLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const filtered = people.filter((person) =>
    !deferredQuery || `${person.displayName} ${person.city}`.toLocaleLowerCase().includes(deferredQuery)
  );

  return (
    <fieldset className="person-picker">
      <legend>{label}</legend>
      {people.length > 6 ? (
        <label className="person-picker-search">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">{t("searchPeople")}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPeople")}
            type="search"
            value={query}
          />
        </label>
      ) : null}
      <div className="person-picker-list">
        {noneLabel ? (
          <label className={`person-picker-row none ${selectedId === "" ? "selected" : ""}`}>
            <input checked={selectedId === ""} name={label} onChange={() => onSelect("")} type="radio" />
            <span><strong>{noneLabel}</strong></span>
          </label>
        ) : null}
        {filtered.map((person) => {
          const summary = personLifeSummary(person, language) ?? person.city;
          return (
            <label className={`person-picker-row ${selectedId === person.id ? "selected" : ""}`} key={person.id}>
              <input checked={selectedId === person.id} name={label} onChange={() => onSelect(person.id)} type="radio" />
              <PersonAvatar person={person} />
              <span>
                <strong>{person.displayName}</strong>
                <small>{summary || t(person.gender)}</small>
              </span>
            </label>
          );
        })}
        {!filtered.length ? <p className="person-picker-empty">{t("noPeopleFound")}</p> : null}
      </div>
    </fieldset>
  );
}
