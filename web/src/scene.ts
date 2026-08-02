import {
  FONT_FAMILY,
  ROUNDNESS,
  convertToExcalidrawElements,
  getCommonBounds
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawLinearElement,
  FileId,
  OrderedExcalidrawElement
} from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { circularAvatarData } from "./avatar";
import { createConnectionPlan, type ConnectionPlan } from "./connectionPlan";
import type { PlannedRelationshipLabel, RouteSegment } from "./connectionGeometry";
import { LAYOUT_METRICS } from "./layout";
import { personLifeSummary } from "./lifeSummary";
import type {
  AppData,
  FamilyRelationship,
  PositionedPerson,
  TreeLayout
} from "./types";
export const HERITG_SCENE_COLORS = {
  canvas: "#f5f5f3",
  avatar: "#fffdf8",
  selectedAvatar: "#f3eadf",
  recessed: "#ede5d8",
  text: "#302b25",
  subtleText: "#796f63",
  line: "#d8ccbc",
  brand: "#a8875b",
  partner: "#b77972",
  sibling: "#7e9b63"
} as const;
export type SceneBounds = readonly [
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
];
export interface HeritgExcalidrawScene {
  elements: OrderedExcalidrawElement[];
  files: BinaryFiles;
  appState: { viewBackgroundColor: string };
  contentBounds: SceneBounds;
  bounds: SceneBounds;
}
type LinearPoint = ExcalidrawLinearElement["points"][number];
const linearPoint = (x: number, y: number) => [x, y] as unknown as LinearPoint;
const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
const stableNumber = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 1) || 1;
};
const encodedId = (value: string) => encodeURIComponent(value);
const elementIdentity = (
  id: string,
  link: string,
  customData: Record<string, unknown>,
  groupIds: string[] = []
) => ({
  id,
  seed: stableNumber(id),
  versionNonce: stableNumber(`${id}:version`),
  roughness: 0,
  locked: true,
  link: null,
  customData,
  groupIds
});
const relationshipData = (relationship: FamilyRelationship) => ({
  heritgType: "relationship",
  entityType: "relationship",
  relationshipId: relationship.id,
  relationshipKind: relationship.kind,
  relationshipSubtype: relationship.subtype,
  marriageDate: relationship.marriageDate,
  fromPersonId: relationship.fromPersonId,
  toPersonId: relationship.toPersonId
});
const relationshipColor = (kind: FamilyRelationship["kind"]) =>
  kind === "parent" ? HERITG_SCENE_COLORS.brand :
    kind === "partner" ? HERITG_SCENE_COLORS.partner : HERITG_SCENE_COLORS.sibling;
const personData = (person: PositionedPerson) => ({
  heritgType: "person",
  entityType: "person",
  personId: person.id,
  role: person.role,
  generation: person.generation
});
const segmentSkeleton = (
  segment: RouteSegment,
  id: string,
  strokeColor: string,
  strokeWidth: number,
  strokeStyle: "solid" | "dashed",
  link: string,
  customData: Record<string, unknown>,
  groupIds: string[] = []
): ExcalidrawElementSkeleton => {
  const x = Math.min(segment.start.x, segment.end.x);
  const y = Math.min(segment.start.y, segment.end.y);
  return {
    type: "line",
    x,
    y,
    width: Math.abs(segment.end.x - segment.start.x),
    height: Math.abs(segment.end.y - segment.start.y),
    points: [
      linearPoint(segment.start.x - x, segment.start.y - y),
      linearPoint(segment.end.x - x, segment.end.y - y)
    ],
    ...elementIdentity(id, link, customData, groupIds),
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth,
    strokeStyle,
    roundness: null,
    opacity: 100
  } as ExcalidrawElementSkeleton;
};
const textSkeleton = (
  id: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  color: string,
  link: string,
  customData: Record<string, unknown>,
  groupIds: string[]
): ExcalidrawElementSkeleton =>
  ({
    type: "text",
    text,
    x,
    y,
    width,
    height,
    fontSize,
    fontFamily: FONT_FAMILY.Helvetica,
    textAlign: "left",
    verticalAlign: "top",
    autoResize: false,
    strokeColor: color,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    opacity: 100,
    ...elementIdentity(id, link, customData, groupIds)
  }) as ExcalidrawElementSkeleton;
const nodeName = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, " ") || "Unnamed person";
  return normalized.length > 34 ? `${normalized.slice(0, 31).trimEnd()}...` : normalized;
};
const nodeNameFontSize = (value: string) =>
  Math.max(9, Math.min(16, Math.floor(320 / Math.max(20, value.length))));
const centeredTextX = (text: string, fontSize: number, centerX: number) =>
  centerX - text.length * fontSize * 0.26;
const plannedLabelSkeletons = (
  relationship: FamilyRelationship,
  label: PlannedRelationshipLabel
): ExcalidrawElementSkeleton[] => {
  const key = encodedId(relationship.id);
  const link = `#heritg-relationship=${key}`;
  const data = relationshipData(relationship);
  const groupIds = [`heritg:relationship:${key}:label-group`];
  return [
    {
      type: "rectangle",
      ...label.rect,
      strokeColor: "transparent",
      backgroundColor: HERITG_SCENE_COLORS.canvas,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      opacity: 100,
      ...elementIdentity(
        `heritg:relationship:${key}:label-background`,
        link,
        data,
        groupIds
      )
    } as ExcalidrawElementSkeleton,
    textSkeleton(
      `heritg:relationship:${key}:label`,
      label.text,
      centeredTextX(label.text, 12, label.center.x),
      label.center.y - 8,
      label.rect.width - 14,
      16,
      12,
      HERITG_SCENE_COLORS.subtleText,
      link,
      data,
      groupIds
    )
  ];
};
const personSkeletons = (
  person: PositionedPerson,
  files: BinaryFiles,
  selectedPersonId: string | undefined,
  language: AppData["language"]
): ExcalidrawElementSkeleton[] => {
  const key = encodedId(person.id);
  const groupIds = [`heritg:person:${key}`];
  const link = `#heritg-person=${key}`;
  const data = personData(person);
  const selected = person.id === selectedPersonId;
  const avatarSize = LAYOUT_METRICS.avatarDiameter;
  const innerSize = LAYOUT_METRICS.innerAvatarDiameter;
  const avatarX = person.x - LAYOUT_METRICS.avatarRadius;
  const avatarY = person.y - LAYOUT_METRICS.avatarRadius;
  const innerX = person.x - innerSize / 2;
  const innerY = person.y - innerSize / 2;
  const name = nodeName(person.displayName);
  const values: ExcalidrawElementSkeleton[] = [
    {
      type: "ellipse",
      x: avatarX,
      y: avatarY,
      width: avatarSize,
      height: avatarSize,
      strokeColor: selected ? HERITG_SCENE_COLORS.brand : HERITG_SCENE_COLORS.line,
      backgroundColor: selected
        ? HERITG_SCENE_COLORS.selectedAvatar
        : HERITG_SCENE_COLORS.avatar,
      fillStyle: "solid",
      strokeWidth: selected ? 2 : 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(`heritg:person:${key}:avatar`, link, data, groupIds)
    } as ExcalidrawElementSkeleton
  ];

  const photo = circularAvatarData(person.photoDataUrl, innerSize);
  if (photo) {
    const fileId = `heritg:person:${key}:photo-${stableNumber(photo.dataURL)}` as FileId;
    const created = Date.parse(person.createdAt);
    files[fileId] = {
      id: fileId,
      dataURL: photo.dataURL,
      mimeType: photo.mimeType,
      created: Number.isFinite(created) ? created : 1
    };
    values.push({
      type: "image",
      x: innerX,
      y: innerY,
      width: innerSize,
      height: innerSize,
      fileId,
      status: "saved",
      scale: [1, 1],
      crop: null,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(`heritg:person:${key}:photo`, link, data, groupIds)
    } as ExcalidrawElementSkeleton);
  } else {
    values.push({
      type: "ellipse",
      x: innerX,
      y: innerY,
      width: innerSize,
      height: innerSize,
      strokeColor: "transparent",
      backgroundColor: selected ? HERITG_SCENE_COLORS.selectedAvatar : HERITG_SCENE_COLORS.recessed,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(`heritg:person:${key}:avatar-fill`, link, data, groupIds)
    } as ExcalidrawElementSkeleton);
    values.push(
      {
        ...textSkeleton(
        `heritg:person:${key}:initial`,
        person.displayName.trim().charAt(0).toUpperCase() || "?",
        person.x,
        person.y,
        24,
        28,
        24,
        HERITG_SCENE_COLORS.text,
        link,
        data,
        groupIds
        ),
        textAlign: "center",
        verticalAlign: "middle"
      } as ExcalidrawElementSkeleton
    );
  }

  values.push(
    textSkeleton(
      `heritg:person:${key}:name`,
      name,
      centeredTextX(name, nodeNameFontSize(name), person.x),
      person.y + LAYOUT_METRICS.labelTop,
      LAYOUT_METRICS.labelWidth,
      LAYOUT_METRICS.nameHeight,
      nodeNameFontSize(name),
      HERITG_SCENE_COLORS.text,
      link,
      data,
      groupIds
    ),
    textSkeleton(
      `heritg:person:${key}:role`,
      person.role,
      centeredTextX(person.role, 13, person.x),
      person.y + LAYOUT_METRICS.roleTop,
      LAYOUT_METRICS.labelWidth,
      LAYOUT_METRICS.roleHeight,
      13,
      selected ? HERITG_SCENE_COLORS.brand : HERITG_SCENE_COLORS.subtleText,
      link,
      data,
      groupIds
    )
  );
  const life = personLifeSummary(person, language);
  if (life) {
    values.push(
      textSkeleton(
        `heritg:person:${key}:life`,
        life,
        centeredTextX(life, 11, person.x),
        person.y + LAYOUT_METRICS.lifeTop,
        LAYOUT_METRICS.labelWidth,
        LAYOUT_METRICS.lifeHeight,
        11,
        HERITG_SCENE_COLORS.subtleText,
        link,
        data,
        groupIds
      )
    );
  }
  return values;
};

export function projectLayoutToScene(
  layout: TreeLayout,
  selectedPersonId?: string,
  language: AppData["language"] = "en",
  suppliedPlan?: ConnectionPlan
): HeritgExcalidrawScene {
  const people = [...layout.people].sort(
    (left, right) =>
      left.generation - right.generation ||
      left.y - right.y ||
      left.x - right.x ||
      compareText(left.id, right.id)
  );
  const plan = suppliedPlan ?? createConnectionPlan(layout, language);
  const skeletons: ExcalidrawElementSkeleton[] = [];
  for (const family of plan.families) {
    const familyKey = encodedId(family.id);
    const data = {
      heritgType: "family",
      entityType: "relationship",
      familyId: family.id,
      relationshipIds: family.relationshipIds,
      parentIds: family.parentIds,
      childIds: family.childIds
    };
    family.segments.forEach((segment, index) => skeletons.push(segmentSkeleton(
      segment,
      `heritg:family:${familyKey}:segment:${index}`,
      HERITG_SCENE_COLORS.brand,
      2,
      "solid",
      `#heritg-family=${familyKey}`,
      data,
      [`heritg:family:${familyKey}`]
    )));
    family.junctions.forEach((junction, index) => skeletons.push({
      type: "ellipse",
      x: junction.x - 3,
      y: junction.y - 3,
      width: 6,
      height: 6,
      strokeColor: HERITG_SCENE_COLORS.brand,
      backgroundColor: HERITG_SCENE_COLORS.brand,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(
        `heritg:family:${familyKey}:junction:${index}`,
        `#heritg-family=${familyKey}`,
        data,
        [`heritg:family:${familyKey}`]
      )
    } as ExcalidrawElementSkeleton));
  }
  for (const route of plan.nonParentRoutes) {
    const relationship = route.relationship;
    const key = encodedId(relationship.id);
    const color = relationshipColor(relationship.kind);
    route.segments.forEach((segment, index) => skeletons.push(segmentSkeleton(
      segment,
      `heritg:relationship:${key}:segment:${index}`,
      color,
      2,
      relationship.kind === "sibling" ? "dashed" : "solid",
      `#heritg-relationship=${key}`,
      relationshipData(relationship),
      [`heritg:relationship:${key}`]
    )));
  }
  plan.crossings.forEach((point, index) => {
    const key = `${point.x}:${point.y}:${index}`;
    skeletons.push({
      type: "ellipse",
      x: point.x - 4,
      y: point.y - 4,
      width: 8,
      height: 8,
      strokeColor: HERITG_SCENE_COLORS.canvas,
      backgroundColor: HERITG_SCENE_COLORS.canvas,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(`heritg:crossing:${encodedId(key)}:mask`, "", { heritgType: "crossing" })
    } as ExcalidrawElementSkeleton);
    skeletons.push(segmentSkeleton(
      { start: { x: point.x, y: point.y - 5 }, end: { x: point.x, y: point.y + 5 } },
      `heritg:crossing:${encodedId(key)}:bridge`,
      relationshipColor(point.kind),
      2,
      point.kind === "sibling" ? "dashed" : "solid",
      "",
      { heritgType: "crossing" }
    ));
  });
  for (const route of plan.nonParentRoutes) {
    if (route.label) {
      skeletons.push(...plannedLabelSkeletons(route.relationship, route.label));
    }
  }

  const files: BinaryFiles = {};
  for (const person of people) {
    skeletons.push(...personSkeletons(person, files, selectedPersonId, language));
  }
  const elements = convertToExcalidrawElements(skeletons, { regenerateIds: false });
  const contentBounds: SceneBounds =
    elements.length === 0 ? [0, 0, 0, 0] : getCommonBounds(elements);
  const padding = elements.length === 0 ? 0 : 32;
  const bounds: SceneBounds = [
    contentBounds[0] - padding,
    contentBounds[1] - padding,
    contentBounds[2] + padding,
    contentBounds[3] + padding
  ];
  return {
    elements,
    files,
    appState: { viewBackgroundColor: HERITG_SCENE_COLORS.canvas },
    contentBounds,
    bounds
  };
}

export const createExcalidrawScene = projectLayoutToScene;
