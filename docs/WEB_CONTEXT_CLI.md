# Web Context CLI

The Web context CLI lets developers and local AI tools inspect the family that
is currently active in HERITG Web. It operates on an explicit development
snapshot and is not included in the production application's data flow.

## Read-Only Contract

Every CLI command is read-only.

- The CLI reads one JSON snapshot from disk.
- The CLI never writes to the snapshot or any other file.
- The CLI never modifies IndexedDB, family trees, people, relationships, or the
  current selection.
- The CLI makes no network requests and starts no child processes.
- Filtering and summaries are derived in memory without mutating parsed data.
- Output is written only to standard output. Errors are written only to
  standard error.
- There are no create, update, delete, import, restore, or synchronization
  commands.

The development bridge and CLI have a one-way data flow:

```text
HERITG Web state
  -> development-only snapshot publisher
  -> web/.heritg-debug-context.json
  -> read-only CLI
  -> stdout
```

The Web app writes the snapshot only when its Vite server starts with
`HERITG_DEBUG_CONTEXT=1`. That publisher receives a copy of active state and
does not change application state or disable encrypted IndexedDB persistence.
The CLI cannot send data back to the app or publisher.

## Start The Bridge

From `web/`, start the development server explicitly:

```sh
HERITG_DEBUG_CONTEXT=1 npm run dev
```

Open the normal application route in a browser. The app updates the gitignored
`web/.heritg-debug-context.json` file whenever published application state
changes. Shared-tree routes under `/s/` do not publish local context.

The snapshot contains the active tree, current selection, people, notes,
addresses, dates, counts, and relationships with readable endpoint names. It
omits inactive trees and photo contents. Although gitignored, it contains
sensitive plaintext and must not be committed, uploaded, or shared.

## Commands

Run commands from `web/`.

### Summary

```sh
npm run context
npm run context -- summary
npm run context -- summary --json
```

Reports the active tree, selected person, people count, and relationship counts
by kind. `summary` is the default command.

### Complete Context

```sh
npm run context -- context
```

Prints the complete active-family snapshot as formatted JSON. This command is
still read-only; `context` describes the output scope rather than an operation.

### People

```sh
npm run context -- people
npm run context -- people --json
```

Lists every person in the active family. JSON output retains all person fields
present in the snapshot.

### Relationships

```sh
npm run context -- relationships
npm run context -- relationships --json
npm run context -- relationships --person selected
npm run context -- relationships --person "Person Name"
npm run context -- relationships --person <person-id>
```

Lists relationship kind, subtype, direction, IDs, readable endpoint names, and
available relationship dates. `--person` accepts `selected`, a person ID, an
exact case-insensitive name, or an unambiguous partial name. Ambiguous and
unknown names fail without changing data.

For parent relationships, `fromPersonName` is the parent and `toPersonName` is
the child. Partner and sibling endpoints are symmetric.

### Selected Person

```sh
npm run context -- selected
npm run context -- selected --json
```

Prints the currently selected person's snapshot, or reports that no person is
selected.

## Options

| Option | Purpose |
| --- | --- |
| `--json` | Produce structured JSON for `summary`, `people`, `relationships`, or `selected` |
| `--person <id-or-name>` | Filter `relationships` to one person |
| `--file <path>` | Read an alternate snapshot without modifying it |
| `--help`, `-h` | Print command help |

Options may appear before or after the command. Unknown commands and options
return a non-zero exit status.

## Troubleshooting

If the CLI reports that no snapshot exists:

1. Stop any Web development server that was started without the debug flag.
2. Run `HERITG_DEBUG_CONTEXT=1 npm run dev` from `web/`.
3. Open or refresh the normal HERITG Web route.
4. Run `npm run context` from another terminal in `web/`.

If displayed data is stale, interact with the app or refresh it so the active
state is published again. Delete `web/.heritg-debug-context.json` when plaintext
debug context is no longer required.
