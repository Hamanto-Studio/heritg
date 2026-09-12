import type { AppLanguage } from "./locale";
import { Pencil, Plus } from "lucide-react";
import { PersonAvatar } from "./ui";
import { personLifeSummary } from "./lifeSummary";
import type { Person } from "./types";
import type { Translator } from "./i18n";

export interface ExplorerPersonProps {
  person: Person; selectedPersonId?: string; onSelect: (id: string) => void;
  onEdit: (id: string) => void; onAdd: (id: string) => void; actionsVisible: boolean; language: AppLanguage; t: Translator;
  context?: string;
}
export function ExplorerPerson({ person, selectedPersonId, onSelect, onEdit, onAdd, actionsVisible, language, t, context }: ExplorerPersonProps) {
  const selected = selectedPersonId === person.id;
  return <div className="explorer-person-row" data-explorer-person={person.id}>
    <button className="explorer-person" type="button" aria-label={`${person.displayName}${context ? ` · ${context}` : ""}`} aria-pressed={selected} onClick={() => onSelect(person.id)}>
      <PersonAvatar person={person} size={40} />
      <span><strong title={person.displayName}>{person.displayName}</strong><small>{personLifeSummary(person, language)}</small></span>
    </button>
    {selected && actionsVisible ? <div className="explorer-person-actions">
      <button type="button" aria-label={t("addRelativeTo", { name: person.displayName })} onClick={() => onAdd(person.id)}><Plus size={17} /></button>
      <button type="button" aria-label={t("editPerson", { name: person.displayName })} onClick={() => onEdit(person.id)}><Pencil size={17} /></button>
    </div> : null}
  </div>;
}
