import { avatarRect, expandRect, nodeLabelRect, parentPortY, rectsIntersect, ROUTE_CLEARANCE } from "./connectionGeometry";
import { familyRouteLanes, FAMILY_ROUTE_LANE_SPACING } from "./familyRouteLanes";
import { parentConnectionGroups } from "./parentConnections";
import type { FamilyRelationship, PositionedPerson } from "./types";

/** An isolated carer of an interior child can use space below that child's
 * shared ancestry rail. This is a physical inset, not a new generation or an
 * inferred relationship. Preserve connected carers and crowded gaps for the
 * general router; never hide their other recorded connections to make room.
 */
export function insetCareParents(people: PositionedPerson[], relationships: readonly FamilyRelationship[], railLevels: Record<string, number>) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const edges = relationships.filter((edge) => byId.has(edge.fromPersonId) && byId.has(edge.toPersonId));
  const groups = parentConnectionGroups(edges);
  const lanes = new Map(familyRouteLanes(people, edges, railLevels).map((family) => [family.id, family]));
  const railY = (id: string, childY: number) => (railLevels[id] ?? childY - 72) - (lanes.get(id)?.childLaneIndex ?? 0) * FAMILY_ROUTE_LANE_SPACING;
  for (const group of groups) {
    if (!group.care || group.parentIds.length !== 1 || group.childIds.length !== 1) continue;
    const carer = byId.get(group.parentIds[0])!, child = byId.get(group.childIds[0])!;
    if (edges.some((edge) => [edge.fromPersonId, edge.toPersonId].includes(carer.id) && !group.relationships.some((record) => record.id === edge.id))) continue;
    const ancestry = groups.filter((family) => !family.care && family.childIds.includes(child.id) &&
      family.childIds.every((id) => byId.get(id)!.y === child.y));
    const crossed = ancestry.filter((family) => family.childIds.some((id) => byId.get(id)!.x < child.x) &&
      family.childIds.some((id) => byId.get(id)!.x > child.x));
    if (!crossed.length) continue;
    const above = Math.max(...ancestry.map((family) => railY(family.id, child.y)));
    const depth = Math.max(260, parentPortY({ ...carer, role: " " }) - carer.y + 142);
    const y = child.y - depth;
    if (y <= carer.y || y - 32 < above + ROUTE_CLEARANCE * 2) continue;
    const columns = groups.flatMap((family) => family.childIds).filter((id) => id !== child.id && id !== carer.id)
      .map((id) => byId.get(id)!).filter((person) => person.y >= y - 32 && person.y <= child.y);
    const direction = carer.x < child.x ? -1 : 1;
    const x = [carer.x, child.x + direction * 260, child.x - direction * 260].find((x) => {
      // Reserve both possible action-button sides as well as the full label.
      const candidate = { ...carer, x, y, role: " " };
      const label = nodeLabelRect(candidate);
      const occupied = { x: x - 148, y: y - 32, width: 296, height: label.y + label.height - y + 32 };
      return Math.abs(x - child.x) >= 148 && columns.every((person) => Math.abs(person.x - x) > 148 &&
        !(person.x > Math.min(child.x, x) && person.x < Math.max(child.x, x))) &&
        people.every((person) => person.id === carer.id ||
          [avatarRect(person), nodeLabelRect({ ...person, role: " " })].every((rect) => !rectsIntersect(occupied, expandRect(rect, ROUTE_CLEARANCE))));
    });
    if (x === undefined) continue;
    carer.x = x; carer.y = y;
    // The child's care rail belongs below the ancestry bus, not at an inherited
    // in-law rail level above the newly inset carer.
    railLevels[group.id] = child.y - 72;
  }
}
