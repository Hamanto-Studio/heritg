import { formatDisplayDate } from "./i18n";
import type { AppData, Person } from "./types";

interface DateParts {
  year: number;
  month: number;
  day: number;
}

const dateParts = (value?: string): DateParts | undefined => {
  const match = value?.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!match) return undefined;
  return {
    year: Number(match[1]),
    month: Number(match[2] ?? 1),
    day: Number(match[3] ?? 1)
  };
};

const ageBetween = (birth: DateParts, reference: DateParts) => {
  let age = reference.year - birth.year;
  if (reference.month < birth.month ||
      (reference.month === birth.month && reference.day < birth.day)) age -= 1;
  return age >= 0 ? age : undefined;
};

export const personAge = (
  person: Pick<Person, "birthDate" | "deathDate">,
  now = new Date()
): number | undefined => {
  const birth = dateParts(person.birthDate);
  if (!birth) return undefined;
  const death = dateParts(person.deathDate);
  return ageBetween(birth, death ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  });
};

export interface PersonLifeSummaryOptions {
  showBirthDate?: boolean;
  showAge?: boolean;
  ageOverride?: number;
}

export const personCitySummary = (
  person: Pick<Person, "city">
): string | undefined => {
  const city = person.city.trim().replace(/\s+/g, " ");
  if (!city) return undefined;
  const displayed = city.length > 34
    ? `${city.slice(0, 31).trimEnd()}...`
    : city;
  return displayed;
};

export const personLifeSummary = (
  person: Pick<Person, "birthDate" | "deathDate" | "birthDatePrecision">,
  language: AppData["language"] = "en",
  now = new Date(),
  options: PersonLifeSummaryOptions = {}
): string | undefined => {
  const showBirthDate = options.showBirthDate ?? true;
  const showAge = options.showAge ?? true;
  const birth = dateParts(person.birthDate);
  const overriddenAge = Number.isInteger(options.ageOverride) && options.ageOverride! >= 0
    ? options.ageOverride
    : undefined;
  if (!birth) {
    if (!showAge || overriddenAge === undefined) return undefined;
    return language === "id" ? `Usia ${overriddenAge}` : `Age ${overriddenAge}`;
  }
  const death = dateParts(person.deathDate);
  const age = showAge ? overriddenAge ?? personAge(person, now) : undefined;
  if (death) {
    if (!showBirthDate) {
      return age === undefined
        ? undefined
        : language === "id" ? `Usia ${age}` : `Age ${age}`;
    }
    const years = `${birth.year}-${death.year}`;
    return age === undefined
      ? years
      : language === "id" ? `${years} · usia ${age}` : `${years} · age ${age}`;
  }
  if (!showBirthDate) {
    return age === undefined
      ? undefined
      : language === "id" ? `Usia ${age}` : `Age ${age}`;
  }
  const birthValue = person.birthDate ?? String(birth.year);
  const displayedBirth = person.birthDatePrecision === "exact"
    ? formatDisplayDate(birthValue, language)
    : person.birthDatePrecision === "month"
      ? new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
          month: "short",
          year: "numeric"
        }).format(new Date(`${birth.year}-${String(birth.month).padStart(2, "0")}-01T00:00:00`))
      : String(birth.year);
  const born = language === "id" ? `Lahir ${displayedBirth}` : `Born ${displayedBirth}`;
  return age === undefined
    ? born
    : language === "id" ? `${born} · usia ${age}` : `${born} · age ${age}`;
};
