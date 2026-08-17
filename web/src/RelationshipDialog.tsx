import { ArrowDown, ArrowLeftRight, ArrowUp, Heart } from "lucide-react";
import { useState } from "react";

import { DatePickerField, formatIsoDate } from "./DatePickerField";
import type { MessageKey, Translator } from "./i18n";
import { PersonPicker } from "./PersonPicker";
import {
  ROLE_GROUPS,
  directRoleDefaults,
  isPartnerRole,
  roleForRelationship
} from "./relationshipRoles";
import type { RelationshipDraftInput } from "./store";
import type { AppData, DirectRole, FamilyRelationship, Person } from "./types";
import { Modal, PersonAvatar } from "./ui";

const ROLE_GROUP_LABELS = {
  common: "roleGroupCommon",
  parents: "roleGroupParents",
  partners: "roleGroupPartners",
  children: "roleGroupChildren"
} as const satisfies Record<(typeof ROLE_GROUPS)[number]["id"], MessageKey>;

const roleIcon = (role: DirectRole) => {
  const defaults = directRoleDefaults(role);
  if (defaults.kind === "partner") return <Heart aria-hidden="true" size={17} />;
  if (defaults.kind === "sibling") {
    return <ArrowLeftRight aria-hidden="true" size={17} />;
  }
  return defaults.relativeIsParent
    ? <ArrowUp aria-hidden="true" size={17} />
    : <ArrowDown aria-hidden="true" size={17} />;
};

export function RelationshipRolePicker({
  selectedRole,
  onSelect,
  t
}: {
  selectedRole?: DirectRole;
  onSelect: (role: DirectRole) => void;
  t: Translator;
}) {
  return (
    <div className="relationship-role-groups">
      {ROLE_GROUPS.map((group) => (
        <section className="relationship-role-group" key={group.id}>
          <h4>{t(ROLE_GROUP_LABELS[group.id])}</h4>
          <div className="relationship-role-grid">
            {group.roles.map((role) => (
              <button
                aria-pressed={selectedRole === role}
                className={`relationship-role-button ${selectedRole === role ? "selected" : ""}`}
                key={role}
                onClick={() => onSelect(role)}
                type="button"
              >
                <span className="relationship-role-symbol">{roleIcon(role)}</span>
                <span>{t(role)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface RelationshipDialogProps {
  target: Person;
  people: Person[];
  relationship?: FamilyRelationship;
  relative?: Person;
  initialDraft?: RelationshipDraftInput;
  language: AppData["language"];
  t: Translator;
  onClose: () => void;
  onSave: (input: RelationshipDraftInput) => void;
  focusMarriageDate?: boolean;
}

export function RelationshipDialog({
  target,
  people,
  relationship,
  relative,
  initialDraft,
  language,
  t,
  onClose,
  onSave,
  focusMarriageDate = false
}: RelationshipDialogProps) {
  const editing = Boolean(relationship && relative);
  const currentRole = relationship && relative
    ? roleForRelationship(relationship, target.id, relative)
    : undefined;
  const [role, setRole] = useState<DirectRole | undefined>(
    initialDraft?.role ?? currentRole
  );
  const [step, setStep] = useState<"role" | "person">("role");
  const [relativePersonId, setRelativePersonId] = useState(
    initialDraft?.relativePersonId ?? relative?.id ?? ""
  );
  const [marriageDate, setMarriageDate] = useState(
    initialDraft ? initialDraft.marriageDate ?? "" : relationship?.marriageDate ?? ""
  );
  const [divorceDate, setDivorceDate] = useState(
    initialDraft ? initialDraft.divorceDate ?? "" : relationship?.divorceDate ?? ""
  );
  const candidates = people
    .filter((person) => person.treeId === target.treeId && person.id !== target.id)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const selectedRelative = relative ?? candidates.find((person) => person.id === relativePersonId);
  const roleGenderMismatch = role && selectedRelative &&
    directRoleDefaults(role).gender !== "unspecified" &&
    directRoleDefaults(role).gender !== selectedRelative.gender;
  const formerPartnerRole = role === "formerPartner" || role === "formerHusband" || role === "formerWife";
  const genderNotice = roleGenderMismatch ? (
    <p className="relationship-gender-notice">
      {t("roleGenderNotice", {
        name: selectedRelative.displayName,
        gender: t(selectedRelative.gender)
      })}
    </p>
  ) : null;

  const chooseRole = (value: DirectRole) => {
    setRole(value);
    if (!isPartnerRole(value)) setMarriageDate("");
    if (value !== "formerPartner" && value !== "formerHusband" && value !== "formerWife") setDivorceDate("");
    if (!editing) setStep("person");
  };

  const save = () => {
    if (!role || !relativePersonId) return;
    onSave({
      relativePersonId,
      role,
      ...(isPartnerRole(role) && marriageDate ? { marriageDate } : {}),
      ...(formerPartnerRole && divorceDate ? { divorceDate } : {})
    });
    onClose();
  };

  const relationshipDates = role && isPartnerRole(role) ? (
    <div className="relationship-date-fields">
      <DatePickerField
        className="relationship-date-field"
        initiallyOpen={focusMarriageDate}
        label={t("marriageDateOptional")}
        language={language}
        max={formatIsoDate(new Date())}
        onChange={setMarriageDate}
        t={t}
        value={marriageDate}
      />
      {formerPartnerRole ? (
        <DatePickerField
          className="relationship-date-field"
          label={t("divorceDateOptional")}
          language={language}
          max={formatIsoDate(new Date())}
          min={marriageDate || undefined}
          onChange={setDivorceDate}
          t={t}
          value={divorceDate}
        />
      ) : null}
    </div>
  ) : null;

  const roleStep = (
    <div className="relationship-wizard">
      {!editing ? (
        <div className="relationship-progress" aria-label={t("wizardProgress", { current: 1, total: 2 })}>
          <span className="active">1</span><i /><span>2</span>
          <strong>{t("wizardProgress", { current: 1, total: 2 })}</strong>
        </div>
      ) : null}
      <div className="relationship-step-copy">
        <h3>{editing && relative
          ? t("relationshipQuestion", { relative: relative.displayName, person: target.displayName })
          : t("chooseRelationship")}</h3>
        <p>{editing ? t("editRelationshipDescription") : t("linkRoleDescription")}</p>
      </div>
      {editing && relative ? (
        <div className="relationship-fixed-person">
          <PersonAvatar person={relative} />
          <div><span>{t("familyMember")}</span><strong>{relative.displayName}</strong></div>
        </div>
      ) : null}
      {relationshipDates}
      <RelationshipRolePicker onSelect={chooseRole} selectedRole={role} t={t} />
      {genderNotice}
    </div>
  );

  const personStep = (
    <div className="relationship-wizard">
      <div className="relationship-progress" aria-label={t("wizardProgress", { current: 2, total: 2 })}>
        <span className="complete">1</span><i className="complete" /><span className="active">2</span>
        <strong>{t("wizardProgress", { current: 2, total: 2 })}</strong>
      </div>
      <div className="relationship-step-copy">
        <h3>{t("chooseFamilyMember")}</h3>
        <p>{t("linkPersonDescription", { role: role ? t(role) : "", name: target.displayName })}</p>
      </div>
      {relationshipDates}
      <PersonPicker
        label={t("selectPerson")}
        language={language}
        onSelect={setRelativePersonId}
        people={candidates}
        selectedId={relativePersonId}
        t={t}
      />
      {genderNotice}
      {!candidates.length ? <p className="relationship-unavailable">{t("noPeopleAvailableToLink")}</p> : null}
    </div>
  );

  return (
    <Modal
      closeLabel={t("close")}
      footer={editing ? (
        <>
          <button className="button secondary" onClick={onClose} type="button">{t("cancel")}</button>
          <button className="button primary" disabled={!role} onClick={save} type="button">{t("saveRelationship")}</button>
        </>
      ) : step === "person" ? (
        <>
          <button className="button secondary" onClick={() => setStep("role")} type="button">{t("back")}</button>
          <button className="button add" disabled={!relativePersonId} onClick={save} type="button">{t("linkPerson")}</button>
        </>
      ) : (
        <button className="button secondary" onClick={onClose} type="button">{t("cancel")}</button>
      )}
      onClose={onClose}
      size="medium"
      title={editing ? t("editRelationship") : t("linkFamilyMember")}
    >
      {editing || step === "role" ? roleStep : personStep}
    </Modal>
  );
}
