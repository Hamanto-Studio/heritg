/** A bounded, deterministic two-sided order for a small reconnecting block.
 * An arc may nest inside another on the same side, but may not interleave.
 * This is a placement certificate only; the complete routed plan is still
 * independently checked before Full can use it. Unsupported blocks decline.
 */
export function familyBlockOrder<N extends { id: string }, E extends { from: N; to: N }>(nodes: N[], edges: E[]) {
  if (!nodes.length || nodes.length > 24 || edges.length > 32 || new Set(nodes).size !== nodes.length ||
      edges.some((edge) => edge.from === edge.to || !nodes.includes(edge.from) || !nodes.includes(edge.to))) return undefined;
  const ordered = [...nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const orderedEdges = [...edges].sort((a, b) => ordered.indexOf(a.from) - ordered.indexOf(b.from) ||
    ordered.indexOf(a.to) - ordered.indexOf(b.to));
  const color = (order: N[]) => {
    const at = new Map(order.map((node, index) => [node, index]));
    // Once an arc starts, every not-yet-placed endpoint is later than all
    // placed nodes. This proves some interleavings before a complete order
    // exists, pruning impossible prefixes without increasing the work limit.
    const ranges = orderedEdges.map((edge) => [at.get(edge.from) ?? Infinity, at.get(edge.to) ?? Infinity]);
    const conflicts = ranges.map(([a, b]) => ranges.flatMap(([c, d], index) =>
      a < c && c < b && b < d || c < a && a < d && d < b ? [index] : []));
    const sides = new Map<number, -1 | 1>();
    for (let i = 0; i < orderedEdges.length; i++) if (!sides.has(i)) {
      sides.set(i, -1);
      const queue = [i];
      for (let j = 0; j < queue.length; j++) for (const next of conflicts[queue[j]]) {
        const side = -sides.get(queue[j])! as -1 | 1;
        if (sides.has(next) && sides.get(next) !== side) return undefined;
        if (!sides.has(next)) { sides.set(next, side); queue.push(next); }
      }
    }
    return new Map(orderedEdges.map((edge, index) => [edge, {
      side: sides.get(index)!, span: ranges[index][1] - ranges[index][0]
    }]));
  };
  let attempts = 0;
  const search = (order: N[]): { nodes: N[]; arcs: NonNullable<ReturnType<typeof color>> } | undefined => {
    if (++attempts > 4096) return undefined;
    const arcs = color(order);
    if (!arcs) return undefined;
    if (order.length === ordered.length) {
      return { nodes: order, arcs };
    }
    for (const node of ordered) if (!order.includes(node) && edges.filter((edge) => edge.to === node).every((edge) => order.includes(edge.from))) {
      const found = search([...order, node]);
      if (found) return found;
      if (attempts > 4096) break;
    }
    return undefined;
  };
  return search([]);
}
