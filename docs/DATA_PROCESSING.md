# Data Processing Register

Last reviewed: August 4, 2026

This register identifies data flows in the official HERITG application. It is
intended to keep the privacy policy, implementation, and App Store disclosures
consistent.

## Current Processing

| Component | Status | Purpose | Data | Destination | User control |
| --- | --- | --- | --- | --- | --- |
| SwiftData and app container | Active | Store family trees locally | User-entered family data and app preferences | User's device | Edit or delete data; delete the app |
| IndexedDB | Active at `heritgapp.hamanto.com` | Store family trees and preferences locally | User-entered family data and app preferences | Browser storage on the user's device | Edit or delete data; clear site data |
| File import | Active | Import genealogy records or backups | User-selected file contents | Processed on-device or in-browser | User explicitly selects a file |
| Image and document export | Active | Create user-requested exports | User-selected family-tree content | User-selected system share or browser download destination | User initiates and chooses destination |
| PWA service worker and Cache Storage | Active on web | Cache the public application shell for offline use | Public HTML, JavaScript, styles, fonts, and images; no family content | Browser cache on the user's device | Clear site data or uninstall the PWA |
| Vercel static web hosting | Active on web | Deliver and protect public application assets at `heritgapp.hamanto.com` | Standard HTTP request metadata; no family-tree payload | Vercel | User opens the web app |
| Cloudflare authoritative DNS | Active on web | Resolve `heritg.hamanto.com` and `heritgapp.hamanto.com` without proxying application traffic | DNS query and resolution metadata; no family-tree payload | Cloudflare DNS | User opens the website or web app |
| Encrypted share creation | Optional on web | Create an expiring immutable read-only family-tree snapshot | AES-256-GCM ciphertext; size and expiration metadata; no viewing key | Cloud Run, Firestore, and private Cloud Storage in Jakarta | User explicitly creates a link and chooses its expiration |
| Encrypted share viewing | Optional on web | Download and decrypt a shared snapshot in memory | Ciphertext and access timing; viewing key remains in the URL fragment | Cloud Run and private Cloud Storage in Jakarta | Recipient opens the complete link |
| Encrypted share management | Optional on web | Revoke active links from the creating browser | Encrypted share ID, deletion capability, and expiration | Encrypted IndexedDB on the sender's device | Sender revokes the link or clears site data |
| External support link | Active | Let users contact support | Link navigation; subsequent communication chosen by user | Telegram | User explicitly opens the link |
| App Store distribution | Active for distributed builds | Install and update the app | Apple account, transaction, device, and diagnostic data determined by Apple | Apple | Apple account and device settings |
| App Store Connect reports | Active for distributed builds | Aggregate distribution and product reporting | Aggregate downloads, sales, conversion, and performance information | Hamanto Studio through Apple | Governed by Apple platform settings and policies |

## Not Currently Active

| Service | Status | Policy |
| --- | --- | --- |
| Product analytics | Not integrated | May be introduced only as optional collection under `ANALYTICS.md` |
| Firebase Analytics / Google Analytics | Not used | Not approved for HERITG under the current policy |
| Firebase infrastructure | Not integrated | A selected service requires a documented purpose and register update |
| Sentry | Not integrated | Optional diagnostics would require separate consent and sanitization |
| Firebase Crashlytics | Not integrated | Optional diagnostics would require separate consent and sanitization |
| Advertising and attribution SDKs | Not integrated | Cross-app tracking and advertising profiles are prohibited |
| Session replay and heatmaps | Not integrated | Prohibited by the analytics policy |
| HERITG account or hosted editable family database | Not available | Core functionality remains account-free and local; optional sharing stores immutable ciphertext only |

## Provider Approval Requirements

Before adding a provider, the implementing pull request must document:

1. The exact SDK products and modules included.
2. The purpose and legal basis for processing.
3. Every collected field, automatic field, identifier, and event.
4. Data destinations, subprocessors, regions, retention, and deletion behavior.
5. Whether collection occurs before consent or when the app is offline.
6. How users enable, disable, reset, export, or delete associated data.
7. How development, test, preview, and community builds remain no-op.
8. Required App Store privacy-label and privacy-policy updates.

Approval applies to specific modules, not an entire vendor. For example, using
Firebase Storage does not approve Firebase Analytics, Crashlytics, Performance
Monitoring, Remote Config, or Cloud Messaging.

## Data Classification

| Classification | Examples | Analytics | Diagnostics | Local app storage |
| --- | --- | --- | --- | --- |
| Family content | Names, dates, relationships, notes, photos, tree titles | Prohibited | Prohibited | Allowed |
| User-selected files | GEDCOM, HERITG archives, exported images and documents | Prohibited | Prohibited | Allowed when required by the feature |
| Product events | Approved events in `ANALYTICS.md` | Optional with consent | Not applicable | Temporary queue only if implemented |
| Technical diagnostics | Error code, stack trace, app version, OS version | Not applicable | Optional with separate consent | Temporary queue only if implemented |
| Direct identifiers | Email, phone number, account ID, advertising ID | Prohibited | Prohibited | Not required by current app |
| Credentials | API secrets, private keys, service accounts, signing passwords | Prohibited | Prohibited | Never bundled with the app |

## Review Triggers

Review and update this register when any of the following changes:

- A dependency, SDK module, backend, or network endpoint is added
- An entitlement or background mode is enabled
- Analytics or diagnostic events change
- Sync, backup, collaboration, accounts, notifications, or purchases are added
- Data retention, processing region, provider terms, or subprocessors change
- App Store privacy questions receive a different answer

## Related Documents

- [Privacy Policy](../PRIVACY.md)
- [Analytics Policy](ANALYTICS.md)
- [Security Policy](../SECURITY.md)
- [Release Policy](RELEASES.md)
