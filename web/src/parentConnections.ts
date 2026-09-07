import type { FamilyRelationship } from "./types";

/** Care relationships are real edges, but are not an additional set of
 * co-parents on the child's ancestry bus. Keep them explicit and individual.
 */
export const isCareRelationship = (edge: FamilyRelationship) => edge.kind === "parent" &&
  (edge.subtype === "stepParent" || edge.subtype === "guardian");

export const isFamilyParent = (edge: FamilyRelationship) => edge.kind === "parent" && !isCareRelationship(edge);

export const careRelationshipLabel = (edge: FamilyRelationship, language: "en" | "id") =>
  edge.subtype === "stepParent" ? (language === "id" ? "Orang tua tiri" : "Step-parent") :
    (language === "id" ? "Wali" : "Guardian");

export const ancestryRelationshipLabel = (subtype: FamilyRelationship["subtype"], language: "en" | "id", count: number) => {
  const parent = count === 1 ? "parent" : "parents";
  if (subtype === "adoptiveParent") return language === "id" ? "Orang tua angkat" : `Adoptive ${parent}`;
  if (subtype === "fosterParent") return language === "id" ? "Orang tua asuh" : `Foster ${parent}`;
  return language === "id" ? "Orang tua kandung" : `Biological ${parent}`;
};

export const stableFamilyId = (ids: readonly string[]) => ids.map((id) => `${id.length}:${id}`).join("|");
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** A recorded step-parent is already traceable through their recorded
 * partnership and the partner's parent branch. Reuse that two-edge path;
 * never infer a step relationship just because two people are partners. */
export function sharedStepParentPaths(relationships: readonly FamilyRelationship[]) {
  const primary = relationships.filter(isFamilyParent);
  const partners = relationships.filter((edge) => edge.kind === "partner")
    .sort((a, b) => Number(a.subtype === "formerSpouse") - Number(b.subtype === "formerSpouse") || compare(a.id, b.id));
  return relationships.filter((edge) => edge.kind === "parent" && edge.subtype === "stepParent")
    .sort((a, b) => compare(a.id, b.id)).flatMap((relationship) => {
      for (const partner of partners) {
        const viaPersonId = partner.fromPersonId === relationship.fromPersonId ? partner.toPersonId :
          partner.toPersonId === relationship.fromPersonId ? partner.fromPersonId : undefined;
        if (!viaPersonId) continue;
        const parent = primary.filter((edge) => edge.fromPersonId === viaPersonId && edge.toPersonId === relationship.toPersonId)
          .sort((a, b) => compare(a.id, b.id))[0];
        if (parent) return [{ relationship, viaPersonId, partnerRelationshipId: partner.id, parentRelationshipId: parent.id }];
      }
      return [];
    });
}

/** Ancestry shares one bus per parent set. Care branches share only their
 * explicitly recorded carer, never a made-up union with biological parents. */
export function parentConnectionGroups(relationships: readonly FamilyRelationship[]) {
  const shared = new Set(sharedStepParentPaths(relationships).map(({ relationship }) => relationship.id));
  const byChild = new Map<string, FamilyRelationship[]>();
  const groups = new Map<string, { id: string; parentIds: string[]; childIds: string[];
    relationships: FamilyRelationship[]; care?: FamilyRelationship }>();
  const add = (id: string, parents: string[], child: string, edges: FamilyRelationship[], care?: FamilyRelationship) => {
    if (!groups.has(id)) groups.set(id, { id, parentIds: parents, childIds: [], relationships: [], care });
    const group = groups.get(id)!;
    if (!group.childIds.includes(child)) group.childIds.push(child);
    group.relationships.push(...edges);
  };
  for (const edge of relationships) {
    if (edge.kind !== "parent" || shared.has(edge.id)) continue;
    if (isCareRelationship(edge)) add(`care:${edge.subtype}:${stableFamilyId([edge.fromPersonId])}`,
      [edge.fromPersonId], edge.toPersonId, [edge], edge);
    else {
      if (!byChild.has(edge.toPersonId)) byChild.set(edge.toPersonId, []);
      byChild.get(edge.toPersonId)!.push(edge);
    }
  }
  for (const [child, edges] of byChild) {
    // A child may have both recorded birth and adoptive/foster parents. They
    // are different parent sets, not one invented four-parent household.
    // Families with the same people still share a bus across their children;
    // the individual child's recorded parent types remain on its branch.
    const byType = new Map<FamilyRelationship["subtype"], FamilyRelationship[]>();
    for (const edge of edges) {
      if (!byType.has(edge.subtype)) byType.set(edge.subtype, []);
      byType.get(edge.subtype)!.push(edge);
    }
    for (const typedEdges of byType.values()) {
      const parents = [...new Set(typedEdges.map((edge) => edge.fromPersonId))].sort(compare);
      add(stableFamilyId(parents), parents, child, typedEdges);
    }
  }
  return [...groups.values()].sort((a, b) => compare(a.id, b.id)).map((group) => {
    const edges = group.relationships.sort((a, b) => compare(a.id, b.id));
    return { ...group, care: group.care ? edges[0] : undefined,
      childIds: group.childIds.sort(compare), relationships: edges };
  });
}
