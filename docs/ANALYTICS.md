# Analytics Policy

HERITG is private by default, works without an account, and does not require an
internet connection. Product analytics, if introduced, must remain optional,
minimal, anonymous, and independent from family-tree content.

This document is the public contract for analytics in official HERITG builds.
Adding an event, property, SDK, or analytics destination requires updating this
document in the same pull request.

Product analytics is not currently integrated. See the current
[data processing register](DATA_PROCESSING.md) and user-facing
[privacy policy](../PRIVACY.md).

## Principles

- Analytics is disabled by default until the user explicitly enables it.
- Declining analytics does not disable or degrade any app feature.
- Analytics and crash reporting use separate consent settings.
- Development, test, preview, and community builds do not send analytics.
- Events pass through one typed analytics gateway. Views must not call a vendor
  SDK directly.
- Only explicitly allowlisted events and properties may leave the device.
- Analytics is used for product improvement, never advertising, profiling,
  fingerprinting, or cross-app tracking.
- Disabling analytics stops collection and resets any analytics identifier
  controlled by HERITG.

## Approved Events

The initial event catalog is intentionally small. Events must describe product
actions and outcomes, not user content.

| Event | Purpose | Approved properties |
| --- | --- | --- |
| `onboarding_completed` | Measure onboarding completion | `app_version`, `locale` |
| `first_tree_created` | Measure initial activation | `app_version`, `locale` |
| `first_person_added` | Measure first-tree progress | `app_version` |
| `first_relationship_added` | Measure successful tree setup | `relationship_category` |
| `import_completed` | Evaluate import reliability | `format`, `result` |
| `export_completed` | Evaluate export usefulness | `format`, `tree_size_bucket`, `result` |
| `pro_screen_viewed` | Measure discovery of Pro | `entry_point` |
| `purchase_started` | Measure purchase intent | `product_category` |
| `purchase_completed` | Measure conversion | `product_category`, `result` |

Approved properties must use predefined values. They must never contain raw or
user-entered text.

`tree_size_bucket` may only use broad ranges such as `1-10`, `11-50`, and
`51+`. `relationship_category` describes a UI workflow category and must not
identify either person or reveal a specific family structure.

## Prohibited Data

Analytics and diagnostics must never collect:

- Names, tree titles, notes, biographies, or search terms
- Birth, death, marriage, or other family dates
- Family relationships or graph structure
- Photos, files, filenames, hashes, or attachment metadata
- GEDCOM or HERITG archive contents
- Contacts, email addresses, phone numbers, or account identifiers
- Precise location, IP-derived location stored by HERITG, or address-book data
- Advertising identifiers, device fingerprints, or cross-app identifiers
- Exact family size or high-cardinality property values
- User-entered values in event names, properties, errors, breadcrumbs, or logs
- Session replay, screen recordings, screenshots, or interaction heatmaps

## Consent

The consent message must explain the collection without dark patterns:

> Help improve HERITG by sharing anonymous product events. Family names,
> relationships, photos, notes, and imported files are never collected.

The choices must be equally visible:

- `Not now`
- `Share anonymous analytics`

Users can change the setting at any time. The Settings screen must link to this
event catalog and accurately state when analytics was last sent.

Because optional analytics requires networking, public messaging must say that
HERITG works offline and requires no connection. It must not claim that the app
never makes a network connection when analytics is enabled.

## Implementation Requirements

The analytics layer must:

1. Use a typed event model with no arbitrary property dictionaries.
2. Reject events not present in the allowlist.
3. Reject unknown properties and values before transmission.
4. Avoid persistent user, device, advertising, and vendor identifiers where
   the selected provider permits it.
5. Keep queued events on-device for the shortest practical period.
6. Avoid logging analytics payloads in production.
7. Include automated tests proving prohibited values cannot be attached.
8. Expose a no-op implementation for tests, previews, and community builds.

## Vendor Requirements

An analytics provider must offer hosted service without requiring HERITG to
operate a tracking backend and must support:

- No advertising or sale of analytics data
- No session replay or automatic interaction capture
- Disabled automatic screen, device, and demographic collection where possible
- Documented retention and deletion behavior
- Appropriate data-processing terms
- Export and deletion controls
- SDK behavior that can be audited or independently verified

Using Firebase for storage, crash reporting, or other infrastructure does not
require using Firebase Analytics. Firebase Analytics and Google Analytics are
not approved under the current HERITG privacy policy.

## Product Measurement

HERITG should combine minimal in-app analytics with aggregate platform data:

- App Store Connect for product-page conversion, downloads, purchases, and
  subscription or in-app purchase performance
- Approved analytics events for activation and feature-success funnels
- Separate opt-in diagnostics for crashes and reliability
- Public issues and user feedback for qualitative research

The primary activation funnel is:

```text
onboarding_completed
-> first_tree_created
-> first_person_added
-> first_relationship_added
-> export_completed or pro_screen_viewed
-> purchase_completed
```

Analytics should answer a documented product question. Events that no longer
support an active decision must be removed.

## Review Checklist

Before merging any analytics change, confirm:

- The event and every property are documented here.
- No value can contain family-tree or user-entered content.
- Collection remains disabled before consent.
- The app remains fully functional when collection is disabled.
- Development, test, preview, and community builds use the no-op implementation.
- Privacy disclosures and App Store privacy answers remain accurate.
- Tests cover allowlisting, consent, disablement, and payload validation.
