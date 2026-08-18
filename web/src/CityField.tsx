import { useId } from "react";

import type { Person } from "./types";

interface CityFieldProps {
  full?: boolean;
  label: string;
  onChange: (value: string) => void;
  people: readonly Person[];
  treeId: string;
  value: string;
}

export const citySuggestions = (people: readonly Person[], treeId: string): string[] => {
  const cities = new Map<string, string>();
  for (const person of people) {
    if (person.treeId !== treeId) continue;
    const city = person.city.trim().replace(/\s+/g, " ");
    const key = city.toLocaleLowerCase();
    if (city && !cities.has(key)) cities.set(key, city);
  }
  return [...cities.values()].sort((left, right) => left.localeCompare(right));
};

export function CityField({ full, label, onChange, people, treeId, value }: CityFieldProps) {
  const listId = useId();
  const suggestions = citySuggestions(people, treeId);
  return (
    <label className={`field${full ? " full" : ""}`}>
      {label}
      <input
        autoComplete="address-level2"
        list={suggestions.length ? listId : undefined}
        maxLength={240}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions.map((city) => <option key={city} value={city} />)}
        </datalist>
      ) : null}
    </label>
  );
}
