import { createConnectionPlan, type ConnectionPlan } from "./connectionPlan";
import type { RouteSegment } from "./connectionGeometry";
import { LAYOUT_METRICS } from "./layout";
import { personLifeSummary } from "./lifeSummary";
import type { AppData, PositionedPerson, TreeLayout } from "./types";

const PADDING = 56;
const FOOTER_HEIGHT = 52;

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const compactText = (value: string, maximum: number) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}...` : normalized;
};

const svgLine = (
  segment: RouteSegment,
  offsetX: number,
  offsetY: number,
  metadata: string,
  color: string,
  width: number,
  dashed = false
) => `<line x1="${segment.start.x + offsetX}" y1="${segment.start.y + offsetY}" x2="${segment.end.x + offsetX}" y2="${segment.end.y + offsetY}" ${metadata} fill="none" stroke="${color}" stroke-width="${width}" ${dashed ? 'stroke-dasharray="7 6"' : ""} stroke-linecap="round" stroke-linejoin="round"/>`;

const nameFontSize = (value: string) =>
  Math.max(9, Math.min(16, Math.floor(320 / Math.max(20, value.length))));

const personNode = (
  person: PositionedPerson,
  offsetX: number,
  offsetY: number,
  selectedPersonId: string | undefined,
  language: AppData["language"]
) => {
  const avatarX = person.x + offsetX;
  const avatarY = person.y + offsetY;
  const selected = person.id === selectedPersonId;
  const clipId = `photo-${person.id.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const innerRadius = LAYOUT_METRICS.innerAvatarDiameter / 2;
  const name = compactText(person.displayName || "Unnamed person", 34);
  const avatar = person.photoDataUrl
    ? `<defs><clipPath id="${clipId}"><circle cx="${avatarX}" cy="${avatarY}" r="${innerRadius}"/></clipPath></defs><image href="${escapeXml(person.photoDataUrl)}" x="${avatarX - innerRadius}" y="${avatarY - innerRadius}" width="${LAYOUT_METRICS.innerAvatarDiameter}" height="${LAYOUT_METRICS.innerAvatarDiameter}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
    : `<circle cx="${avatarX}" cy="${avatarY}" r="${innerRadius}" fill="${selected ? "#f3eadf" : "#ede5d8"}"/><text x="${avatarX}" y="${avatarY + 8}" text-anchor="middle" font-size="24" font-weight="700" fill="#302b25">${escapeXml(person.displayName.charAt(0).toUpperCase() || "?")}</text>`;
  const life = personLifeSummary(person, language);
  return `<g>
    <circle cx="${avatarX}" cy="${avatarY}" r="${LAYOUT_METRICS.avatarRadius}" fill="${selected ? "#f3eadf" : "#fffdf8"}" stroke="${selected ? "#a8875b" : "#d8ccbc"}" stroke-width="${selected ? 2 : 1}"/>
    ${avatar}
    <text x="${avatarX}" y="${avatarY + LAYOUT_METRICS.labelTop + 15}" text-anchor="middle" font-size="${nameFontSize(name)}" font-weight="700" fill="#302b25">${escapeXml(name)}</text>
    <text x="${avatarX}" y="${avatarY + LAYOUT_METRICS.roleTop + 13}" text-anchor="middle" font-size="13" fill="${selected ? "#a8875b" : "#796f63"}">${escapeXml(compactText(person.role, 28))}</text>
    ${life ? `<text x="${avatarX}" y="${avatarY + LAYOUT_METRICS.lifeTop + 12}" text-anchor="middle" font-size="11" fill="#796f63">${escapeXml(life)}</text>` : ""}
  </g>`;
};

export interface ChartSvg {
  svg: string;
  width: number;
  height: number;
}

export function buildChartSvg(
  layout: TreeLayout,
  title: string,
  selectedPersonId?: string,
  language: AppData["language"] = "en",
  suppliedPlan?: ConnectionPlan
): ChartSvg {
  if (!layout.people.length) throw new Error("Add a person before exporting this chart.");
  const plan = suppliedPlan ?? createConnectionPlan(layout, language);
  const minX = plan.bounds.x;
  const maxX = plan.bounds.x + plan.bounds.width;
  const minY = plan.bounds.y;
  const maxY = plan.bounds.y + plan.bounds.height;
  const width = Math.ceil(maxX - minX + PADDING * 2);
  const height = Math.ceil(maxY - minY + PADDING * 2 + FOOTER_HEIGHT);
  const offsetX = -minX + PADDING;
  const offsetY = -minY + PADDING;
  const familyLines = plan.families.flatMap((family) => family.segments.map((segment, index) =>
    svgLine(
      segment,
      offsetX,
      offsetY,
      `data-family-id="${escapeXml(family.id)}" data-segment-index="${index}"`,
      "#a8875b",
      2
    )
  )).join("");
  const relationshipLines = plan.nonParentRoutes.flatMap((route) => route.segments.map((segment, index) =>
    svgLine(
      segment,
      offsetX,
      offsetY,
      `data-route-id="${escapeXml(route.id)}" data-segment-index="${index}"`,
      route.relationship.kind === "partner" ? "#b77972" : "#7e9b63",
      2,
      route.relationship.kind === "sibling"
    )
  )).join("");
  const junctions = plan.families.flatMap((family) => family.junctions.map((point, index) =>
    `<circle cx="${point.x + offsetX}" cy="${point.y + offsetY}" r="3" fill="#a8875b" data-family-junction="${escapeXml(family.id)}:${index}"/>`
  )).join("");
  const crossings = plan.crossings.map((point, index) =>
    `<g data-crossing-index="${index}"><circle cx="${point.x + offsetX}" cy="${point.y + offsetY}" r="4" fill="#fffdf8"/><line x1="${point.x + offsetX}" y1="${point.y + offsetY - 5}" x2="${point.x + offsetX}" y2="${point.y + offsetY + 5}" stroke="${point.kind === "parent" ? "#a8875b" : point.kind === "partner" ? "#b77972" : "#7e9b63"}" stroke-width="2" ${point.kind === "sibling" ? 'stroke-dasharray="4 3"' : ""} stroke-linecap="round"/></g>`
  ).join("");
  const relationshipLabels = plan.nonParentRoutes.flatMap((route) => route.label ? [
    `<g data-relationship-label="${escapeXml(route.id)}"><rect x="${route.label.rect.x + offsetX}" y="${route.label.rect.y + offsetY}" width="${route.label.rect.width}" height="${route.label.rect.height}" rx="12" fill="#fffdf8"/><text x="${route.label.center.x + offsetX}" y="${route.label.center.y + offsetY + 4}" text-anchor="middle" font-size="12" font-weight="500" fill="#796f63">${escapeXml(route.label.text)}</text></g>`
  ] : []).join("");
  const nodes = layout.people.map((person) =>
    personNode(person, offsetX, offsetY, selectedPersonId, language)
  ).join("");
  const exported = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <title>${escapeXml(title)}</title>
    <rect width="100%" height="100%" fill="#fffdf8"/>
    <g font-family="Assistant, Segoe UI, Arial, sans-serif">${familyLines}${relationshipLines}${junctions}${crossings}${relationshipLabels}${nodes}</g>
    <line x1="${PADDING}" x2="${width - PADDING}" y1="${height - FOOTER_HEIGHT}" y2="${height - FOOTER_HEIGHT}" stroke="#ede5d8"/>
    <text x="${width - PADDING}" y="${height - 21}" text-anchor="end" font-family="Assistant, Segoe UI, Arial, sans-serif" font-size="11" fill="#796f63">Heritg · ${escapeXml(exported)}</text>
  </svg>`;
  return { svg, width, height };
}

export async function chartSvgToPng(chart: ChartSvg): Promise<Blob> {
  const source = new Blob([chart.svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The family chart could not be rendered."));
      image.src = url;
    });
    const scale = Math.min(2, 4096 / Math.max(chart.width, chart.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(chart.width * scale));
    canvas.height = Math.max(1, Math.round(chart.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is not available in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")),
      "image/png"
    ));
  } finally {
    URL.revokeObjectURL(url);
  }
}
