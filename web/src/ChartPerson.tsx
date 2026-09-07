import { PersonAvatar } from "./ui";
import type { Person } from "./types";

/** Fixed chart geometry, bounded names, and the complete name for assistive tech. */
export function ChartPerson({ person, context, current = false, onExplore }: {
  person: Person; context: string; current?: boolean; onExplore: (id: string) => void;
}) {
  return <button className="chart-person" type="button" data-chart-person={person.id}
    aria-label={`${person.displayName} · ${context}`} aria-current={current ? "true" : undefined}
    title={person.displayName} onClick={() => onExplore(person.id)}>
    <PersonAvatar person={person} size={32} />
    <strong>{person.displayName}</strong>
  </button>;
}
