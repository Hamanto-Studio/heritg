import { parentConnectionGroups } from "./parentConnections";
import { parentPortY, segmentsForPoints, type RoutePoint, type RouteSegment } from "./connectionGeometry";
import type { TreeLayout, PositionedPerson } from "./types";
import { splitAtAttachmentPoints } from "./obstacleRouter";
import { familyCycleBlocks } from "./familyCycleBlocks";
import { familyBlockOrder } from "./familyBlockOrder";

type Node = { id: string; person?: PositionedPerson; incoming: Edge[]; outgoing: Edge[] };
type Edge = { id: string; familyId: string; from: Node; to: Node };
type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Drawing = { positions: Map<Node, RoutePoint>; paths: Map<Edge, RoutePoint[]>; bounds: Box; parentPort?: RoutePoint };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function mergeCorridorSegments(segments: RouteSegment[]) {
  const lines = new Map<string, { horizontal: boolean; coordinate: number; ranges: [number, number][] }>();
  for (const { start, end } of segments) {
    const horizontal = start.y === end.y;
    const coordinate = horizontal ? start.y : start.x;
    const key = `${horizontal}:${coordinate}`;
    if (!lines.has(key)) lines.set(key, { horizontal, coordinate, ranges: [] });
    const values = horizontal ? [start.x, end.x] : [start.y, end.y];
    lines.get(key)!.ranges.push([Math.min(...values), Math.max(...values)]);
  }
  return [...lines.values()].flatMap(({ horizontal, coordinate, ranges }) => {
    const merged: [number, number][] = [];
    for (const range of ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      if (merged.length && range[0] <= merged.at(-1)![1]) merged.at(-1)![1] = Math.max(merged.at(-1)![1], range[1]);
      else merged.push([...range]);
    }
    return merged.filter(([a, b]) => a !== b).map(([a, b]) => horizontal
      ? { start: { x: a, y: coordinate }, end: { x: b, y: coordinate } }
      : { start: { x: coordinate, y: a }, end: { x: coordinate, y: b } });
  });
}

/** Whole-branch placement with coordinated ancestry corridors. Full-tree
 * preparation admits it only after comparing complete, validated routed plans.
 * By default every undirected component must be a tree. An optional scaffold
 * orders cyclic components for placement, then explicitly restores every edge;
 * it is only a candidate, never a crossing-free guarantee. Logical generations stay intact.
 * The caller supplies the label state to reserve (the worker reserves role space).
 */
export function directedFamilyCorridors(layout: TreeLayout, scaffold?: { prefer: "parents" | "children"; reverse: boolean }, reconnectingLoops = false): TreeLayout | undefined {
  const personIds = new Set(layout.people.map((person) => person.id));
  if (!personIds.size || personIds.size !== layout.people.length || layout.relationships.some((edge) =>
    !personIds.has(edge.fromPersonId) || !personIds.has(edge.toPersonId) || edge.fromPersonId === edge.toPersonId)) return undefined;
  const nodes: Node[] = layout.people.map((person) => ({ id: `person:${person.id}`, person, incoming: [], outgoing: [] }));
  const byId = new Map(nodes.map((node) => [node.person!.id, node]));
  const groups = parentConnectionGroups(layout.relationships);
  const allGroups = groups.map((group) => ({ id: group.id, parents: group.parentIds, children: group.childIds }));
  for (const edge of layout.relationships.filter((edge) => edge.kind === "partner")) {
    if (groups.some((group) => group.parentIds.includes(edge.fromPersonId) && group.parentIds.includes(edge.toPersonId))) continue;
    allGroups.push({ id: `union:${edge.id}`, parents: [edge.fromPersonId, edge.toPersonId], children: [] });
  }
  const edges: Edge[] = [];
  const connect = (from: Node, to: Node, familyId: string) => {
    const edge = { id: `${from.id} -> ${to.id}`, familyId, from, to };
    edges.push(edge); from.outgoing.push(edge); to.incoming.push(edge);
  };
  for (const group of allGroups) {
    const node: Node = { id: `family:${group.id}`, incoming: [], outgoing: [] }; nodes.push(node);
    for (const id of group.parents) connect(byId.get(id)!, node, group.id);
    for (const id of group.children) connect(node, byId.get(id)!, group.id);
  }
  const placementEdges = new Set(edges);
  const loops = reconnectingLoops ? familyCycleBlocks(nodes, edges) : [];
  const blockOrders = new Map<Edge[], NonNullable<ReturnType<typeof familyBlockOrder<Node, Edge>>>>();
  if (reconnectingLoops && (!loops.length || loops.some((block) => {
    const members = [...new Set(block.flatMap((edge) => [edge.from, edge.to]))];
    const sources = members.filter((node) => !block.some((edge) => edge.to === node));
    const sinks = members.filter((node) => !block.some((edge) => edge.from === node));
    // Shared parent-set blocks have their own compact placement policy.
    // This builder handles reconnections that end at family unions.
    if (sinks.some((node) => node.person)) return true;
    const degrees = members.map((node) => block.filter((edge) => edge.from === node || edge.to === node).length);
    if (degrees.some((degree) => degree !== 2)) {
      // Two loops can share a recorded ancestry path. Keep the whole block,
      // rather than cutting one of its marriages out to obtain a tree.
      if (block.length !== members.length + 1 || degrees.filter((degree) => degree === 3).length !== 2 ||
          degrees.some((degree) => degree !== 2 && degree !== 3)) return true;
      const order = familyBlockOrder(members, block);
      if (!order) return true;
      blockOrders.set(block, order);
      return false;
    }
    const reconvergingAncestry = sources.length === 1 && sinks.length === 1;
    const siblingPairs = block.length === 8 && members.length === 8 && sources.length === 2 && sinks.length === 2 &&
      sources.every((node) => !node.person) && members.filter((node) => node.person).length === 4;
    if (reconvergingAncestry || siblingPairs) return false;
    // Marriages may reconnect in-law branches at different ancestry depths.
    // Their longer simple cycle has several origins, so neither the two-arm
    // ancestry layout nor the adjacent sibling-pair layout describes it.
    const order = familyBlockOrder(members, block);
    if (!order) return true;
    blockOrders.set(block, order);
    return false;
  }))) return undefined;
  if (scaffold) {
    const parents = new Map(nodes.map((node) => [node, node]));
    const root = (node: Node): Node => {
      const parent = parents.get(node)!;
      if (parent === node) return node;
      const found = root(parent); parents.set(node, found); return found;
    };
    for (const edge of [...edges].sort((a, b) => (Number(Boolean(b.to.person)) - Number(Boolean(a.to.person))) * (scaffold.prefer === "children" ? 1 : -1) ||
      compare(a.id, b.id) * (scaffold.reverse ? -1 : 1))) {
      const a = root(edge.from), b = root(edge.to);
      if (a === b) placementEdges.delete(edge);
      else parents.set(a, b);
    }
    if (placementEdges.size === edges.length) return undefined;
  }
  const neighbors = (node: Node) => [...node.incoming, ...node.outgoing].filter((edge) => placementEdges.has(edge));
  const other = (edge: Edge, node: Node) => edge.from === node ? edge.to : edge.from;
  const visited = new Set<Node>(), positions = new Map<Node, RoutePoint>(), paths = new Map<Edge, RoutePoint[]>();
  const arrivals = new Map<Node, Edge | undefined>();
  const reserved = new Set(loops.flat());
  const consumed = new Set<Edge[]>(), excluded = new Set<Edge>();
  const arcOrder = new Map<Edge, number>();
  for (const order of blockOrders.values()) for (const [edge, arc] of order.arcs) {
    // Left outer arcs use the leftmost sockets; right outer arcs use the
    // rightmost. External branches retain the remaining sockets to the right.
    arcOrder.set(edge, arc.side * 100 + arc.side * arc.span);
  }
  const socket = (node: Node, edge: Edge, previous?: Edge) => {
    if (!node.person) return { x: 0, y: 0 };
    const incoming = edge.to === node;
    const side = [...(incoming ? node.incoming : node.outgoing)].sort((a, b) =>
      Number(reserved.has(b)) - Number(reserved.has(a)) || Number(b === previous) - Number(a === previous) ||
      (arcOrder.get(a) ?? 0) - (arcOrder.get(b) ?? 0) || compare(a.id, b.id));
    const offset = side.length === 1 ? 0 : (side.indexOf(edge) - (side.length - 1) / 2) * (incoming ? 48 : 128) / (side.length - 1);
    return { x: offset, y: incoming ? -Math.sqrt(32 ** 2 - offset ** 2) : parentPortY({ ...node.person, y: 0 }) };
  };
  let cursor = 0;
  const place = (node: Node, previous?: Edge): Drawing => {
    const loop = loops.find((block) => !consumed.has(block) && block.some((edge) => edge.from === node || edge.to === node));
    if (loop) return placeLoop(loop, node, previous);
    arrivals.set(node, previous);
    const body = node.person ? { minX: -130, maxX: 130, minY: -32,
      maxY: parentPortY({ ...node.person, y: 0 }) + 24 } : { minX: -16, maxX: 16, minY: -16, maxY: 16 };
    const bounds = { ...body };
    const positions = new Map<Node, RoutePoint>([[node, { x: 0, y: 0 }]]), paths = new Map<Edge, RoutePoint[]>();
    const ordered = (side: Edge[]) => [...side].sort((a, b) => Number(b === previous) - Number(a === previous) || compare(a.id, b.id));
    const parentPort = previous ? socket(node, previous, previous) : undefined;
    for (const sign of [-1, 1]) {
      const side = ordered(sign < 0 ? node.incoming : node.outgoing).filter((edge) => edge !== previous && placementEdges.has(edge) && !excluded.has(edge));
      // Each outgoing household also carries a parallel marriage line.
      // Reserve room on both sides of its brown parent path, not one 32px
      // lane that two 20px marriage offsets can cross inside.
      const laneSpacing = node.person && sign > 0 ? 64 : 32;
      let nextX = body.maxX + 200;
      side.forEach((edge, index) => {
        const branch = place(other(edge, node), edge);
        const dx = nextX - branch.bounds.minX;
        const dy = sign < 0 ? body.minY - 96 - side.length * laneSpacing - branch.bounds.maxY
          : body.maxY + 96 + side.length * laneSpacing - branch.bounds.minY;
        const shift = (point: RoutePoint) => ({ x: point.x + dx, y: point.y + dy });
        for (const [node, point] of branch.positions) positions.set(node, shift(point));
        for (const [edge, points] of branch.paths) paths.set(edge, points.map(shift));
        const start = socket(node, edge, previous), end = shift(branch.parentPort!);
        // Branches of the same family intentionally share their rail. Only
        // different families incident on a real person need separate lanes.
        const lane = node.person ? (side.length - 1 - index) * laneSpacing : 0;
        const railY = sign < 0 ? body.minY - 32 - lane : body.maxY + 32 + lane;
        const route = [start, { x: start.x, y: railY }, { x: end.x, y: railY }, end];
        paths.set(edge, edge.from === node ? route : route.reverse());
        bounds.minX = Math.min(bounds.minX, branch.bounds.minX + dx);
        bounds.maxX = Math.max(bounds.maxX, branch.bounds.maxX + dx);
        bounds.minY = Math.min(bounds.minY, branch.bounds.minY + dy);
        bounds.maxY = Math.max(bounds.maxY, branch.bounds.maxY + dy);
        nextX = branch.bounds.maxX + dx + 200;
      });
    }
    return { positions, paths, bounds, parentPort };
  };
  const placeLoop = (block: Edge[], entry: Node, previous?: Edge): Drawing => {
    consumed.add(block); block.forEach((edge) => excluded.add(edge));
    const members = [...new Set(block.flatMap((edge) => [edge.from, edge.to]))];
    const sources = members.filter((node) => !block.some((edge) => edge.to === node)).sort((a, b) => compare(a.id, b.id));
    // A child outside this block must leave its own household below the
    // complete loop, not through a later sibling household in the next row.
    // A containing loop may own that child edge instead of `previous`.
    const downwardExit = previous?.from === entry || entry.outgoing.some((edge) => excluded.has(edge) && !block.includes(edge));
    const sinks = members.filter((node) => !block.some((edge) => edge.from === node)).sort((a, b) =>
      Number(a === entry && downwardExit) - Number(b === entry && downwardExit) || compare(a.id, b.id));
    const pairedBranches: { edge: Edge; anchor: Edge }[] = [];
    if (blockOrders.has(block)) for (const family of members.filter((node) => !node.person)) {
      const internal = block.filter((edge) => edge.to === family && edge.from.person);
      if (internal.length !== 1) continue;
      const anchor = internal[0];
      for (const edge of family.incoming) {
        if (block.includes(edge) || excluded.has(edge) || edge === previous || !edge.from.person) continue;
        const partners = layout.relationships.some((record) => record.kind === "partner" &&
          [record.fromPersonId, record.toPersonId].includes(anchor.from.person!.id) &&
          [record.fromPersonId, record.toPersonId].includes(edge.from.person!.id));
        const sharedStepPath = partners && layout.relationships.some((record) => record.subtype === "stepParent" &&
          [anchor.from.person!.id, edge.from.person!.id].includes(record.fromPersonId) &&
          layout.relationships.some((parent) => parent.kind === "parent" && parent.subtype !== "stepParent" &&
            parent.toPersonId === record.toPersonId && parent.fromPersonId !== record.fromPersonId &&
            [anchor.from.person!.id, edge.from.person!.id].includes(parent.fromPersonId)));
        if (!sharedStepPath) continue;
        pairedBranches.push({ edge, anchor }); excluded.add(edge);
      }
    }
    const drawings = new Map(members.map((node) => [node, place(node, node === entry ? previous : undefined)]));
    const pairedPorts = new Map<Edge, RoutePoint>();
    // Keep a spouse's complete outside household beside the partner who is
    // inside the loop. Putting that spouse above a much later family junction
    // can leave either step-parent below the other's earlier children.
    for (const { edge, anchor } of pairedBranches) {
      const household = drawings.get(anchor.from)!, spouse = place(edge.from, edge);
      const dx = household.bounds.maxX + 320 - spouse.bounds.minX;
      const shift = (point: RoutePoint) => ({ x: point.x + dx, y: point.y });
      pairedPorts.set(edge, shift(spouse.parentPort!));
      for (const [node, point] of spouse.positions) household.positions.set(node, shift(point));
      for (const [edge, points] of spouse.paths) household.paths.set(edge, points.map(shift));
      household.bounds.minY = Math.min(household.bounds.minY, spouse.bounds.minY);
      household.bounds.maxY = Math.max(household.bounds.maxY, spouse.bounds.maxY);
      household.bounds.maxX = spouse.bounds.maxX + dx;
    }
    const result: Drawing = { positions: new Map(), paths: new Map(), bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } };
    const insert = (drawing: Drawing, dx: number, dy: number, mirror = false) => {
      const shift = (point: RoutePoint) => ({ x: (mirror ? -point.x : point.x) + dx, y: point.y + dy });
      if (drawing.positions.has(entry) && drawing.parentPort) result.parentPort = shift(drawing.parentPort);
      for (const [node, point] of drawing.positions) result.positions.set(node, shift(point));
      for (const [edge, path] of drawing.paths) result.paths.set(edge, path.map(shift));
      result.bounds.minX = Math.min(result.bounds.minX, (mirror ? -drawing.bounds.maxX : drawing.bounds.minX) + dx);
      result.bounds.maxX = Math.max(result.bounds.maxX, (mirror ? -drawing.bounds.minX : drawing.bounds.maxX) + dx);
      result.bounds.minY = Math.min(result.bounds.minY, drawing.bounds.minY + dy);
      result.bounds.maxY = Math.max(result.bounds.maxY, drawing.bounds.maxY + dy);
    };
    const blockOrder = blockOrders.get(block);
    if (blockOrder) {
      // Separate complete attached households into vertical regions. The
      // certified non-interleaving arcs run outside every region, on two
      // different sides. Length is preferable to an ambiguous crossing.
      const maxDegree = Math.max(...members.map((node) => block.filter((edge) => edge.from === node || edge.to === node).length));
      const gap = (maxDegree + 1) * 192 + 160;
      let top = 0;
      const shifts = new Map<Node, number>();
      for (const node of blockOrder.nodes) {
        const drawing = drawings.get(node)!, dy = top - drawing.bounds.minY;
        insert(drawing, 0, dy); shifts.set(node, dy);
        top = drawing.bounds.maxY + dy + gap;
      }
      const inner = { ...result.bounds };
      const port = (node: Node, edge: Edge) => {
        const position = result.positions.get(node)!, offset = socket(node, edge, node === entry ? previous : undefined);
        return { x: position.x + offset.x, y: position.y + offset.y };
      };
      const rank = (node: Node, edge: Edge) => {
        const arc = blockOrder.arcs.get(edge)!;
        return block.filter((other) => other !== edge && (other.from === node && edge.from === node || other.to === node && edge.to === node) &&
          blockOrder.arcs.get(other)!.side === arc.side && blockOrder.arcs.get(other)!.span > arc.span).length;
      };
      for (const [edge, arc] of blockOrder.arcs) {
        const start = port(edge.from, edge), end = port(edge.to, edge);
        const startY = shifts.get(edge.from)! + drawings.get(edge.from)!.bounds.maxY + 96 + rank(edge.from, edge) * 96;
        const endY = shifts.get(edge.to)! + drawings.get(edge.to)!.bounds.minY - 96 - rank(edge.to, edge) * 96;
        const railX = (arc.side < 0 ? inner.minX : inner.maxX) + arc.side * (160 + arc.span * 80);
        const path = [start, { x: start.x, y: startY }, { x: railX, y: startY },
          { x: railX, y: endY }, { x: end.x, y: endY }, end];
        result.paths.set(edge, path);
        for (const point of path) {
          result.bounds.minX = Math.min(result.bounds.minX, point.x - 32);
          result.bounds.maxX = Math.max(result.bounds.maxX, point.x + 32);
          result.bounds.minY = Math.min(result.bounds.minY, point.y - 32);
          result.bounds.maxY = Math.max(result.bounds.maxY, point.y + 32);
        }
      }
      for (const { edge, anchor } of pairedBranches) {
        const position = result.positions.get(anchor.from)!, offset = pairedPorts.get(edge)!;
        const start = { x: position.x + offset.x, y: position.y + offset.y }, mainPath = result.paths.get(anchor)!;
        // Both parents intentionally share this family's rail; their other
        // unions retain their own paths and typed descendant connections.
        result.paths.set(edge, [start, { x: start.x, y: mainPath[1].y }, ...mainPath.slice(1)]);
      }
    } else if (sources.length === 1) {
      // Two recorded ancestry paths reconverge at a later union (for example,
      // adult cousins). Keep the paths on opposite sides, with every attached
      // household facing outward and the shared descendants below both arms.
      const source = sources[0], sink = sinks[0], sourceDrawing = drawings.get(source)!;
      const placements = new Map<Node, { x: number; y: number; mirror: boolean }>();
      const add = (node: Node, x: number, y: number, mirror = false) => {
        insert(drawings.get(node)!, x, y, mirror); placements.set(node, { x, y, mirror });
      };
      add(source, 0, 0);
      const arms = block.filter((edge) => edge.from === source).sort((a, b) => compare(a.id, b.id)).map((first) => {
        const path = [first];
        while (path.at(-1)!.to !== sink) path.push(block.find((edge) => edge.from === path.at(-1)!.to)!);
        return path;
      });
      for (const [side, arm] of arms.entries()) {
        let nextY = sourceDrawing.bounds.maxY + 160;
        for (const edge of arm.slice(0, -1)) {
          const node = edge.to, drawing = drawings.get(node)!, dy = nextY - drawing.bounds.minY;
          add(node, side ? 320 : -320, dy, !side);
          nextY = drawing.bounds.maxY + dy + 160;
        }
      }
      const sinkDrawing = drawings.get(sink)!, sinkTop = result.bounds.maxY + 160;
      add(sink, 0, sinkTop - sinkDrawing.bounds.minY);
      const port = (node: Node, edge: Edge) => {
        const position = result.positions.get(node)!, offset = socket(node, edge, node === entry ? previous : undefined);
        return { x: position.x + (placements.get(node)!.mirror ? -offset.x : offset.x), y: position.y + offset.y };
      };
      for (const arm of arms) for (const edge of arm) {
        const start = port(edge.from, edge), end = port(edge.to, edge);
        const railY = edge.to === sink ? sinkTop - 80
          : placements.get(edge.from)!.y + drawings.get(edge.from)!.bounds.maxY + 80;
        result.paths.set(edge, [start, { x: start.x, y: railY }, { x: end.x, y: railY }, end]);
      }
    } else {
      // Each married sibling pair keeps its complete attached branches in one
      // row. Their shared descendants get a separate region below that row.
      const attachments = new Map<Edge, RoutePoint>();
      let rowY = 0;
      for (const sink of sinks) {
        const pair = sources.map((source) => block.find((edge) => edge.from === source &&
          block.some((other) => other.from === edge.to && other.to === sink))!.to);
        const left = drawings.get(pair[0])!, right = drawings.get(pair[1])!;
        const dy = rowY - Math.min(left.bounds.minY, right.bounds.minY);
        const rightX = left.bounds.maxX + right.bounds.maxX + 400;
        insert(left, 0, dy); insert(right, rightX, dy, true);
        const joinY = Math.max(left.bounds.maxY, right.bounds.maxY) + dy + 160;
        const descendants = drawings.get(sink)!;
        insert(descendants, rightX / 2, joinY - descendants.positions.get(sink)!.y);
        pair.forEach((person, index) => {
          const position = result.positions.get(person)!;
          const incoming = block.find((edge) => edge.to === person)!;
          const outgoing = block.find((edge) => edge.from === person)!;
          const port = (edge: Edge) => {
            const offset = socket(person, edge, person === entry ? previous : undefined);
            return { x: position.x + (index ? -offset.x : offset.x), y: position.y + offset.y };
          };
          const start = port(outgoing), end = result.positions.get(sink)!;
          result.paths.set(outgoing, [start, { x: start.x, y: end.y }, end]);
          attachments.set(incoming, port(incoming));
        });
        rowY = result.bounds.maxY + 320;
      }
      // Both origin families sit outside the entire enclosed set of households.
      // Their rails never cut through a later sibling's descendant region.
      const inner = { ...result.bounds };
      sources.forEach((source, index) => {
        const drawing = drawings.get(source)!;
        const dx = index ? inner.maxX + 320 + drawing.bounds.maxX : inner.minX - 320 - drawing.bounds.maxX;
        const dy = inner.minY - 320 - drawing.bounds.maxY;
        insert(drawing, dx, dy, Boolean(index));
        const start = result.positions.get(source)!;
        const railX = index ? inner.maxX + 160 : inner.minX - 160;
        const joinY = inner.minY - 160;
        for (const edge of block.filter((edge) => edge.from === source)) {
          const end = attachments.get(edge)!;
          const personDrawing = drawings.get(edge.to)!;
          const personPosition = result.positions.get(edge.to)!;
          const railY = personPosition.y - personDrawing.positions.get(edge.to)!.y + personDrawing.bounds.minY - 112;
          result.paths.set(edge, [start, { x: start.x, y: joinY }, { x: railX, y: joinY },
            { x: railX, y: railY }, { x: end.x, y: railY }, end]);
        }
      });
    }
    // Normalize around the attachment node so an enclosing branch can keep
    // using its exact original socket. No person is duplicated at block joins.
    const anchor = result.positions.get(entry)!;
    for (const [node, point] of result.positions) result.positions.set(node, { x: point.x - anchor.x, y: point.y - anchor.y });
    for (const [edge, path] of result.paths) result.paths.set(edge, path.map((point) => ({ x: point.x - anchor.x, y: point.y - anchor.y })));
    result.bounds = { minX: result.bounds.minX - anchor.x, maxX: result.bounds.maxX - anchor.x,
      minY: result.bounds.minY - anchor.y, maxY: result.bounds.maxY - anchor.y };
    if (result.parentPort) result.parentPort = { x: result.parentPort.x - anchor.x, y: result.parentPort.y - anchor.y };
    return result;
  };
  for (const start of [...nodes].sort((a, b) => compare(a.id, b.id))) {
    if (visited.has(start)) continue;
    const component = [start]; visited.add(start);
    for (let i = 0; i < component.length; i++) for (const edge of neighbors(component[i])) {
      const next = other(edge, component[i]);
      if (!visited.has(next)) { visited.add(next); component.push(next); }
    }
    if (!reconnectingLoops && component.reduce((sum, node) => sum + neighbors(node).length, 0) !== 2 * (component.length - 1)) return undefined;
    const branchWeight = (node: Node, previous: Node): number => Number(Boolean(node.person)) + neighbors(node)
      .map((edge) => other(edge, node)).filter((next) => next !== previous).reduce((sum, next) => sum + branchWeight(next, node), 0);
    const score = (node: Node) => Math.max(0, ...neighbors(node).map((edge) => branchWeight(other(edge, node), node)));
    const balancedScore = (node: Node) => {
      const seen = new Set([node]);
      let maximum = 0;
      for (const edge of neighbors(node)) {
        const first = other(edge, node);
        if (seen.has(first)) continue;
        const queue = [first]; seen.add(first);
        let weight = 0;
        for (let i = 0; i < queue.length; i++) {
          weight += Number(Boolean(queue[i].person));
          for (const nextEdge of neighbors(queue[i])) {
            const next = other(nextEdge, queue[i]);
            if (!seen.has(next)) { seen.add(next); queue.push(next); }
          }
        }
        maximum = Math.max(maximum, weight);
      }
      return maximum;
    };
    const descendantCount = (node: Node) => {
      const reached = new Set([node]), queue = [node];
      for (let i = 0; i < queue.length; i++) for (const edge of queue[i].outgoing) if (!reached.has(edge.to)) {
        reached.add(edge.to); queue.push(edge.to);
      }
      return queue.filter((member) => member.person).length;
    };
    // Start at the broad recorded ancestry, not whichever newly added carer's
    // identifier sorts first. Care branches remain complete outside the loop.
    const reconvergingMembers = new Set(loops.filter((block) => block.some((edge) => component.includes(edge.from)) &&
      (blockOrders.has(block) || new Set(block.map((edge) => edge.from).filter((node) => !block.some((edge) => edge.to === node))).size === 1))
      .flatMap((block) => block.flatMap((edge) => [edge.from, edge.to])));
    const roots = component.map((node) => ({ node, score: reconnectingLoops
      ? reconvergingMembers.size ? reconvergingMembers.has(node) ? balancedScore(node) : Infinity
        : node.incoming.length ? Infinity : -descendantCount(node) : score(node) }));
    roots.sort((a, b) => a.score - b.score || Number(Boolean(a.node.person)) - Number(Boolean(b.node.person)) || compare(a.node.id, b.node.id));
    const drawing = place(roots[0].node);
    const dx = cursor - drawing.bounds.minX, dy = -drawing.bounds.minY;
    const shift = (point: RoutePoint) => ({ x: point.x + dx, y: point.y + dy });
    for (const [node, point] of drawing.positions) positions.set(node, shift(point));
    for (const [edge, points] of drawing.paths) paths.set(edge, points.map(shift));
    cursor += drawing.bounds.maxX - drawing.bounds.minX + 400;
  }
  // A spanning tree is only a placement scaffold. Reconnecting family edges
  // are restored explicitly before the final plan's completeness admission.
  for (const edge of edges) if (!paths.has(edge)) {
    const port = (node: Node) => {
      const center = positions.get(node)!, offset = socket(node, edge, arrivals.get(node));
      return { x: center.x + offset.x, y: center.y + offset.y };
    };
    const start = port(edge.from), end = port(edge.to);
    const railY = edge.from.person ? start.y + 64 : end.y - 112;
    paths.set(edge, [start, { x: start.x, y: railY }, { x: end.x, y: railY }, end]);
  }
  const people = layout.people.map((person) => ({ ...person, ...positions.get(byId.get(person.id)!)! }));
  // A reconnection can contradict the scaffold's physical generation order.
  // Reject it before routing; a visually upside-down parent is not a repair.
  if ((scaffold || reconnectingLoops) && layout.relationships.some((edge) => edge.kind === "parent" &&
      positions.get(byId.get(edge.fromPersonId)!)!.y >= positions.get(byId.get(edge.toPersonId)!)!.y)) return undefined;
  const geometry: NonNullable<TreeLayout["familyRouteGeometry"]> = {};
  for (const group of groups) {
    const relevant = edges.filter((edge) => edge.familyId === group.id);
    const parentPorts = Object.fromEntries(relevant.filter((edge) => edge.from.person).map((edge) => [edge.from.person!.id, paths.get(edge)![0]]));
    const childPorts = Object.fromEntries(relevant.filter((edge) => edge.to.person).map((edge) => [edge.to.person!.id, paths.get(edge)!.at(-1)!]));
    geometry[group.id] = { parentPorts, childPorts, segments: mergeCorridorSegments(relevant.flatMap((edge) => segmentsForPoints(paths.get(edge)!))) };
  }
  const candidateRoutes: NonNullable<TreeLayout["partnerRouteCandidates"]> = {};
  const pointKey = (p: RoutePoint) => `${p.x}:${p.y}`;
  for (const relationship of layout.relationships.filter((edge) => edge.kind === "partner")) {
    const group = allGroups.find((group) => group.parents.length === 2 && group.parents.includes(relationship.fromPersonId) && group.parents.includes(relationship.toPersonId));
    if (!group) continue;
    const familyEdges = edges.filter((edge) => edge.familyId === group.id);
    const network = splitAtAttachmentPoints(mergeCorridorSegments(familyEdges.flatMap((edge) => segmentsForPoints(paths.get(edge)!))));
    const start = paths.get(familyEdges.find((edge) => edge.from.person?.id === relationship.fromPersonId)!)![0];
    const end = paths.get(familyEdges.find((edge) => edge.from.person?.id === relationship.toPersonId)!)![0];
    const links = new Map<string, RoutePoint[]>();
    for (const { start, end } of network) for (const [a, b] of [[start, end], [end, start]]) {
      const key = pointKey(a); if (!links.has(key)) links.set(key, []); links.get(key)!.push(b);
    }
    const previous = new Map<string, RoutePoint>(), queue = [start], seen = new Set([pointKey(start)]);
    for (let i = 0; i < queue.length && !seen.has(pointKey(end)); i++) for (const next of links.get(pointKey(queue[i])) ?? []) {
      if (seen.has(pointKey(next))) continue;
      seen.add(pointKey(next)); previous.set(pointKey(next), queue[i]); queue.push(next);
    }
    if (!seen.has(pointKey(end))) continue;
    const path = [end];
    while (pointKey(path[0]) !== pointKey(start)) path.unshift(previous.get(pointKey(path[0]))!);
    const simplified = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const [a, b, c] = [path[i - 1], path[i], path[i + 1]];
      if (!(a.x === b.x && b.x === c.x || a.y === b.y && b.y === c.y)) simplified.push(b);
    }
    simplified.push(end);
    const candidates: RouteSegment[][] = [];
    for (const offset of [-12, 12, -20, 20]) {
      const segments = segmentsForPoints(simplified);
      const shifted = segments.map(({ start, end }) => {
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const dx = -(end.y - start.y) / length * offset, dy = (end.x - start.x) / length * offset;
        return { start: { x: start.x + dx, y: start.y + dy }, end: { x: end.x + dx, y: end.y + dy } };
      });
      const points = [shifted[0].start];
      for (let i = 1; i < shifted.length; i++) {
        const a = shifted[i - 1], b = shifted[i];
        points.push(a.start.x === a.end.x ? { x: a.start.x, y: b.start.y } : { x: b.start.x, y: a.start.y });
      }
      points.push(shifted.at(-1)!.end);
      candidates.push(segmentsForPoints(points));
    }
    candidateRoutes[relationship.id] = candidates;
  }
  // Do not retain the incumbent layout's bounds or inset-rail coordinates.
  // These coordinates start at a fresh origin; the final plan derives bounds
  // from its actual people, labels and routed lines.
  return { people, relationships: layout.relationships, familyRouteGeometry: geometry, partnerRouteCandidates: candidateRoutes,
    width: Math.max(...people.map((person) => person.x)) + 130, height: Math.max(...people.map((person) => person.y)) + 200 };
}

/** Compose sibling-pair marriages and reconverging ancestry as complete blocks inside the
 * surrounding ancestry, union and care branches. Unsupported cycle shapes
 * decline the candidate; no recorded edge is removed to make them fit. */
export const reconnectingFamilyCorridors = (layout: TreeLayout) => directedFamilyCorridors(layout, undefined, true);
