import { useMemo } from "react";
import { buildFamilyGroupIndex } from "./familyGroups";
import { type familyIndex } from "./familyExplorers";
import { explorerCopy } from "./explorerCopy";
import { ExplorerPerson, type ExplorerPersonProps } from "./ExplorerPerson";
import { formatDisplayDate } from "./i18n";
import type { FamilyRelationship } from "./types";
import { PartnerFacts } from "./PartnerFacts";

export function FamilyGroupsView({ index, anchor, relationships, onExplore, ...props }: {
  index: ReturnType<typeof familyIndex>; anchor: string; relationships: FamilyRelationship[]; onExplore: (id: string) => void;
} & Omit<ExplorerPersonProps, "person">) {
  const copy = explorerCopy(props.language);
  const groups = useMemo(() => buildFamilyGroupIndex([...index.byId.values()], relationships).groups.get(anchor) ?? [], [index, relationships, anchor]);
  const person = index.byId.get(anchor)!;
  const list = (ids: string[], facts?: Record<string, FamilyRelationship>) => ids.length ? <ul className="explorer-person-list">{ids.map((id) => <li key={id}>
    <ExplorerPerson {...props} person={index.byId.get(id)!} />
    {facts?.[id] ? <PartnerFacts relationship={facts[id]} language={props.language} t={props.t} /> : null}
    {props.selectedPersonId === id ? <button className="explorer-text-button" type="button" onClick={() => onExplore(id)}>{copy.explore}</button> : null}
  </li>)}</ul> : <p className="explorer-note">{copy.none}</p>;
  return <div className="family-groups-view">
    <div className="family-profile"><ExplorerPerson {...props} person={person} />{[person.city, person.province, person.country].filter(Boolean).join(", ")}</div>
    <div className="family-groups-columns">
      <section><h3>{copy.parents}</h3>{list(index.parents.get(anchor) ?? [])}</section>
      <section><h3>{copy.siblings}</h3>{list(index.siblings.get(anchor) ?? [])}<p className="explorer-note">{copy.siblingNote}</p></section>
    </div>
    <section><h3>{copy.partners}</h3>
      {groups.length ? groups.map((group) => <section className="family-household" key={group.id}>
        <h4>{props.t(group.relationship?.subtype === "formerPartner" || group.relationship?.subtype === "formerSpouse" ? "branchFormerPartner" : group.partners.length ? "branchWith" : "branchChildren")}</h4>
        {group.relationship?.marriageDate ? <p className="explorer-note">{props.t("marriageDate")} · {formatDisplayDate(group.relationship.marriageDate, props.language)}</p> : null}
        {group.relationship?.divorceDate ? <p className="explorer-note">{props.t("branchDivorced")} · {formatDisplayDate(group.relationship.divorceDate, props.language)}</p> : null}
        {group.partners.length ? list(group.partners, !group.relationship ? group.partnerRelationships : undefined) : null}
        <p className="family-children-label">{copy.children} · {group.children.length}</p>{list(group.children)}
      </section>) : <p className="explorer-note">{copy.none}</p>}
    </section>
  </div>;
}
