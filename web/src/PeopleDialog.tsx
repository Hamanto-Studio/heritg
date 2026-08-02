import { ArrowRight, Search, UsersRound } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { deriveKinshipLabels } from "./kinship";
import type { Translator } from "./i18n";
import type { AppData, FamilyRelationship, Person } from "./types";
import { Modal, PersonAvatar } from "./ui";

interface PeopleDialogProps {
  people: Person[];
  relationships: FamilyRelationship[];
  selectedPersonId?: string;
  language: AppData["language"];
  t: Translator;
  onClose: () => void;
  onSelect: (personId: string) => void;
}

const lifeSummary = (person: Person) => {
  const birth = person.birthDate?.slice(0, 4);
  const death = person.deathDate?.slice(0, 4);
  if (birth && death) return `${birth} - ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return person.city || undefined;
};

export function PeopleDialog({
  people,
  relationships,
  selectedPersonId,
  language,
  t,
  onClose,
  onSelect
}: PeopleDialogProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const labels = useMemo(
    () => selectedPersonId
      ? deriveKinshipLabels(selectedPersonId, people, relationships, language)
      : {},
    [language, people, relationships, selectedPersonId]
  );
  const filtered = [...people]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .filter((person) => {
      const role = labels[person.id] ?? t("unknownRelationship");
      return !deferredQuery || `${person.displayName} ${role}`.toLocaleLowerCase().includes(deferredQuery);
    });

  return (
    <Modal closeLabel={t("close")} onClose={onClose} size="medium" title={t("allPeople")}>
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
          {filtered.map((person) => (
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
              <span>
                <strong>{person.displayName}</strong>
                <span>{labels[person.id] ?? t("unknownRelationship")}{lifeSummary(person) ? ` · ${lifeSummary(person)}` : ""}</span>
              </span>
              <ArrowRight aria-hidden="true" color="var(--subtle)" size={17} />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-dialog-state">
          <UsersRound aria-hidden="true" size={30} />
          <strong>{t("noPeopleFound")}</strong>
          <span>{t("emptySearch")}</span>
        </div>
      )}
    </Modal>
  );
}
