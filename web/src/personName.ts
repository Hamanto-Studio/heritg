export const PERSON_NAME_FONT_SIZE = 14;
export const PERSON_NAME_LINE_HEIGHT = 17;

const MAX_LINE_CHARACTERS = 24;
const MAX_NAME_CHARACTERS = MAX_LINE_CHARACTERS * 2 - 1;

export interface FormattedPersonName {
  fullName: string;
  lines: string[];
  text: string;
  extraHeight: number;
}

export const formatPersonName = (value: string): FormattedPersonName => {
  const fullName = value.trim().replace(/\s+/g, " ") || "Unnamed person";
  const displayed = fullName.length > MAX_NAME_CHARACTERS
    ? `${fullName.slice(0, MAX_NAME_CHARACTERS - 3).trimEnd()}...`
    : fullName;
  if (displayed.length <= MAX_LINE_CHARACTERS) {
    return { fullName, lines: [displayed], text: displayed, extraHeight: 0 };
  }

  const candidates = [...displayed.matchAll(/ /g)]
    .map((match) => match.index)
    .filter((index) => index <= MAX_LINE_CHARACTERS && displayed.length - index - 1 <= MAX_LINE_CHARACTERS);
  const split = candidates.sort((left, right) =>
    Math.abs(left - (displayed.length - left - 1)) -
    Math.abs(right - (displayed.length - right - 1))
  )[0];
  const lines = split === undefined
    ? [
        displayed.slice(0, MAX_LINE_CHARACTERS).trimEnd(),
        displayed.slice(MAX_LINE_CHARACTERS).trimStart()
      ]
    : [displayed.slice(0, split), displayed.slice(split + 1)];
  return {
    fullName,
    lines,
    text: lines.join("\n"),
    extraHeight: PERSON_NAME_LINE_HEIGHT
  };
};
