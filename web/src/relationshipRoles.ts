import type {
  DirectRole,
  FamilyRelationship,
  Gender,
  Person,
  RelationshipKind,
  RelationshipSubtype
} from "./types";

export interface DirectRoleDefaults {
  readonly gender: Gender;
  readonly kind: RelationshipKind;
  readonly subtype: RelationshipSubtype;
  readonly relativeIsParent: boolean;
}

const defaults = (
  gender: Gender,
  kind: RelationshipKind,
  subtype: RelationshipSubtype,
  relativeIsParent = false
): DirectRoleDefaults => ({ gender, kind, subtype, relativeIsParent });

export const DIRECT_ROLE_DEFAULTS: Readonly<Record<DirectRole, DirectRoleDefaults>> = {
  father: defaults("male", "parent", "biologicalParent", true),
  mother: defaults("female", "parent", "biologicalParent", true),
  son: defaults("male", "parent", "biologicalParent"),
  daughter: defaults("female", "parent", "biologicalParent"),
  adoptiveFather: defaults("male", "parent", "adoptiveParent", true),
  adoptiveMother: defaults("female", "parent", "adoptiveParent", true),
  adoptiveSon: defaults("male", "parent", "adoptiveParent"),
  adoptiveDaughter: defaults("female", "parent", "adoptiveParent"),
  fosterFather: defaults("male", "parent", "fosterParent", true),
  fosterMother: defaults("female", "parent", "fosterParent", true),
  fosterSon: defaults("male", "parent", "fosterParent"),
  fosterDaughter: defaults("female", "parent", "fosterParent"),
  guardian: defaults("unspecified", "parent", "guardian", true),
  ward: defaults("unspecified", "parent", "guardian"),
  stepfather: defaults("male", "parent", "stepParent", true),
  stepmother: defaults("female", "parent", "stepParent", true),
  stepson: defaults("male", "parent", "stepParent"),
  stepdaughter: defaults("female", "parent", "stepParent"),
  brother: defaults("male", "sibling", "sibling"),
  sister: defaults("female", "sibling", "sibling"),
  halfBrother: defaults("male", "sibling", "halfSibling"),
  halfSister: defaults("female", "sibling", "halfSibling"),
  adoptiveBrother: defaults("male", "sibling", "adoptiveSibling"),
  adoptiveSister: defaults("female", "sibling", "adoptiveSibling"),
  fosterBrother: defaults("male", "sibling", "fosterSibling"),
  fosterSister: defaults("female", "sibling", "fosterSibling"),
  stepbrother: defaults("male", "sibling", "stepSibling"),
  stepsister: defaults("female", "sibling", "stepSibling"),
  partner: defaults("unspecified", "partner", "partner"),
  husband: defaults("male", "partner", "spouse"),
  wife: defaults("female", "partner", "spouse"),
  formerPartner: defaults("unspecified", "partner", "formerPartner"),
  formerHusband: defaults("male", "partner", "formerSpouse"),
  formerWife: defaults("female", "partner", "formerSpouse")
};

export const directRoleDefaults = (role: DirectRole): DirectRoleDefaults =>
  DIRECT_ROLE_DEFAULTS[role];

export type RoleGroupId = "common" | "parents" | "partners" | "children" | "siblings";

export interface RoleGroup {
  readonly id: RoleGroupId;
  readonly roles: readonly DirectRole[];
}

export const ROLE_GROUPS = [
  {
    id: "common",
    roles: ["father", "mother", "son", "daughter", "brother", "sister", "partner"]
  },
  {
    id: "parents",
    roles: [
      "stepfather", "stepmother", "adoptiveFather", "adoptiveMother",
      "fosterFather", "fosterMother", "guardian"
    ]
  },
  {
    id: "partners",
    roles: ["husband", "wife", "formerPartner", "formerHusband", "formerWife"]
  },
  {
    id: "children",
    roles: [
      "stepson", "stepdaughter", "adoptiveSon", "adoptiveDaughter",
      "fosterSon", "fosterDaughter", "ward"
    ]
  },
  {
    id: "siblings",
    roles: [
      "halfBrother", "halfSister", "stepbrother", "stepsister",
      "adoptiveBrother", "adoptiveSister", "fosterBrother", "fosterSister"
    ]
  }
] as const satisfies readonly RoleGroup[];

export const isPartnerRole = (role: DirectRole) =>
  directRoleDefaults(role).kind === "partner";

export const allowsCoParent = (role: DirectRole) => {
  const roleDefaults = directRoleDefaults(role);
  return roleDefaults.kind === "parent" &&
    !roleDefaults.relativeIsParent &&
    roleDefaults.subtype !== "stepParent";
};

export function roleForRelationship(
  relationship: FamilyRelationship,
  targetPersonId: string,
  relative: Person
): DirectRole {
  const female = relative.gender === "female";
  if (relationship.kind === "parent") {
    const relativeIsParent = relationship.fromPersonId === relative.id &&
      relationship.toPersonId === targetPersonId;
    switch (relationship.subtype) {
      case "adoptiveParent":
        return relativeIsParent
          ? (female ? "adoptiveMother" : "adoptiveFather")
          : (female ? "adoptiveDaughter" : "adoptiveSon");
      case "fosterParent":
        return relativeIsParent
          ? (female ? "fosterMother" : "fosterFather")
          : (female ? "fosterDaughter" : "fosterSon");
      case "guardian":
        return relativeIsParent ? "guardian" : "ward";
      case "stepParent":
        return relativeIsParent
          ? (female ? "stepmother" : "stepfather")
          : (female ? "stepdaughter" : "stepson");
      default:
        return relativeIsParent
          ? (female ? "mother" : "father")
          : (female ? "daughter" : "son");
    }
  }
  if (relationship.kind === "partner") {
    switch (relationship.subtype) {
      case "spouse": return female ? "wife" : "husband";
      case "formerSpouse": return female ? "formerWife" : "formerHusband";
      case "formerPartner": return "formerPartner";
      default: return "partner";
    }
  }
  switch (relationship.subtype) {
    case "halfSibling": return female ? "halfSister" : "halfBrother";
    case "adoptiveSibling": return female ? "adoptiveSister" : "adoptiveBrother";
    case "fosterSibling": return female ? "fosterSister" : "fosterBrother";
    case "stepSibling": return female ? "stepsister" : "stepbrother";
    default: return female ? "sister" : "brother";
  }
}
