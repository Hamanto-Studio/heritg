import { useId } from "react";

import { isValidAvatarImage } from "./avatar";
import type { ConnectionPlan } from "./connectionPlan";
import { personLifeTop } from "./connectionGeometry";
import {
  CONNECTOR_STYLE,
  branchJunctions,
  connectorPaths,
  roundedConnectorPath
} from "./connectorStyle";
import { LAYOUT_METRICS } from "./layout";
import { personLifeSummary } from "./lifeSummary";
import type {
  AppData,
  PositionedPerson,
  SceneLifeSummaryOptions,
  TreeLayout
} from "./types";

interface SvgTreeSceneProps {
  connectionPlan: ConnectionPlan;
  language: AppData["language"];
  layout: TreeLayout;
  lifeSummaryOptions?: SceneLifeSummaryOptions;
  overview: boolean;
  selectedPersonId?: string;
}

const SCENE_COLORS = {
  canvas: "#f5f5f3",
  avatar: "#fffdf8",
  selectedAvatar: "#f3eadf",
  recessed: "#ede5d8",
  text: "#302b25",
  subtleText: "#796f63",
  line: "#d8ccbc",
  brand: CONNECTOR_STYLE.familyColor
} as const;

const compactText = (value: string, maximum: number) => {
  const normalized = value.trim().replace(/\s+/g, " ") || "Unnamed person";
  return normalized.length > maximum
    ? `${normalized.slice(0, maximum - 3).trimEnd()}...`
    : normalized;
};

const nameFontSize = (value: string) =>
  Math.max(9, Math.min(16, Math.floor(320 / Math.max(20, value.length))));

const PersonNode = ({
  clipPrefix,
  language,
  lifeSummaryOptions,
  overview,
  person,
  selectedPersonId
}: {
  clipPrefix: string;
  language: AppData["language"];
  lifeSummaryOptions?: SceneLifeSummaryOptions;
  overview: boolean;
  person: PositionedPerson;
  selectedPersonId?: string;
}) => {
  const selected = person.id === selectedPersonId;
  const showRole = Boolean(selectedPersonId && person.role);
  const innerRadius = LAYOUT_METRICS.innerAvatarDiameter / 2;
  const clipId = `${clipPrefix}-${encodeURIComponent(person.id).replaceAll("%", "-")}`;
  const hasPhoto = isValidAvatarImage(person.photoDataUrl);
  const name = compactText(person.displayName, 34);
  const life = personLifeSummary(person, language, new Date(), lifeSummaryOptions ? {
    showBirthDate: lifeSummaryOptions.showBirthDate,
    showAge: lifeSummaryOptions.showAge,
    ageOverride: lifeSummaryOptions.ageByPersonId?.[person.id]
  } : undefined);

  return (
    <g className="svg-person" data-person-id={person.id}>
      <circle
        cx={person.x}
        cy={person.y}
        fill={selected ? SCENE_COLORS.selectedAvatar : SCENE_COLORS.avatar}
        r={LAYOUT_METRICS.avatarRadius}
        stroke={selected ? SCENE_COLORS.brand : SCENE_COLORS.line}
        strokeWidth={selected ? 2 : 1}
      />
      {!overview ? <>
        <circle
          cx={person.x}
          cy={person.y}
          fill={selected ? SCENE_COLORS.selectedAvatar : SCENE_COLORS.recessed}
          r={innerRadius}
        />
        <text
          className="svg-person-initial"
          dominantBaseline="central"
          textAnchor="middle"
          x={person.x}
          y={person.y}
        >
          {person.displayName.trim().charAt(0).toUpperCase() || "?"}
        </text>
        {hasPhoto ? <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={person.x} cy={person.y} r={innerRadius} />
            </clipPath>
          </defs>
          <image
            clipPath={`url(#${clipId})`}
            height={LAYOUT_METRICS.innerAvatarDiameter}
            href={person.photoDataUrl}
            preserveAspectRatio="xMidYMid slice"
            width={LAYOUT_METRICS.innerAvatarDiameter}
            x={person.x - innerRadius}
            y={person.y - innerRadius}
          />
        </> : null}
      </> : null}
      {!overview ? <>
        <text
          className="svg-person-name"
          fontSize={nameFontSize(name)}
          textAnchor="middle"
          x={person.x}
          y={person.y + LAYOUT_METRICS.labelTop + nameFontSize(name)}
        >
          {name}
        </text>
        {showRole ? (
          <text
            className="svg-person-role"
            fill={selected ? SCENE_COLORS.brand : SCENE_COLORS.subtleText}
            textAnchor="middle"
            x={person.x}
            y={person.y + LAYOUT_METRICS.roleTop + 13}
          >
            {person.role}
          </text>
        ) : null}
        {life ? (
          <text
            className="svg-person-life"
            textAnchor="middle"
            x={person.x}
            y={person.y + personLifeTop(showRole) + 11}
          >
            {life}
          </text>
        ) : null}
      </> : null}
    </g>
  );
};

export function SvgTreeScene({
  connectionPlan,
  language,
  layout,
  lifeSummaryOptions,
  overview,
  selectedPersonId
}: SvgTreeSceneProps) {
  const clipPrefix = useId().replaceAll(":", "-");
  return <>
    <g className="svg-connectors">
      {connectionPlan.families.flatMap((family) =>
        connectorPaths(family.segments).map((path, index) => (
          <path
            className="svg-connector family"
            d={roundedConnectorPath(path.points)}
            data-family-id={family.id}
            key={`${family.id}:path:${index}`}
          />
        ))
      )}
      {connectionPlan.nonParentRoutes.flatMap((route) =>
        connectorPaths(route.segments).map((path, index) => (
          <path
            className={`svg-connector ${route.relationship.kind}`}
            d={roundedConnectorPath(path.points)}
            data-relationship-id={route.id}
            key={`${route.id}:path:${index}`}
          />
        ))
      )}
      {connectionPlan.families.flatMap((family) =>
        branchJunctions(family.segments).map((point, index) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill={CONNECTOR_STYLE.familyColor}
            key={`${family.id}:junction:${index}`}
            r={CONNECTOR_STYLE.junctionRadius}
          />
        ))
      )}
      {connectionPlan.crossings.map((point, index) => (
        <g key={`${point.x}:${point.y}:${index}`}>
          <circle
            cx={point.x}
            cy={point.y}
            fill={SCENE_COLORS.canvas}
            r={CONNECTOR_STYLE.crossingRadius}
          />
          <line
            className={`svg-connector ${point.kind}`}
            x1={point.x}
            x2={point.x}
            y1={point.y - 6}
            y2={point.y + 6}
          />
        </g>
      ))}
      {!overview ? connectionPlan.nonParentRoutes.map((route) => route.label ? (
        <g className="svg-relationship-label" key={`${route.id}:label`}>
          <rect {...route.label.rect} rx={12} />
          <text textAnchor="middle" x={route.label.center.x} y={route.label.center.y + 4}>
            {route.label.text}
          </text>
        </g>
      ) : null) : null}
    </g>
    <g className="svg-people">
      {layout.people.map((person) => (
        <PersonNode
          clipPrefix={clipPrefix}
          key={person.id}
          language={language}
          lifeSummaryOptions={lifeSummaryOptions}
          overview={overview}
          person={person}
          selectedPersonId={selectedPersonId}
        />
      ))}
    </g>
  </>;
}
