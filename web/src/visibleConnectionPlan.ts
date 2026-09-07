import type { ConnectionPlan } from "./connectionPlan";
import { nodeLabelRect, pointsEqual, type RoutePoint, type RouteSegment } from "./connectionGeometry";
import { personLifeSummary } from "./lifeSummary";
import type { AppData, SceneLifeSummaryOptions, TreeLayout } from "./types";

/** Extend only terminal stems into reserved-but-hidden label space. The costly
 * family routing, person positions, labels and crossing bridges stay unchanged.
 * Always project from the prepared plan, never from the prior projection.
 */
export function visibleConnectionPlan(plan: ConnectionPlan, layout: TreeLayout,
  language: AppData["language"], selectedPersonId?: string, options?: SceneLifeSummaryOptions): ConnectionPlan {
  const people = new Map(layout.people.map((person) => [person.id, person]));
  const bottoms = new Map<string, { reserved: number; visible: number }>();
  const now = new Date();
  const obstacles = plan.obstacles.map((obstacle) => {
    if (obstacle.kind !== "nodeLabel") return obstacle;
    const person = people.get(obstacle.ownerId);
    if (!person) return obstacle;
    const rect = nodeLabelRect(person, {
      showRole: Boolean(selectedPersonId && person.role),
      hasLife: Boolean(personLifeSummary(person, language, now, options ? {
        showBirthDate: options.showBirthDate, showAge: options.showAge,
        ageOverride: options.ageByPersonId?.[person.id]
      } : undefined))
    });
    // This is a projection inside existing clearance, not a second router.
    // A changed name/position or larger label must be prepared again.
    if (rect.x !== obstacle.rect.x || rect.y !== obstacle.rect.y || rect.height >= obstacle.rect.height) return obstacle;
    bottoms.set(person.id, { reserved: obstacle.rect.y + obstacle.rect.height + 2, visible: rect.y + rect.height + 2 });
    return { ...obstacle, rect };
  });
  if (!bottoms.size) return plan;
  const move = (point: RoutePoint, personId: string) => {
    const bottom = bottoms.get(personId);
    return bottom && Math.abs(point.y - bottom.reserved) < 0.001 ? { ...point, y: bottom.visible } : point;
  };
  const rebind = (segments: RouteSegment[], ports: { before: RoutePoint; after: RoutePoint }[]) => {
    const moved = ports.filter(({ before, after }) => !pointsEqual(before, after));
    if (!moved.length) return segments;
    const replacements = new Map(moved.map(({ before, after }) => [`${before.x}:${before.y}`, after]));
    const endpoint = (point: RoutePoint) => replacements.get(`${point.x}:${point.y}`) ?? point;
    return segments.map(({ start, end }) => ({ start: endpoint(start), end: endpoint(end) }));
  };
  return { ...plan, obstacles,
    families: plan.families.map((family) => {
      const parentPorts = family.parentPorts.map((port, i) => move(port, family.parentIds[i]));
      return { ...family, parentPorts, segments: rebind(family.segments,
        family.parentPorts.map((before, i) => ({ before, after: parentPorts[i] }))) };
    }),
    nonParentRoutes: plan.nonParentRoutes.map((route) => {
      if (!route.labelTerminals?.length) return route;
      const labelTerminals = route.labelTerminals.map((terminal) => ({ ...terminal, point: move(terminal.point, terminal.personId) }));
      return { ...route, labelTerminals, segments: rebind(route.segments,
        route.labelTerminals.map(({ point: before }, i) => ({ before, after: labelTerminals[i].point }))) };
    })
  };
}
