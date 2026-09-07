import { useMemo, useState } from "react";
import { filterPeople } from "./familyExplorers";
import { explorerCopy } from "./explorerCopy";
import { ExplorerPerson, type ExplorerPersonProps } from "./ExplorerPerson";
import type { Person } from "./types";

export function PeopleView({ people, search, onSearch, ...props }: {
  people: Person[]; search: string; onSearch: (value: string) => void;
} & Omit<ExplorerPersonProps, "person">) {
  const [sort, setSort] = useState("name");
  const copy = explorerCopy(props.language);
  const visible = useMemo(() => filterPeople(people, search, sort), [people, search, sort]);
  return <>
    <div className="explorer-filters">
      <label>{copy.search}<input type="search" value={search} placeholder={copy.search} onChange={(e) => onSearch(e.target.value)} /></label>
      <label>{copy.sort}<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">{copy.name}</option><option value="oldest">{copy.oldest}</option><option value="youngest">{copy.youngest}</option></select></label>
    </div>
    <p className="explorer-note" role="status">{copy.showCount.replace("{shown}", String(visible.length)).replace("{total}", String(people.length))}</p>
    {visible.length ? <ul className="explorer-directory">{visible.map((person) => <li key={person.id}>
      <ExplorerPerson {...props} person={person} /><span className="directory-location">{[person.city, person.country].filter(Boolean).join(", ") || copy.noLocation}</span>
    </li>)}</ul> : <p className="explorer-empty">{copy.noResults}</p>}
  </>;
}
