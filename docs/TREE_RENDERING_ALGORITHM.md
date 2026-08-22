# HERITG Tree Layout and Rendering Algorithm

Status: canonical Web reference and cross-platform target, version 1

This document defines the canonical Web algorithm for deterministic person
coordinates, routed relationship connectors, rendering layers, and an
interactive viewport. Other platforms may adopt individual layers without
replacing their platform-native canvas behavior.

The version 1 rules are derived from the production Web implementation. Native
implementations can migrate incrementally, but intentional deviations must be
documented and covered by platform-specific tests. The current iOS scope adopts
connector planning and drawing, semantic overview zoom, and scale-compensated
action controls. Native layout, generation filtering, focus, gestures, person
views, hit testing, and viewport transforms remain authoritative on iOS.

## 1. Goals

The algorithm must:

1. Produce deterministic output independent of input array order for valid,
   uniquely identified entities.
2. Keep partners and co-parents together on one generation row.
3. Place parents above children and center branches where practical.
4. Use one shared family bus for children with the same parent set.
5. Avoid avatars, labels, controls, and previously routed connectors.
6. Represent unavoidable crossings consistently.
7. Keep layout, routing, rendering, and viewport state separate.
8. Support large trees without making visual detail the accessibility model.
9. Preserve fallback geometry and expose routing failures when routing degrades.
10. Use density-independent logical scene units on every platform.

This specification does not define persistence, editing workflows, archive
encryption, or the visual design of dialogs outside the tree canvas.

## 2. Architecture

Every platform should implement these stages:

```text
Family graph
  -> normalization and validation
  -> generation assignment
  -> optional branch-depth filtering
  -> row blocks and person coordinates
  -> semantic relationship filtering
  -> obstacle construction
  -> family and non-parent connection planning
  -> crossings, labels, bounds, and diagnostics
  -> renderer projection
  -> viewport transform and interaction overlay
```

The output of one stage is input to the next. A renderer must not independently
infer generations, family topology, or connector paths.

Recommended core interfaces:

```text
TreeLayout createTreeLayout(TreeSceneInput, LayoutOptions)
ConnectionPlan createConnectionPlan(TreeLayout, RoutingOptions)
RenderedScene projectScene(TreeLayout, ConnectionPlan, RenderOptions)
```

Layout and routing must be pure functions. They must not read screen size,
device density, wall-clock time, database state, or mutable UI controls.

## 3. Canonical Data Contract

### 3.1 Person

```text
Person {
  id: String
  displayName: String
  gender: male | female | unspecified
  birthDate: CalendarDate?
  deathDate: CalendarDate?
  birthDatePrecision: exact | month | year
  birthOrderOverride: PositiveSafeInteger?
  photoReference: PlatformPhotoReference?
}
```

Genealogy dates are timezone-free calendar values. The canonical wire form is
`YYYY-MM-DD`, with precision stored separately. Platforms may use native date
types internally only if conversion cannot shift the calendar day.

`birthOrderOverride` accepts integers from `1` through `9007199254740991`.
Duplicate values are allowed. The field controls displayed order metadata only
and must never participate in person, block, row, or connector geometry.

### 3.2 Relationship

```text
Relationship {
  id: String
  fromPersonId: String
  toPersonId: String
  kind: parent | partner | sibling
  subtype: RelationshipSubtype
  marriageDate: CalendarDate?
  divorceDate: CalendarDate?
}
```

`RelationshipSubtype` uses these exact, case-sensitive wire values:

```text
biologicalParent, adoptiveParent, fosterParent, guardian, stepParent,
partner, spouse, formerPartner, formerSpouse, sibling, halfSibling,
adoptiveSibling, fosterSibling, stepSibling
```

Parent direction is parent to child. Partner and sibling endpoints are
semantically unordered, even though stored records have `from` and `to` fields.

All parent subtypes currently affect generation assignment. If product rules
later exclude foster, guardian, or step-parent relationships from ancestry,
that must be introduced as a new algorithm version rather than a silent
platform difference.

### 3.3 Options

```text
LayoutOptions {
  selectedPersonId: String?
  ancestorLimit: Int?
  descendantLimit: Int?
  language: en | id
}

RoutingOptions {
  interactionObstacles: none | allVisible
}
```

`null` generation limits mean unlimited. Negative limits are treated as zero.

### 3.4 Numeric model

Use IEEE-754 double precision logical scene units. Do not round during layout or
routing. Renderer projection quantizes coordinate graph keys as specified in
section 25; path serialization and fixture output may also round.

Web maps scene units to CSS pixels, iOS to points, and Android to density-
independent coordinates before applying display density. Each renderer applies
exactly one scene-to-device transform.

## 4. Canonical Constants

### 4.1 Person and row metrics

| Name | Value | Meaning |
| --- | ---: | --- |
| `avatarDiameter` | 64 | Outer avatar diameter |
| `avatarRadius` | 32 | Outer avatar radius |
| `innerAvatarDiameter` | 54 | Photo or initial circle |
| `labelWidth` | 190 | Reserved label width |
| `labelTop` | 42 | Name box top relative to person center |
| `nameHeight` | 20 | Reserved name height |
| `roleTop` | 64 | Kinship role top |
| `roleHeight` | 18 | Reserved role height |
| `lifeTop` | 84 | Life summary top when a role exists |
| `lifeHeight` | 16 | Reserved life summary height |
| `nodeBottom` | 100 | Maximum node extent below center |
| `horizontalSpacing` | 260 | Person spacing inside a block |
| `familyGap` | 200 | Additional gap between family blocks |
| `generationSpacing` | 260 | Vertical generation spacing |

### 4.2 Routing metrics

| Name | Value |
| --- | ---: |
| `routeClearance` | 8 |
| `routeEpsilon` | 0.001 |
| `coordinatePadding` | 2 |
| `familyRailSpacing` | 32 |
| `occupiedRouteSpacing` | 6 |
| `bendPenalty` | 24 |
| `connectorWidth` | 2 |
| `cornerRadius` | 12 |
| `junctionRadius` | 2 |
| `crossingRadius` | 5 |

### 4.3 Viewport metrics

| Name | Value |
| --- | ---: |
| Minimum zoom | 0.08 |
| Maximum zoom | 1.8 |
| Enter overview below | 0.30 |
| Exit overview at or above | 0.42 |
| Fit-all viewport factor | 0.82 |
| Fit-all maximum zoom | 1.1 |
| Focus viewport factor | 0.32 |
| Focus zoom range | 0.25 to 1.35 |
| Fit animation | 320 ms |
| Focus animation | 280 ms |
| Drag threshold | 3 screen units |
| Viewport persistence debounce | 220 ms |

Changing a canonical metric changes coordinates and requires an algorithm
version increment plus fixture updates on every platform.

## 5. Deterministic Ordering

Structural ordering is lexicographic comparison of unsigned UTF-16 code units,
matching JavaScript string `<`; it is not localized collation, Unicode scalar
ordering, or grapheme-cluster ordering:

```text
compareText(a, b):
  return -1 when a < b
  return  1 when a > b
  return  0 otherwise
```

### 5.1 Person order

Sort people by:

1. Birth date ascending; missing dates sort last.
2. Gender: male, female, unspecified.
3. Lowercased display name.
4. Exact display name.
5. Person ID.

The lowercase operation must match JavaScript `String.toLowerCase()`, without a
locale argument, before applying UTF-16 code-unit comparison. Shared fixtures
should include non-ASCII and supplementary-plane text so native ports do not
accidentally use locale collation or Swift grapheme ordering.

ECMAScript delegates case data to its runtime and version 1 does not pin a
Unicode data version. Expected outputs generated by the supported Node 22 Web
toolchain are authoritative for conformance fixtures. This is a known version 1
portability limit; a future algorithm version should ship canonical lowercase
sort keys or pin a mapping table.

### 5.2 Relationship order

Sort relationships by:

1. Kind: parent, partner, sibling.
2. `fromPersonId`.
3. `toPersonId`.
4. Subtype.
5. Relationship ID.

Every map or set that influences geometry must be converted to a sorted list
before iteration. Hash-map iteration order is never part of the contract.

## 6. Input Normalization

Normalize before assigning generations:

1. Remove people whose trimmed ID is empty.
2. Sort people canonically.
3. Keep the first person for each exact ID.
4. Remove relationships whose trimmed ID is empty.
5. Remove relationships with identical endpoints.
6. Remove relationships whose endpoints do not exist.
7. Sort relationships canonically.
8. Keep the first relationship for each exact relationship ID.

Equivalent endpoint relationships with different IDs remain distinct. Domain
validation should normally prevent such duplicates, but layout output must stay
deterministic when receiving imperfect imported data.

When duplicate records have the same ID and every documented sort key ties,
version 1 relies on stable sort and keeps the record that occurred first in the
input. Non-key fields such as a relationship date can therefore make malformed
duplicate-ID input order observable. Reject or repair duplicate IDs during
domain validation; do not invent a native-only tie-breaker inside version 1.

Platforms should report invalid input separately from layout. Version 1 uses
normalization as a defensive fallback rather than throwing.

## 7. Generation Assignment

### 7.1 Same-generation components

Create a stable union-find containing every normalized person ID.

Union:

1. Both endpoints of every partner relationship.
2. Both endpoints of every sibling relationship.
3. All parents connected to the same child.
4. All children connected to the same parent.

When union roots differ, the lexically smaller root becomes the representative.
This makes component identity independent of insertion order.

Partners, explicitly or implicitly related siblings, and co-parents therefore
share one generation. This keeps siblings aligned when one sibling's partner
has a deeper ancestry branch.

### 7.2 Component graph

For every parent relationship:

```text
parentComponent = component(fromPersonId)
childComponent  = component(toPersonId)

if parentComponent != childComponent:
  add directed edge parentComponent -> childComponent
```

Count duplicate component edges once when calculating indegree.

### 7.3 Longest-path levels

Initialize every component level to zero. Create a lexical queue of all
zero-indegree components.

```text
while queue is not empty:
  current = remove first
  for child in lexical outgoing children:
    level[child] = max(level[child], level[current] + 1)
    indegree[child] -= 1
    when indegree[child] becomes zero:
      insert child into the remaining queue in lexical order
```

Each person receives its component level. This is the longest parent-chain
distance from a root, not the shortest graph distance.

### 7.4 Cycles and contradictions

Version 1 does not repair parent cycles. A blocked component keeps whatever
partial level it received before its unresolved indegree prevented it from
entering the queue; a pure cycle with no queued predecessor remains at level
zero. Parent relationships that do not point to a strictly greater generation
are removed during semantic filtering.

The version 1 Web connection plan does not report cycles and can remain valid
after semantic filtering removes every cycle edge. Domain validation should
expose a separate cycle warning, but that warning is not a connection-plan
failure or conformance output. A future version may reject cycles or collapse
strongly connected components. Native platforms must not use first-visit BFS
because it produces different rows for conflicting paths.

## 8. Selection-Relative Generation Filtering

Filtering changes visibility only when at least one limit is finite.

Build three deduplicated, lexically sorted adjacency maps:

```text
all:      every relationship in both directions
parents:  child -> parent for parent relationships
children: parent -> child for parent relationships
```

Run BFS from the selected person in each map. Neighbor distances begin at one;
the selected person has relative level zero.

For every person connected through `all`:

1. If only ancestor distance exists, level is negative ancestor distance.
2. If only descendant distance exists, level is positive descendant distance.
3. If both exist, use the shorter distance.
4. If distances tie, calculate the signed delta
   `generation[person] - generation[selected]`; choose the negative ancestor
   distance when the delta is negative, otherwise choose the positive
   descendant distance. A zero delta therefore resolves as descendant.
5. If neither directional path exists, use the signed generation delta.

Visibility rules:

```text
level < 0: keep when abs(level) <= max(0, ancestorLimit)
level > 0: keep when level      <= max(0, descendantLimit)
level = 0: always keep
```

If both limits are unlimited, show all normalized people. If the selection is
missing or invalid, also show all normalized people. With active filtering and
a valid selection, disconnected components are excluded.

A relationship remains visible only when both endpoints remain visible.

## 9. Row Blocks

Group visible people by absolute generation. Process generations ascending.

Inside each row, build stable blocks by unioning:

1. Explicit partners in that row.
2. Co-parents in that row who share a child.

A block can contain more than two people.

### 9.1 Member order

For each member, calculate the mean X coordinate of already positioned parents.
This is a relationship-weighted mean: equivalent parent edges with different
relationship IDs contribute repeatedly and are not deduplicated.
Sort members by:

1. Mean parent X.
2. Canonical person order.

Missing parent positions sort after finite parent positions.

### 9.2 Block order

For each block calculate:

```text
parentX    = relationship-weighted mean X of all positioned parent edges
familyKeys = sorted parent-ID sequence for each member that has parents;
             duplicate parent edges remain repeated
key        = block member IDs joined with U+001F
```

Sort blocks by:

1. `parentX`.
2. Pairwise canonical member order.
3. Member count.
4. Block key.

### 9.3 Family gap

Add `familyGap` between neighboring blocks when any condition is true:

1. Either block contains multiple people.
2. Either block has no parent-sequence key.
3. The blocks share no exact parent-sequence key.

Otherwise use only normal horizontal spacing. This keeps siblings with the
same parent-edge sequence compact while separating couples and unrelated
branches. Equivalent duplicate edges can intentionally affect this version 1
behavior because normalization retains relationships with distinct IDs.

## 10. Initial Person Coordinates

For each row:

```text
personCount    = total block members
familyGapCount = boundaries that require familyGap
rowWidth       = (personCount - 1) * 260 + familyGapCount * 200
```

The earliest visible generation starts at `x = -rowWidth / 2`. Later rows are
anchored to parent positions and are not independently centered.

For each block from left to right:

```text
minimumX = previousNextSlot + optionalFamilyGap
parentX  = finite block parent mean, otherwise minimumX or 0
startX   = max(parentX, minimumX) when minimumX exists

member[i].x = startX + i * horizontalSpacing
member[i].y = (generation - minimumVisibleGeneration) * generationSpacing
previousNextSlot = startX + memberCount * horizontalSpacing
```

`previousNextSlot` is one full `horizontalSpacing` after the preceding block's
last member center. It is not the preceding member's X coordinate.

Store the absolute generation on each positioned person even though visible Y
coordinates are normalized to the earliest visible generation.

## 11. Bottom-Up Branch Adjustment

After initial placement, process every row except the last from bottom to top.

For each block:

1. Find direct children in any later generation.
2. Retain children in the nearest later generation only.
3. Desired center is the midpoint of minimum and maximum retained child X.
4. If there are no children, retain the block's current center.
5. Convert desired center into a desired block start.
6. Enforce left-to-right spacing and the same family-gap rule.
7. When collision spacing moves the block right of its descendant-derived
   start, collect all transitive descendants. Shift every complete later-row
   block containing any collected descendant by the same collision delta.
8. Shift every member of the current block by the same amount.

Pseudocode:

```text
desiredStart = desiredCenter - ((memberCount - 1) * spacing) / 2
minimumStart = previousNextSlot + optionalFamilyGap
start        = max(desiredStart, minimumStart)
shift        = start - currentStart
previousNextSlot = start + memberCount * horizontalSpacing
```

This lets wide descendant branches pull parents apart without changing spacing
inside couples or co-parent groups. Moving complete descendant blocks preserves
their internal spacing and prevents a parent collision adjustment from
stretching or crossing the branch below it.

## 12. Semantic Relationship Filtering

After coordinates are final, retain relationships only when:

```text
parent:  childGeneration > parentGeneration
partner: fromGeneration == toGeneration
sibling: fromGeneration == toGeneration
```

Both endpoints must also be visible. This suppresses reversed parent links,
cycle edges, parent links trapped in a same-generation component, and invalid
non-parent links spanning generations.

## 13. Layout Bounds

Person layout bounds reserve complete labels:

```text
minX = min(person.x - 95)
maxX = max(person.x + 95)
minY = min(person.y - 32)
maxY = max(person.y + 100)
```

Empty layout bounds are `(0, 0, 0, 0)`.

## 14. Kinship Labels and Routing Stability

Kinship roles are presentation values derived relative to the selected person.
When generation filtering is inactive, selecting a person must not change node
coordinates or connector geometry.

Build routing geometry from a copy where every person reserves a role line,
using a single blank role value if necessary. Overlay actual kinship text after
layout. This prevents lines from jumping when selection changes.

## 15. Obstacles

Every obstacle is a rectangle with a kind and stable owner ID.

### 15.1 Avatar

```text
x = person.x - 32
y = person.y - 32
width = 64
height = 64
```

### 15.2 Node label

```text
x = person.x - 95
y = person.y + 42
width = 190
```

Height extends through the final visible/reserved line:

```text
name only:  labelTop + nameHeight
with role:  roleTop + roleHeight
with life:  lifeTop + lifeHeight when role exists
            roleTop + lifeHeight when role does not exist
```

### 15.3 Action controls

Each action control is a 44 by 44 rectangle centered on its planned coordinate.

The version 1 control obstacle policy is explicit:

```text
none:        read-only, controls hidden, or more than 24 source people
allVisible:  editable canvas with at most 24 source people
```

The threshold uses the unfiltered source graph count, not the currently visible
layout count. In a large editable tree, Web may display controls for the
selected person, or for every person in a small filtered result, but those
controls are not routing obstacles in version 1. Native implementations must
preserve this behavior for matching geometry. A future algorithm version may
introduce a `selectedOnly` policy. Do not reserve hidden controls implicitly.

### 15.4 Relationship labels

Accepted partner labels become obstacles before later relationships are routed.

### 15.5 Clearance

Expand obstacles by eight units for route tests. Touching the expanded boundary
is allowed; entering its open interior is not.

Endpoint people permit outward terminal exits from the contacted avatar side.
Parent stems may exit downward from the label's parent port. No other obstacle
exception is allowed.

### 15.6 Canonical obstacle order

Before each route search, sort obstacles by:

1. UTF-16 comparison of `"{kind}:{ownerId}"`.
2. Rectangle Y.
3. Rectangle X.
4. Rectangle height.
5. Rectangle width.

This order is significant when candidate coordinates less than
`routeEpsilon` apart are deduplicated and the earlier value survives.

## 16. Action-Control Placement

Inspect non-parent relationships to determine whether related people occupy the
left or right side of each person.

Preferred side is left when `person.x <= 0`, otherwise right. If preferred is
occupied and the opposite side is free, switch sides.

For direction `d`, where left is `-1` and right is `+1`:

```text
add center  = (person.x + d * 66,  person.y)
edit center = (person.x + d * 110, person.y)
```

Control visuals and physical hit targets are renderer concerns, but routing
uses these logical rectangles when the obstacle policy includes them.

## 17. Family Grouping

For each child with parent relationships:

1. Deduplicate parent IDs.
2. Sort parent IDs by UTF-16 code-unit order.
3. Encode a stable family ID using each ID's UTF-16 code-unit length:

```text
"{length}:{id}|{length}:{id}|..."
```

4. Group all children with exactly the same parent set into one family.
5. Sort family parent and child people by X, then ID.

Family identity ignores parent subtype and explicit partner relationships.

## 18. Family Lanes and Parent Ports

For each family, calculate the horizontal interval spanning all parent and child
X coordinates. Group families by mean parent Y.

Inside each parent-Y band, sort by interval start, interval end, then family ID.
Assign the first lane where:

```text
previousLaneEnd + 20 < currentIntervalStart
```

Otherwise allocate a new lane.

When one parent participates in multiple families, sort those families by ID
and shift each family port:

```text
offset = (index - (familyCount - 1) / 2) * familyRailSpacing
```

The stem is vertical at the shifted port X from the label bottom to the family
rail. Version 1 does not draw a segment from the person's original X to a
shifted port.

## 19. Family Rail Geometry

### 19.1 Parent port Y

The parent port is two units below the complete reserved label rectangle.
Initialize `parentStartY` to the maximum Y among all family parent ports. Push it
down to at least an unrelated label's bottom plus `routeClearance` for every
label on the same parent row that overlaps the family interval.

### 19.2 Lane spacing

```text
childTopY       = min(child.y - avatarRadius)
availableHeight = max(childTopY - parentStartY - 32, 0)

spacing = laneCount > 1
  ? max(2, min(32, availableHeight / ((laneCount - 1) * 2)))
  : 0

parentJoinY     = parentStartY + 8 + laneIndex * spacing
childRailOffset = 40
```

Lane spacing separates parent-side joins only. Every child-facing rail keeps the
same 40-unit clearance from the top of its avatar, regardless of relationship
status or lane index.

### 19.3 Primary trunk

Start from mean parent-port X. Find the child nearest that X, breaking ties by
lower X.

Align directly to that child when no other family in the same band has a parent
port or child center whose X is exactly equal to the candidate child's X, and
either there is one child or the offset is at most 12 units. This is an exact
endpoint-X test, not interval overlap or epsilon proximity. Otherwise spread
trunks by eight units around the band center.

### 19.4 Multiple child generations

When children occupy multiple rows, create one horizontal rail per child row
and a continuation trunk.

Candidate continuation channels are:

1. Midpoints between child columns separated by more than 206 units.
2. An outer channel 111 units left of the leftmost child.
3. An outer channel 111 units right of the rightmost child.

For safety, test a vertical probe from `parentJoinY` to the deepest child rail,
even though the rendered continuation trunk begins at the first child rail.
Prefer channels whose probe clears every node obstacle. Choose the safe channel
nearest the base trunk, breaking ties by lower X. If none is safe, choose from
all candidates using the same ordering.

### 19.5 Base family network

The base orthogonal network contains:

1. A stem from each parent port to the parent join rail.
2. One parent join rail.
3. A primary trunk to the first child rail.
4. An optional continuation trunk across child rows.
5. One horizontal rail per child row.
6. One vertical drop to each child's avatar top.

Remove zero-length and diagonal segments.

## 20. Generic Orthogonal Router

The router accepts start, end, obstacles, endpoint owner IDs, and occupied
segments. Candidate order is part of determinism.

### 20.1 Acceptance

A route is accepted when:

1. Every segment is horizontal or vertical and has positive length.
2. No segment has a forbidden obstacle intersection.
3. No segment has positive-length collinear overlap with an occupied segment.

Ordinary perpendicular crossings are permitted and represented later.

### 20.2 Candidate order

Try in this order:

1. Direct route when axis-aligned.
2. Fast channels drawn from both obstacle boundaries and coordinates six units
   from occupied parallel routes.
3. General fallback channels.

Combine and deduplicate both fast-channel sources before sorting all coordinates
by distance from the direct coordinate, then by numeric value. Obstacle-derived
channels do not have precedence over closer occupied-route channels.

General fallback Y channels include:

1. 40 units above the upper endpoint.
2. 40 units below the lower endpoint.
3. Ten units outside the global obstacle envelope.
4. Ten units above and below every obstacle.
5. Six units above and below occupied horizontal routes.

Deduplicate these Y values in generation order, then sort them by distance from
the midpoint of the two endpoint Y values, breaking ties by lower numeric Y.

For each Y channel, candidate escape X coordinates include:

1. Original endpoint X.
2. Ten units outside blocking rectangles.
3. Six units beside occupied vertical routes.
4. Ten units outside the global obstacle envelope.

For item 2, an obstacle blocks an endpoint-to-channel escape only when the
endpoint X is strictly inside the obstacle's horizontal range expanded by eight
units and the vertical span from endpoint Y to channel Y inclusively overlaps
the obstacle's unexpanded vertical range. Candidate X values are ten units
outside that obstacle's original left and right edges.

For items 1 through 3, deduplicate then sort by distance from that endpoint's X,
breaking ties by lower numeric X, and keep the nearest nine. Append the left and
right global outer coordinates afterward when they are not duplicates; do not
re-sort them. Iterate sorted Y, start X, then end X and accept the first valid
route.

## 21. Routing Family Networks

Route families in this order:

1. Mean parent-port Y, including label-height differences.
2. Mean child Y.
3. Interval start.
4. Interval end.
5. Family ID.

Split base segments at every attachment point before routing so T-junctions are
preserved.

For each family:

1. Route split segments around obstacles and previously occupied routes.
2. Require every segment to route and the resulting network to remain connected.
3. If strict routing fails, retry without earlier families as occupied space.
4. If relaxed routing succeeds, use it and append `family:{familyId}` to
   `failures`.
5. Otherwise render base geometry and append the same failure key.
6. Add chosen segments to occupied space.

Do not omit an entire family silently. Version 1 failures identify the entity
but do not encode a reason or whether relaxed routing succeeded.

## 22. Routing Partner and Sibling Relationships

Route non-parent relationships after every family. Sort by relationship ID.
Orient endpoints as left and right by X, then ID.

Try endpoint pairs in this exact order:

| Penalty | Left endpoint | Right endpoint |
| ---: | --- | --- |
| 0 | Right avatar edge | Left avatar edge |
| 20 | Right edge at Y - 12 | Left edge at Y - 12 |
| 40 | Right edge at Y + 12 | Left edge at Y + 12 |
| 80 | Avatar top | Avatar top |
| 90 | Top shifted X - 12 | Top shifted X - 12 |
| 100 | Top shifted X + 12 | Top shifted X + 12 |
| 120 | Outer left edge | Outer right edge |
| 160 | Avatar bottom | Avatar bottom |

For each viable route:

```text
cost = ManhattanLength
     + bendPenalty * max(segmentCount - 1, 0)
     + endpointPenalty
```

Choose the strictly lowest cost. Equal cost retains the earlier endpoint pair.

If no route avoids occupied connectors, retry without occupied-route
constraints and append `relationship:{relationshipId}` to `failures` whether
that relaxed retry succeeds or not. If it fails, use a direct side-to-side
segment. Thus any strict-routing failure makes `isValid` false.

## 23. Partner-Date Labels

Only partner relationships with marriage and/or divorce dates receive route
labels. For `en`, format parseable dates with locale `en-US`; for `id`, use
`id-ID`. Both use numeric day, short month, and numeric year. Invalid date text
remains unchanged. Prefix each result using these exact templates:

| Language | Marriage | Divorce |
| --- | --- | --- |
| `en` | `Married {date}` | `Divorced {date}` |
| `id` | `Menikah {date}` | `Bercerai {date}` |

The implementation uses `Intl.DateTimeFormat`, whose abbreviated month strings
depend on runtime CLDR data. As with Unicode lowercasing, expected label text and
geometry generated by the supported Node 22 Web toolchain are authoritative
for fixtures. Native implementations must reproduce those fixture strings
rather than substitute user-locale formatting.

```text
text   = marriage text, divorce text, or both joined by " · "
width  = clamp(textUTF16CodeUnitCount * 6.2 + 14, 44, 240)
height = 20
```

Search horizontal route segments longest first, breaking equal lengths by the
stored start Y and then stored start X. Segments are not reoriented left to
right. Test anchor fractions 1/20 through 19/20 from each stored `start` toward
its stored `end`, ordered nearest to the midpoint, then lower fraction. At each
anchor test upward offsets:

```text
-14, -22, -40, -58, -76, -94
```

Accept the first rectangle that clears obstacles expanded by eight units and
occupied routes with two units of clearance. The occupied set includes the
relationship's own route. Add the accepted label as an obstacle. If no
placement works, omit the label without changing the relationship route.

If platforms use actual text measurement, route coordinates can differ by font
and locale. Exact cross-platform geometry therefore requires the conservative
UTF-16 code-unit formula above. Renderers may center glyphs using native text
measurement inside the canonical rectangle.

## 24. Crossings

Compare every connector pair and segment pair. A crossing occurs where one
horizontal and one vertical segment intersect, including endpoint boundaries
within epsilon.

Deduplicate crossings by coordinate in connector-pair and segment-pair
iteration order. For suppression, version 1 recognizes only
`segments[0].start` and `segments[last].end` as each connector's terminals. It
suppresses a crossing when both connectors share a person and the intersection
matches one of those two terminals on both connectors. Other graph terminals in
a family segment network do not participate in this exception.

Classify the crossing using the connector that contributes the vertical
segment. When several connector pairs meet at a deduplicated coordinate, the
first encountered classification wins. Sort crossings by Y, then X.

Render:

1. A canvas-colored circle of radius five over the underlying lines.
2. A 12-unit vertical bridge from `y - 6` to `y + 6` using the vertical
   connector's style.

Crossings do not make a plan invalid.

## 25. Connector Paths and Corners

Routing output remains an orthogonal segment network. Renderer projection joins
segments into paths:

1. Normalize values with absolute magnitude below `routeEpsilon` to zero, round
   each X and Y to three decimal places, and build graph keys from those values.
   This quantization can merge nearby routing coordinates and is part of
   version 1 projection behavior.
2. Build a graph of those stable coordinate keys and segment edges.
3. Walk from nodes whose degree is not two.
4. Continue through degree-two nodes.
5. Stop at endpoints and branch points.
6. Process remaining cycles afterward.
7. Remove duplicate and collinear intermediate points.

Draw a junction dot only where geometry continues in at least three distinct
directions. Do not draw dots at ordinary bends or person endpoints.

At a corner:

```text
radius = min(12, incomingLength / 2, outgoingLength / 2)
```

Use radius zero when the corner touches a path endpoint through a leg no longer
than the 40-unit child-rail clearance. This preserves the full visual gap between
a child-family rail and the avatar instead of letting a rounded endpoint bend
toward the circle. Married and unmarried children must use the same rule.

SVG uses a quadratic curve. SwiftUI and Compose should construct equivalent
paths rather than drawing disconnected square elbows.

## 26. Connection Plan Bounds and Diagnostics

Connection-plan bounds include:

1. Avatar rectangles.
2. Node-label rectangles.
3. Relationship-label rectangles.
4. Every connector endpoint.

Action controls are excluded from fit-all bounds. Include zero in each minimum
and maximum calculation for version 1 compatibility.

Canonical version 1 output:

```text
ConnectionPlan {
  families: FamilyRoute[]
  nonParentRoutes: RelationshipRoute[]
  obstacles: Obstacle[]
  controls: ControlPlacement[]
  crossings: Crossing[]
  bounds: Rect
  failures: String[]
  isValid: Boolean
}
```

Failure strings are exactly `family:{familyId}` or
`relationship:{relationshipId}`. A plan is valid when it has no failures and no
connector has collinear self-overlap. Invalid plans remain renderable.

Platforms may expose structured failure reasons in a diagnostic wrapper, but
those additions are not available from the Web reference and must not alter
canonical geometry, failure strings, or `isValid`.

## 27. Rendering Order and Styles

Render back to front:

1. Family connector paths.
2. Partner and sibling paths.
3. Family junction dots.
4. Crossing masks and bridges.
5. Relationship labels.
6. Person nodes.
7. Screen-space accessibility and action overlays.

Canonical relationship styles:

| Relationship | Color | Stroke |
| --- | --- | --- |
| Parent/family | `#9c825f` | Solid, width 2 |
| Partner | `#b47c76` | Solid, width 2 |
| Sibling | `#78956c` | Dashed `6 7`, width 2 |

Caps and joins are round. Relationship type must not rely on color alone;
sibling dashing and accessible descriptions provide additional meaning.

## 28. Person Node Projection

A full-detail node contains:

1. Outer circle, diameter 64.
2. Inner circle or circularly cropped photo, diameter 54.
3. Uppercase fallback initial.
4. Name.
5. Optional selected-relative kinship role.
6. Optional life summary.
7. Optional birth-order badge.

Selected styling uses a two-unit brand border and selected fill. Unselected
styling uses a one-unit neutral border.

Normalize name whitespace. Use `Unnamed person` when empty. The version 1 Web
presentation truncates over 34 UTF-16 code units and derives font size as:

```text
clamp(floor(320 / max(20, UTF16CodeUnitCount)), 9, 16)
```

Native renderers may use measured one-line fitting inside the same label width,
but obstacle dimensions remain canonical. Large accessibility text should use
an alternate semantic/list presentation rather than changing route geometry.

### 28.1 Birth-Order Derivation and Projection

Group children by their exact set of biological parent IDs. A group receives
automatic order only when it contains at least two children, every child has a
birth date, and every date range is unambiguous:

```text
exact -> that calendar day
month -> first through last day of that month
year  -> January 1 through December 31 of that year
```

Sort by range start, then stable person ID. If any preceding range ends on or
after the next range starts, omit automatic order for the complete sibling
group. Otherwise assign one-based order. Finally, replace the derived value for
each person that has `birthOrderOverride`. Overrides may duplicate each other.

The badge is a radius-10 circle centered 23 units left and 23 units above the
avatar center. It displays the complete decimal value and exposes a localized
ordinal label to accessibility and SVG `<title>` output. Badges remain visible
at overview zoom; names, roles, life summaries, and relationship labels do not.

## 29. Semantic Zoom and Culling

Use hysteresis:

```text
full -> overview when zoom < 0.30
overview -> full when zoom >= 0.42
```

Overview retains:

1. Outer avatar circles.
2. Connectors.
3. Junctions.
4. Crossing bridges.
5. Birth-order badges.
6. Stable person identity and interaction semantics.

Overview omits photos, inner fills, initials, names, roles, life summaries, and
relationship labels. Do not recompute layout or routing when detail changes.

Visual viewport culling is allowed with an overscan region. Accessibility
objects must not disappear solely because visual nodes are culled. Platforms
should provide a structured person list for very large trees.

## 30. Viewport Coordinate Contract

Canonical persisted viewport state is:

```text
ViewportState {
  scrollX: Double
  scrollY: Double
  zoom: Double
}
```

Transform scene to viewport:

```text
viewportX = (sceneX + scrollX) * zoom
viewportY = (sceneY + scrollY) * zoom
```

iOS/Android center-plus-translation state can convert using:

```text
translationX = viewportWidth  / 2 + scrollX * zoom
translationY = viewportHeight / 2 + scrollY * zoom

scrollX = (translationX - viewportWidth  / 2) / zoom
scrollY = (translationY - viewportHeight / 2) / zoom
```

### 30.1 Pointer-centered zoom

For viewport anchor `(px, py)`:

```text
nextScrollX = oldScrollX + px * (1 / nextZoom - 1 / oldZoom)
nextScrollY = oldScrollY + py * (1 / nextZoom - 1 / oldZoom)
```

This must preserve the scene point beneath a mouse pointer or pinch centroid.

### 30.2 Pan

For screen movement `(dx, dy)`:

```text
scrollX += dx / zoom
scrollY += dy / zoom
```

### 30.3 Fit rectangle

```text
widthZoom  = viewportWidth  * factor / sceneWidth
heightZoom = viewportHeight * factor / sceneHeight
zoom       = clamp(min(widthZoom, heightZoom), minZoom, maxZoom)

scrollX = viewportWidth  / (2 * zoom) - sceneCenterX
scrollY = viewportHeight / (2 * zoom) - sceneCenterY
```

Zero rectangle dimensions contribute positive infinity.

Fit all uses connection-plan bounds, factor 0.82, and zoom range 0.08 to 1.1.

Focus person uses rectangle:

```text
x = person.x - 95
y = person.y - 32
width = 190
height = 132
```

with factor 0.32 and zoom range 0.25 to 1.35.

Animations linearly interpolate viewport components with cubic ease-out:

```text
easedProgress = 1 - (1 - progress)^3
```

User navigation cancels active fit/focus animation.

## 31. Input Behavior by Modality

Required behavior:

| Input | Behavior |
| --- | --- |
| Touch drag | Pan |
| Pinch | Zoom around centroid and pan with centroid movement |
| Person tap/click | Toggle selection |
| Background tap/click | Deselect |
| Movement over threshold | Suppress selection |
| Visible zoom controls | Center-anchored zoom |
| Fit control | Fit connection-plan bounds |

Desktop Web additionally supports wheel pan, Shift-wheel horizontal pan,
Ctrl/Command-wheel zoom, middle-button pan, and Space-drag pan. These are
modality adaptations, not requirements for touch-only native platforms.

Selection alone must not reset the viewport. Explicit focus actions may animate
to the selected person. A layout-changing generation filter may fit or preserve
the viewport according to product policy, but the choice must be consistent.

## 32. Accessibility Contract

The visual drawing is not sufficient accessibility output. Every platform must
provide a semantic interaction layer independent of visual level of detail.

For each visible person expose:

1. Display name.
2. Selected state.
3. Kinship role when available.
4. Life summary when privacy settings permit.
5. Select action.
6. Add/edit actions when permitted.

Traversal order is generation, then visual X, then stable person ID.

Minimum physical hit targets are:

```text
Web:     44 CSS pixels
iOS:     44 points
Android: 48 dp
```

Targets must remain at least this size regardless of scene zoom. Use a
screen-space overlay or inverse-scale compensation. Scaling action controls
with the scene below minimum size is non-conforming.

The canvas must have an equivalent structured person/relationship list.
Reduced-motion settings should shorten or remove fit/focus animation.

## 33. Performance Requirements

Implementations should:

1. Cache normalized layout for immutable graph/options inputs.
2. Reuse geometry when selection changes labels only.
3. Route relationships outside paint callbacks.
4. Apply pan/zoom as one scene transform rather than recomputing geometry.
5. Coalesce wheel/pinch events to display frames.
6. Use semantic zoom at overview scale.
7. Cull visual elements with overscan where native scene graphs require it.
8. Keep accessibility navigation available when visual elements are culled.
9. Avoid decoding full-resolution photos for tree nodes.

Likely scaling bottlenecks are row scans over relationships, obstacle candidate
search, pairwise crossing detection, and junction detection, not generation
assignment. Optimize only after preserving fixture output.

## 34. Cross-Platform Conformance Fixtures

Create shared JSON fixtures containing normalized inputs and expected outputs.
Every platform should decode the same files and assert that the absolute
coordinate difference is strictly less than `routeEpsilon`; equality at exactly
`routeEpsilon` fails.

Each fixture should include:

```text
expected.people[]: id, generation, x, y
expected.relationshipIds[]
expected.families[]: id, parentIds, childIds, segments
expected.nonParentRoutes[]: relationshipId, segments, labelRect?
expected.crossings[]
expected.bounds
expected.isValid and failure strings
```

Minimum fixtures:

1. Single person.
2. Two parents with one child.
3. Two parents with multiple children.
4. Siblings with identical parent sets.
5. Married child among unmarried siblings.
6. Multiple partners and remarriage.
7. One parent in multiple families.
8. Children from one family on multiple generation rows.
9. Partner route blocked by a person.
10. Partner route blocked by action controls.
11. Relationship labels with marriage and divorce dates.
12. Unavoidable crossing bridge.
13. Disconnected family components.
14. Ancestor/descendant limits including zero.
15. Invalid dangling/self relationships.
16. Parent cycle with documented partial levels, semantically filtered edges,
    and connection-plan validity; any domain cycle warning is asserted
    separately.
17. Input arrays permuted repeatedly.
18. Realistic large family fixture without private data.

Fixture comparison must not include wall-clock ages, export dates, localized
font glyph positions, random IDs, or platform photo objects.

## 35. Native Migration Guidance

### 35.1 iOS

iOS intentionally retains its native tree layout, generation filtering, focus
recentering, fit bounds, zoom range, gestures, person views, hit testing, and
viewport transforms. Its interactive-canvas adoption includes obstacle-aware
family and non-parent routes, stable family IDs, joined paths, rounded corners,
relationship styles, junctions, crossing bridges, semantic overview zoom, and
scale-compensated action controls. PNG and SVG exports share the planned route
geometry and label positions while retaining export-specific styling. Route
plans and finished SwiftUI paths must be cached by layout so drag and pinch
updates only transform existing content and never rerun route search or path
construction.

### 35.2 Android

Android already has obstacle-aware routing and is the closer native
implementation. It should replace BFS generation assignment and uniform row
centering with the canonical component DAG and block placement. Rail/port
spacing must use canonical values, including 32-unit family-port and lane caps.
Family IDs must use lexically sorted parent IDs rather than visual-X order.
Control obstacles need the version 1 `none`/`allVisible` policy. The generic
router must try all eight non-parent endpoint pairs, and family geometry must
support one rail per child generation plus a continuation trunk. Relationship
label width and offsets must match sections 23 and 4. Rendering must use the
canonical colors, widths, dashes, joined paths, rounded corners, junctions, and
crossing bridges rather than disconnected uniform line segments. Viewport state
should adopt the canonical transform and 0.08 minimum zoom. Semantics must
survive visual culling, and action targets must not shrink with scene zoom.

### 35.3 Shared model work

Before claiming full archive parity, native models should support optional
`divorceDate`, timezone-free genealogy dates, and the same relationship-label
input semantics. Preformatted platform strings should not be layout inputs.

## 36. Source References

The version 1 reference implementation is under `web/src/`:

| Concern | Reference |
| --- | --- |
| Normalization, filtering, generations, positions | `layout.ts` |
| Family grouping, rails, crossings, bounds | `connectionPlan.ts` |
| Rectangles, collision rules, labels | `connectionGeometry.ts` |
| Orthogonal route search | `obstacleRouter.ts` |
| Paths, junctions, rounded corners | `connectorStyle.ts` |
| Renderer-neutral viewport math | `canvasViewport.ts` |
| Gesture and persistence behavior | `SvgTreeCanvas.tsx` |
| SVG layer projection | `SvgTreeScene.tsx` |
| Static SVG/PNG projection | `chartExport.ts` |

Current native comparison points:

| Platform | Layout | Routing | Viewport/rendering |
| --- | --- | --- | --- |
| iOS | `ios/Heritg/TreeLayout.swift` | `TreeConnectionPlan.swift`, `TreeRendering.swift` | `HeritgTreeCanvas.swift` |
| Android | `android/core/.../tree/TreeLayout.kt` | `TreeConnectionPlan.kt`, `TreeObstacleRouter.kt` | `android/app/.../TreeScreen.kt` |

When code and this specification disagree, treat the discrepancy as a bug or
propose an explicit algorithm-version change. Do not silently make one platform
different.
