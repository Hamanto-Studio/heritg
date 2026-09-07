# Large-tree clarity workstream

Status: **implemented and verified for the representative 500-person acceptance matrix**.
Scope: Web Full view first, Focus compatibility; no backend, native-platform,
production deployment, or real family-data changes.

## Current completion audit (2026-09-07)

This section records current evidence. Later sections are chronological
engineering checkpoints; their earlier crossing counts and open issues are
not current measurements.

`fullTreeAcceptance.test.ts` now exercises **117** cases through `prepareTree`,
the same entry used by the interactive worker: all 13 synthetic combinations,
100/250/500 people, seeds 0/2/4, Indonesian labels, and the reserved role line.
The initial 117-case run passed in 78.93 seconds on this Mac.

Every case checks complete, unchanged person metadata and relationship records,
finite positions, connected routes, correct avatar/label terminals, downward
parent direction, separate recorded parent sets, required ancestry/care labels,
and absence of unrelated avatar/name collisions, person collisions, collinear
route overlaps, diagonal segments, or routing failures.

Crossings are also recomputed from the actual horizontal and vertical segments
by the test-only `crossingAudit.ts`, independently of `plan.crossings` and
`plan.isValid`. Common recorded-person terminals are distinguished from foreign
touching routes. Tests deliberately hide a crossing from the plan, split/reverse
segments, create a three-route intersection, and change a shared terminal's
owner to verify that this measurement detects these cases.

| Family combinations | 100 people | 250 people | 500 people |
| --- | --- | --- | --- |
| All 12 combinations other than shared-parent-sets | 0 crossings | 0 crossings | 0 crossings |
| Shared birth/adoptive/foster sets | 11 crossings / 11 witnesses | 27 / 27 | 55 / 55 |

Counts hold for all three tested seeds. Each remaining intersection belongs to
exactly two non-care family routes in the same three-child cohort, never to a
neighboring household. Every cohort has exactly one such intersection.

### Why these particular crossings have a lower bound

The witness is derived from original records, not from generated geometry:
three disjoint parent sets each connect to exactly the same three children.
Under Heritg's separate-family-bus representation, contracting each family's
internal connected bus produces a K3,3 graph. K3,3 is nonplanar, so this pattern
cannot be drawn without at least one intersection while preserving separate
families and single person instances. This is an application of the
[MIT planarity notes](https://math.mit.edu/~djk/18.310/Lecture-Notes/some_graph_theory_2007.html),
not a claim from that source about Heritg. Each certified cohort uses distinct
family routes, and its one measured crossing is between those routes, so the
observed counts attain this lower bound for these fixtures and this model.
The nine shared-parent-set cases also passed an additional leaf-terminal
check: every child has exactly one incident segment in each of its three
connected family networks. No family bus uses a child as a through-vertex,
which is required for the contraction argument above.

This does **not** certify arbitrary graphs, prove that a five-child pattern has
the same minimum, or replace visual inspection. Incomplete parent sets,
shared-parent sets, two-child patterns, and care-only patterns are deliberately
not certified by this narrow witness detector.

### Selection and final verification

`connectionTrace.test.ts` now covers every person in every 500-person base
combination: **6,500 selections**. All directly recorded relationships remain
represented, including sibling and care edges, and each selected family's
rendered highlight paths have the same total length as the traced segments.
The immutable-plan checks and different-depth-marriage case also pass
(16 tests, 31.11 seconds in the targeted run).

The focused-family compatibility matrix has been expanded from eight to all
13 combinations. The full regression suite, including this expansion and the
explicit crossing-count assertions, passed. After the readable-opening fix,
the full suite passed **874 tests, one optional test skipped, 85 files**, in
198.15 seconds with two workers. The final hit-layer CSS correction then passed
all **27 SvgTreeCanvas tests**, including its new computed-style regression.
Lint, production build, TypeScript, whitespace checks and the scoped
canvas/connection UI detector passed too. The existing bundle-size warning
remains. No deployment, backend, credentials or real family records changed.

The resumed live review inspected a residual shared-parent-set crossing near
synthetic Dedi Hidayat 283 in Chrome. The birth, adoptive and foster routes
remain separate, with their corresponding labels and an isolated bridge, not
a shared junction dot. The selected-person guide retained all recorded parent,
partner and child roles. This closes the previous locked-Mac crossing gate.

That review found and fixed two additional interaction defects:

- Automatic framing of a tall 500-person Full tree previously used zoom
  approximately 0.003, making the initial canvas look almost empty. Full trees
  with at least 100 people now open at readable scale around the selected or
  first recorded person. No selection is forced and all people stay rendered.
  Explicit Fit still displays complete bounds; valid saved viewports remain.
  Both 390- and 1000-pixel regression cases failed before this fix and passed
  afterward.
- Keyboard activation of an offscreen person could scroll the invisible hit
  layer independently by hundreds of pixels. The SVG hit layer now uses
  `overflow: clip`, which prohibits the independent scrolling allowed by
  `hidden` ([CSS Overflow specification](https://www.w3.org/TR/css-overflow-3/#valdef-overflow-clip)).
  After distant keyboard navigation on the 390-pixel view, both overlay scroll
  offsets were zero and avatar/hit-target centers matched within 0.001 pixels.

Current browser checks used only the synthetic manual fixture:

- Chrome desktop: readable 500-person opening, residual crossing inspection,
  and named parent/child navigation.
- Chrome at 390×844: 500 targets in Full, 24 around Dedi in Focus, restoration
  of all 500 on return to Full, no horizontal page overflow, adoptive-parent
  navigation, explicit full overview, and readable distant keyboard selection.
  The temporary viewport override was reset afterward.
- Native Safari: readable initial 500-person rendering, all 500 targets in
  its read-only diagnostic, Focus selection, return to Full, and adoptive-parent
  guide state with a Back action. The final diagnostic confirmed `clip` and zero
  overlay scroll offsets. Its page visibility was `hidden`, so camera animation
  frames were suspended; this is not presented as a fresh foreground Safari
  motion check or a VoiceOver audit. Earlier native interaction evidence is
  retained below.

This completes the scoped representative-family workstream, not a promise
that every possible 500-person graph is crossing-free or that all names fit
legibly in a single overview. Residual bridges, panning, Fit, and the named
connection guide remain important for genuinely interwoven families.

## Acceptance contract

- Exercise connected 100-, 250-, and 500-person archives, including both sides
  of marriages, multiple wives, remarriage, biological and step parents,
  half-/step-siblings, adoption, foster care, and guardianship.
- Preserve all people and recorded parent/partner edges; never “fix” clarity
  by dropping relationships or silently changing parent type.
- Each route must be connected, terminate at its intended people, and avoid
  unrelated avatars, names, and routes that would look like a shared junction.
- Prefer separated household corridors and longer lines over compactness.
  Count and inspect residual crossings; a rendered bridge is not proof that
  its crossing was necessary or understandable.
- Check shuffled input, repeated selection, exports, and Focus windows.
- Verify actual interactive-worker geometry and desktop/mobile browser views,
  not just an export layout without space reserved for relationship labels.
- A broad Full chart must fit its complete bounds and remain navigable back
  to a readable person/family. Selection must not reroute the complete archive.

## Synthetic cases

`web/src/testFixtures/indonesianFamilies.ts` generates deterministic connected
archives with Indonesian names and locations. Numbers in names distinguish
synthetic people; no private archives are used. Generations start historically,
parent ages are at least 18 years, and biological parent counts never exceed
two. Historical people receive synthetic death dates rather than appearing
alive at 200 years old. Tests check adult parent/marriage ages, birth before
death, marriage/divorce before death, references, and connectivity.

The categories are relevant to records, not claims of equal prevalence.
[BPS family-record metadata](https://romantik.web.bps.go.id/rekomendasi-terbit/RUxhMDVVRWFWNDZXNFJ6VGl6dmJLQT09)
recognizes biological, step, and adopted children. Divorce and widowhood are
separate statuses in [BPS marital-status metadata](https://sirusa.web.bps.go.id/metadata/indikator/64368).
Multiple-wife fixtures assume applicable permission requirements were met;
they do not imply automatic legal eligibility. See the
[Kementerian Agama registration guidance](https://tangerang.kemenag.go.id/pendaftaran-nikah).
The app remains a recorder of relationships, not a legal adjudicator.

| Case | Topology exercised |
| --- | --- |
| extended | Multi-generation descendants with spouses and wide sibling families |
| multiple-wives | Three unions per expanded father, separate child sets, explicit half-siblings |
| remarried | Former and current spouses, a wife's former husband and daughter, stepmother/stepfather and step-sibling records |
| adoption | Biological, adoptive/foster children and an additional guardian |
| in-laws | Both spouses' parents, joining independent ancestry branches |
| mixed | All preceding household patterns in one connected archive |
| parent-sets | Birth parents retained alongside a separate adoptive or foster household, including partial one-parent records |
| compound | All household patterns plus each spouse's parents, a sibling and their child, and occasional grandparents; connected spouse ancestry cannot use the isolated-in-law shortcut |
| linked-households | Two unrelated sibling pairs marry across the same two origin households, reconnecting ancestry without a directed pedigree cycle |
| shared-adoption | Several biological siblings retain their birth parents and share a separately recorded adoptive couple; descendant households repeat the pattern |
| shared-parent-sets | Siblings retain birth, adoptive and foster families together, with a separately recorded guardian; descendant households repeat the pattern |
| partial-parent-sets | Three birth siblings have overlapping but different adoption/foster histories: the first two share adopters, the first and third share foster parents, and the third has a separate guardian |
| interwoven | Reconnecting sibling-pair marriages occur within the same archive as multiple wives, remarriage, step/half siblings, separate birth/adoptive/foster parents and guardians |

## Shared sibling ancestry — local Full integration

`sharedAncestryCorridors.ts` handles two distinct parent sets sharing the same
siblings when their descendant household structure can be laid out as a forest.
Instead of squeezing two parallel ancestry rails over one sibling row, it puts
each complete child household between two outside rails and stacks households
vertically. Parent types, separate avatar sockets and individual labels remain
explicit. Childless couples stay together, isolated people remain present, and
the input archive is never modified. Normal one-parent-set households retain
their horizontal sibling layout within the larger drawing.

This is not a workaround that removes a graph cycle's recorded edges. The
temporary placement grouping is separate from the original typed family paths.
Full runs the existing independent admission checks on the actual routed plan;
unsupported overlapping parent sets, additional care loops and intermarrying
ancestry continue to use the general complete layout.

Observed shared-adoption regression, synthetic seed 0:

| People | Before: crossings / missing type labels | Local Full result |
| --- | --- | --- |
| 100 | 32 / 8 | 0 crossings, complete labels and relationships |
| 250 | Earlier crossing count not retained | 0 crossings, complete labels and relationships |
| 500 | 166 crossings after the label-space fix | 0 crossings, all 500 people and 1,163 recorded relationships |

The 500-person result measures about 6,105 × 109,874 layout units. This is
intentionally a long, pannable drawing, not a claim that 500 names can be read
simultaneously on one screen. One sequential live-worker preparation measured
10.7 seconds including the initial general drawing and candidate admission;
initial-load performance still needs improvement. Ordinary selection reuses
the prepared geometry.

Tests cover the actual Full worker entry at 100/250/500 people, visible-label
projection, shuffled input, isolated people, childless partnerships, and 2/4/8
shared siblings with biological/adoptive or biological/foster parent sets in
both languages. SVG tests retain the typed labels. A rendered household crop
from the actual 500-person SVG was inspected: both rails are distinct, labels
are legible, endpoints attach to their own people, and no unrelated junctions
are introduced. This is static rendering evidence, not live Safari/mobile QA.

Compact Focus now reserves an 88-unit child stem where a type label is needed,
instead of the ordinary 40-unit stem; corresponding generation space grows.
The 100-person compact regression keeps every label but still has 32 crossings,
so it is not used as proof of Full clarity. Focus-window UX still needs browser
verification.

Two discarded experiments remain diagnostic evidence, not app dependencies:
ELK 0.12.0 native edge routes produced 3 crossings for a 15-person linked
household (general layout: 2), and 7–8 for shared adoption (general layout: 4).
Simply offsetting a combined family corridor also worsened the 100-person case
to 63 crossings with one missing label. Neither candidate was integrated.

The prior eight-category matrix also passes at 500 people for seeds 2 and 4
after these changes (16 complete drawings, zero crossings and integrity
failures). The shared-adoption fixture's seed variations currently repeat the
same structure, so they are not counted as different topology coverage.
At that checkpoint, 538 tests passed, one optional private-example test
skipped, across 67 files. Build and lint passed; the existing large-bundle
warning remains. No PR, deployment, backend or credential changes were made.

## Reconnecting origin households — local Full integration

`linkedHouseholdCorridors.ts` keeps two origin families on opposite outside
rails and stacks their children's complete married households between them.
The ancestry rail attaches to the actual child on each side of a couple, not
to an invented shared person. Recorded family membership determines that
orientation, not gender or surnames. Childless partners and isolated people
remain visible; records and logical generations are unchanged.

The linked-households fixture now has zero crossings at 100, 250 and 500
people (184, 468 and 941 relationships respectively). The previous 100/500
counts were 24/266. The live 500-person preparation measured 8.3 seconds and
6,105 × 112,724 layout units. These are long, pannable diagrams, not a promise
of simultaneous readability at full-fit scale. Tests cover input shuffling,
reassigned person/relationship IDs, both languages, visible terminals and SVG
exports. Static 15-person and actual 500-person household renders were checked.

## Mixed reconnecting families — substantial improvement, not finished

The new interwoven case deliberately combines the preceding patterns in one
archive. Fixture validity is checked for all 11 categories at seeds 0, 2 and 4;
validity alone is not clarity evidence. The mixed case exposed two distinct
problems:

- An earlier route detour could occupy another family's provisional join.
  The general router now relocates the connected internal joins while keeping
  real person ports fixed. If a whole-network shift is impossible, one complete
  horizontal level can move independently, with connectedness, orthogonality,
  obstacles and terminal directions checked. The 500-person seed-4 case went
  from two overlapping segments and one failed family to neither. The recovery
  tests explicitly bypass Full alternatives so a better layout cannot mask a
  general-router regression.
- No whole-branch alternative previously handled cycles mixed with multiple
  unions and care relationships. Full now tries four deterministic placement
  scaffolds. A scaffold chooses where to place people, **not which relationships
  to draw**: every reconnecting edge is explicitly restored before routing.
  Candidates with upside-down parent directions are rejected early; complete
  routed candidates must pass the independent admission checks and improve
  the actual crossing count. Existing clear compact/household layouts still
  take precedence. Focus does not use these alternative scaffolds.

Scaffold checkpoint through the actual Full preparation entry, 500 synthetic people:

| Seed | Relationships retained | Previous crossings | Local crossings | Integrity failures |
| --- | --- | --- | --- | --- |
| 0 | 1,381 | 333 | 101 | 0 |
| 2 | 1,370 | 384 | 113 | 0 |
| 4 | 1,384 | 593 | 117 | 0 |

The seed-4 general join repair alone reduced 593 to 592; the coordinated layout
reduces that to 117. All type labels, terminals and original records remain.
The 100-person seed-0 case reduces 37 to 12. A discarded forward-order scaffold
had only eight crossings there but placed two parents below their children;
the admission checks correctly reject it despite the lower crossing count.

At that checkpoint, 500-person preparation took 13–33 seconds including the initial general
drawing, candidate search and admission. Bounds range from approximately
125,301–192,561 wide and 7,028–14,974 high. Initial-load time, very long traversal
distances and residual crossing clusters remain unresolved. A static crop of
the actual seed-4 drawing showed a seven-crossing cluster near a multiple
union; this is concrete evidence that the overall clarity goal is not met.

New tests cover actual 500-person Full results, independently preserved typed
paths, selected/unselected projections, English/Indonesian SVGs, renamed and
reordered records, unchanged Focus geometry, and rejection of invalid scaffold
directions. Browser usability is still unverified while the Mac is locked.

Verification at this checkpoint: 582 tests passed, one optional private-example
test skipped, across 70 files. The eight original categories also passed the
500-person seed-4 Full integration matrix, each with zero crossings and no
integrity failures. Build, lint, whitespace checks and the scoped layout
detector passed; the existing large-bundle warning remains. This is local-only
work: no commits, PRs, deployments, backend or credential changes.

### Complete-diagram connector detours

Full now reconsiders crossing family segments against the **complete** routed
diagram, including marriages and families added later in the routing order.
`untangleFamilyRails.ts` keeps people, records and every real parent/child
attachment fixed. A finite set of longer side routes can pass around blocking
segments; inset bends preserve existing joins and vertical endpoint directions.
Already-clear routes stay unchanged. Focus does not run this pass.

A proposed detour is not accepted on its local crossing count alone. Full
rebuilds the whole connection plan and its relationship labels, then requires
fewer actual crossings and a complete valid drawing. The admission gate now
also rejects missing care labels, incorrectly grouped parent sets, absent
parent-type annotations and annotations mapped to the wrong records.

| 500-person seed | Relationships retained | Scaffold crossings | With detours | Integrity failures |
| --- | --- | --- | --- | --- |
| 0 | 1,381 | 101 | 31 | 0 |
| 2 | 1,370 | 113 | 34 | 0 |
| 4 | 1,384 | 117 | 38 | 0 |

All three actual Full integration regressions retain every person and recorded
relationship and pass the independent geometry/type-label checks. The detour
pass on prepared scaffold geometry measured approximately 1.5–1.7 seconds;
one complete seed-4 Full preparation measured 37.5 seconds. These are different
measurements, not an initial-load speedup claim. Bounds remain unchanged.

The actual seed-4 SVG was rendered and inspected after the change. Connections
and labels remain attached, but the densest inspected region still contains
five crossings, including closely paired parent/marriage paths across a long
rail. Small return bends and long travel distances also need attention. Fewer
crossings is progress, not proof that this full chart is clear enough to ship.
A second identical detour pass did not improve these three cases. A separate
ancestor-root placement experiment was discarded: it did not improve the
100-person crossing counts and made the chart wider.

Verification after integration: 588 tests passed, one optional private-example
test skipped, across 71 files. The eight original categories were also rerun
at 500 people, seed 4: all passed with zero crossings and no integrity failures.
Tests include both languages, exact attachment
preservation, selected/unselected projections, unchanged Focus geometry and
invalid-label rejection. Build, lint, whitespace checks and the scoped layout
detector passed; the existing large-bundle warning remains. Browser usability
remains unverified while the Mac is locked. All changes remain local; nothing
was committed, pushed or deployed.

### Whole reconnecting sibling-family blocks

The remaining interwoven fixture crossings came from repeating eight-edge
loops: two origin families have two sibling pairs who marry each other. The
seed-4 archive contains 12 such blocks, including blocks sharing a family
attachment. Individual marriage-segment detours made no further improvement.

`familyCycleBlocks.ts` now identifies complete undirected edge blocks without
discarding their connections. `reconnectingFamilyCorridors` composes supported
blocks inside the whole-branch layout. Each sibling couple keeps its attached
unions, care branches and descendants in a separate region; both origin
families have outside rails. Real people occur once, logical generations and
recorded parent sets stay intact, and every original edge is routed. Mirrored
branches retain their actual attachment sockets. The drawing starts from the
parentless ancestor with the broadest recorded descendant reach, rather than
allowing an added guardian's identifier to determine the starting branch.

This candidate recognizes the specific two-origin/two-couple loop topology,
not every possible reconnection. More complicated blocks are declined and
retain the complete existing fallback. Full still admits a new drawing only
after independent geometry, record, label and parent-direction checks; it
keeps already-clear layouts and does not alter Focus preparation.

| 500-person seed | Relationships retained | Segment-detour crossings | Whole-block crossings | Integrity failures |
| --- | --- | --- | --- | --- |
| 0 | 1,381 | 31 | 0 | 0 |
| 2 | 1,370 | 34 | 0 | 0 |
| 4 | 1,384 | 38 | 0 | 0 |

These zero-crossing results pass through the actual Full preparation entry,
not only a standalone builder. Additional tests cover six mixed-family seeds
at 100 people in both languages, renamed and shuffled records, explicit extra
guardian entry points, preservation of mirrored terminals, unsupported cycle
shapes and 500-person English/Indonesian SVG exports. The extra-guardian tests
initially exposed invalid joins when a newly added carer became the starting
point; the ancestry-root selection fixed those cases without suppressing their
care relationships or weakening admission.

The current seed-4 candidate occupies about 191,332 × 13,756 layout units.
Its builder, routing and integrity measurements took 1.5 seconds in a separate
run, excluding the initial general layout/plan. Full still builds that general
plan first, so this is not a claim of 1.5-second initial loading. A rendered
crop from the actual 500-person candidate was inspected: the sibling ancestry
rails remain separate, both real partners attach to their marriage/parent
paths, and descendant connections do not cross the neighboring household.
The wide chart still requires substantial panning; a static crop does not
prove desktop/mobile navigation is comfortable.

Verification for this change: 612 tests passed, one optional private-example
test skipped, across 73 files. The eight original categories also passed again
at 500 people, seed 4, with zero crossings and integrity failures. Build, lint,
whitespace checks and the scoped layout detector passed. An initial full-suite
run alongside a build and another stress run timed out on the existing
500-person shared-adoption test; rerunning the unchanged suite without those
concurrent jobs passed in 70 seconds. No test timeout or assertion was relaxed.
The existing large-bundle warning remains.

Remaining at that checkpoint: cover broader reconnections and more than two/partially overlapping
parent sets; verify age-only shared labels, large-chart export sizing,
initial-load performance and live desktop/mobile usability. The Mac's lock
screen still blocks Safari verification. The overall goal remains active;
these are local Web changes, not a deployment or native-platform migration.

### Three recorded parent sets and separate carers

The shared-parent-sets fixture adds a broader historical record: three siblings
retain their biological, adoptive and foster families, and one has a separate
guardian. It does not imply simultaneous custody or merge six adults into one
parent set. Fixture validation at that checkpoint covered 12 categories; seeds of this new
category vary names, not independent topologies.

The original compact plan omitted some required parent-type labels when three
sets and a carer converged. It now reserves additional child-stem space and
orders the central biological connection above flanking ancestry stems.
All labels survive in both compact preparation and actual Focus windows;
compact crossing counts are not claimed as Full clarity evidence.

Full's shared-ancestry placement now supports three disjoint parent sets that
have the same recorded children. Their complete child households are stacked
between separate outside rails. An isolated carer sits below the ancestry
rails with a distinct dashed, labeled path, never inside the ancestry group.
For nested households, the parent set with earlier ancestry occupies the
outermost position. Its first-child line can pass above the other joins,
removing a crossing at each nested household's entrance. This choice depends
on the recorded graph, not gender, parent type, names or identifier order.

| People | Original crossings / missing type labels | First complete three-set drawing | Current crossings / missing labels | Records retained |
| --- | --- | --- | --- | --- |
| 100 | 82 / 3 | 21 / 0 | 11 / 0 | 242 |
| 500 | 413 / 13 | 109 / 0 | 55 / 0 | 1,217 |

The current 500-person drawing has one crossing within each of 55 three-set
cohorts. Tests require both routes at every residual crossing to belong to the
same recorded child cohort, with no second crossing in that cohort. No route
crosses a neighboring household in these cases. This is a measured result,
not a proof of a global minimum or a crossing-free result. All independent
record, terminal, direction, overlap, label and obstacle checks pass through
the actual Full preparation entry at 100, 250 and 500 people.

The 500-person command-line diagnostic measured 14.2 seconds and approximately
10,185 × 160,100 layout units; the 100-person diagnostic measured 1.4 seconds.
These include Full preparation plus extra independent geometry/admission
measurements outside the worker. They are not browser-load timings. Initial
preparation and long-distance navigation still need profiling and usability
verification. Ordinary selection reuses the prepared geometry.

Additional tests cover an incoming biological, adoptive or foster set after
renaming and reversing records, one-parent foster sets, both languages,
visible-label projection, exact archive preservation, and isolated guardians
or step-parents. A complete ten-person SVG and a crop around a residual crossing
in the actual 500-person SVG were inspected together. The paths have distinct
terminals and readable type labels at detail scale; the bridge remains separate
from the shared branch junction. This is static diagram evidence, not a live
Safari, mobile or interaction verification.

At that checkpoint, partially overlapping child cohorts, shared adults between
parent sets and connected care loops still needed broader routing support. Unsupported cases
retain the complete general fallback. Browser usability remains unverified
while the Mac is locked. No backend, native, credential or deployment changes
were made.

Verification for this checkpoint: 628 tests passed, one optional private-example
test skipped, across 74 files. The original eight-category matrix passed again
at 500 people, seed 4, with zero crossings and integrity failures. Build, lint,
whitespace checks and the scoped layout detector passed. The existing bundle
size warning remains. Verification jobs ran sequentially to avoid contending
with the large-family tests.

### Overlapping, rather than identical, sibling histories

The thirteenth synthetic category records different care histories for three
birth siblings. Only two have the same recorded adoptive parents; a different
pair has the same foster parents. No adoption or foster connection is inferred
for the remaining sibling. The historical fixture retains plausible adult
ages and explicit relationships, not a claim about custody or prevalence.

The shared-ancestry builder now groups parent sets whose recorded child lists
overlap, including transitive overlap, for placement. It draws each original
parent set using its original child list and relationship IDs. Every child and
their complete descendant household is placed exactly once. Shared children
lead a partial cohort; subsequent ordering finishes the inner family's own
branches before the outside line continues. Ordering uses membership rather
than names or import IDs. The prior outside-ancestry placement is preserved.

| People | Original crossings | Current crossings | Original missing guardian labels | Current missing guardian labels | Records retained |
| --- | --- | --- | --- | --- | --- |
| 100 | 71 | 0 | 6 | 0 | 198 |
| 500 | 356 | 0 | 27 | 0 | 997 |

The earlier quality measurements did not count missing care labels separately;
the independent admission gate rejected the old drawing despite otherwise
clean geometry metrics. The diagnostic now reports `unlabeledCareLabels`.
Care labels may use a clear vertical stem when no horizontal segment has room,
and an unplaceable label now produces a `care-label` plan failure. A negative
test deliberately removes a label and separately forces placement to fail,
proving both checks detect the defect. Missing labels are not treated as a
successful clear route.

Actual Full preparation passes at 100, 250 and 500 people, including every
person, exact per-family child/parent membership, every relationship ID,
complete labels, ports, directions and non-overlapping routes. Tests rename and
shuffle records, inspect English/Indonesian SVG labels, project visible lines,
and keep each Focus child's own recorded parents and guardian. The 500-person
command-line diagnostic took 11.1 seconds including Full preparation and extra
independent integrity checks, and occupies about 10,185 × 160,100 units.
This is not a browser-load measurement. Clarity improved, but initial
preparation still needs profiling and the chart requires long-distance navigation.

A complete ten-person SVG and a detail from the actual 500-person SVG were
inspected together. The latter shows only the child's recorded birth/foster
lines and separate dashed guardian line, without an invented adoption line.
That inspection also caught the birth-order badge covering the care terminal.
All Web projections now share a lower-left badge position, leaving the upper
avatar edge clear. Geometry tests check the full upper semicircle and side
marriage ports; SVG and PNG-source tests verify placement. A final rendered
detail confirms the care line reaches the avatar unobscured. This does not
replace live Safari/mobile verification, which remains blocked by the locked
Mac.

The builder still declines overlapping adult sets, more than three connected
parent sets, multiple incoming ancestry attachments and connected care loops;
those retain complete general routing. Further coverage, initial-load speed,
large-chart PNG sizing and actual Full/Focus navigation remain open. These are
local Web changes only, with no commits, deployment, backend or native changes.

Verification for this checkpoint: 641 tests passed, one optional private-example
test skipped, across 75 files. The original eight-category matrix passed at
500 people, seed 4, with zero crossings and integrity failures. Build, lint,
whitespace checks and the scoped layout detector passed. The existing large
bundle warning remains. The final static render confirms the badge correction;
live browser inspection is still unavailable on the locked Mac.

## Faster preparation with unchanged routes (2026-09-07)

CPU profiles of actual layout, baseline routing, and Full candidate routing
identified two avoidable costs: alternative spouse ports that cannot improve
an already-found route, and repeated checks against every distant obstacle.
The local router now:

- Applies the existing Manhattan-distance-plus-port-penalty lower bound
  before quick searches as well as before fallback searches. Bends and
  crossings have nonnegative costs; equal-cost later candidates never won
  before, so tie ordering remains unchanged.
- Sorts obstacles only when detour candidates are needed. Straight routes
  and yes/no clearance checks do not depend on obstacle ordering.
- Builds short-lived axis indexes only for repeated checks against at least
  64 obstacles. The first check still uses the exhaustive predicate. Indexed
  checks exclude only rectangles entirely off a segment's fixed axis, and
  use the original precise clearance and circle-terminal rules for all
  possible collisions. Indexes are not shared across searches, archive
  changes, or placement of a new relationship label.

Fresh-process, CPU-profiled samples on this Mac, in seconds:

| 500-person fixture | Seed | Before: layout / baseline / Full | After: layout / baseline / Full | Total before → after |
| --- | --- | --- | --- | --- |
| partial-parent-sets | 0 | 0.124 / 3.008 / 7.877 | 0.328 / 0.716 / 0.531 | 11.0 → 1.6 |
| compound | 4 | 0.191 / 7.112 / 1.729 | 0.243 / 2.583 / 0.686 | 9.0 → 3.5 |
| interwoven | 4 | 0.234 / 30.347 / 1.404 | 0.236 / 8.028 / 0.692 | 32.0 → 9.0 |

These are computational samples with profiling overhead, not browser load
times, device-independent budgets, or evidence that every initial load is
fast enough. Independent route diagnostics, hashing and file serialization
ran **after** these phase timers stopped. The remaining difficult detour
searches, especially in the interwoven compact baseline, still need attention.

Each fixture's complete serialized layout and connection plan has the same
SHA-256 before and after the optimization. All three retain zero crossings,
obstacle hits, unrelated overlaps, missing records, missing terminals,
disconnected routes, reversed parent directions, and missing parent/care
labels. This pass changes search work, not the layout/admission policy.

Regression tests compare the indexed predicate with the exhaustive one for
shuffled obstacles, both line directions, all obstacle kinds, tolerance
boundaries, circle sockets, node-label exits and owner restrictions. Operation
counts also check that distant rectangles, losing spouse ports, and clear-rail
sorts are actually skipped, without hardware-sensitive timing assertions.
Browser, phone and export visual acceptance remain pending; identical routed
geometry is not a replacement for those checks.

Verification after these changes: 647 tests passed across 76 files, with one
optional private-archive example skipped. A separate eight-category 500-person
Full matrix at seed 4 passed all crossing and integrity assertions (eight
other tests were excluded by that command's name filter). Production build,
lint and whitespace checks passed. The existing large-JavaScript-chunk build
warning remains; these changes do not claim to solve download performance.

## Reconverging ancestry and shared-loop marriages (2026-09-07)

The new `cousinFamilyFixture` adds one synthetic adult-cousin marriage to an
existing extended, compound, or interwoven archive without changing its people
or earlier relationships. Both adults are previously unmarried, have distinct
recorded parents, share a biological grandparent, and are not direct ancestors
of each other. Their marriage date is at least 25 years after both birth years,
before either recorded death, and no later than 2026. Seeds 0, 2, and 4 have
fixture-validity coverage at 500 people. This is a graph-coverage scenario, not
a claim about prevalence or universal eligibility across religions and customs.
It assumes the other applicable marriage conditions are met.
[Kemenag Jembrana discusses cousin marriage](https://bali.kemenag.go.id/jembrana/berita/39873/hukum-menikah-dengan-sepupu).

Full's reconnecting candidate now supports two additional structures:

- Two ancestry paths from one origin reconverging at a later family union.
  Complete attached households face outward on opposite arms; the shared
  descendants sit below both arms. The origin may be a person, which retains
  half-cousin relationships through a grandparent's separate unions.
- Two loops sharing an ancestry path. A bounded topological search assigns
  their arcs to two outside corridors without interleaving on either side.
  Each member keeps its entire attached household region. Parent directions,
  circle/label sockets, care labels, and every recorded relationship are still
  validated by the complete-plan admission gate. The search is limited to
  24 block members, 32 edges, and 4,096 partial orders; unsupported structures
  decline rather than dropping records. Existing shared-parent-set layouts
  retain their separate placement policy.

Actual Full preparation, seed 0, with the additional marriage:

| Scenario | People | Before crossings | After crossings |
| --- | --- | --- | --- |
| Compound | 100 | 2 | 0 |
| Compound | 250 | Not sampled | 0 |
| Compound | 500 | 15 | 0 |
| Interwoven | 100 | 12 | 0 |
| Interwoven | 250 | Not sampled | 0 |
| Interwoven | 500 | 32 | 0 |

The 500-person compound and interwoven results retain all 1,101 and 1,382
recorded relationships respectively. Every listed after-result also has zero
missing routes, invalid terminals, disconnected routes, diagonals, obstacle
hits, overlapping people, upward-facing parent relationships, conflated parent
sets, missing parent/care labels, and unrelated overlapping segments. These
are synthetic computational checks, not a proof of clarity for arbitrary
archives. Other seeds' fixture validity alone does not prove their routing.

Renaming every person/relationship identifier and reversing the record arrays
also passes complete zero-crossing checks for 100-person compound and
500-person interwoven examples in English and Indonesian. Reversed input
produces the same geometry, and SVG exports retain every person name and
family/relationship path. A failed first ordering attempt under renamed IDs
led to earlier pruning: the bounded search now rejects already-proven
interleavings in partial orders, without increasing its work limit. Focus
remains compact for either cousin and retains the expected selected ancestry
and siblings without applying the Full corridor layout.

This pass also corrects offset marriage ports: a port 12 units above/below the
avatar's center now lies on the circle, not on its bounding square. Independent
route measurements now inspect the actual first/last endpoints and exact
circle radius, rather than allowing an intermediate point or square contact.
The production admission gate was already stricter than the old test metric.
Tests explicitly reject a forged square-contact route even when its plan
claims to be valid. The earlier performance-only hash comparison above remains
a historical checkpoint; this new pass intentionally changes geometry.

Static review inspected family-sized crops from the actual 500-person SVG
exports. The compound marriage and its incoming birth/foster lines are distinct
and attached, and both ends of the harder interwoven marriage are readable and
separate from ancestry. The latter remains a long outside route with several
bends; these crops do not establish whole-chart navigation usability. The Mac
was locked, so no fresh Safari, Chrome, phone or browser-PNG acceptance is
claimed. This pass follows the layout skill's clarity-first guidance; it does
not change the product's visual style or claim all 500-person work is finished.

The complete application suite passes: 666 tests across 78 files, with the one
optional private-archive example skipped. Initial full-run timeouts in the
synthetic cousin generator were corrected by indexing parents, partners and
grandparents and caching ancestry checks. No test timeout or routing
assertion was relaxed. A separate eight-category 500-person Full matrix at
seed 4 also passes all integrity and zero-crossing assertions; nine other
tests were excluded by that command's name filter. Build, lint, whitespace and
the scoped layout detector pass. The existing large-JavaScript-chunk warning
remains (main bundle 761.50 kB, 235.96 kB gzip; preparation worker 174.93 kB).

## Descendant exits from nested family loops (2026-09-07)

The extended cousin-marriage matrix exposed two more interwoven failures:
the household that sends a descendant branch outside a loop could occupy its
first row, so that branch crossed the next household's join. Complete-plan
validation correctly declined those candidates, leaving the crossed fallback.
Loop placement now puts that exit household below its sibling households.
This includes exits owned by a containing loop, not only the immediately
preceding traversal edge. No admission check is relaxed and no record is removed.

Fresh actual Full preparation at 500 people, with one additional cousin union:

| Scenario | Seed | Recorded relationships | Before crossings | After crossings |
| --- | --- | --- | --- | --- |
| Extended | 2 | 874 | 0 | 0 |
| Extended | 4 | 874 | 0 | 0 |
| Compound | 2 | 1,072 | 0 | 0 |
| Compound | 4 | 1,098 | 0 | 0 |
| Interwoven | 2 | 1,371 | 35 | 0 |
| Interwoven | 4 | 1,385 | 39 | 0 |

Every after-result retains all 500 people and all recorded relationships,
with zero missing routes/terminals, disconnected routes, diagonals, obstacle
hits, person overlaps, reversed parent directions, conflated parent sets,
unlabeled parent/care types, unrelated overlaps, or routing failures. The two
interwoven cases now have explicit Full and visible-plan regression tests.
Single local preparation samples improved from 40.4/52.8 seconds to 3.8/5.7
seconds; the final six-case rerun measured 3.8/6.0 seconds for those cases.
These are computational samples, not browser-load or cross-device guarantees.

Browser access became available for this pass. The in-app browser fitted all
500 interwoven seed-2 people with no person bounds outside the viewport and
no page overflow. Selecting Wulan Wulandari 16 framed a readable household.
At 390×844, Focus showed eight relatives; selecting the visible child Nur
Wulandari 18 showed seven relatives and kept the selected name readable with
no page overflow. The temporary viewport override was reset. Distant relatives
still need panning at readable scale; Fit remains a separate full overview.

Native Safari loaded the same 500-person synthetic variant after a reload.
Its very small Full overview is not readable without zoom and does not prove
individual-route clarity. In Focus, selecting Wulan showed attached parent,
spouse, and child lines; selecting Nur directly then centered the child with
both parents and their recorded ancestry retained. These are meaningful Focus
navigation checks, not whole-Full or phone-Safari acceptance. A new Chrome
synthetic tab could not attach its debugger and its native content remained
blank, so this pass claims no new Chrome acceptance. No private archives were
read, imported, changed, or uploaded. Browser PNG checks and broader Full
navigation remain pending; the larger clarity goal is not complete.

Verification: 668 tests passed across 78 files, with one optional private-data
test skipped. Build, lint, and the scoped layout detector passed. The existing
large-bundle warning remains (main JavaScript 761.60 kB, 236.02 kB gzip;
preparation worker 175.05 kB). Changes remain local, with no release or deployment.

## Marriages joining different ancestry depths (2026-09-07)

`crossGenerationFamilyFixture` adds one recorded marriage to the compound
fixtures without changing any person or earlier relationship. Both partners
are unmarried, childless adults with disjoint recorded parent/care ancestry.
Their longest recorded ancestry paths have different depths. The date is at
least 25 years after both birth years, before either recorded death, and no
later than 2026. These historical stress cases include large age differences;
they are not a claim about typical Indonesian marriages, and assume other
applicable marriage conditions are satisfied. Recorded ancestry depth is not
an age or biological-generation label.

The added union creates longer simple loops with multiple origins. Full now
uses the existing bounded two-sided ordering certificate for these loops,
instead of recognizing only adjacent sibling pairs and single-origin loops.
The same 24-node/32-edge/4,096-partial-order bounds remain. Unsupported shapes
and invalid plans still decline without discarding recorded relationships.

A remarriage within one such loop exposed a separate constraint: a step-parent
whose connection is represented through their spouse could land below that
spouse's earlier children. When the couple has such a recorded shared step-path,
their complete outside households now sit beside each other. Each retains its
own former unions and descendants; only the current family's rail is shared.
The moved household retains its exact attachment socket. Merely rerooting the
loop did not fix reciprocal step-parent relationships and was not retained.

Actual Full preparation results for the added-marriage fixtures:

| People | Seed | Recorded relationships | Before crossings | After crossings |
| --- | --- | --- | --- | --- |
| 100 | 0 | 230 | 1 | 0 |
| 100 | 2 | 201 | 1 | 0 |
| 100 | 4 | 212 | 3 | 0 |
| 250 | 0 | 556 | Not sampled | 0 |
| 250 | 2 | 527 | Not sampled | 0 |
| 250 | 4 | 538 | Not sampled | 0 |
| 500 | 0 | 1,101 | 16 | 0 |
| 500 | 2 | 1,072 | 10 | 0 |
| 500 | 4 | 1,098 | 13 | 0 |

Every after-result also has zero missing routes/terminals, disconnected routes,
diagonals, obstacle hits, overlapping people, reversed parent directions,
conflated parent sets, missing parent/care labels, unrelated overlaps, or
routing failures. Both raw and visible plans pass. The 500-person seed-0 case
also passes after renaming every identifier and reversing record arrays, in
English and Indonesian. SVG tests retain all names and family/relationship
paths. Both new partners' Focus windows retain the expected people and compact
geometry. The old cyclic-union fallback test now requires a complete,
zero-crossing improvement, since its shape is newly supported.

The in-app browser rendered all 500 people with no page overflow. A selected
Full person showed separate, attached ancestry and union lines at readable
zoom; their distant destinations extend offscreen. This is not whole-household
or whole-Full navigation acceptance. At 390×844, Focus showed five people,
kept Ayu Saputra 24 readable, and supported clicking her visible father Dedi
Saputra 23 directly. After settling, the father's name was inside the viewport
at x=115.9, y=542.1, width=94.2, height=15, with no page overflow. Distant
relatives still require panning. The viewport override was reset. No new
native Safari/Chrome or browser-PNG acceptance is claimed in this pass.

Verification: 681 tests passed across 79 files; one optional private-archive
test was skipped. Build, lint, the scoped layout scan and whitespace checks
passed. The existing large-bundle warning remains (763.11 kB main JavaScript,
236.47 kB gzip; 176.47 kB worker). The layout skill's guidance informed the
household grouping and separate paths, preserving the incumbent visual style.
Changes are local only. Long-route wayfinding and broader graph/browser
acceptance remain unfinished, so the overall 500-person goal is still active.

## Following offscreen connections in Full (2026-09-07)

Long clear routes still left a selected person with every destination offscreen.
Full now provides a selected-only Connections guide, above the existing
bottom-left view tools. Named relatives retain every recorded role, including
former partnerships and gender-neutral parent/care labels. It offers direct
camera navigation and a bounded return trail without filtering the 500-person
archive or reintroducing the removed global person-search section.

`connectionTrace.ts` emphasizes only the relevant recorded parent/child paths,
partnerships, and explicit sibling connections. It follows step-parent and
sibling paths represented through shared parent rails instead of adding
duplicate lines. Graph traversal is restricted to each individual family:
foreign crossings do not become attachments. Real within-family intersections
are split for tracing. All other routes remain visible at their normal weight,
and existing crossing bridges retain their separation. Exports are unchanged.

`connectionTrace.test.ts` selects **every person** in three 500-person archives
(compound, multiple-wives, shared-parent-sets), requiring every recorded direct
edge to have a represented trace. It also checks that every traced segment is
actually present in the highlighted render paths, not just recorded in a set,
and that preparation data is immutable. Both endpoints of the different-depth
marriage are covered separately. A sibling stem unrelated to the selected
child remains unhighlighted. These are selection/trace checks, not new evidence
that the shared-parent-set residual crossings have all been eliminated.

Browser verification on the local synthetic compound fixture retained all 500
person targets. Overview selection exposed overlapping 44px transparent hit
targets selecting the wrong record; pointer resolution now uses nearest visible
person position, with explicit keyboard activation unchanged. The same Dedi
Pratama 3 selection then selected the intended record and displayed eight
highlighted connector paths. The guide showed parents, spouse, and children;
choosing spouse Ayu Pratama 4 selected that offscreen person, closed the list,
and supplied a named return action. At 390px width the guide stayed inside the
viewport (290px panel, 274px list buttons) without horizontal page overflow.
Return restored the original selected record and retained all 500 people.

A responsive resize initially replaced a selected-person camera position with
a tiny Full overview. The resize callback now uses the latest selection and
frames that person. Its regression also asserts that the complete tree remains
mounted. Focus and explicit Fit retain their separate behavior.
Phone person-navigation zoom is bounded at 0.85 rather than shrinking names
to overview size. The final 390px browser jump to Ayu Pratama 4 settled at
that zoom with a 54.4px person target centered at x=195, all 500 targets retained,
and the return action still available.

Verification: the complete suite passed **699 tests with one optional skipped
test across 81 files**. After the final minimum-zoom adjustment, all 24 canvas
tests passed again; lint, production build, the scoped layout scan, and whitespace
checks passed. The existing main-bundle size warning remains (770.79kB raw).

Further acceptance remains necessary: native Safari/Chrome checks, readable
whole-household context across the remaining 500-person matrices, residual
shared-parent-set crossings, and browser-rendered large PNG inspection. The
guide improves traceability; it does not establish universal Full-tree clarity.
All work remains local; no archive data, releases, deployments, or backend changed.

## Related birth and adoptive households (2026-09-07)

The new `relatedParentSetsFixture` adds the same two recorded parents to a
birth father and an adoptive father, making them brothers. Their separate
households, original birth/adoption/foster histories, guardian records and
descendants remain unchanged. This is synthetic historical relationship data,
not a custody determination or a claim about legal adoption eligibility.
Kinship care is relevant to the Indonesian record model: the education
ministry's [positive-parenting material](https://repositori.kemendikdasmen.go.id/4992/)
describes care by close relatives when biological parents cannot provide it.
That source supports including kinship care, not the legal status of any
particular synthetic adoption.

Previously, multiple incoming parents made the shared-ancestry layout reject
the whole archive, even when both came from one recorded origin household.
The layout now draws their joined descendant cohort once and connects both
original ancestry stems. In a three-parent-set cohort, the two related entry
households occupy opposite outside positions. The second incoming stem no
longer cuts through the first household's child connector. An isolated carer
attached to the second entry is preserved as a separate labeled connection.
Distinct origin households and more complex care loops still require the
general layout; the independent complete-routing gate is unchanged.

Actual Full preparation, synthetic seed 0 (retained pre-change bundle compared
with current source; all integrity checks zero in both):

| Pattern | People | Previous crossings | Current crossings |
| --- | --- | --- | --- |
| Related birth/adoptive fathers | 100 | 32 | 0 |
| Related birth/adoptive fathers | 500 | 165 | 0 |
| Same related fathers, plus foster histories | 100 | 108 | 10 |
| Same related fathers, plus foster histories | 500 | 563 | 55 |

The remaining crossings belong to three-parent-set shared-child cohorts,
at most one crossing per cohort—not the incoming ancestry or a neighboring
household. This does not establish a mathematical crossing minimum or prove
that every residual crossing is easy to trace. The 500-person drawings remain
large: roughly 6,105 × 109,762 and 10,185 × 160,442 layout units respectively.
The offscreen Connections guide and readable camera navigation remain important.

`relatedParentSets.test.ts` covers 100/250/500 people and seeds 0/2/4 for both
patterns, all person/record IDs, original parent-set membership and labels,
ports, connected routes, no collisions or false overlaps, and localized visible
plans. Renamed/reversed 500-person inputs are checked in English and Indonesian,
including every person and connection in SVG exports. Focus retains the
recorded families of both brothers and a shared child. Fixture tests check
adult parent/marriage ages, death ordering, unique IDs, connectivity and at most
two biological parents. Strictly increasing parent-to-child birth dates also
exclude directed ancestry cycles.

The in-app browser rendered all 500 people and a readable selected adoptive
household in Full. At 390 × 844, Focus showed the selected person's 18-person
window with page width remaining 390. This is local interaction evidence, not
complete cross-browser or whole-chart export acceptance.

Native Safari is available again. A follow-up isolated the missing person
buttons to a size boundary in the native accessibility inspection path:
`/tests/manual/accessibility-targets.html`, containing plain buttons without
canvas, transforms, positioning or hidden content, lists all 499 buttons but
no buttons at 500. This corrects the earlier suspicion that the app's
transformed hit-target layer caused the missing inspection output. It does
not establish how VoiceOver itself behaves.

The synthetic canvas's read-only **Diagnostik tombol** panel confirms 500
rendered person targets, visible sampled targets approximately 44 pixels wide,
and pointer hits. Both the 2D-transform and screen-coordinate positioning
experiments were reverted because neither changed the inspection boundary.
No production workaround for this inspection limitation remains.

With the original target positioning restored, native Safari pointer selection
opened Siti Lestari 11. The Connections guide then moved to spouse Dedi Pratama 3,
listed his birth/adoptive/foster parents with distinct labels, navigated to
adoptive father Fajar Pratama 5 and his father Sutrisno Pranoto, and returned to
Fajar using Back. A rendered crop showed Fajar's readable name, spouse and
highlighted connection. The synthetic archive remained at 500 people in Full.
This verifies that navigation path, not all native-browser interactions,
screen-reader behavior, or whole-chart readability.

Verification: **725 tests passed, one optional stress test skipped, 82 files**
with `vitest run --maxWorkers=2`; lint, production build, whitespace checks and
the scoped layout detector passed. The initial fully parallel run hit the
existing 30-second timeout in one different-depth-marriage export test; that
entire 13-test file passed alone, and the bounded-worker full rerun passed
without changing time limits or assertions. The existing bundle-size warning
remains. No commit, PR, deployment or real archive mutation was performed.

After reverting the positioning experiments, the focused canvas/navigation,
view-selector, complete Fan-name and motion checks passed again: **65 tests,
7 files**. Lint, production build and whitespace checks also passed. The
diagnostic pages are development fixtures only, are absent from the production
output, and do not read saved archives or change family records. The existing
bundle-size warning remains.

## Avoid routing a discarded large drawing (2026-09-07)

Full preparation can now supply its incumbent route lazily. For at least 100
people, the existing shared-sibling and linked-household builders may run first.
Only a zero-crossing candidate passing the unchanged complete-routing gate
can skip the incumbent. Candidates with crossings or invalid records, labels
or terminals still require the established comparison. Attempted candidates
are cached within that preparation, including declined builders, so the
fallback does not repeat their routing work.

Shared ancestry takes this early path only when distinct recorded parent sets
share at least two children. The first broad regression run caught unnecessary
expansion of the already-clear ordinary `parent-sets` case; this structural
guard fixes that regression without relaxing its existing assertion. Small
trees and Focus retain the established path. Ordinary `extended` and
`parent-sets` regression cases retain their compact geometry.

New tests compare complete 500-person shared-adoption and linked-household
layouts/plans against the eager path for exact equality, including every
person, record, point, route and label. They also check live preparation,
restored role metadata, immutable inputs, one-time fallback, candidate reuse,
and rejection of apparently valid zero-crossing candidates with missing
records, wrong terminals or absent type labels.

Three sequential local samples per path, alternating order, with no test/build
job running concurrently (includes layout, routing and admission, not browser
startup or rendering):

| 500-person case | Eager median | Lazy median | Crossings unchanged |
| --- | --- | --- | --- |
| Shared adoption | 720 ms | 511 ms | 0 |
| Linked households | 589 ms | 397 ms | 0 |
| Shared birth/adoptive/foster sets | 1,086 ms | 1,090 ms | 55 |

These are host-specific measurements, not a cross-device guarantee. This pass
improves time to a clear drawing; it does not reduce the remaining crossings
or establish complete 500-person readiness.

Native Chrome loaded the final 500-person shared-adoption fixture through the
worker and exposed all 500 person controls. Keyboard selection of Dedi Pratama 3
opened the Connections guide; the named adoptive-parent action moved to Fajar
Pratama 5 with a readable spouse/parent-join crop. After the eligibility guard,
the 500-person load and keyboard selection were rechecked. At 390 × 844,
Focus retained its 19-person window, a readable selected Dedi and a 390-pixel
page width. The temporary viewport override was reset and Full restored.
This is synthetic interaction evidence, not a whole-matrix browser acceptance
claim or permission to access real archives.

Verification after the eligibility correction: **734 tests passed, one optional
test skipped, 83 files** with `vitest run --maxWorkers=2`; lint, production build
and whitespace checks passed. Nine preparation regressions were added. The
existing bundle-size warning remains. No commit, PR, deployment, backend or
real family-data change was made.

## Current implementation changes

- Reserve whole descendant-household widths even when the descendant has a
  spouse. Center parents on the actual child within that household.
- Keep a same-generation household's child rail within its children's span.
  Travel sideways on the parent join instead of extending into the next rail.
- Omit redundant half-/step-sibling drawing only when compatible recorded
  parent edges already show the connection; retain the underlying records.
- Skip alternative route searches whose Manhattan-distance lower bound cannot
  beat the best route already found. Tie behavior stays deterministic.
- Permit overview zoom below 8%, and use proportional zoom-control steps at
  low zoom so wide trees can fit without an abrupt jump.
- Discard stale resize fits while switching from Full to Focus; the retained
  large scene must not overwrite the newly prepared focused family's viewport.
- Use household-aware layered ordering for joined ancestry, with temporary
  family hubs, adjacent crossing-reduction swaps, spouse-side orientation,
  and non-overlapping row alignment. Ordinary forests retain subtree spacing.
  This follows the separation of ordering and coordinate assignment described
  in [Dagre's layout references](https://github.com/dagrejs/dagre/wiki#recommended-reading),
  but is repository-owned code with family-specific ports, not a new dependency.
- Reserve child-rail lanes separately from parent joins. Grow physical
  generation gaps to fit those lanes without changing logical generations.
- Try inexpensive partner ports before expensive detours. Cache escape-column
  sets, deduplicate nearby coordinates in linear time, and prune routes that
  cannot beat the already-found valid route.
- Keep guardian and standalone step-parent branches distinct with dashed,
  labeled paths and their own avatar sockets. Only explicitly recorded
  step-parent edges may reuse a fully recorded partner-plus-parent path;
  the data stays intact and the independent verifier checks both visible edges.
- Follow simple remarriage partnership chains instead of treating them as a
  star. Keep each union's children together even when their names interleave.
- Inset isolated, single-child in-law couples below the main sibling rail.
  Insert extra vertical space and reserve clear columns for their labels and
  interactive controls, rather than changing logical generations. Ancestry
  with other children or incoming parents retains the general DAG layout.
  `TreeLayout.familyRailY` is transient geometry, carried to the worker and
  chart exporters, never saved in an archive. Lane allocation distinguishes
  these physical rail levels even when their children share a row.
- Exclude eligible hanging in-law couples only from descendant-backbone
  ordering, so they no longer interleave otherwise independent sibling
  subtrees. Their people and edges remain in the layout and the final inset.
  This optimization requires two-person parent and child households;
  more complex ancestry still uses the general joined-family layout.
- Order each shared parent's separate union sockets by the other parents'
  physical positions (child position for a lone parent), not database IDs.
  This removes artificial twists beneath remarried parents without changing
  household order or the represented relationships.
- Include perpendicular crossings in partner-route costs, preferring clear
  alternate ports over slightly shorter routes through an earlier union.
  The finite crossing cost preserves the distance-based search pruning;
  this is not a globally optimal or crossing-free routing guarantee.
- Keep automatic Focus framing at a readable minimum scale and center the
  current person when a broad family cannot fit. All relatives remain on the
  pannable canvas. Explicit Fit still shows the complete bounds at overview
  scale; selecting another person restores readable automatic framing.
- Split a child's recorded biological/adoptive/foster parents by type before
  grouping matching parent identities across siblings. Never present different
  sets as a single four- or six-parent union. Give additional sets distinct
  child sockets and label each non-biological branch (and biological branches
  when several sets meet). Labels identify the affected child rather than
  implying that all children on a shared bus are adopted. They carry exact
  relationship IDs into the SVG canvas, SVG/PNG source and legacy renderer.
- Place parent-type labels alongside child stems when the horizontal rail has
  no room. Check names, controls, existing labels and line segments before
  placing them; a missing required label is a reported plan failure. The
  independent verifier also rejects conflated parent sets or missing label
  bindings, with negative regressions to prove those checks detect corruption.
- Route disjoint parent sets that converge on identical children from the
  central household outward. This removes two unnecessary crossings in the
  six-parent regression; shared-parent unions deliberately retain their own
  ordering. English and Indonesian regressions check all three sets, distinct
  terminals, non-overlapping labels, complete records, Full/Focus and exports.
- Coordinate physical tiers and marriage sockets for nested, isolated spouses
  in a partnership star. Insert enough room for complete labels and separate
  union lanes, moving subsequent rows together without changing generations.
  A lower spouse can connect to the upper person's complete name/life block
  from below; same-row marriages retain avatar sockets. These red marriage
  paths remain distinct from brown parent paths and carry their marriage label.
  The independent verifier requires the correct person, exact label boundary,
  a real route endpoint and a downward exit. Negative tests reject invented,
  missing, wrong-person, sideways and upward attachments.
- Search short L-shaped routes before global detours. Include a central
  marriage socket for even numbers of parent sets and separate side sockets
  for three/four unions. If an outer union's midpoint falls above a lower
  spouse, feed its child rail from its own co-parent's clear column instead.
  This prevents a detour through the nested union while retaining every child.
  Incoming spouse ancestry, other partnerships, sibling links and care branches
  exclude that spouse from this isolated-tier optimization.
- Move an isolated guardian caring for an interior sibling into an existing
  clear corridor below the shared ancestry rail. Use a near-side child socket;
  never move carers with other connections or insert them across sibling stems.
  Logical generations, birth/foster parents and guardian records stay intact.
- Refine joined-layout households using actual partnerships and matching parent
  sets, not all adults attached to the same child. For an acyclic undirected
  household graph, initialize layered ordering with a people-weighted centroid
  and disjoint whole-branch spans. Ancestors and collateral descendants begin
  together, reducing interleaving before port-aware crossing minimization.
  Cyclic graphs retain the general optimizer, with no deleted edges. This is
  an ordering seed, not a final crossing-free routing algorithm.

These are a Web version-2 layout/routing candidate, not a silent update of the
native version-1 conformance target in `TREE_RENDERING_ALGORITHM.md`.

## Evidence and remaining defects (2026-09-07)

### Coordinated corridors — integrated into local Full preparation

`prepareTree` now tries `directedFamilyCorridors` when the compact Full drawing
contains crossings. `fullTreeRouting` admits it only when the complete routed
plan reduces crossings and passes a separate geometry/record admission gate.
The gate checks complete parent/partner coverage, label and avatar terminals,
connected orthogonal networks, finite geometry, downward parent directions,
person collisions, obstacle clearance and inter-route collinear overlaps.
`createTreeLayout` remains the compact baseline. Focus explicitly uses compact
preparation, so a Full-layout change cannot silently change its framing.
The primary SVG worker, main-thread fallback, optional Excalidraw fallback and
complete SVG/PNG export preparation share the Full policy. This is local code,
not a deployed change or a completed 500-person readiness claim.

Instead of packing every logical generation onto one physical row, the
candidate gives each connected ancestry/descendant component a disjoint area
above or below its attachment. It plans the family lines together with person
positions. Temporary family junctions share one sibling rail, while separate
parent sets and care branches retain their own ports and exact records.
Logical generation numbers are preserved. Genuine cycles, invalid references,
or duplicate people return no candidate; no edge is deleted to make the graph
fit this algorithm. Unsupported/cyclic topology returns the unchanged complete
general drawing. That preserves records; it is not a claim that the fallback's
crossings are clear.

Recorded marriages receive parallel path candidates along their family's
parent corridor. They attach below each partner's full label block and stay
distinct from parent lines; they do not share or erase those parent segments.
The planner validates both real endpoints, downward exits, orthogonal path
continuity, labels and occupied routes before accepting a candidate. The
independent verifier now checks every parent port against its own label block
as well, not merely whether the port occurs somewhere on the network.
Negative tests reject swapped parents, floating points, incorrect owners,
missing endpoints and sideways/upward label attachments at either partner.

Measured compound results through the live worker preparation entry, with its
role-space reservation:

| Size/seed | Incumbent crossings | Corridor candidate | Parent/parent crossings in candidate |
| --- | ---: | ---: | ---: |
| 31 / 0 | 4 | 0 | 0 |
| 100 / 0 | 24 | 0 | 0 |
| 500 / 0 | 183 | 0 | 0 |
| 500 / 2 | 299 | 0 | 0 |
| 500 / 4 | 239 | 0 | 0 |

The 500-person candidates retain all people and all 1,100 / 1,071 / 1,097
relationships respectively, with no missing or disconnected terminals,
diagonals, person/label overlaps, reversed parent directions, conflated parent
sets, missing type labels, collinear route overlaps or plan failures in the
covered runs. Tests compare complete routed plans with the incumbent, preserve
all non-position person fields, check shuffled inputs and cyclic fallback,
and verify English/Indonesian export paths and long names.

The first corridor-only trial left 73 crossings at 500 and took 188 seconds
to route marriages. Supplying their coordinated parallel paths reduced this
to 39 and roughly 1.4–1.7 seconds of routing, plus about 0.3 seconds of layout
on this Mac. The remaining crossings came from allocating a 32-unit parent
lane without allowing for a parallel marriage offset on both sides. Reserving
64 units for a person's outgoing household lanes removes those crossings in
all three measured 500-person variants, with all invariants still satisfied.
The final seed-0 routing run took about 1.3 seconds. These are synthetic local
timings, not device-wide guarantees.
An avatar-side return-path experiment produced additional shared-parent
crossings; it was removed. Jointly optimizing the parallel-path choices did
not improve the measured counts and was also removed.

`visibleConnectionPlan` extends terminal stems through reserved-but-hidden
label space without re-running the router. Parent ports and both marriage
endpoints follow the displayed label bottom; person positions, shared rails,
crossing bridges and control placement stay stable. It projects from the
prepared plan, not a previous projection. Tests cover role selection/clearing
at 500 people, both languages, hidden birth dates/ages, privacy-safe removal of
marriage date labels, immutable plans, and actual SVG paths. Larger labels or
changed person positions require fresh preparation, not stretching this
clearance-only projection. Shared age-only label reservation remains an edge
case to cover before claiming all label states are complete.

Already-clear Full layouts are retained unchanged. Invalid/floating corridor
metadata is rejected before routing. Old saved camera positions that show no
person in the new corridors are refitted, while usable saved views are kept.
Switching routing strategies also reframes the canvas; selection alone does
not trigger full preparation.

Fresh live-entry tests cover all eight combinations at 100 people and all
eight at 500 people with seeds 0, 2 and 4 (24 complete 500-person drawings), each with zero crossings and all
independent integrity invariants satisfied. Compound 500 seeds 0/2/4 also have
dedicated live-entry tests. Compact-order, guardian and union ablation tests
explicitly isolate their compact baseline so Full's alternative cannot mask
those regressions. The full suite passes 527 tests with one optional private
example skipped. A sequential 500-person compound Full preparation took about
7.3 seconds on this Mac; selection reuses that prepared route. This includes
both compact and alternative plans plus admission checks, not just routing.
Further initial-load profiling is needed.

Actual worker/export SVG crops at 31 and 500 people show separated parent and
marriage paths, full visible-label attachments and shared sibling rails.
This was code-native artifact inspection, **not** a live browser check.
Remaining work includes broader mixed/cyclic cases, all label states, and
meaningful desktop/phone browser and PNG verification. The Mac remains locked.
Do not call the 500-person goal complete from these measurements alone.

### Compact baseline (retained when clear, in Focus, and for unsupported graphs)

Measurements below use interactive role-space reservation and seed 0.
All 24 combinations (eight scenarios × 100/250/500 people) retained every
parent/partner edge and terminal, with **zero disconnected routes, diagonals,
unrelated person-obstacle collisions, collinear overlaps, or routing failures**.
The current tests also reject overlapping person/label boxes, parent arrows
that run upward to children, and invalid connection plans.
These invariants are now asserted for every measured scenario. That is not
full clarity acceptance: the new compound case exposes many residual crossings.
Wider topology variation and live browser verification still need work, even
where this matrix reaches zero.

| Case | Crossings at 100 | At 250 | At 500 | At 500, seed 2 |
| --- | ---: | ---: | ---: | ---: |
| extended | 0 | 0 | 0 | 0 |
| multiple-wives | 0 | 0 | 0 | 0 |
| remarried | 0 | 0 | 0 | 0 |
| adoption | 0 | 0 | 0 | 0 |
| in-laws | 0 | 0 | 0 | 0 |
| mixed | 0 | 0 | 0 | 0 |
| parent-sets | 0 | 0 | 0 | 0 |
| compound | 24 | 77 | 183 | 299 |

The compound baseline before whole-branch ordering had 54 crossings at 100
people and 1,140 at 500. The current 500-person seed-4 variant has 239 crossings;
all three compound 500-person seeds (0/2/4) retain every record and satisfy all
integrity invariants, but their clarity is **not acceptable as a finished
result**. A controlled 100-person ablation retains the refined households but
disables the branch-order seed: 67 crossings become 24 when the seed is enabled.
That isolates the ordering improvement from merely splitting household blocks.
Dedicated tests preserve this progress, cover cyclic/parallel-path fallback,
input-order stability, complete SVG routes, and four Focus anchors in both
languages. Residual-crossing test budgets are not a new acceptance threshold.

The previous inset-only 500-person in-law baseline had 105 crossings; the
descendant-backbone ordering reduces that to zero. A 250-person regression
compares the prior ordering (23 crossings) with the new ordering (zero),
requiring both layouts to pass the independent integrity checks. It no longer
compares against an invalid layout with physical insets disabled.
Spatial parent sockets reduce the 500-person remarriage case from 100 to zero.
Those changes reduced mixed seed 0 from 369 to 33 and seed 2 from 482 to 28.
Crossing-aware partner routing first reduced the 500-person multiple-wife case
from 81 to 41, and the mixed cases to 20 and 15. Coordinated spouse tiers,
below-label marriage sockets and household-side trunks now reduce those
multiple-wife cases to zero and mixed cases to one and zero. The isolated-care
corridor now removes that final measured mixed crossing. The 15-person
three-wife regression changes from one crossing to zero with all records and
logical generations retained. Dedicated actual-worker regressions cover
500-person in-law seeds 0,
2, and 4 with all people/edges retained and zero crossings. These variants
still use isolated in-law roots; they do not prove arbitrary joined-ancestry
clarity. General layout selection using real routed-crossing costs remains
an open improvement, and two mixed seeds are not broad graph coverage.

A previously tested vertical-stagger-only alternative moved the nearer, isolated spouse down
208 units and reserved 240 extra units before descendants. In the 15-person
multiple-wife fixture it replaced the parent crossing at (-130, 132) with a
marriage/parent crossing at (-88, 126), without reducing the count. That code
was removed. The current implementation is the coordinated replacement, not
that failed change: its marriage approaches the shared parent's label from
below and the outer family's trunk stays clear of the inset spouse. Regressions
also exercise a spouse with no recorded children, four unions on both sides,
long labels in English/Indonesian, read-only export plans and Focus. Three
500-person multiple-wife worker variants (seeds 0, 2 and 4) assert zero crossings
and every integrity invariant; this is not proof for arbitrary spouse ancestry.

The former mixed seed-0 guardian crossing at (-47262, 2448) now has a clear
care path below the shared ancestry rail. A controlled actual-worker test
disables/re-enables that inset and requires one crossing to become zero, with
all 500 people, foster-parent edges and the guardian record retained. English
and Indonesian tests also check the care label, child socket, export path and
conservative exclusions. Arbitrary care configurations remain unproven.

An experiment moving a connected inner spouse's entire birth-family component
down one tier did not resolve the 31-person four-crossing case. At 100 it
introduced a person overlap and routing failures; at 500 it left collinear
overlaps and a failure. That experiment was removed. Connected spouse ancestry
needs coordinated horizontal space and route geometry, not just vertical
displacement of the same branch.

### Rejected follow-up experiments

A temporary, pinned `elkjs@0.12.0` benchmark compared
[ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
coordinates with the existing family renderer. Household nodes retained
member-specific ports; family hubs retained every parent/child attachment.
Alternative person-level graphs kept each recorded parent set separate.
The final counts below are from Heritg's actual routed connections, not ELK's
abstract graph. No ELK dependency was added to the app.

| Coordinate candidate, compound seed 0 | 31 people | 100 people | 500 people |
| --- | ---: | ---: | ---: |
| Current Heritg layout | 4 | 24 | 183 |
| ELK households, generation partitions | 3 | 39 | 882 |
| ELK households, no generation partitions | — | 35 | — |
| ELK individual people, generation partitions | — | 119 | — |
| ELK individual people, no generation partitions | — | 89 | — |

These coordinate candidates retained all integrity invariants, but did not
improve the larger chart. Using only ELK's horizontal coordinates with
Heritg's existing vertical tiers produced 39 crossings and one routing
failure at 100 people. The partitioned 500-person candidate took about 6.7
seconds for coordinates plus 4.6 seconds for Heritg routing on this host.
This rejects this adapter, **not** ELK's own edge router: its edge sections
were deliberately not substituted for Heritg's typed family networks,
marriage sockets and labels. Any future engine integration must verify those
semantics rather than accepting a cleaner abstract graph.

Three local trials were also removed: coordinating nested-union socket/join
order did not improve 500 (183 crossings) and worsened 100 (24 to 25);
permuting spouses within a partnership star improved 500 only to 180 while
worsening 100 to 25; choosing crossing-aware detours for individual family
segments left the counts unchanged. None are part of the current candidate.

An ownership audit of the 183 remaining seed-0 crossings found 164 between
parent networks without a shared adult, seven between a parent network and
an unrelated partnership, and 12 between parent networks sharing an adult.
Thus the next structural work must coordinate whole connected ancestry and
descendant corridors, not concentrate exclusively on shared-parent sockets.

The new parent-sets scenario retains 500 people and 831 relationships with
zero conflated sets, missing type labels, crossings or integrity failures.
The seven-person birth/adoptive/foster example now also has zero crossings,
down from two after initially separating those sets. These results establish
the covered configurations, not arbitrary combinations of mixed parent sets
and connected spouse ancestry.

Before this pass, the 100-person in-law case had 36 crossings, two overlaps,
and two routing failures; mixed had 84 crossings, 12 overlaps, and two failures.
The old partner search took 145 seconds for the 500-person multiple-wife case
on this host; the revised search completed the same case in 3.7 seconds.
Timings are local observations, not a cross-device performance guarantee.

One representative Focus window per 500-person scenario retains connected
routes without overlaps or person-obstacle hits; the eight representative
Focus windows now have zero crossings. Reversed 500-person inputs retain identical layouts and
all parent/partner records. The earlier compact-baseline pass completed 494 tests with one optional
private-example test skipped; build and lint passed (the existing large-bundle
warning remains). A 15-person Chrome Full check confirmed the separated
in-law branches with interactive controls reserved, backed by an exact worker
regression test. Phone-width Focus rendered nine relatives without page
overflow; the expanded overview still requires zoom for comfortable reading.
The current 500-person in-law worker chart rendered all 500 person groups in
Chrome's 954×1080 viewport, with no person outside the viewport and no page
overflow after Fit. This is an overview/navigation check, not a readability
claim at that scale.
The latest Chrome check again fitted all 500 in-law people with no person
outside the viewport, and a zoomed household crop showed the spouse's inset
parents with distinct connected lines. Selecting tiny nodes directly from the
overview is imprecise; zooming or person navigation is needed. A 15-person
remarriage Full check showed separated union corridors. The expanded phone
Focus defect (14 tiny relatives at approximately 10% scale) now opens at 85%
with the current person's name readable. Explicit Fit returns to the complete
14-person overview with zero offscreen person bounds. Both states have no page
overflow. At readable scale, distant relatives need panning; the framing is
not a claim that an entire expanded family is readable at once on a phone.
Tests cover readable framing, explicit Fit retaining every relative, and
re-selection at both 390- and 1000-pixel widths. Safari loaded the synthetic
100-person chart and a 15-person multiple-wife Full example; manual zoom
responded, but precise person-to-person automatic framing needs further Safari
verification. Large Safari crops and image-export visual checks remain pending.
These checks do not establish that all remaining crossings are clear.

The new 15-person parent-sets Chrome Full view shows separate birth and
adoptive/foster connections with labels at each affected child. At 390 pixels,
selecting the adopted child in Focus preserved all seven relatives and showed
both parent labels with the selected name readable and no page overflow.
Some parents are offscreen at readable scale and remain reachable by panning;
Fit provides the complete overview. No new Safari or PNG-render visual
acceptance is claimed for this pass.

The latest local export review rasterized the actual SVG source for the
15-person three-union and 12-person empty-union examples. Both show separated
household rails and connected, dated red marriage paths, with no crossing
bridges. This is an SVG-raster review, not a live browser or browser-PNG check.
The Mac was locked, so new Chrome/Safari and phone interaction checks could not
run. Those checks remain required before declaring readiness.

The compound review inspected family-sized crops from actual 100- and
500-person worker/export plans. They still show congested bridge clusters
around inner spouses, incoming birth-family lines and outgoing union joins;
the reduced counts have not solved traceability there. These crops are not
whole-chart readability or browser acceptance. The Mac remains locked, so no
new Chrome, Safari, phone, or browser-rasterized PNG check is claimed.

Next priorities:

1. Extend clarity beyond the acyclic household graphs solved by the integrated
   corridors. Extend the new cousin-union checks to more seeds and genuine
   cross-generation unions and mixed parent-set cycles against the actual Full
   entry; retaining a complete fallback is not
   proof of clear connections. Distinguish unavoidable crossings from poor
   placement. The historical 183/299/239 compound counts are now zero through
   Full preparation, but do not establish arbitrary graph readability.
2. Stress the newly separated biological/adoptive/foster parent sets with
   remarriage and connected spouse ancestry. Their standalone regressions
   now pass, but arbitrary compound cases remain unproven.
3. Handle in-law ancestry that cannot use
   the isolated-couple inset, while preserving every recorded relationship.
4. Expand the full routing matrix to multiple deterministic seeds and keep
   profiling large cases on target browsers. Fixture validity/permutation
   checks alone do not establish routing clarity across variants.
5. Inspect meaningful family-sized crops in Chrome and Safari, phone-sized
   Focus, and SVG/PNG export. Verify navigation between offscreen Focus
   households at readable scale. Overview screenshots alone
   cannot prove clarity.

## Reproduction

From `web/`, use the supported Node 22+ runtime:

```sh
node node_modules/vitest/vitest.mjs run src/largeFamilyClarity.test.ts --reporter verbose
node node_modules/vitest/vitest.mjs run src/fullTreeRouting.test.ts src/visibleConnectionPlan.test.tsx
node node_modules/vitest/vitest.mjs run src/routeClearance.test.ts src/obstacleRouter.test.ts
node node_modules/vitest/vitest.mjs run src/cousinFamilyCorridors.test.ts src/familyBlockOrder.test.ts
node node_modules/vitest/vitest.mjs run src/crossGenerationCorridors.test.ts
node node_modules/vitest/vitest.mjs run src/relatedParentSets.test.ts
node node_modules/vitest/vitest.mjs run src/connectionTrace.test.ts src/CanvasConnections.test.tsx src/SvgTreeCanvas.test.tsx
HERITG_STRESS_SIZE=500 HERITG_STRESS_SEED=2 node node_modules/vitest/vitest.mjs run src/fullTreeRouting.test.ts -t 'every person and relationship'
HERITG_STRESS_SIZE=500 node node_modules/vitest/vitest.mjs run src/largeFamilyClarity.test.ts --reporter verbose
HERITG_STRESS_SIZE=500 HERITG_STRESS_SEED=2 node node_modules/vitest/vitest.mjs run src/largeFamilyClarity.test.ts -t 'measures full-tree clarity' --reporter verbose
HERITG_STRESS_DETAILS=1 node node_modules/vitest/vitest.mjs run src/largeFamilyClarity.test.ts -t 'clarity for in-laws' --reporter verbose
HERITG_CORRIDOR_SIZE=250 node node_modules/vitest/vitest.mjs run src/inlawCorridors.test.ts -t 'reduces real' --reporter verbose
```

`fullTreeRouting.test.ts` exercises the live Full preparation policy;
`largeFamilyClarity.test.ts` retains the direct compact-baseline matrix.
`routeClarity.ts` independently counts collisions, shared segments, missing
routes, missing person terminals, disconnected networks, and diagonals. All
these integrity/no-overlap invariants are enforced across the selected size
and seed. Extended, multiple-wife, adoption, remarried, mixed, parent-sets, and isolated in-law cases assert zero
crossings; compound cases remain diagnostic for crossing
clarity. Do not describe these tests as full
500-person acceptance.

The local-only `/tests/manual/large-family.html` page exposes size, scenario,
seed (0/2/4), an optional synthetic marriage, Full/Focus,
fit, and zoom controls. It includes the reconnected-family scenarios. Its data
does not read or write IndexedDB,
upload archives, or modify the user's trees. It is excluded from production's
Vite entry points.

Under `Koneksi tambahan`, choose `Sepupu sintetis` for the earlier cousin
matrix or `Beda kedalaman silsilah` for the new different-depth union (compound
scenario, 100/250/500 people, seeds 0/2/4). Unsupported combinations are disabled.
Choose `Orang tua kandung dan angkat bersaudara` with `shared-adoption` or
`shared-parent-sets` for the related-parent-household case (15/100/250/500 people).
