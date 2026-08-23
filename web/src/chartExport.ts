import { createConnectionPlan, type ConnectionPlan } from "./connectionPlan";
import {
  CONNECTOR_STYLE,
  branchJunctions,
  connectorPaths,
  crossingBridgePath,
  roundedConnectorPath
} from "./connectorStyle";
import { personCityTop, personLifeTop } from "./connectionGeometry";
import { LAYOUT_METRICS } from "./layout";
import { personCitySummary, personLifeSummary } from "./lifeSummary";
import { isValidAvatarImage } from "./avatar";
import { BIRTH_ORDER_BADGE, birthOrderLabel } from "./birthOrder";
import { personAvatarAppearance } from "./personAvatarAppearance";
import {
  formatPersonName,
  PERSON_NAME_FONT_SIZE,
  PERSON_NAME_LINE_HEIGHT
} from "./personName";
import {
  DEFAULT_EXPORT_PRIVACY_SELECTION,
  type ExportPrivacySelection
} from "./exportPrivacy";
import type { AppData, PositionedPerson, TreeLayout } from "./types";

const PADDING = 56;
const FOOTER_HEIGHT = 52;
const PNG_TARGET_SCALE = 2;
const PNG_MAX_DIMENSION = 16_384;
const PNG_MAX_PIXELS = 64 * 1024 * 1024;

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

const connectorColor = (kind: "parent" | "partner" | "sibling") =>
  kind === "parent" ? CONNECTOR_STYLE.familyColor :
    kind === "partner" ? CONNECTOR_STYLE.partnerColor : CONNECTOR_STYLE.siblingColor;

const svgConnector = (
  points: Parameters<typeof roundedConnectorPath>[0],
  offsetX: number,
  offsetY: number,
  metadata: string,
  color: string,
  width: number,
  dashed = false
) => `<path d="${roundedConnectorPath(points, offsetX, offsetY)}" ${metadata} fill="none" stroke="${color}" stroke-width="${width}" ${dashed ? `stroke-dasharray="${CONNECTOR_STYLE.siblingDash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>`;

const personNode = (
  person: PositionedPerson,
  offsetX: number,
  offsetY: number,
  selectedPersonId: string | undefined,
  language: AppData["language"],
  privacy: ExportPrivacySelection
) => {
  const avatarX = person.x + offsetX;
  const avatarY = person.y + offsetY;
  const selected = person.id === selectedPersonId;
  const appearance = personAvatarAppearance(person.gender);
  const showRole = Boolean(selectedPersonId && person.role);
  const clipId = `photo-${person.id.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const innerRadius = LAYOUT_METRICS.innerAvatarDiameter / 2;
  const name = formatPersonName(person.displayName);
  const avatar = privacy.photos && isValidAvatarImage(person.photoDataUrl)
    ? `<defs><clipPath id="${clipId}"><circle cx="${avatarX}" cy="${avatarY}" r="${innerRadius}"/></clipPath></defs><image href="${escapeXml(person.photoDataUrl!)}" x="${avatarX - innerRadius}" y="${avatarY - innerRadius}" width="${LAYOUT_METRICS.innerAvatarDiameter}" height="${LAYOUT_METRICS.innerAvatarDiameter}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
    : `<circle cx="${avatarX}" cy="${avatarY}" r="${innerRadius}" fill="${appearance.fill}"/><text x="${avatarX}" y="${avatarY + 8}" text-anchor="middle" font-size="24" font-weight="700" fill="#302b25">${escapeXml(person.displayName.charAt(0).toUpperCase() || "?")}</text>`;
  const life = personLifeSummary(person, language, new Date(), {
    showBirthDate: privacy.birthDates,
    showAge: privacy.ages
  });
  const city = personCitySummary(person);
  const birthOrderBadge = privacy.birthDates && person.birthOrder
    ? `<g data-birth-order="${person.birthOrder}"><title>${escapeXml(birthOrderLabel(person.birthOrder, language))}</title><circle cx="${avatarX - BIRTH_ORDER_BADGE.offset}" cy="${avatarY - BIRTH_ORDER_BADGE.offset}" r="${BIRTH_ORDER_BADGE.radius}" fill="#f5f5f3" stroke="${appearance.stroke}" stroke-width="2"/><text x="${avatarX - BIRTH_ORDER_BADGE.offset}" y="${avatarY - BIRTH_ORDER_BADGE.offset + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#302b25">${person.birthOrder}</text></g>`
    : "";
  const nameLines = name.lines.map((line, index) =>
    `<tspan x="${avatarX}" y="${avatarY + LAYOUT_METRICS.labelTop + PERSON_NAME_FONT_SIZE + index * PERSON_NAME_LINE_HEIGHT}">${escapeXml(line)}</tspan>`
  ).join("");
  return `<g data-person-id="${escapeXml(person.id)}" data-gender="${person.gender}">
    <title>${escapeXml(name.fullName)}</title>
    <circle cx="${avatarX}" cy="${avatarY}" r="${LAYOUT_METRICS.avatarRadius}" fill="${appearance.fill}" stroke="${selected ? "#a8875b" : appearance.stroke}" stroke-width="${selected ? 2 : 1}"/>
    ${avatar}
    ${birthOrderBadge}
    <text x="${avatarX}" text-anchor="middle" font-size="${PERSON_NAME_FONT_SIZE}" font-weight="700" fill="#302b25">${nameLines}</text>
    ${showRole ? `<text x="${avatarX}" y="${avatarY + LAYOUT_METRICS.roleTop + name.extraHeight + 13}" text-anchor="middle" font-size="13" fill="${selected ? "#a8875b" : "#796f63"}">${escapeXml(compactText(person.role, 28))}</text>` : ""}
    ${life ? `<text x="${avatarX}" y="${avatarY + personLifeTop(showRole, name.extraHeight) + 12}" text-anchor="middle" font-size="11" fill="#796f63">${escapeXml(life)}</text>` : ""}
    ${city ? `<text x="${avatarX}" y="${avatarY + personCityTop(showRole, Boolean(life), name.extraHeight) + 12}" text-anchor="middle" font-size="11" fill="#796f63">${escapeXml(city)}</text>` : ""}
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
  suppliedPlan?: ConnectionPlan,
  privacy: ExportPrivacySelection = DEFAULT_EXPORT_PRIVACY_SELECTION
): ChartSvg {
  if (!layout.people.length) throw new Error("Add a person before exporting this chart.");
  const exportLayout = privacy.relationshipDates ? layout : {
    ...layout,
    relationships: layout.relationships.map((relationship) => ({
      ...relationship,
      marriageDate: undefined,
      divorceDate: undefined
    }))
  };
  const plan = privacy.relationshipDates && suppliedPlan
    ? suppliedPlan
    : createConnectionPlan(exportLayout, language);
  const minX = plan.bounds.x;
  const maxX = plan.bounds.x + plan.bounds.width;
  const minY = plan.bounds.y;
  const maxY = plan.bounds.y + plan.bounds.height;
  const width = Math.ceil(maxX - minX + PADDING * 2);
  const height = Math.ceil(maxY - minY + PADDING * 2 + FOOTER_HEIGHT);
  const offsetX = -minX + PADDING;
  const offsetY = -minY + PADDING;
  const familyLines = plan.families.flatMap((family) => connectorPaths(family.segments).map((path, index) =>
    svgConnector(
      path.points,
      offsetX,
      offsetY,
      `data-family-id="${escapeXml(family.id)}" data-path-index="${index}" data-segment-indexes="${path.segmentIndexes.join(",")}"`,
      CONNECTOR_STYLE.familyColor,
      CONNECTOR_STYLE.width
    )
  )).join("");
  const relationshipLines = plan.nonParentRoutes.flatMap((route) => connectorPaths(route.segments).map((path, index) =>
    svgConnector(
      path.points,
      offsetX,
      offsetY,
      `data-route-id="${escapeXml(route.id)}" data-path-index="${index}" data-segment-indexes="${path.segmentIndexes.join(",")}"`,
      route.relationship.kind === "partner" ? CONNECTOR_STYLE.partnerColor : CONNECTOR_STYLE.siblingColor,
      CONNECTOR_STYLE.width,
      route.relationship.kind === "sibling"
    )
  )).join("");
  const junctions = plan.families.flatMap((family) => branchJunctions(family.segments).map((point, index) =>
    `<circle cx="${point.x + offsetX}" cy="${point.y + offsetY}" r="${CONNECTOR_STYLE.junctionRadius}" fill="${CONNECTOR_STYLE.familyColor}" data-family-junction="${escapeXml(family.id)}:${index}"/>`
  )).join("");
  const crossings = plan.crossings.map((point, index) =>
    `<g data-crossing-index="${index}"><line x1="${point.x + offsetX}" y1="${point.y + offsetY - CONNECTOR_STYLE.crossingRadius - 5}" x2="${point.x + offsetX}" y2="${point.y + offsetY + CONNECTOR_STYLE.crossingRadius + 5}" stroke="#fffdf8" stroke-width="${CONNECTOR_STYLE.width + 4}" stroke-linecap="butt"/><line x1="${point.x + offsetX - CONNECTOR_STYLE.crossingRadius - 5}" y1="${point.y + offsetY}" x2="${point.x + offsetX + CONNECTOR_STYLE.crossingRadius + 7}" y2="${point.y + offsetY}" stroke="${connectorColor(point.horizontalKind)}" stroke-width="${CONNECTOR_STYLE.width}" ${point.horizontalKind === "sibling" ? `stroke-dasharray="${CONNECTOR_STYLE.siblingDash}"` : ""} stroke-linecap="round"/><path d="${crossingBridgePath(point, offsetX, offsetY)}" fill="none" stroke="#fffdf8" stroke-width="${CONNECTOR_STYLE.width + 4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${crossingBridgePath(point, offsetX, offsetY)}" fill="none" stroke="${connectorColor(point.kind)}" stroke-width="${CONNECTOR_STYLE.width}" ${point.kind === "sibling" ? `stroke-dasharray="${CONNECTOR_STYLE.siblingDash}"` : ""} stroke-linecap="round" stroke-linejoin="round"/></g>`
  ).join("");
  const relationshipLabels = plan.nonParentRoutes.flatMap((route) => route.label ? [
    `<g data-relationship-label="${escapeXml(route.id)}"><rect x="${route.label.rect.x + offsetX}" y="${route.label.rect.y + offsetY}" width="${route.label.rect.width}" height="${route.label.rect.height}" rx="12" fill="#fffdf8"/><text x="${route.label.center.x + offsetX}" y="${route.label.center.y + offsetY + 4}" text-anchor="middle" font-size="12" font-weight="500" fill="#796f63">${escapeXml(route.label.text)}</text></g>`
  ] : []).join("");
  const nodes = layout.people.map((person) =>
    personNode(person, offsetX, offsetY, selectedPersonId, language, privacy)
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

export const pngExportDimensions = (
  chart: Pick<ChartSvg, "width" | "height">
): { width: number; height: number; scale: number } => {
  const dimensionScale = PNG_MAX_DIMENSION / Math.max(chart.width, chart.height);
  const areaScale = Math.sqrt(PNG_MAX_PIXELS / Math.max(1, chart.width * chart.height));
  const scale = Math.min(PNG_TARGET_SCALE, dimensionScale, areaScale);
  return {
    width: Math.max(1, Math.floor(chart.width * scale)),
    height: Math.max(1, Math.floor(chart.height * scale)),
    scale
  };
};

export async function chartSvgToPng(chart: ChartSvg): Promise<Blob> {
  await document.fonts?.ready;
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
    const dimensions = pngExportDimensions(chart);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
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
