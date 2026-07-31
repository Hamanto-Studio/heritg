# HERITG Kumo Design System

Status: Draft v0.1<br>
Reference: [Kumo UI](https://kumo-ui.com), initially pinned to v2.8.0<br>
Companion: [MVP_PRODUCT_SPEC.md](MVP_PRODUCT_SPEC.md)

## 1. Adoption Model

HERITG uses Kumo's styling and component language on both platforms while remaining fully native:

- iOS components are implemented in SwiftUI.
- Android components are implemented in Jetpack Compose.
- Kumo's React components and Tailwind classes are not runtime dependencies.
- Kumo documentation, source, and component registry are the normative visual references.
- A canonical HERITG token file generates Swift and Kotlin constants.
- A HERITG component contract defines matching variants, states, sizing, and semantics.

Kumo is MIT licensed. Preserve its copyright and license notice when copying or substantially adapting source, tokens, component definitions, or assets. Review third-party icon and font licenses separately.

## 2. Product Adaptation

Retain Kumo's clean, compact, layered visual language while adapting it to family archives:

- Neutral canvas and layered surfaces keep dense trees readable.
- Brand color is a HERITG product token, not Cloudflare's brand identity.
- Family relationship colors are semantic additions and never the only relationship indicator.
- Controls remain simple enough for elders and low-cost Android devices.
- Native system pickers, share sheets, permission prompts, and authentication dialogs are not restyled.

Do not copy Cloudflare logos, trademarks, product wording, or Cloudflare-specific components.

## 3. Canonical Tokens

Use semantic names rather than raw color values in feature code.

### Surfaces

- `kumo.canvas`: outermost screen and tree background
- `kumo.base`: standard card and control surface
- `kumo.elevated`: raised cards and sheets
- `kumo.recessed`: grouped or segmented control background
- `kumo.tint`: subtle selection or hover/pressed background
- `kumo.contrast`: inverted high-contrast surface
- `kumo.overlay`: modal and floating overlay surface
- `kumo.control`: input and button control surface

### Text

- `kumo.text.default`
- `kumo.text.strong`
- `kumo.text.subtle`
- `kumo.text.inactive`
- `kumo.text.placeholder`
- `kumo.text.inverse`
- `kumo.text.link`
- `kumo.text.info`
- `kumo.text.success`
- `kumo.text.warning`
- `kumo.text.danger`

### Interaction and Status

- `kumo.brand` and `kumo.brand.hover`
- `kumo.interact`
- `kumo.fill` and `kumo.fill.hover`
- `kumo.focus`
- `kumo.line` and `kumo.hairline`
- `kumo.info` and `kumo.info.tint`
- `kumo.success` and `kumo.success.tint`
- `kumo.warning` and `kumo.warning.tint`
- `kumo.danger` and `kumo.danger.tint`

Every color token defines light and dark values. Initial values should be derived from Kumo v2.8.0, except HERITG brand and family-specific semantic additions.

### Typography and Geometry

- Use Inter where licensing, packaging, and platform rendering are validated.
- Fall back to the platform system font when Inter is unavailable or an accessibility setting requires it.
- Typography roles: display, title, body, label, metadata.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Corner radii: 8, 12, 20.
- Elevation roles: none, selected, overlay.
- Motion roles: fast, standard, deliberate.
- Minimum interactive target: 44 points on iOS and 48 dp on Android.

## 4. Components

Implement matching native component contracts:

- `HERITGButton`
- `HERITGTextField`
- `HERITGSelectField`
- `HERITGSheet`
- `HERITGDialog`
- `HERITGAppBar`
- `HERITGSearchBar`
- `HERITGPersonAvatar`
- `HERITGPersonCard`
- `HERITGRelationshipBadge`
- `HERITGEmptyState`
- `HERITGBanner`
- `HERITGUndoToast`
- `HERITGContextMenu`
- `HERITGLoadingIndicator`

Do not add date-picker components until dates return to product scope.

### Button Contract

Kumo-aligned variants:

- `primary`
- `secondary`
- `ghost`
- `destructive`
- `secondaryDestructive`
- `outline`

Shapes:

- `base`
- `square`
- `circle`

Sizes:

- `small`
- `base`
- `large`

Extra-small controls may be used only when the final touch target still meets platform accessibility requirements.

Every button supports enabled, pressed, focused, loading, and disabled states. Icon-only buttons require an accessibility label.

### Person Card Contract

`HERITGPersonCard` uses Kumo's base/elevated surface hierarchy and adds genealogy-specific states:

- default
- selected
- focused person
- living/private
- collapsed branch
- missing or unknown details

The card must show the person's display name without requiring a surname. Relationship type is communicated by text or shape in addition to color.

## 5. Native Mapping

### SwiftUI

- Generate `Color`, typography, spacing, radius, and motion constants from canonical tokens.
- Use `ButtonStyle`, `TextFieldStyle`, `ViewModifier`, and reusable SwiftUI views.
- Use environment values for color scheme, Dynamic Type, contrast, and Reduce Motion.
- Use VoiceOver labels, values, hints, traits, and focus APIs.

### Jetpack Compose

- Generate Compose `Color`, typography, spacing, shape, and motion constants from the same source.
- Use reusable composables and stable parameter contracts.
- Use Material primitives only as implementation details; HERITG Kumo tokens control app-owned appearance.
- Respect font scale, dark theme, high contrast where available, reduced animation preferences, and TalkBack semantics.

## 6. Accessibility

Kumo's web implementation uses WAI-ARIA patterns, but native apps must translate intent rather than copy ARIA attributes.

- Maintain visible focus and selected states.
- Provide accessible names for every custom and icon-only control.
- Restore focus after dialogs and sheets close.
- Meet platform contrast guidance in light and dark modes.
- Preserve logical focus order independent of tree coordinates.
- Support external keyboards where platform controls permit.
- Disable or reduce nonessential animation under Reduce Motion.
- Test VoiceOver and TalkBack on physical devices.

## 7. Parity Verification

For every component:

- Maintain one contract describing variants, states, content rules, and accessibility behavior.
- Capture iOS and Android golden screenshots for light, dark, large text, loading, error, and disabled states.
- Compare token outputs in CI to ensure Swift and Kotlin values originate from the same canonical version.
- Allow documented differences only for native font metrics, system dialogs, pickers, and accessibility behavior.
- Pin the adopted Kumo version and review upstream changes before updating tokens or component behavior.

Kumo upgrades are intentional product changes, not automatic package updates.

## 8. Sources

- [Kumo documentation](https://kumo-ui.com)
- [Kumo colors and semantic tokens](https://kumo-ui.com/colors)
- [Kumo accessibility guidance](https://kumo-ui.com/accessibility)
- [Kumo button contract](https://kumo-ui.com/components/button)
- [Kumo source and MIT license](https://github.com/cloudflare/kumo)
