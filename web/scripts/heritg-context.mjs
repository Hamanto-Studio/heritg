#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultContextUrl = new URL("../.heritg-debug-context.json", import.meta.url);

const usage = `Usage: npm run context -- [command] [options]

All commands are read-only.

Commands:
  summary                    Show active-family counts (default)
  context                    Print the complete active-family snapshot as JSON
  people                     List people in the active family
  relationships              List relationships in the active family
  selected                   Show the currently selected person

Options:
  --person <id-or-name>      Filter relationships by person
  --json                     Print structured JSON
  --file <path>              Read a different context snapshot
  --help                     Show this help`;

const parseArguments = (arguments_) => {
  const options = {
    command: "summary",
    file: undefined,
    json: false,
    person: undefined
  };
  let commandSet = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") return { ...options, help: true };
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--file" || argument === "--person") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--file") options.file = value;
      else options.person = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    if (commandSet) throw new Error(`Unexpected argument: ${argument}`);
    options.command = argument;
    commandSet = true;
  }

  return options;
};

const validateContext = (context) => {
  if (!context || typeof context !== "object" || !Array.isArray(context.people) ||
      !Array.isArray(context.relationships) || !("activeTree" in context)) {
    throw new Error("The context snapshot is not a valid active-family context.");
  }
  return context;
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const selectedPerson = (context) => context.selectedPerson ??
  context.people.find((person) => person.id === context.selectedPersonId) ?? null;

const resolvePerson = (context, query) => {
  if (query.toLowerCase() === "selected") {
    const person = selectedPerson(context);
    if (!person) throw new Error("No person is currently selected.");
    return person;
  }

  const normalized = query.trim().toLowerCase();
  const exact = context.people.find((person) =>
    person.id.toLowerCase() === normalized || person.displayName.toLowerCase() === normalized
  );
  if (exact) return exact;

  const partial = context.people.filter((person) =>
    person.displayName.toLowerCase().includes(normalized)
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`Person query is ambiguous: ${partial.map((person) => person.displayName).join(", ")}`);
  }
  throw new Error(`Person not found: ${query}`);
};

const countBy = (values, key) => Object.fromEntries(
  [...new Set(values.map((value) => value[key]))]
    .sort()
    .map((name) => [name, values.filter((value) => value[key] === name).length])
);

const summary = (context) => ({
  generatedAt: context.generatedAt,
  activeTree: context.activeTree,
  selectedPerson: selectedPerson(context),
  counts: {
    people: context.people.length,
    relationships: context.relationships.length,
    peopleByGender: countBy(context.people, "gender"),
    relationshipsByKind: countBy(context.relationships, "kind"),
    relationshipsBySubtype: countBy(context.relationships, "subtype")
  }
});

const textSummary = (context) => {
  const result = summary(context);
  const selected = result.selectedPerson;
  const kinds = Object.entries(result.counts.relationshipsByKind)
    .map(([kind, count]) => `${kind}: ${count}`)
    .join(", ") || "none";
  return [
    `Active family: ${result.activeTree?.title ?? "None"}${result.activeTree ? ` (${result.activeTree.id})` : ""}`,
    `Selected person: ${selected ? `${selected.displayName} (${selected.id})` : "None"}`,
    `People: ${result.counts.people}`,
    `Relationships: ${result.counts.relationships} (${kinds})`,
    `Snapshot: ${result.generatedAt ?? "Unknown"}`
  ].join("\n") + "\n";
};

const textPeople = (people) => people.length === 0
  ? "No people in the active family.\n"
  : `${people.map((person) => {
      const life = [person.birthDate ? `born ${person.birthDate}` : undefined,
        person.deathDate ? `died ${person.deathDate}` : undefined]
        .filter(Boolean)
        .join(", ");
      return `${person.displayName} (${person.id}) | ${person.gender}${life ? ` | ${life}` : ""}`;
    }).join("\n")}\n`;

const textRelationships = (relationships) => relationships.length === 0
  ? "No matching relationships.\n"
  : `${relationships.map((relationship) => {
      const dates = [relationship.marriageDate ? `married ${relationship.marriageDate}` : undefined,
        relationship.divorceDate ? `divorced ${relationship.divorceDate}` : undefined]
        .filter(Boolean)
        .join(", ");
      return `${relationship.fromPersonName} -> ${relationship.toPersonName} | ` +
        `${relationship.kind}/${relationship.subtype} (${relationship.id})${dates ? ` | ${dates}` : ""}`;
    }).join("\n")}\n`;

export function renderCommand(contextInput, options) {
  const context = validateContext(contextInput);
  switch (options.command) {
    case "summary":
      return options.json ? json(summary(context)) : textSummary(context);
    case "context":
      return json(context);
    case "people":
      return options.json ? json(context.people) : textPeople(context.people);
    case "relationships": {
      const person = options.person ? resolvePerson(context, options.person) : undefined;
      const relationships = person
        ? context.relationships.filter((relationship) =>
            relationship.fromPersonId === person.id || relationship.toPersonId === person.id
          )
        : context.relationships;
      return options.json ? json(relationships) : textRelationships(relationships);
    }
    case "selected": {
      const person = selectedPerson(context);
      return options.json ? json(person) : person ? textPeople([person]) : "No person is currently selected.\n";
    }
    default:
      throw new Error(`Unknown command: ${options.command}`);
  }
}

export async function run(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) return `${usage}\n`;
  const contextPath = options.file ?? fileURLToPath(defaultContextUrl);

  let contents;
  try {
    contents = await readFile(contextPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `No active-family snapshot found at ${contextPath}. ` +
        "Start the Web app with HERITG_DEBUG_CONTEXT=1 and open the normal app route."
      );
    }
    throw error;
  }
  return renderCommand(JSON.parse(contents), options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((output) => process.stdout.write(output))
    .catch((error) => {
      process.stderr.write(`heritg-context: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
