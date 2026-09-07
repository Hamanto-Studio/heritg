import { ancestorChartLayout, type AncestorNode } from "./familyExplorers";

export const chartCard = { width: 160, height: 72, column: 184, row: 88, inset: 12 } as const;

/** Reserve a real child generation left of the current person, without overlaps. */
export function familyPedigreeLayout(nodes: AncestorNode[], childIds: string[]) {
  const base = ancestorChartLayout(nodes);
  const baseRoot = base.y.get("root") ?? base.height / 2;
  const halfChildren = Math.max(0, childIds.length - 1) * chartCard.row / 2;
  const top = 40 + Math.max(0, halfChildren + chartCard.height / 2 - baseRoot);
  const rootY = baseRoot + top;
  const y = new Map([...base.y].map(([key, value]) => [key, value + top]));
  const children = childIds.map((id, i) => ({ id, x: chartCard.inset, y: rootY - halfChildren + i * chartCard.row }));
  const height = Math.max(base.height + top, rootY + halfChildren + chartCard.height / 2 + 16);
  const rootX = chartCard.inset + chartCard.column;
  const x = (depth: number) => rootX + depth * chartCard.column;
  return { y, children, rootY, rootX, height, x,
    width: x(Math.max(1, ...nodes.map((node) => node.depth))) + chartCard.width + chartCard.inset };
}

/** Tangential labels fit inside the ring and between its radial boundaries. */
export function fanLabelLayout(node: AncestorNode, cx: number, cy: number) {
  if (!node.depth) return { x: cx, y: cy, rotation: 0, width: 76, height: 56 };
  const inner = 72 + (node.depth - 1) * 78;
  return fanRingLabelLayout(cx, cy, inner, inner + 78, node.start, node.end);
}

export function fanSectorPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number, below = false) {
  const point = (radius: number, position: number) => {
    const angle = Math.PI * (1 + (below ? -position : position));
    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  };
  return `M${point(outer, start)} A${outer},${outer} 0 0 ${below ? 0 : 1} ${point(outer, end)} L${point(inner, end)} A${inner},${inner} 0 0 ${below ? 1 : 0} ${point(inner, start)} Z`;
}

function fanRingLabelLayout(cx: number, cy: number, inner: number, outer: number, start: number, end: number, below = false) {
  const radius = (inner + outer) / 2;
  const height = Math.min(below ? 96 : 56, (outer - inner) * 0.64), halfTextHeight = height / 2;
  const angle = Math.PI * (1 + (below ? -1 : 1) * (start + end) / 2);
  const halfAngle = Math.PI * (end - start) / 2;
  const radialLimit = 2 * Math.sqrt(Math.max(0, (outer - 6) ** 2 - (radius + halfTextHeight) ** 2));
  const angularLimit = 2 * (radius - halfTextHeight) * Math.tan(Math.min(halfAngle, Math.PI / 2 - 0.001));
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle),
    rotation: angle * 180 / Math.PI - (below ? 90 : 270), width: Math.max(0.01, Math.min(180, radialLimit, angularLimit) * 0.9), height };
}

export const fanChildrenPerPage = 4;
export const fanChildFontSize = (renderScale: number) => Math.max(20, 12 / Math.max(0.01, renderScale));
/** One child generation fans down from the same center, never as extra ancestor rings. */
export function fanChildLayout(childIds: string[], requestedPage: number, cx: number, cy: number, ancestorRadius: number) {
  const pageCount = Math.ceil(childIds.length / fanChildrenPerPage);
  const page = Math.max(0, Math.min(Math.trunc(requestedPage) || 0, pageCount - 1));
  const offset = page * fanChildrenPerPage;
  const ids = childIds.slice(offset, offset + fanChildrenPerPage);
  const inner = 72, outer = Math.max(190, ancestorRadius * 0.85);
  return { page, pageCount, offset, outer, children: ids.map((id, i) => {
    const start = i / ids.length, end = (i + 1) / ids.length;
    return { id, start, end, inner, outer,
      path: fanSectorPath(cx, cy, inner, outer, start, end, true),
      label: fanRingLabelLayout(cx, cy, inner, outer, start, end, true) };
  }) };
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** Conservative wrapping plus a shape clip in the renderer; never split a grapheme. */
export function chartLabelLines(label: string, width: number): string[] {
  if (width < 16) return [];
  let remaining = Array.from(graphemes.segment(label.trim().replace(/\s+/g, " ")), (part) => part.segment);
  const lines: string[] = [];
  const advance = (value: string) => /[^\u0000-\u024f]|[MW@]/u.test(value) ? 12 : 7;
  for (let line = 0; line < 2 && remaining.length; line++) {
    let length = 0, used = 0;
    const budget = width - (line === 1 ? 12 : 0);
    while (length < remaining.length && used + advance(remaining[length]) <= budget) used += advance(remaining[length++]);
    if (!length) break;
    if (!line && length < remaining.length) {
      const wordEnd = remaining.slice(0, length + 1).lastIndexOf(" ");
      if (wordEnd > length / 2) length = wordEnd;
    }
    const text = remaining.slice(0, length).join("").trim();
    remaining = remaining.slice(length);
    while (remaining[0] === " ") remaining.shift();
    lines.push(text + (line === 1 && remaining.length ? "…" : ""));
  }
  return lines;
}
