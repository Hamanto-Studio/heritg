# Commit Message Guide

HERITG uses intent-first commit messages. The format describes the affected
product area and the outcome of the change without Conventional Commit types
such as `fix`, `feat`, or `chore`.

The repository uses squash merges, so the pull-request title becomes the final
commit subject on `main`.

## Subject

```text
<Area>: <Imperative outcome>
```

Examples:

```text
iOS: Preserve the viewport after selection changes
Archive: Reject files with invalid checksums
Privacy: Document optional diagnostic reporting
Repository: Require secret scanning before merge
Android: Establish the native project boundary
```

Rules:

- Use a product or technical area, not a change type.
- Start the outcome with an imperative verb.
- Describe the behavior after the commit is applied.
- Capitalize the area and outcome.
- Keep the complete subject at 72 characters or fewer.
- Do not end the subject with a period.
- Do not include issue numbers in the subject.
- Avoid generic subjects such as `Update files`, `Changes`, or `WIP`.

The subject should complete this sentence:

> If applied, this commit will **preserve the viewport after selection changes**.

## Body

Small, obvious commits may use only a subject. Changes involving behavior,
architecture, privacy, security, migrations, or non-obvious tradeoffs should
record durable context:

```text
iOS: Preserve the viewport after selection changes

Context:
Changing the selected person rebuilt the visible tree around a new origin,
which made navigation feel unstable.

Decision:
Keep world-space node positions stable and move only the selection state.

Validation:
- Added focused and complete-tree layout coverage
- Passed the iOS unit and UI test suite

Privacy:
- No data collection or network behavior changed

Refs: #123
```

Use only sections that add useful information. Explain why the change exists,
the decision or constraint that is not obvious from the diff, and how the
result was verified. Do not narrate every edited file.

## Trailers

Use standard Git trailers at the end when applicable:

```text
Refs: #123
Reviewed-by: Name <email@example.com>
Co-authored-by: Name <email@example.com>
Assisted-by: OpenCode
```

- `Refs` links related work without claiming that the commit closes it.
- `Co-authored-by` is for people who made a substantive contribution and
  consent to attribution.
- `Assisted-by` may identify an AI tool when disclosure is useful. It is
  optional and must not replace human authorship or review.
- Do not include prompts, transcripts, hidden reasoning, secrets, or personal
  data in commit messages.

## AI-Assisted Changes

AI-generated summaries are drafts, not evidence. Before committing, the human
author must verify that the message:

- Matches the staged diff rather than the original request
- Records important constraints and tradeoffs
- States only tests and scans that actually ran
- Does not claim privacy or security properties that were not verified
- Contains no credentials, family data, prompts, or internal system details

The commit message should remain useful if the AI conversation is unavailable.
