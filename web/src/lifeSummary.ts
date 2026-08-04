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

export const personLifeSummary = (
  person: Pick<Person, "birthDate" | "deathDate" | "birthDatePrecision">,
  language: AppData["language"] = "en",
  now = new Date()
): string | undefined => {
  const birth = dateParts(person.birthDate);
  if (!birth) return undefined;
  const death = dateParts(person.deathDate);
  const reference = death ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  };
  const age = ageBetween(birth, reference);
  if (death) {
    const years = `${birth.year}-${death.year}`;
    return age === undefined
      ? years
      : language === "id" ? `${years} · usia ${age}` : `${years} · age ${age}`;
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
