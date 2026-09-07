export interface LayerNode {
  id: string;
  rank: number;
  width: number;
  x: number;
  members: string[];
  incoming: LayerEdge[];
  outgoing: LayerEdge[];
}
export interface LayerEdge {
  from: LayerNode;
  to: LayerNode;
  fromPort: number;
  toPort: number;
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Seed layered ordering with whole ancestral/descendant branches. Joining
 * several origins does not necessarily make the undirected household graph
 * cyclic. For a forest, a people-weighted centroid and disjoint branch spans
 * avoid starting the optimizer with unrelated families interleaved.
 *
 * This is an ordering seed, not a crossing-free placement guarantee. Genuine
 * cycles (including parallel family paths) return no seed; no edge is removed.
 * The input graph and saved records are never modified.
 */
export function joinedFamilyBranchOrder(nodes: readonly LayerNode[], spacing: number, gap: number) {
  const neighbors = new Map(nodes.map((node) => [node, [...node.incoming.map((edge) => edge.from), ...node.outgoing.map((edge) => edge.to)]]));
  const visited = new Set<LayerNode>();
  const result = new Map<LayerNode, number>();
  let cursor = 0;
  for (const start of [...nodes].sort((a, b) => compare(a.id, b.id))) {
    if (visited.has(start)) continue;
    const component = [start]; visited.add(start);
    for (let i = 0; i < component.length; i++) for (const next of neighbors.get(component[i])!) {
      if (!visited.has(next)) { visited.add(next); component.push(next); }
    }
    if (component.reduce((sum, node) => sum + neighbors.get(node)!.length, 0) !== 2 * (component.length - 1)) return undefined;
    const parent = new Map<LayerNode, LayerNode>();
    const traversal = [start];
    for (let i = 0; i < traversal.length; i++) for (const next of neighbors.get(traversal[i])!) {
      if (next !== parent.get(traversal[i])) { parent.set(next, traversal[i]); traversal.push(next); }
    }
    const weights = new Map<LayerNode, number>();
    for (const node of [...traversal].reverse()) weights.set(node, node.members.length + neighbors.get(node)!
      .filter((next) => next !== parent.get(node)).reduce((sum, next) => sum + weights.get(next)!, 0));
    const total = weights.get(start)!;
    const balance = (node: LayerNode) => Math.max(total - weights.get(node)!, ...neighbors.get(node)!
      .filter((next) => next !== parent.get(node)).map((next) => weights.get(next)!));
    const root = [...component].sort((a, b) => balance(a) - balance(b) || b.members.length - a.members.length || compare(a.id, b.id))[0];
    const placeBranch = (node: LayerNode, previous?: LayerNode) => {
      const localPort = (next: LayerNode) => node.outgoing.find((edge) => edge.to === next)?.fromPort ??
        node.incoming.find((edge) => edge.from === next)?.toPort ?? 0;
      const children = neighbors.get(node)!.filter((next) => next !== previous)
        .sort((a, b) => localPort(a) - localPort(b) || a.x - b.x || compare(a.id, b.id));
      const left = cursor;
      for (const next of children) placeBranch(next, node);
      if (!children.length) cursor += Math.max(node.width, spacing);
      result.set(node, (left + cursor) / 2);
    };
    placeBranch(root);
    cursor += gap;
  }
  return result;
}
