import type { ConnectionPlan } from "./connectionPlan";
import { pointsEqual, type RouteSegment } from "./connectionGeometry";
import { preferredRoute, routeCrossingCount, splitAtAttachmentPoints } from "./obstacleRouter";
import type { TreeLayout } from "./types";

/** Reconsider rails against the complete diagram, including later unions.
 * Person coordinates and every family attachment stay fixed. This only builds
 * a candidate: labels and routes must be regenerated, then independently
 * validated and compared before it can replace the displayed drawing.
 */
export function untangleFamilyRails(layout: TreeLayout, plan: ConnectionPlan): TreeLayout | undefined {
  if (!plan.crossings.length || !plan.isValid) return undefined;
  const routes = new Map(plan.families.map((family) => [family.id, splitAtAttachmentPoints(family.segments)]));
  const partnerSegments = plan.nonParentRoutes.flatMap((route) => route.segments);
  const obstacles = plan.obstacles.filter((obstacle) => obstacle.kind !== "relationshipLabel");
  let changed = false;
  for (const family of plan.families) {
    const current = routes.get(family.id)!;
    const foreign = [...partnerSegments, ...[...routes].filter(([id]) => id !== family.id).flatMap(([, segments]) => segments)];
    const endpoints = new Set([...family.parentIds, ...family.childIds]);
    const rewritten: RouteSegment[] = [];
    for (const [index, segment] of current.entries()) {
      const reserved = [...foreign, ...rewritten, ...current.slice(index + 1)];
      if (!routeCrossingCount([segment], foreign)) {
        rewritten.push(segment); continue;
      }
      const candidate = preferredRoute(segment.start, segment.end, obstacles, endpoints, reserved, true);
      if (candidate && routeCrossingCount(candidate, foreign) < routeCrossingCount([segment], foreign)) {
        rewritten.push(...candidate);
        changed ||= candidate.length !== 1 || !pointsEqual(candidate[0].start, segment.start) || !pointsEqual(candidate[0].end, segment.end);
      } else rewritten.push(segment);
    }
    routes.set(family.id, rewritten);
  }
  if (!changed) return undefined;
  return { ...layout, familyRouteGeometry: Object.fromEntries(plan.families.map((family) => [family.id, {
    parentPorts: Object.fromEntries(family.parentIds.map((id, index) => [id, family.parentPorts[index]])),
    childPorts: Object.fromEntries(family.childIds.map((id, index) => [id, family.childPorts[index]])),
    segments: routes.get(family.id)!
  }])) };
}
