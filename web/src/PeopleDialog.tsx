import { ArrowRight, Search, UsersRound } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { deriveKinshipLabels } from "./kinship";
import type { Translator } from "./i18n";
import { personLifeSummary } from "./lifeSummary";
import type {
  AppData,
  FamilyRelationship,
  Person,
  RelationshipLanguage
} from "./types";
import { PersonAvatar, SidePanel } from "./ui";

interface PeopleDialogProps {
  people: Person[];
  relationships: FamilyRelationship[];
  selectedPersonId?: string;
  language: AppData["language"];
  relationshipLanguage?: RelationshipLanguage;
  t: Translator;
  onClose: () => void;
  onSelect: (personId: string) => void;
}

export function PeopleDialog({
  people,
  relationships,
  selectedPersonId,
  language,
  relationshipLanguage = "id",
  t,
  onClose,
  onSelect
}: PeopleDialogProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const labels = useMemo(
    () => selectedPersonId
      ? deriveKinshipLabels(
          selectedPersonId,
          people,
          relationships,
          relationshipLanguage
        )
      : {},
    [people, relationshipLanguage, relationships, selectedPersonId]
  );
  const filtered = [...people]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .filter((person) => {
      const role = labels[person.id] ?? t("unknownRelationship");
      return !deferredQuery || `${person.displayName} ${role}`.toLocaleLowerCase().includes(deferredQuery);
    });

  return (
    <SidePanel closeLabel={t("close")} onClose={onClose} title={t("allPeople")}>
      <label className="people-toolbar">
        <Search aria-hidden="true" size={18} />
        <span className="sr-only">{t("searchPeople")}</span>
        <input
          autoFocus
          className="search-field"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPeople")}
          type="search"
          value={query}
        />
      </label>
      {filtered.length ? (
        <div className="people-list">
          {filtered.map((person) => {
            const summary = personLifeSummary(person, language) ?? person.city;
            return (
              <button
                className="person-list-row"
                key={person.id}
                onClick={() => {
                  onSelect(person.id);
                  onClose();
                }}
                type="button"
              >
                <PersonAvatar person={person} />
                <span className="person-list-copy">
                  <strong>{person.displayName}</strong>
                  <span>{labels[person.id] ?? t("unknownRelationship")}{summary ? ` · ${summary}` : ""}</span>
                </span>
                <ArrowRight aria-hidden="true" color="var(--subtle)" size={17} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-dialog-state">
          <UsersRound aria-hidden="true" size={30} />
          <strong>{t("noPeopleFound")}</strong>
          <span>{t("emptySearch")}</span>
        </div>
      )}
    </SidePanel>
  );
}
