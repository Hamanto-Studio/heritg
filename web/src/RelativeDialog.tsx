import { ImagePlus, Link2, UserPlus } from "lucide-react";
import { useState } from "react";

import { DatePickerField, formatIsoDate } from "./DatePickerField";
import type { Translator } from "./i18n";
import { PersonPicker } from "./PersonPicker";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { RelationshipRolePicker } from "./RelationshipDialog";
import {
  allowsCoParent,
  directRoleDefaults,
  isPartnerRole
} from "./relationshipRoles";
import type { AppActions } from "./store";
import type { AppData, DirectRole, FamilyRelationship, Person } from "./types";
import { ErrorNotice, Modal, PersonAvatar } from "./ui";

interface RelativeDialogProps {
  target: Person;
  people: Person[];
  relationships: FamilyRelationship[];
  actions: AppActions;
  language: AppData["language"];
  t: Translator;
  onClose: () => void;
  onSaved: (personId: string) => void;
}

type WizardStep = "method" | "role" | "details";
type AddMethod = "new" | "existing";

export function RelativeDialog({
  target,
  people,
  relationships,
  actions,
  language,
  t,
  onClose,
  onSaved
}: RelativeDialogProps) {
  const [step, setStep] = useState<WizardStep>("method");
  const [method, setMethod] = useState<AddMethod>();
  const [role, setRole] = useState<DirectRole>();
  const [name, setName] = useState("");
  const [existingPersonId, setExistingPersonId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [marriageDate, setMarriageDate] = useState("");
  const [divorceDate, setDivorceDate] = useState("");
  const [coParentId, setCoParentId] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string>();
  const [photoToCrop, setPhotoToCrop] = useState<File>();
  const [error, setError] = useState<string>();

  const candidates = people
    .filter((person) => person.treeId === target.treeId && person.id !== target.id)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const activePartnerIds = new Set(relationships.flatMap((relationship) => {
    if (
      relationship.treeId !== target.treeId ||
      relationship.kind !== "partner" ||
      (relationship.subtype !== "partner" && relationship.subtype !== "spouse")
    ) {
      return [];
    }
    if (relationship.fromPersonId === target.id) return [relationship.toPersonId];
    if (relationship.toPersonId === target.id) return [relationship.fromPersonId];
    return [];
  }));
  const coParents = people
    .filter((person) => activePartnerIds.has(person.id) && person.id !== existingPersonId)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const selectedExisting = people.find((person) => person.id === existingPersonId);
  const roleGenderMismatch = role && selectedExisting &&
    directRoleDefaults(role).gender !== "unspecified" &&
    directRoleDefaults(role).gender !== selectedExisting.gender;
  const formerPartnerRole = role === "formerPartner" || role === "formerHusband" || role === "formerWife";

  const chooseMethod = (value: AddMethod) => {
    if (value !== method) {
      setExistingPersonId("");
      setCoParentId("");
    }
    setMethod(value);
    setError(undefined);
    setStep("role");
  };

  const chooseRole = (value: DirectRole) => {
    setRole(value);
    if (!isPartnerRole(value)) setMarriageDate("");
    if (value !== "formerPartner" && value !== "formerHusband" && value !== "formerWife") setDivorceDate("");
    if (!allowsCoParent(value)) setCoParentId("");
    setError(undefined);
    setStep("details");
  };

  const save = () => {
    if (!method || !role) return;
    setError(undefined);
    try {
      const partnerDate = isPartnerRole(role) && marriageDate
        ? marriageDate
        : undefined;
      const selectedCoParentId = allowsCoParent(role) && coParentId
        ? coParentId
        : undefined;
      let relativePersonId = existingPersonId;

      if (method === "new") {
        relativePersonId = actions.createRelative(
          target.treeId,
          target.id,
          {
            displayName: name,
            gender: directRoleDefaults(role).gender,
            birthDate: birthDate || undefined,
            city,
            photoDataUrl
          },
          role,
          partnerDate,
          selectedCoParentId,
          formerPartnerRole && divorceDate ? divorceDate : undefined
        );
      } else {
        if (!relativePersonId) throw new Error(t("selectPerson"));
        actions.linkRelative(
          target.id,
          relativePersonId,
          role,
          partnerDate,
          selectedCoParentId,
          formerPartnerRole && divorceDate ? divorceDate : undefined
        );
      }

      actions.selectPerson(target.id);
      onSaved(relativePersonId);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("errorTitle"));
    }
  };

  const progress = (current: number) => (
    <div className="relationship-progress three" aria-label={t("wizardProgress", { current, total: 3 })}>
      <span className={current === 1 ? "active" : "complete"}>1</span>
      <i className={current > 1 ? "complete" : ""} />
      <span className={current === 2 ? "active" : current > 2 ? "complete" : ""}>2</span>
      <i className={current > 2 ? "complete" : ""} />
      <span className={current === 3 ? "active" : ""}>3</span>
      <strong>{t("wizardProgress", { current, total: 3 })}</strong>
    </div>
  );

  const methodStep = (
    <div className="relationship-wizard">
      {progress(1)}
      <div className="relationship-step-copy">
        <h3>{t("chooseAddMethod")}</h3>
        <p>{t("chooseAddMethodDescription", { name: target.displayName })}</p>
      </div>
      <div className="relationship-methods">
        <button className="relationship-method-card" onClick={() => chooseMethod("new")} type="button">
          <span className="relationship-method-icon"><UserPlus aria-hidden="true" size={22} /></span>
          <span><strong>{t("addNewPerson")}</strong><small>{t("addNewPersonDescription")}</small></span>
        </button>
        <button
          aria-describedby={!candidates.length ? "link-existing-unavailable" : undefined}
          className="relationship-method-card"
          disabled={!candidates.length}
          onClick={() => chooseMethod("existing")}
          type="button"
        >
          <span className="relationship-method-icon"><Link2 aria-hidden="true" size={22} /></span>
          <span><strong>{t("linkExistingFamilyMember")}</strong><small>{t("linkExistingDescription")}</small></span>
        </button>
      </div>
      {!candidates.length ? (
        <p className="relationship-unavailable" id="link-existing-unavailable">{t("noOtherPeopleToLink")}</p>
      ) : null}
    </div>
  );

  const roleStep = (
    <div className="relationship-wizard">
      {progress(2)}
      <div className="relationship-step-copy">
        <h3>{t("chooseRelationship")}</h3>
        <p>{t("relationshipRolePrompt", { name: target.displayName })}</p>
      </div>
      <RelationshipRolePicker onSelect={chooseRole} selectedRole={role} t={t} />
    </div>
  );

  const detailsStep = role && method ? (
    <div className="relationship-wizard">
      {progress(3)}
      <div className="relationship-step-copy">
        <h3>{method === "new"
          ? t("newRelativeDetails", { role: t(role) })
          : t("chooseExistingRelative")}</h3>
        <p>{method === "new"
          ? t("newRelativeDescription", { role: t(role), name: target.displayName })
          : t("existingRelativeDescription", { role: t(role), name: target.displayName })}</p>
      </div>
      <div className="relationship-selection-summary">
        <span>{t("relationship")}</span><strong>{t(role)}</strong>
      </div>

      {isPartnerRole(role) ? (
        <div className="relationship-date-fields">
          <DatePickerField
            label={t("marriageDateOptional")}
            language={language}
            max={formatIsoDate(new Date())}
            onChange={setMarriageDate}
            t={t}
            value={marriageDate}
          />
          {formerPartnerRole ? (
            <DatePickerField
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
      ) : null}

      {method === "new" ? (
        <div className="relative-create-fields">
          <div className="photo-editor compact">
            <PersonAvatar person={{
              id: "new-relative",
              treeId: target.treeId,
              displayName: name,
              gender: directRoleDefaults(role).gender,
              createdAt: "",
              birthDatePrecision: "exact",
              notes: "",
              addressLine: "",
              city,
              province: "",
              country: "",
              postalCode: "",
              photoDataUrl
            }} size={68} />
            <div className="photo-actions">
              <label className="button secondary file-button">
                <ImagePlus aria-hidden="true" size={17} /> {t("choosePhoto")}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) setPhotoToCrop(file);
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
          <label className="field full">
            {t("name")}
            <input autoFocus autoComplete="name" maxLength={240} onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <details className="person-detail-disclosure">
            <summary>{t("optionalDetails")}</summary>
            <div className="field-grid">
              <DatePickerField
                defaultMonth={new Date(new Date().getFullYear() - 30, 0, 1)}
                label={t("birthDateOptional")}
                language={language}
                max={formatIsoDate(new Date())}
                onChange={setBirthDate}
                t={t}
                value={birthDate}
              />
              <label className="field">
                {t("city")}
                <input maxLength={240} onChange={(event) => setCity(event.target.value)} value={city} />
              </label>
            </div>
          </details>
        </div>
      ) : (
        <div>
          <PersonPicker
            label={t("selectPerson")}
            language={language}
            onSelect={(personId) => {
              setExistingPersonId(personId);
              if (coParentId === personId) setCoParentId("");
            }}
            people={candidates}
            selectedId={existingPersonId}
            t={t}
          />
          {roleGenderMismatch ? (
            <p className="relationship-gender-notice">
              {t("roleGenderNotice", {
                name: selectedExisting.displayName,
                gender: t(selectedExisting.gender)
              })}
            </p>
          ) : null}
        </div>
      )}

      {allowsCoParent(role) && coParents.length ? (
        <PersonPicker
          label={t("coParentOptional")}
          language={language}
          noneLabel={t("noCoParent")}
          onSelect={setCoParentId}
          people={coParents}
          selectedId={coParentId}
          t={t}
        />
      ) : null}
      <ErrorNotice message={error} />
    </div>
  ) : null;

  return (
    <>
    <Modal
      closeLabel={t("close")}
      inactive={Boolean(photoToCrop)}
      footer={step === "method" ? (
        <button className="button secondary" onClick={onClose} type="button">{t("cancel")}</button>
      ) : step === "role" ? (
        <>
          <button className="button secondary" onClick={() => setStep("method")} type="button">{t("back")}</button>
          <button className="button ghost" onClick={onClose} type="button">{t("cancel")}</button>
        </>
      ) : (
        <>
          <button className="button secondary" onClick={() => setStep("role")} type="button">{t("back")}</button>
          <button
            className="button add"
            disabled={method === "new" ? !name.trim() : !existingPersonId}
            onClick={save}
            type="button"
          >
            {method === "new" ? t("addRelative") : t("linkPerson")}
          </button>
        </>
      )}
      onClose={onClose}
      size="medium"
      title={t("addRelativeTo", { name: target.displayName })}
    >
      {step === "method" ? methodStep : step === "role" ? roleStep : detailsStep}
    </Modal>
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
