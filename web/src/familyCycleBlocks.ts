/** Undirected biconnected edge blocks. The graph is placement-only: callers
 * must retain every original relationship when drawing a supported block. */
export function familyCycleBlocks<N, E extends { from: N; to: N }>(nodes: N[], edges: E[]): E[][] {
  const neighbors = new Map(nodes.map((node) => [node, [] as E[]]));
  for (const edge of edges) { neighbors.get(edge.from)!.push(edge); neighbors.get(edge.to)!.push(edge); }
  const discovered = new Map<N, number>(), low = new Map<N, number>();
  const stack: E[] = [], blocks: E[][] = [];
  let time = 0;
  const visit = (node: N, previous?: E) => {
    discovered.set(node, ++time); low.set(node, time);
    for (const edge of neighbors.get(node)!) {
      if (edge === previous) continue;
      const next = edge.from === node ? edge.to : edge.from;
      if (!discovered.has(next)) {
        stack.push(edge); visit(next, edge);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
        if (low.get(next)! >= discovered.get(node)!) {
          const block: E[] = [];
          let item: E;
          do { item = stack.pop()!; block.push(item); } while (item !== edge);
          if (block.length > 1) blocks.push(block);
        }
      } else if (discovered.get(next)! < discovered.get(node)!) {
        stack.push(edge); low.set(node, Math.min(low.get(node)!, discovered.get(next)!));
      }
    }
  };
  for (const node of nodes) if (!discovered.has(node)) visit(node);
  return blocks;
}
