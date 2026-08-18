import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { selectFocusedFamily } from "./familyCopy";
import type { Translator } from "./i18n";
import { PersonPicker } from "./PersonPicker";
import type { AppActions } from "./store";
import type { AppData, FamilyTree } from "./types";
import { ErrorNotice, Modal, PersonAvatar } from "./ui";

const uniqueTitle = (candidate: string, trees: readonly FamilyTree[]) => {
  if (!trees.some((tree) => tree.title === candidate)) return candidate;
  let number = 2;
  while (trees.some((tree) => tree.title === `${candidate} ${number}`)) number += 1;
  return `${candidate} ${number}`;
};

export function FocusedTreeCopyDialog({
  data,
  sourceTree,
  actions,
  t,
  onClose,
  onCreated
}: {
  data: AppData;
  sourceTree: FamilyTree;
  actions: AppActions;
  t: Translator;
  onClose: () => void;
  onCreated: () => void;
}) {
  const sourcePeople = data.people
    .filter((person) => person.treeId === sourceTree.id)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const sourceRelationships = data.relationships.filter(
    (relationship) => relationship.treeId === sourceTree.id
  );
  const [title, setTitle] = useState(() => uniqueTitle(
    t("familyCopySourceName", { name: sourceTree.title }),
    data.trees
  ));
  const [titleTouched, setTitleTouched] = useState(false);
  const [focusPersonId, setFocusPersonId] = useState("");
  const [excludedPartnerIds, setExcludedPartnerIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  const focusPartnerIds = new Set(sourceRelationships.flatMap((relationship) => {
    if (relationship.kind !== "partner") return [];
    if (relationship.fromPersonId === focusPersonId) return [relationship.toPersonId];
    if (relationship.toPersonId === focusPersonId) return [relationship.fromPersonId];
    return [];
  }));
  const focusPartners = sourcePeople.filter((person) => focusPartnerIds.has(person.id));
  const selection = focusPersonId
    ? selectFocusedFamily(
      sourcePeople,
      sourceRelationships,
      focusPersonId,
      excludedPartnerIds
    )
    : undefined;

  const selectFocus = (personId: string) => {
    const partnerIds = sourceRelationships.flatMap((relationship) => {
      if (relationship.kind !== "partner") return [];
      if (relationship.fromPersonId === personId) return [relationship.toPersonId];
      if (relationship.toPersonId === personId) return [relationship.fromPersonId];
      return [];
    });
    setFocusPersonId(personId);
    setExcludedPartnerIds([...new Set(partnerIds)]);
    setError(undefined);
    if (!titleTouched) {
      const person = sourcePeople.find((item) => item.id === personId);
      if (person) {
        setTitle(uniqueTitle(t("familyCopyDefaultName", { name: person.displayName }), data.trees));
      }
    }
  };

  const createCopy = () => {
    if (!focusPersonId || !title.trim()) return;
    try {
      actions.copyFocusedTree(sourceTree.id, title, focusPersonId, excludedPartnerIds);
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("errorTitle"));
    }
  };

  return (
    <Modal
      closeLabel={t("close")}
      footer={
        <>
          <button className="button secondary" onClick={onClose} type="button">{t("cancel")}</button>
          <button
            className="button primary"
            disabled={!focusPersonId || !title.trim()}
            onClick={createCopy}
            type="button"
          >
            {t("createFamilyCopy")}
          </button>
        </>
      }
      onClose={onClose}
      size="medium"
      title={t("makeFamilyCopy")}
    >
      <div className="form-stack">
        <p className="dialog-copy">{t("familyCopyIntro", { name: sourceTree.title })}</p>
        <label className="field">
          {t("treeName")}
          <input
            maxLength={160}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleTouched(true);
            }}
            value={title}
          />
        </label>
        <PersonPicker
          label={t("familyCopyFocus")}
          language={data.language}
          onSelect={selectFocus}
          people={sourcePeople}
          selectedId={focusPersonId}
          t={t}
        />
        {selection ? (
          <section className="family-copy-options">
            <div>
              <h3>{t("familyCopyExcludePartners")}</h3>
              <p>{t("familyCopyExcludeHelp")}</p>
            </div>
            {focusPartners.length ? (
              <div className="family-copy-partners">
                {focusPartners.map((partner) => (
                  <label className="family-copy-partner" key={partner.id}>
                    <input
                      checked={excludedPartnerIds.includes(partner.id)}
                      onChange={() => setExcludedPartnerIds((current) =>
                        current.includes(partner.id)
                          ? current.filter((id) => id !== partner.id)
                          : [...current, partner.id]
                      )}
                      type="checkbox"
                    />
                    <PersonAvatar person={partner} size={38} />
                    <span>
                      <strong>{partner.displayName}</strong>
                      <small>{t("familyCopyRemovePartner")}</small>
                    </span>
                  </label>
                ))}
              </div>
            ) : <p className="family-copy-empty">{t("familyCopyNoPartners")}</p>}
            <div className="family-copy-preview">
              <ShieldCheck aria-hidden="true" size={20} />
              <span>
                <strong>{t("familyCopyPreview")}</strong>
                <small>{t("familyCopyCounts", {
                  included: selection.people.length,
                  excluded: selection.excludedPeople.length
                })}</small>
                <small>{t("familyCopyPrivacy")}</small>
              </span>
            </div>
          </section>
        ) : null}
        <p className="family-copy-independent">{t("familyCopyIndependent")}</p>
        <ErrorNotice message={error} />
      </div>
    </Modal>
  );
}
