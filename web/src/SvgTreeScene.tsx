import { useId } from "react";

import { isValidAvatarImage } from "./avatar";
import { BIRTH_ORDER_BADGE, birthOrderLabel } from "./birthOrder";
import type { ConnectionPlan } from "./connectionPlan";
import { personCityTop, personLifeTop } from "./connectionGeometry";
import {
  CONNECTOR_STYLE,
  branchJunctions,
  connectorPaths,
  crossingBridgePath,
  roundedConnectorPath
} from "./connectorStyle";
import { LAYOUT_METRICS } from "./layout";
import { personCitySummary, personLifeSummary } from "./lifeSummary";
import { personAvatarAppearance } from "./personAvatarAppearance";
import {
  formatPersonName,
  PERSON_NAME_FONT_SIZE,
  PERSON_NAME_LINE_HEIGHT
} from "./personName";
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
  selectedPersonId?: string;
}

const SCENE_COLORS = {
  canvas: "#f5f5f3",
  text: "#302b25",
  subtleText: "#796f63",
  line: "#d8ccbc",
  brand: CONNECTOR_STYLE.familyColor
} as const;

const PersonNode = ({
  clipPrefix,
  language,
  lifeSummaryOptions,
  person,
  selectedPersonId
}: {
  clipPrefix: string;
  language: AppData["language"];
  lifeSummaryOptions?: SceneLifeSummaryOptions;
  person: PositionedPerson;
  selectedPersonId?: string;
}) => {
  const selected = person.id === selectedPersonId;
  const showRole = Boolean(selectedPersonId && person.role);
  const innerRadius = LAYOUT_METRICS.innerAvatarDiameter / 2;
  const clipId = `${clipPrefix}-${encodeURIComponent(person.id).replaceAll("%", "-")}`;
  const hasPhoto = isValidAvatarImage(person.photoDataUrl);
  const appearance = personAvatarAppearance(person.gender);
  const name = formatPersonName(person.displayName);
  const life = personLifeSummary(person, language, new Date(), lifeSummaryOptions ? {
    showBirthDate: lifeSummaryOptions.showBirthDate,
    showAge: lifeSummaryOptions.showAge,
    ageOverride: lifeSummaryOptions.ageByPersonId?.[person.id]
  } : undefined);
  const city = personCitySummary(person);

  return (
    <g className="svg-person" data-gender={person.gender} data-person-id={person.id}>
      <title>{name.fullName}</title>
      <circle
        cx={person.x}
        cy={person.y}
        fill={appearance.fill}
        r={LAYOUT_METRICS.avatarRadius}
        stroke={selected ? SCENE_COLORS.brand : appearance.stroke}
        strokeWidth={selected ? 2 : 1}
      />
      <>
        <circle
          cx={person.x}
          cy={person.y}
          fill={appearance.fill}
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
        {person.birthOrder ? (
          <g className="svg-birth-order" data-birth-order={person.birthOrder}>
            <title>{birthOrderLabel(person.birthOrder, language)}</title>
            <circle
              cx={person.x - BIRTH_ORDER_BADGE.offset}
              cy={person.y - BIRTH_ORDER_BADGE.offset}
              fill={SCENE_COLORS.canvas}
              r={BIRTH_ORDER_BADGE.radius}
              stroke={appearance.stroke}
              strokeWidth={2}
            />
            <text
              dominantBaseline="central"
              fill={SCENE_COLORS.text}
              fontSize={10}
              fontWeight={700}
              textAnchor="middle"
              x={person.x - BIRTH_ORDER_BADGE.offset}
              y={person.y - BIRTH_ORDER_BADGE.offset}
            >
              {person.birthOrder}
            </text>
          </g>
        ) : null}
      </>
      <>
        <text
          className="svg-person-name"
          fontSize={PERSON_NAME_FONT_SIZE}
          textAnchor="middle"
          x={person.x}
          y={person.y + LAYOUT_METRICS.labelTop + PERSON_NAME_FONT_SIZE}
        >
          {name.lines.map((line, index) => (
            <tspan
              key={`${line}:${index}`}
              x={person.x}
              y={person.y + LAYOUT_METRICS.labelTop + PERSON_NAME_FONT_SIZE +
                index * PERSON_NAME_LINE_HEIGHT}
            >
              {line}
            </tspan>
          ))}
        </text>
        {showRole ? (
          <text
            className="svg-person-role"
            fill={selected ? SCENE_COLORS.brand : SCENE_COLORS.subtleText}
            textAnchor="middle"
            x={person.x}
            y={person.y + LAYOUT_METRICS.roleTop + name.extraHeight + 13}
          >
            {person.role}
          </text>
        ) : null}
        {life ? (
          <text
            className="svg-person-life"
            textAnchor="middle"
            x={person.x}
            y={person.y + personLifeTop(showRole, name.extraHeight) + 11}
          >
            {life}
          </text>
        ) : null}
        {city ? (
          <text
            className="svg-person-city"
            textAnchor="middle"
            x={person.x}
            y={person.y + personCityTop(showRole, Boolean(life), name.extraHeight) + 11}
          >
            {city}
          </text>
        ) : null}
      </>
    </g>
  );
};

export function SvgTreeScene({
  connectionPlan,
  language,
  layout,
  lifeSummaryOptions,
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
          <line
            stroke={SCENE_COLORS.canvas}
            strokeLinecap="butt"
            strokeWidth={CONNECTOR_STYLE.width + 4}
            x1={point.x}
            x2={point.x}
            y1={point.y - CONNECTOR_STYLE.crossingRadius - 5}
            y2={point.y + CONNECTOR_STYLE.crossingRadius + 5}
          />
          <line
            className={`svg-connector ${point.horizontalKind}`}
            x1={point.x - CONNECTOR_STYLE.crossingRadius - 5}
            x2={point.x + CONNECTOR_STYLE.crossingRadius + 7}
            y1={point.y}
            y2={point.y}
          />
          <path
            d={crossingBridgePath(point)}
            fill="none"
            stroke={SCENE_COLORS.canvas}
            strokeLinecap="round"
            strokeWidth={CONNECTOR_STYLE.width + 4}
          />
          <path
            className={`svg-connector ${point.kind}`}
            d={crossingBridgePath(point)}
            fill="none"
          />
        </g>
      ))}
      {connectionPlan.nonParentRoutes.map((route) => route.label ? (
        <g className="svg-relationship-label" key={`${route.id}:label`}>
          <rect {...route.label.rect} rx={12} />
          <text textAnchor="middle" x={route.label.center.x} y={route.label.center.y + 4}>
            {route.label.text}
          </text>
        </g>
      ) : null)}
    </g>
    <g className="svg-people">
      {layout.people.map((person) => (
        <PersonNode
          clipPrefix={clipPrefix}
          key={person.id}
          language={language}
          lifeSummaryOptions={lifeSummaryOptions}
          person={person}
          selectedPersonId={selectedPersonId}
        />
      ))}
    </g>
  </>;
}
