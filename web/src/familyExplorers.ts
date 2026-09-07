import type { FamilyRelationship, Person } from "./types";

export type ExplorerView = "fan";
export const explorerViews: ExplorerView[] = ["fan"];
export const explorerLabels = {
  fan: "fanView"
} as const;
export const explorerDescriptions = {
  fan: "fanDescription"
} as const;

export function familyIndex(people: Person[], relationships: FamilyRelationship[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parents = new Map<string, string[]>(), children = new Map<string, string[]>(), siblings = new Map<string, string[]>();
  const compare = (a: string, b: string) => byId.get(a)!.displayName.localeCompare(byId.get(b)!.displayName) || a.localeCompare(b);
  const add = (map: Map<string, string[]>, from: string, to: string) => {
    const ids = map.get(from) ?? []; if (!ids.includes(to)) ids.push(to); map.set(from, ids);
  };
  for (const r of relationships) {
    if (!byId.has(r.fromPersonId) || !byId.has(r.toPersonId) || r.fromPersonId === r.toPersonId) continue;
    if (r.kind === "parent") { add(parents, r.toPersonId, r.fromPersonId); add(children, r.fromPersonId, r.toPersonId); }
    if (r.kind === "sibling") { add(siblings, r.fromPersonId, r.toPersonId); add(siblings, r.toPersonId, r.fromPersonId); }
  }
  for (const [id, parentIds] of parents) for (const parent of parentIds) for (const child of children.get(parent) ?? []) {
    if (child !== id) add(siblings, id, child);
  }
  for (const map of [parents, children, siblings]) for (const ids of map.values()) ids.sort(compare);
  return { byId, parents, children, siblings };
}

export interface AncestorNode {
  key: string; parentKey?: string; personId?: string; depth: number;
  start: number; end: number; repeat: boolean;
}

/** Path identities preserve pedigree collapse; cycle guards never invent ancestors. */
export function ancestorNodes(index: ReturnType<typeof familyIndex>, root: string, generations: number) {
  const nodes: AncestorNode[] = [];
  let truncated = false;
  const visit = (id: string | undefined, depth: number, start: number, end: number, path: string[], key: string, parentKey?: string) => {
    if (nodes.length >= 512) { truncated = true; return; }
    const repeat = Boolean(id && path.includes(id));
    nodes.push({ key, parentKey, personId: id, depth, start, end, repeat });
    if (!id || repeat || depth >= Math.min(5, Math.max(1, generations))) return;
    const parents: (string | undefined)[] = [...index.parents.get(id) ?? []];
    // Unknown slots are explicitly unrecorded people, never saved placeholders.
    while (parents.length < 2) parents.push(undefined);
    parents.forEach((parent, i) => visit(parent, depth + 1, start + (end - start) * i / parents.length,
      start + (end - start) * (i + 1) / parents.length, [...path, id], `${key}.${i}`, key));
  };
  if (index.byId.has(root)) visit(root, 0, 0, 1, [], "root");
  return { nodes, truncated };
}

/** Size by displayed leaves, not by exponentially small fan-sector fractions. */
export function ancestorChartLayout(nodes: AncestorNode[]) {
  const children = new Map<string, string[]>();
  for (const node of nodes) if (node.parentKey) children.set(node.parentKey, [...children.get(node.parentKey) ?? [], node.key]);
  const leaves = nodes.filter((node) => !children.has(node.key));
  const height = Math.max(344, leaves.length * 86);
  const y = new Map(leaves.map((node, i) => [node.key, (i + 0.5) * height / Math.max(1, leaves.length)]));
  for (const node of [...nodes].reverse()) {
    const childKeys = children.get(node.key);
    if (childKeys?.length) y.set(node.key, (y.get(childKeys[0])! + y.get(childKeys[childKeys.length - 1])!) / 2);
  }
  return { y, height };
}

export function filterPeople(people: Person[], search: string, sort: string) {
  const query = search.trim().toLocaleLowerCase();
  return people.filter((p) => [p.displayName, p.city, p.province, p.country].some((s) => s.toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      if (sort !== "name") {
        if (!a.birthDate !== !b.birthDate) return a.birthDate ? -1 : 1;
        const dateOrder = (a.birthDate ?? "").localeCompare(b.birthDate ?? "");
        if (dateOrder) return sort === "youngest" ? -dateOrder : dateOrder;
      }
      return a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
    });
}
