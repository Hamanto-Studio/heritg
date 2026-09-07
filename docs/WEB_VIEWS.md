# Web family views

The existing bottom-left selector offers exactly **Focus, Full, and Fan**.
They browse the same archive without changing saved people or relationships.
No backend or native-platform changes are required.

| View | Scope and interaction |
| --- | --- |
| Focus | Current person and configurable ancestor/descendant depths, with optional siblings. Depth settings survive person changes. |
| Full | Complete tree with smooth camera movement to the selected person. |
| Fan | Ancestor rings above the current person and a child fan below; 1–5 ancestor generations, fit/zoom, and one-tap recentering. |

In Full, selecting someone highlights their recorded connections without
filtering the tree. The compact **Connections** control lists named relatives,
including their recorded parent/care, partner, child, and sibling roles. Tapping
a name moves to that person; the return arrow retraces up to 20 guide jumps.
It is not a search or a replacement view. Escape/outside interaction closes
the list; scrolling the list does not pan the canvas. Hiding canvas controls
hides the guide and connection emphasis too.

At overview zoom, overlapping touch targets resolve to the person nearest
the pointer. Keyboard activation still selects the explicitly focused person.
Crossing a responsive breakpoint keeps the selected Full relative readable
instead of replacing that position with the whole-tree overview.
The SVG button layer clips without becoming a scroll container, so keyboard
focus cannot move click targets independently of the drawn people.

Family groups, People, Ancestors, Map, Timeline, and Branches are no longer
available in the selector. The expandable “Find another person” section is
removed. Focus retains its existing person picker inside the view controls.

## Names and navigation

Only the selected person receives add/edit buttons. In Fan, tapping a parent
or child recenters the chart on them without opening a menu. Back retraces
those explicit steps, preserving generation depth and the previous child page.
Up to four children occupy the lower half at once; previous/next controls and
a visible range make every child reachable. Missing children have an explicit
empty state.

Fan names preserve every word: labels wrap at spaces onto up to three lines,
then shrink to fit their segment. Browser font measurements determine the
size; no name is shortened or replaced with an ellipsis. Long unbroken words
shrink without splitting graphemes. Shape clips remain a safety boundary,
not a substitute for fitting. The detail row and accessible labels also retain
the complete name. Very long names or dense outer rings can require zoom for
comfortable reading.

## Person transitions

Full animates the camera to the selected person. Focus retains its existing
scene while the next family is prepared, keeps the tapped person's position
as the layout changes, then smoothly frames the new family. Automatic Focus
framing keeps names readable; when the whole family is too broad, it centers
the current person and keeps relatives accessible by panning. The explicit
Fit control still shows the complete family at overview scale. Fan moves the newly
centered chart from the tapped relative's previous position with a short,
subtle scale and opacity transition. Back transitions from the prior center.

Transitions last 360 ms and can be interrupted by another selection; tree
panning or zooming cancels its camera animation. Reduced-motion preferences
skip animations and take effect during an active transition. Keyboard
navigation moves focus to Fan's new current person without scrolling the page;
mouse and touch navigation do not force a keyboard-focus outline onto the chart.
For Full trees with at least 100 people, automatic framing preserves readable
names around the selected person (or first recorded person on a fresh view).
It does not select anyone, change the Full layout, or filter the archive.
Explicit Fit still shows all bounds, and a valid saved Full viewport is kept.
Choosing a person elsewhere in the app also recenters Fan, without resetting
generations or adding duplicate Back steps. Deselecting leaves the current
family in place.

## Archive and graph integrity

- Parent relationships are included regardless of subtype; parent order never
  infers gender or silently discards additional parents.
- Repeated ancestors retain separate path positions. Cycles stop at a labeled
  repeat. Charts have a 512-node display bound with a visible continuation hint.
- Missing ancestor slots are UI-only, not saved people. Each ancestor's
  accessible label identifies its generation and whose parent it represents.
- Fan fit mode constrains width and height; explicit zoom permits scrolling.
- “Back to tree” returns to the previous Focus/Full canvas and preserves its
  depth settings. The chosen view is per tree for the current session.
- PNG/SVG remain complete family-tree chart exports, not Fan screenshots.
  Sharing, GEDCOM, backups, and privacy filtering retain existing behavior.

## Verification

Tests require exactly three supported views, no expandable person search,
preserved Focus settings, full Fan names, bounded label geometry, child paging,
keyboard exploration, and Back navigation. Motion tests cover interrupted
camera movement, pending layout retention, and reduced-motion handling.

The dev-only `/tests/manual/family-views.html` fixture uses synthetic people,
long unbroken names, Unicode, and 20 children without accessing saved archives.
Check Fan/Focus/Full at desktop and phone widths, both languages, and parent/
child selection. Large charts scroll within their containers; page chrome and
text must not overflow.
