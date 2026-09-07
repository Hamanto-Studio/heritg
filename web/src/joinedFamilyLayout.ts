import type { FamilyRelationship, PositionedPerson } from "./types";
import { parentConnectionGroups } from "./parentConnections";
import { joinedFamilyBranchOrder, type LayerEdge, type LayerNode } from "./joinedFamilyOrder";
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Layered crossing minimization for marriages joining independent ancestry.
 * Households stay indivisible, while temporary family hubs keep siblings on
 * the same branch. Hubs/dummies are layout constraints, never saved people.
 * Existing generations and every relationship are preserved.
 */
export function joinedFamilyPositions(
  blocks: readonly { key: string; members: readonly { id: string }[] }[],
  positioned: ReadonlyMap<string, PositionedPerson>,
  relationships: readonly FamilyRelationship[],
  spacing: number,
  gap: number
) {
  const nodes: LayerNode[] = [];
  const byPerson = new Map<string, LayerNode>();
  const addNode = (id: string, rank: number, width: number, x: number, members: string[] = []) => {
    const node: LayerNode = { id, rank, width, x, members, incoming: [], outgoing: [] };
    nodes.push(node);
    return node;
  };
  // Birth and adoptive households are not one marriage block just because
  // they care for the same child. Keep actual couples/co-parent sets intact,
  // allowing the separate origins of a joined family to have their own slots.
  const household = new Map([...positioned.keys()].map((id) => [id, id]));
  const find = (id: string): string => {
    const parent = household.get(id)!;
    if (parent === id) return id;
    const root = find(parent); household.set(id, root); return root;
  };
  const join = (a: string, b: string) => {
    if (!positioned.has(a) || !positioned.has(b) || positioned.get(a)!.generation !== positioned.get(b)!.generation) return;
    const roots = [find(a), find(b)].sort(compare); household.set(roots[1], roots[0]);
  };
  for (const edge of relationships) if (edge.kind === "partner") join(edge.fromPersonId, edge.toPersonId);
  for (const group of parentConnectionGroups(relationships)) if (!group.care) {
    for (const id of group.parentIds.slice(1)) join(group.parentIds[0], id);
  }
  const householdMembers = new Map<string, string[]>();
  for (const block of blocks) for (const { id } of block.members) {
    const key = find(id);
    if (!householdMembers.has(key)) householdMembers.set(key, []);
    householdMembers.get(key)!.push(id);
  }
  for (const [key, members] of householdMembers) {
    const node = addNode(`household:${key}`, positioned.get(members[0])!.generation * 2,
      members.length * spacing, mean(members.map((id) => positioned.get(id)!.x)), members);
    for (const id of members) byPerson.set(id, node);
  }
  const port = (node: LayerNode, id: string) => (node.members.indexOf(id) - (node.members.length - 1) / 2) * spacing;
  const connect = (from: LayerNode, to: LayerNode, fromPort: number, toPort: number, key: string) => {
    let previous = from;
    for (let rank = from.rank + 1; rank <= to.rank; rank++) {
      const target = rank === to.rank ? to : addNode(`corridor:${key}:${rank}`, rank, 24,
        from.x + (to.x - from.x) * (rank - from.rank) / (to.rank - from.rank));
      const edge: LayerEdge = { from: previous, to: target, fromPort: previous === from ? fromPort : 0, toPort: target === to ? toPort : 0 };
      previous.outgoing.push(edge); target.incoming.push(edge); previous = target;
    }
  };
  const groups = parentConnectionGroups(relationships.filter((edge) => {
    if (edge.kind !== "parent") return true;
    const from = byPerson.get(edge.fromPersonId), to = byPerson.get(edge.toPersonId);
    return Boolean(from && to && from.rank < to.rank);
  }));
  const families = new Map(groups.map((group) => [group.care ? group.id : JSON.stringify(group.parentIds),
    { parents: group.parentIds, children: group.childIds }]));
  for (const [key, { parents, children }] of [...families].sort(([a], [b]) => compare(a, b))) {
    const hub = addNode(`family:${key}`, Math.max(...parents.map((id) => byPerson.get(id)!.rank)) + 1,
      24, mean(children.map((id) => positioned.get(id)!.x)));
    const parentNodes = [...new Set(parents.map((id) => byPerson.get(id)!))];
    for (const parent of parentNodes) connect(parent, hub,
      mean(parents.filter((id) => byPerson.get(id) === parent).map((id) => port(parent, id))), 0, `${parent.id}:${key}`);
    for (const child of children.sort(compare)) {
      const node = byPerson.get(child)!;
      connect(hub, node, 0, port(node, child), `${key}:${child}`);
    }
  }
  const ranks = [...new Set(nodes.map((node) => node.rank))].sort((a, b) => a - b);
  const layers = ranks.map((rank) => nodes.filter((node) => node.rank === rank).sort((a, b) => a.x - b.x || compare(a.id, b.id)));
  const branchOrder = joinedFamilyBranchOrder(nodes, spacing, gap);
  if (branchOrder) for (const layer of layers) layer.sort((a, b) => branchOrder.get(a)! - branchOrder.get(b)! || compare(a.id, b.id));
  const order = new Map<LayerNode, number>();
  const indexLayers = () => layers.forEach((layer) => layer.forEach((node, index) => order.set(node, index)));
  // Ports distinguish the left/right spouse; treating a household as a single
  // zero-width point would hide crossings between their ancestry connections.
  const orderAtPort = (node: LayerNode, offset: number) => order.get(node)! + offset / Math.max(node.width, 1) * 0.8;
  const crossings = () => {
    indexLayers();
    let count = 0;
    for (const layer of layers) {
      const edges = layer.flatMap((node) => node.outgoing);
      for (let a = 0; a < edges.length; a++) for (let b = a + 1; b < edges.length; b++) {
        const left = edges[a], right = edges[b];
        if ((orderAtPort(left.from, left.fromPort) - orderAtPort(right.from, right.fromPort)) *
            (orderAtPort(left.to, left.toPort) - orderAtPort(right.to, right.toPort)) < -1e-9) count++;
      }
    }
    return count;
  };
  const transpose = () => {
    let changed = false;
    for (const layer of layers) for (let index = 0; index < layer.length - 1; index++) {
      const a = layer[index], b = layer[index + 1];
      let gain = 0;
      for (const side of ["incoming", "outgoing"] as const) {
        const position = (edge: LayerEdge) => side === "incoming"
          ? orderAtPort(edge.from, edge.fromPort) : orderAtPort(edge.to, edge.toPort);
        for (const left of a[side]) for (const right of b[side]) {
          const difference = position(left) - position(right);
          if (Math.abs(difference) > 1e-9) gain += difference > 0 ? 1 : -1;
        }
      }
      if (gain > 0) {
        layer[index] = b; layer[index + 1] = a;
        order.set(b, index); order.set(a, index + 1); changed = true;
      }
    }
    return changed;
  };
  let best = layers.map((layer) => [...layer]), bestScore = crossings(), stale = 0;
  for (let pass = 0; pass < 24 && stale < 6 && bestScore > 0; pass++) {
    const downward = pass % 2 === 0;
    for (const layer of downward ? layers.slice(1) : layers.slice(0, -1).reverse()) {
      const barycenter = new Map(layer.map((node) => {
        const edges = downward ? node.incoming : node.outgoing;
        const positions = edges.map((edge) => downward ? orderAtPort(edge.from, edge.fromPort) : orderAtPort(edge.to, edge.toPort));
        return [node, positions.length ? mean(positions) : order.get(node)!] as const;
      }));
      layer.sort((a, b) => barycenter.get(a)! - barycenter.get(b)! || order.get(a)! - order.get(b)! || compare(a.id, b.id));
      layer.forEach((node, index) => order.set(node, index));
    }
    for (let local = 0; local < 12 && transpose(); local++) { /* Strictly fewer crossings. */ }
    const score = crossings();
    if (score < bestScore) { bestScore = score; best = layers.map((layer) => [...layer]); stale = 0; }
    else stale++;
  }
  best.forEach((layer, index) => { layers[index] = layer; });
  indexLayers();
  // A spouse's ancestry belongs on that spouse's side of the household.
  // Reversing the whole block preserves partner adjacency but can remove
  // crossings that no permutation of the household blocks can resolve.
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const node of nodes) {
      if (node.members.length < 2) continue;
      let gain = 0;
      for (const side of ["incoming", "outgoing"] as const) {
        const edges = node[side];
        for (let a = 0; a < edges.length; a++) for (let b = a + 1; b < edges.length; b++) {
          const left = edges[a], right = edges[b];
          const ownDifference = side === "incoming" ? left.toPort - right.toPort : left.fromPort - right.fromPort;
          const otherDifference = side === "incoming"
            ? orderAtPort(left.from, left.fromPort) - orderAtPort(right.from, right.fromPort)
            : orderAtPort(left.to, left.toPort) - orderAtPort(right.to, right.toPort);
          const product = ownDifference * otherDifference;
          if (Math.abs(product) > 1e-9) gain += product < 0 ? 1 : -1;
        }
      }
      if (gain > 0) {
        node.members.reverse();
        for (const edge of node.incoming) edge.toPort *= -1;
        for (const edge of node.outgoing) edge.fromPort *= -1;
        changed = true;
      }
    }
    if (!transpose() && !changed) break;
  }

  // Project desired neighbor alignment onto non-overlap constraints. Pooling
  // adjacent violations moves both sides fairly, instead of a one-way push
  // that repeatedly adds whitespace and drags every following family right.
  const separation = (left: LayerNode, right: LayerNode) => {
    if (!left.members.length || !right.members.length) return 32;
    const siblings = left.members.length === 1 && right.members.length === 1 &&
      left.incoming.some((a) => right.incoming.some((b) => a.from === b.from));
    return siblings ? 0 : gap;
  };
  const align = (layer: LayerNode[], downward: boolean) => {
    let offset = 0;
    const offsets = layer.map((node, index) => {
      if (index) offset += (layer[index - 1].width + node.width) / 2 + separation(layer[index - 1], node);
      return offset;
    });
    const pools: { start: number; end: number; value: number; count: number }[] = [];
    layer.forEach((node, index) => {
      const edges = downward ? node.incoming : node.outgoing;
      const desired = edges.map((edge) => downward ? edge.from.x + edge.fromPort - edge.toPort : edge.to.x + edge.toPort - edge.fromPort);
      pools.push({ start: index, end: index, value: (desired.length ? mean(desired) : node.x) - offsets[index], count: 1 });
      while (pools.length > 1 && pools.at(-2)!.value > pools.at(-1)!.value) {
        const right = pools.pop()!, left = pools.pop()!;
        pools.push({ start: left.start, end: right.end, value: (left.value * left.count + right.value * right.count) / (left.count + right.count), count: left.count + right.count });
      }
    });
    for (const pool of pools) for (let index = pool.start; index <= pool.end; index++) layer[index].x = pool.value + offsets[index];
  };
  // Start with bounded, centered rows: old sweeps may have drifted far right.
  for (const layer of layers) {
    let next = 0;
    for (const node of layer) { node.x = next + node.width / 2; next += node.width + gap; }
    for (const node of layer) node.x -= next / 2;
  }
  for (let pass = 0; pass < 32; pass++) {
    const downward = pass % 2 === 0;
    for (const layer of downward ? layers : [...layers].reverse()) align(layer, downward);
  }
  const result = new Map<string, number>();
  for (const node of nodes) for (const id of node.members) result.set(id, Math.round((node.x + port(node, id)) * 1e6) / 1e6);
  return result;
}
