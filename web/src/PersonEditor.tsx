import { ImagePlus, Link2, Pencil, RotateCcw, Trash2, Unlink } from "lucide-react";
import { useState } from "react";

import { DatePickerField, formatIsoDate } from "./DatePickerField";
import { formatDisplayDate, type Translator } from "./i18n";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { RelationshipDialog } from "./RelationshipDialog";
import { roleForRelationship } from "./relationshipRoles";
import type { AppActions, RelationshipDraftInput } from "./store";
import type { AppData, FamilyRelationship, Gender, Person } from "./types";
import { ConfirmDialog, ErrorNotice, Modal, PersonAvatar } from "./ui";

interface PersonEditorProps {
  treeId: string;
  person?: Person;
  people: Person[];
  relationships: FamilyRelationship[];
  language: AppData["language"];
  actions: AppActions;
  t: Translator;
  onClose: () => void;
  onSaved: (personId: string) => void;
}

interface ConnectedRelationship {
  relationship: FamilyRelationship;
  relative: Person;
}

type OpenRelationshipDialog =
  | { kind: "link" }
  | { kind: "edit"; relationship: FamilyRelationship; relative: Person };

const connectedRelationships = (
  personId: string,
  people: readonly Person[],
  relationships: readonly FamilyRelationship[]
): ConnectedRelationship[] => relationships.flatMap((relationship) => {
  const relativeId = relationship.fromPersonId === personId
    ? relationship.toPersonId
    : relationship.toPersonId === personId
      ? relationship.fromPersonId
      : undefined;
  const relative = people.find((candidate) => candidate.id === relativeId);
  return relative ? [{ relationship, relative }] : [];
});

export function PersonEditor({
  treeId,
  person,
  people,
  relationships,
  language,
  actions,
  t,
  onClose,
  onSaved
}: PersonEditorProps) {
  const [name, setName] = useState(person?.displayName ?? "");
  const [gender, setGender] = useState<Gender>(person?.gender ?? "unspecified");
  const [birthDate, setBirthDate] = useState(person?.birthDate ?? "");
  const [deathDate, setDeathDate] = useState(person?.deathDate ?? "");
  const [city, setCity] = useState(person?.city ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState(person?.photoDataUrl);
  const [photoToCrop, setPhotoToCrop] = useState<File>();
  const [error, setError] = useState<string>();
  const processingPhoto = Boolean(photoToCrop);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [openRelationshipDialog, setOpenRelationshipDialog] = useState<OpenRelationshipDialog>();
  const [removedRelationshipIds, setRemovedRelationshipIds] = useState<Set<string>>(() => new Set());
  const [relationshipEdits, setRelationshipEdits] = useState<Record<string, RelationshipDraftInput>>({});
  const [pendingLinks, setPendingLinks] = useState<RelationshipDraftInput[]>([]);

  const relatives = person
    ? connectedRelationships(person.id, people, relationships)
    : [];
  const blockedPersonIds = new Set([
    ...relatives.map(({ relative }) => relative.id),
    ...pendingLinks.map((draft) => draft.relativePersonId)
  ]);
  const linkablePeople = person
    ? people
      .filter((candidate) =>
        candidate.treeId === person.treeId &&
        candidate.id !== person.id &&
        !blockedPersonIds.has(candidate.id)
      )
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
    : [];

  const profileDirty = person
    ? name !== person.displayName ||
      gender !== person.gender ||
      birthDate !== (person.birthDate ?? "") ||
      deathDate !== (person.deathDate ?? "") ||
      city !== person.city ||
      notes !== person.notes ||
      photoDataUrl !== person.photoDataUrl
    : Boolean(
      name || birthDate || deathDate || city || notes || photoDataUrl || gender !== "unspecified"
    );
  const relationshipsDirty = Boolean(
    removedRelationshipIds.size || Object.keys(relationshipEdits).length || pendingLinks.length
  );
  const dirty = profileDirty || relationshipsDirty;
  const nestedDialogOpen = Boolean(
    openRelationshipDialog || confirmingDelete || confirmingDiscard || photoToCrop
  );

  const personChanges = {
    displayName: name,
    gender,
    birthDate: birthDate || undefined,
    deathDate: deathDate || undefined,
    birthDatePrecision: person?.birthDatePrecision ?? "exact" as const,
    city,
    notes,
    addressLine: person?.addressLine,
    province: person?.province,
    country: person?.country,
    postalCode: person?.postalCode,
    photoDataUrl
  };

  const save = () => {
    setError(undefined);
    try {
      if (person) {
        const editedRelationshipIds = Object.keys(relationshipEdits);
        const removals = [...new Set([
          ...removedRelationshipIds,
          ...editedRelationshipIds
        ])];
        const additions = [
          ...editedRelationshipIds.map((id) => relationshipEdits[id]),
          ...pendingLinks
        ];
        actions.savePerson(person.id, personChanges, removals, additions);
        onSaved(person.id);
      } else {
        const id = actions.createPerson(treeId, personChanges);
        actions.selectPerson(id);
        onSaved(id);
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("errorTitle"));
    }
  };

  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  };

  const readPhoto = (file: File) => {
    setError(undefined);
    setPhotoToCrop(file);
  };

  const removeRelationship = (relationshipId: string) => {
    setRemovedRelationshipIds((current) => new Set(current).add(relationshipId));
    setRelationshipEdits((current) => {
      const next = { ...current };
      delete next[relationshipId];
      return next;
    });
  };

  const restoreRelationship = (relationshipId: string) => {
    setRemovedRelationshipIds((current) => {
      const next = new Set(current);
      next.delete(relationshipId);
      return next;
    });
  };

  const stageRelationshipEdit = (
    relationship: FamilyRelationship,
    relative: Person,
    draft: RelationshipDraftInput
  ) => {
    const originalRole = roleForRelationship(relationship, person!.id, relative);
    const unchanged = draft.role === originalRole &&
      (draft.marriageDate ?? "") === (relationship.marriageDate ?? "") &&
      (draft.divorceDate ?? "") === (relationship.divorceDate ?? "");
    setRelationshipEdits((current) => {
      const next = { ...current };
      if (unchanged) delete next[relationship.id];
      else next[relationship.id] = draft;
      return next;
    });
  };

  return (
    <>
      <Modal
        closeLabel={t("close")}
        inactive={nestedDialogOpen}
        onClose={() => {
          if (!nestedDialogOpen) requestClose();
        }}
        size={person ? "large" : "medium"}
        title={person ? t("editPerson", { name: person.displayName }) : t("startFamilyTree")}
        footer={
          <>
            <button className="button secondary" onClick={requestClose} type="button">{t("cancel")}</button>
            <button
              className="button primary"
              disabled={processingPhoto || (person ? !dirty : !name.trim())}
              form="person-editor-form"
              type="submit"
            >
              {person ? t("save") : t("addPerson")}
            </button>
          </>
        }
      >
        <form
          className={`form-stack ${person ? "" : "person-create-form"}`}
          id="person-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="photo-editor">
            {person ? (
              <PersonAvatar person={{ ...person, displayName: name || person.displayName, photoDataUrl }} size={76} />
            ) : (
              <span className="person-avatar" style={{ width: 104, height: 104 }} aria-hidden="true">
                {photoDataUrl ? <img alt="" src={photoDataUrl} /> : (name.trim().charAt(0).toUpperCase() || "?")}
              </span>
            )}
            <div className="photo-actions">
              <label className="button secondary file-button">
                <ImagePlus aria-hidden="true" size={17} />
                {processingPhoto ? t("processingPhoto") : t("choosePhoto")}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={processingPhoto}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) readPhoto(file);
                  }}
                  type="file"
                />
              </label>
              {photoDataUrl ? (
                <button className="text-button danger-text" onClick={() => setPhotoDataUrl(undefined)} type="button">
                  {t("removePhoto")}
                </button>
              ) : null}
            </div>
          </div>

          {person ? (
            <section className="form-section">
              <h3>{t("personDetails")}</h3>
              <div className="field-grid">
              <label className="field full">
                {t("name")}
                <input autoFocus autoComplete="name" maxLength={240} onChange={(event) => setName(event.target.value)} required value={name} />
              </label>
              <label className="field">
                {t("gender")}
                <select onChange={(event) => setGender(event.target.value as Gender)} value={gender}>
                  <option value="unspecified">{t("unspecified")}</option>
                  <option value="female">{t("female")}</option>
                  <option value="male">{t("male")}</option>
                </select>
              </label>
              <label className="field">
                {t("city")}
                <input maxLength={240} onChange={(event) => setCity(event.target.value)} value={city} />
              </label>
              <DatePickerField
                defaultMonth={new Date(new Date().getFullYear() - 30, 0, 1)}
                label={t("birthDate")}
                language={language}
                max={formatIsoDate(new Date())}
                onChange={setBirthDate}
                t={t}
                value={birthDate}
              />
              <DatePickerField
                label={t("deathDate")}
                language={language}
                max={formatIsoDate(new Date())}
                min={birthDate || undefined}
                onChange={setDeathDate}
                t={t}
                value={deathDate}
              />
              </div>
            </section>
          ) : (
            <>
              <section className="form-section person-name-section">
                <label className="field">
                  {t("name")}
                  <input autoFocus autoComplete="name" maxLength={240} onChange={(event) => setName(event.target.value)} required value={name} />
                </label>
              </section>
              <details className="person-detail-disclosure">
                <summary>{t("optionalDetails")}</summary>
                <div className="field-grid">
                  <DatePickerField
                    defaultMonth={new Date(new Date().getFullYear() - 30, 0, 1)}
                    label={t("birthDate")}
                    language={language}
                    max={formatIsoDate(new Date())}
                    onChange={setBirthDate}
                    t={t}
                    value={birthDate}
                  />
                  <DatePickerField
                    label={t("deathDate")}
                    language={language}
                    max={formatIsoDate(new Date())}
                    min={birthDate || undefined}
                    onChange={setDeathDate}
                    t={t}
                    value={deathDate}
                  />
                  <label className="field full">
                    {t("city")}
                    <input maxLength={240} onChange={(event) => setCity(event.target.value)} value={city} />
                  </label>
                </div>
              </details>
            </>
          )}

          {person ? (
            <section className="form-section">
              <h3>{t("notes")}</h3>
              <label className="field">
                <span className="sr-only">{t("notes")}</span>
                <textarea maxLength={20_000} onChange={(event) => setNotes(event.target.value)} value={notes} />
              </label>
            </section>
          ) : null}

          {person ? (
            <section className="form-section relationship-editor-section">
              <div className="relationship-section-heading">
                <div><h3>{t("family")}</h3><p>{t("familyChangesStaged")}</p></div>
                <button
                  className="button secondary"
                  disabled={!linkablePeople.length}
                  onClick={() => setOpenRelationshipDialog({ kind: "link" })}
                  type="button"
                >
                  <Link2 aria-hidden="true" size={16} /> {t("linkFamilyMember")}
                </button>
              </div>
              <div className="relationship-list">
                {relatives.map(({ relationship, relative }) => {
                  const draft = relationshipEdits[relationship.id];
                  const removed = removedRelationshipIds.has(relationship.id);
                  const role = draft?.role ?? roleForRelationship(relationship, person.id, relative);
                  const date = draft ? draft.marriageDate : relationship.marriageDate;
                  const divorceDate = draft ? draft.divorceDate : relationship.divorceDate;
                  return (
                    <div className={`relationship-row ${removed ? "pending-removal" : ""}`} key={relationship.id}>
                      <PersonAvatar person={relative} />
                      <div>
                        <strong>{relative.displayName}</strong>
                        <span>{t(role)}</span>
                        {date ? <span>{t("marriedOn", { date: formatDisplayDate(date, language) })}</span> : null}
                        {divorceDate ? <span>{t("divorcedOn", { date: formatDisplayDate(divorceDate, language) })}</span> : null}
                        {removed ? <em className="relationship-status removal">{t("pendingRemoval")}</em> : null}
                        {!removed && draft ? <em className="relationship-status">{t("pendingChange")}</em> : null}
                      </div>
                      <div className="relationship-row-actions">
                        {removed ? (
                          <button className="icon-button quiet small" onClick={() => restoreRelationship(relationship.id)} type="button">
                            <RotateCcw aria-hidden="true" size={17} /><span className="sr-only">{t("undoRemove")}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              aria-label={t("editRelationshipWith", { name: relative.displayName })}
                              className="icon-button quiet small"
                              onClick={() => setOpenRelationshipDialog({ kind: "edit", relationship, relative })}
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={17} />
                            </button>
                            <button
                              aria-label={t("removeRelationshipWith", { name: relative.displayName })}
                              className="icon-button quiet small danger-text"
                              onClick={() => removeRelationship(relationship.id)}
                              type="button"
                            >
                              <Unlink aria-hidden="true" size={17} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {pendingLinks.map((draft) => {
                  const relative = people.find((candidate) => candidate.id === draft.relativePersonId);
                  return relative ? (
                    <div className="relationship-row pending-link" key={`pending-${draft.relativePersonId}`}>
                      <PersonAvatar person={relative} />
                      <div>
                        <strong>{relative.displayName}</strong>
                        <span>{t(draft.role)}</span>
                        {draft.marriageDate ? <span>{t("marriedOn", { date: formatDisplayDate(draft.marriageDate, language) })}</span> : null}
                        {draft.divorceDate ? <span>{t("divorcedOn", { date: formatDisplayDate(draft.divorceDate, language) })}</span> : null}
                        <em className="relationship-status">{t("pendingLink")}</em>
                      </div>
                      <button
                        aria-label={t("removePendingRelationship", { name: relative.displayName })}
                        className="icon-button quiet small danger-text"
                        onClick={() => setPendingLinks((current) => current.filter((item) => item.relativePersonId !== draft.relativePersonId))}
                        type="button"
                      >
                        <Unlink aria-hidden="true" size={17} />
                      </button>
                    </div>
                  ) : null;
                })}
                {!relatives.length && !pendingLinks.length ? <p className="empty-inline">{t("noFamilyLinks")}</p> : null}
              </div>
              {!linkablePeople.length ? <p className="relationship-unavailable">{t("noPeopleAvailableToLink")}</p> : null}
            </section>
          ) : null}

          <ErrorNotice message={error} />

          {person ? (
            <div className="danger-zone">
              <div><strong>{t("removePerson")}</strong><p>{t("removePersonWarning")}</p></div>
              <button className="button danger" onClick={() => setConfirmingDelete(true)} type="button">
                <Trash2 aria-hidden="true" size={17} /> {t("removePerson")}
              </button>
            </div>
          ) : null}
        </form>
      </Modal>

      {person && openRelationshipDialog ? (
        <RelationshipDialog
          initialDraft={openRelationshipDialog.kind === "edit"
            ? relationshipEdits[openRelationshipDialog.relationship.id]
            : undefined}
          key={openRelationshipDialog.kind === "edit"
            ? openRelationshipDialog.relationship.id
            : "new-relationship"}
          onClose={() => setOpenRelationshipDialog(undefined)}
          onSave={(draft) => {
            if (openRelationshipDialog.kind === "edit") {
              stageRelationshipEdit(
                openRelationshipDialog.relationship,
                openRelationshipDialog.relative,
                draft
              );
            } else if (!blockedPersonIds.has(draft.relativePersonId)) {
              setPendingLinks((current) => [...current, draft]);
            }
          }}
          people={openRelationshipDialog.kind === "link" ? linkablePeople : []}
          language={language}
          relationship={openRelationshipDialog.kind === "edit" ? openRelationshipDialog.relationship : undefined}
          relative={openRelationshipDialog.kind === "edit" ? openRelationshipDialog.relative : undefined}
          t={t}
          target={person}
        />
      ) : null}

      {confirmingDiscard ? (
        <ConfirmDialog
          confirmLabel={t("discardChanges")}
          message={t("discardChangesMessage")}
          onClose={() => setConfirmingDiscard(false)}
          onConfirm={() => {
            setConfirmingDiscard(false);
            onClose();
          }}
          t={t}
          title={t("discardChangesQuestion")}
        />
      ) : null}

      {person && confirmingDelete ? (
        <ConfirmDialog
          confirmLabel={t("removePerson")}
          message={t("removePersonWarning")}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => {
            try {
              actions.deletePerson(person.id);
              setConfirmingDelete(false);
              onClose();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : t("errorTitle"));
              setConfirmingDelete(false);
            }
          }}
          t={t}
          title={t("removePersonQuestion", { name: person.displayName })}
        />
      ) : null}

      {photoToCrop ? (
        <PhotoCropDialog
          file={photoToCrop}
          onCancel={() => setPhotoToCrop(undefined)}
          onConfirm={(photo) => {
            setPhotoDataUrl(photo);
            setPhotoToCrop(undefined);
          }}
          onError={(message) => {
            setError(message);
            setPhotoToCrop(undefined);
          }}
          t={t}
        />
      ) : null}
    </>
  );
}
