import type { Person } from "./types";

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Orders children for display without inventing genealogical information.
 * A recorded/inferred sibling order wins, followed by a reliable birth date.
 * Names and IDs are deterministic fallbacks only.
 */
export function compareChildOrder(
  left: Person,
  right: Person,
  birthOrders: ReadonlyMap<string, number>
): number {
  const leftOrder = birthOrders.get(left.id);
  const rightOrder = birthOrders.get(right.id);
  if (leftOrder !== undefined || rightOrder !== undefined) {
    if (leftOrder === undefined) return 1;
    if (rightOrder === undefined) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  const leftBirth = left.birthDate ?? "\uffff";
  const rightBirth = right.birthDate ?? "\uffff";
  return compareText(leftBirth, rightBirth) ||
    compareText(left.displayName.toLocaleLowerCase(), right.displayName.toLocaleLowerCase()) ||
    compareText(left.displayName, right.displayName) ||
    compareText(left.id, right.id);
}
