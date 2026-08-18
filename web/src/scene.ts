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
import { circularAvatarData, type AvatarImageResolver } from "./avatar";
import { BIRTH_ORDER_BADGE } from "./birthOrder";
import {
  CONNECTOR_STYLE,
  branchJunctions,
  connectorPaths,
  roundedConnectorPoints
} from "./connectorStyle";
import { createConnectionPlan, type ConnectionPlan } from "./connectionPlan";
import {
  personLifeTop,
  personCityTop,
  type PlannedRelationshipLabel,
  type RoutePoint
} from "./connectionGeometry";
import { LAYOUT_METRICS } from "./layout";
import { personCitySummary, personLifeSummary } from "./lifeSummary";
import { personAvatarAppearance } from "./personAvatarAppearance";
import { formatPersonName, PERSON_NAME_FONT_SIZE } from "./personName";
import type {
  AppData,
  FamilyRelationship,
  PositionedPerson,
  SceneLifeSummaryOptions,
  TreeLayout
} from "./types";
export const HERITG_SCENE_COLORS = {
  canvas: "#f5f5f3",
  text: "#302b25",
  subtleText: "#796f63",
  line: "#d8ccbc",
  brand: CONNECTOR_STYLE.familyColor,
  partner: CONNECTOR_STYLE.partnerColor,
  sibling: CONNECTOR_STYLE.siblingColor
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
export type { SceneLifeSummaryOptions } from "./types";
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
  gender: person.gender,
  role: person.role,
  generation: person.generation
});
const connectorSkeleton = (
  points: readonly RoutePoint[],
  id: string,
  strokeColor: string,
  strokeWidth: number,
  strokeStyle: "solid" | "dashed",
  link: string,
  customData: Record<string, unknown>,
  groupIds: string[] = []
): ExcalidrawElementSkeleton => {
  const renderedPoints = roundedConnectorPoints(points);
  const x = Math.min(...renderedPoints.map((point) => point.x));
  const y = Math.min(...renderedPoints.map((point) => point.y));
  const maxX = Math.max(...renderedPoints.map((point) => point.x));
  const maxY = Math.max(...renderedPoints.map((point) => point.y));
  return {
    type: "line",
    x,
    y,
    width: maxX - x,
    height: maxY - y,
    points: renderedPoints.map((point) => linearPoint(point.x - x, point.y - y)),
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
  language: AppData["language"],
  resolveAvatar: AvatarImageResolver,
  lifeSummaryOptions?: SceneLifeSummaryOptions
): ExcalidrawElementSkeleton[] => {
  const key = encodedId(person.id);
  const groupIds = [`heritg:person:${key}`];
  const link = `#heritg-person=${key}`;
  const data = personData(person);
  const selected = person.id === selectedPersonId;
  const appearance = personAvatarAppearance(person.gender);
  const showRole = Boolean(selectedPersonId && person.role);
  const avatarSize = LAYOUT_METRICS.avatarDiameter;
  const innerSize = LAYOUT_METRICS.innerAvatarDiameter;
  const avatarX = person.x - LAYOUT_METRICS.avatarRadius;
  const avatarY = person.y - LAYOUT_METRICS.avatarRadius;
  const innerX = person.x - innerSize / 2;
  const innerY = person.y - innerSize / 2;
  const name = formatPersonName(person.displayName);
  const values: ExcalidrawElementSkeleton[] = [
    {
      type: "ellipse",
      x: avatarX,
      y: avatarY,
      width: avatarSize,
      height: avatarSize,
      strokeColor: selected ? HERITG_SCENE_COLORS.brand : appearance.stroke,
      backgroundColor: appearance.fill,
      fillStyle: "solid",
      strokeWidth: selected ? 2 : 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(`heritg:person:${key}:avatar`, link, data, groupIds)
    } as ExcalidrawElementSkeleton
  ];

  const photo = resolveAvatar(person.photoDataUrl, innerSize);
  if (photo) {
    const fileId = `heritg:person:${key}:photo-${photo.fingerprint}` as FileId;
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
      backgroundColor: appearance.fill,
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
  if (person.birthOrder) {
    const badgeX = person.x - BIRTH_ORDER_BADGE.offset;
    const badgeY = person.y - BIRTH_ORDER_BADGE.offset;
    values.push(
      {
        type: "ellipse",
        x: badgeX - BIRTH_ORDER_BADGE.radius,
        y: badgeY - BIRTH_ORDER_BADGE.radius,
        width: BIRTH_ORDER_BADGE.radius * 2,
        height: BIRTH_ORDER_BADGE.radius * 2,
        strokeColor: appearance.stroke,
        backgroundColor: HERITG_SCENE_COLORS.canvas,
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        opacity: 100,
        ...elementIdentity(`heritg:person:${key}:birth-order-badge`, link, data, groupIds)
      } as ExcalidrawElementSkeleton,
      textSkeleton(
        `heritg:person:${key}:birth-order`,
        String(person.birthOrder),
        badgeX,
        badgeY,
        10,
        BIRTH_ORDER_BADGE.radius * 2,
        BIRTH_ORDER_BADGE.radius * 2,
        HERITG_SCENE_COLORS.text,
        link,
        data,
        groupIds
      )
    );
  }

  values.push({
    ...textSkeleton(
      `heritg:person:${key}:name`,
      name.text,
      person.x - LAYOUT_METRICS.labelWidth / 2,
      person.y + LAYOUT_METRICS.labelTop,
      LAYOUT_METRICS.labelWidth,
      LAYOUT_METRICS.nameHeight + name.extraHeight,
      PERSON_NAME_FONT_SIZE,
      HERITG_SCENE_COLORS.text,
      link,
      data,
      groupIds
    ),
    textAlign: "center"
  } as ExcalidrawElementSkeleton);
  if (showRole) {
    values.push(textSkeleton(
      `heritg:person:${key}:role`,
      person.role,
      centeredTextX(person.role, 13, person.x),
      person.y + LAYOUT_METRICS.roleTop + name.extraHeight,
      LAYOUT_METRICS.labelWidth,
      LAYOUT_METRICS.roleHeight,
      13,
      selected ? HERITG_SCENE_COLORS.brand : HERITG_SCENE_COLORS.subtleText,
      link,
      data,
      groupIds
    ));
  }
  const life = personLifeSummary(person, language, new Date(), lifeSummaryOptions ? {
    showBirthDate: lifeSummaryOptions.showBirthDate,
    showAge: lifeSummaryOptions.showAge,
    ageOverride: lifeSummaryOptions.ageByPersonId?.[person.id]
  } : undefined);
  const city = personCitySummary(person);
  if (life) {
    values.push(
      textSkeleton(
        `heritg:person:${key}:life`,
        life,
        centeredTextX(life, 11, person.x),
        person.y + personLifeTop(showRole, name.extraHeight),
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
  if (city) {
    values.push(
      textSkeleton(
        `heritg:person:${key}:city`,
        city,
        centeredTextX(city, 11, person.x),
        person.y + personCityTop(showRole, Boolean(life), name.extraHeight),
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

export const projectConnectionPlanToElements = (
  plan: ConnectionPlan
): OrderedExcalidrawElement[] => {
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
    connectorPaths(family.segments).forEach((path, index) => skeletons.push(connectorSkeleton(
      path.points,
      `heritg:family:${familyKey}:path:${index}`,
      HERITG_SCENE_COLORS.brand,
      CONNECTOR_STYLE.width,
      "solid",
      `#heritg-family=${familyKey}`,
      data,
      [`heritg:family:${familyKey}`]
    )));
    branchJunctions(family.segments).forEach((junction, index) => skeletons.push({
      type: "ellipse",
      x: junction.x - CONNECTOR_STYLE.junctionRadius,
      y: junction.y - CONNECTOR_STYLE.junctionRadius,
      width: CONNECTOR_STYLE.junctionRadius * 2,
      height: CONNECTOR_STYLE.junctionRadius * 2,
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
    connectorPaths(route.segments).forEach((path, index) => skeletons.push(connectorSkeleton(
      path.points,
      `heritg:relationship:${key}:path:${index}`,
      color,
      CONNECTOR_STYLE.width,
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
      x: point.x - CONNECTOR_STYLE.crossingRadius,
      y: point.y - CONNECTOR_STYLE.crossingRadius,
      width: CONNECTOR_STYLE.crossingRadius * 2,
      height: CONNECTOR_STYLE.crossingRadius * 2,
      strokeColor: HERITG_SCENE_COLORS.canvas,
      backgroundColor: HERITG_SCENE_COLORS.canvas,
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      opacity: 100,
      ...elementIdentity(`heritg:crossing:${encodedId(key)}:mask`, "", { heritgType: "crossing" })
    } as ExcalidrawElementSkeleton);
    skeletons.push(connectorSkeleton(
      [{ x: point.x, y: point.y - 6 }, { x: point.x, y: point.y + 6 }],
      `heritg:crossing:${encodedId(key)}:bridge`,
      relationshipColor(point.kind),
      CONNECTOR_STYLE.width,
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
  return convertToExcalidrawElements(skeletons, { regenerateIds: false });
};

export function projectLayoutToScene(
  layout: TreeLayout,
  selectedPersonId?: string,
  language: AppData["language"] = "en",
  suppliedPlan?: ConnectionPlan,
  resolveAvatar: AvatarImageResolver = circularAvatarData,
  suppliedConnectionElements?: readonly OrderedExcalidrawElement[],
  lifeSummaryOptions?: SceneLifeSummaryOptions
): HeritgExcalidrawScene {
  const people = [...layout.people].sort(
    (left, right) =>
      left.generation - right.generation ||
      left.y - right.y ||
      left.x - right.x ||
      compareText(left.id, right.id)
  );
  const plan = suppliedPlan ?? createConnectionPlan(layout, language);
  const connectionElements = suppliedConnectionElements ??
    projectConnectionPlanToElements(plan);

  const files: BinaryFiles = {};
  const personSkeletonValues: ExcalidrawElementSkeleton[] = [];
  for (const person of people) {
    personSkeletonValues.push(...personSkeletons(
      person, files, selectedPersonId, language, resolveAvatar, lifeSummaryOptions
    ));
  }
  const personElements = convertToExcalidrawElements(
    personSkeletonValues, { regenerateIds: false }
  );
  const elements = [...connectionElements, ...personElements];
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
