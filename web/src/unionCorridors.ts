import { parentPortY, ROUTE_CLEARANCE } from "./connectionGeometry";
import { FAMILY_ROUTE_LANE_SPACING } from "./familyRouteLanes";
import { parentConnectionGroups } from "./parentConnections";
import type { FamilyRelationship, PositionedPerson } from "./types";

/** Give nested unions a physical tier of their own. A simple partnership star
 * may have several spouses on one side of its hub; their descending stems
 * otherwise cut the outer union's join. Only isolated spouses can move here:
 * connected spouse ancestry, other unions and care branches keep the general
 * layout. Logical generations and the archive are never changed.
 *
 * This must be paired with below-label marriage sockets in connectionPlan:
 * moving a spouse alone merely trades a parent crossing for a marriage one.
 */
export function staggerUnionParents(people: PositionedPerson[], relationships: readonly FamilyRelationship[]) {
  const byId = new Map(people.map((person) => [person.id, person]));
  const edges = relationships.filter((edge) => byId.has(edge.fromPersonId) && byId.has(edge.toPersonId));
  const partners = new Map<string, Set<string>>();
  for (const edge of edges) if (edge.kind === "partner") {
    for (const [id, other] of [[edge.fromPersonId, edge.toPersonId], [edge.toPersonId, edge.fromPersonId]]) {
      const set = partners.get(id) ?? new Set<string>();
      set.add(other); partners.set(id, set);
    }
  }
  const groups = parentConnectionGroups(edges);
  const offsets = new Map<string, number>();
  for (const hub of people) {
    const leaves = [...partners.get(hub.id) ?? []].map((id) => byId.get(id)!);
    if (leaves.length < 3 || leaves.some((leaf) => partners.get(leaf.id)?.size !== 1 || leaf.y !== hub.y || leaf.generation !== hub.generation)) continue;
    const labelDepth = Math.max(...[hub, ...leaves].map((person) => parentPortY({ ...person, role: " " }) - person.y));
    const stride = Math.ceil((labelDepth + ROUTE_CLEARANCE + FAMILY_ROUTE_LANE_SPACING * 2 + 16) / 4) * 4;
    for (const direction of [-1, 1]) {
      const sameSide = leaves.filter((leaf) => Math.sign(leaf.x - hub.x) === direction)
        .sort((a, b) => Math.abs(b.x - hub.x) - Math.abs(a.x - hub.x) || a.id.localeCompare(b.id));
      sameSide.forEach((leaf, index) => {
        if (!index) return;
        const outgoing = groups.filter((group) => group.parentIds.includes(leaf.id));
        if (!outgoing.length || outgoing.some((group) => group.care || group.parentIds.length !== 2 || !group.parentIds.includes(hub.id))) return;
        if (edges.some((edge) => (edge.toPersonId === leaf.id && edge.kind === "parent") ||
          (edge.kind === "sibling" && [edge.fromPersonId, edge.toPersonId].includes(leaf.id)))) return;
        offsets.set(leaf.id, stride * index);
      });
    }
  }
  const originalY = new Map(people.map((person) => [person.id, person.y]));
  const rows = [...new Set([...offsets.keys()].map((id) => originalY.get(id)!))].sort((a, b) => a - b);
  for (const row of rows) {
    const rowOffsets = [...offsets].filter(([id]) => originalY.get(id) === row);
    const depth = Math.max(...rowOffsets.map(([, offset]) => offset)) + FAMILY_ROUTE_LANE_SPACING;
    for (const person of people) if (originalY.get(person.id)! > row) person.y += depth;
    for (const [id, offset] of rowOffsets) byId.get(id)!.y += offset;
  }
}
