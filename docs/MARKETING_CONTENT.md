# Public product copy

Reviewed against Web 0.9.0 and the owner's PDF export correction on 2026-09-12. The landing
pages are `en/index.html` and `id/index.html`; the in-app Family+ benefits use
`web/src/FamilyPlusBenefits.tsx` and the English, Indonesian, and Malay catalogs.
Keep those surfaces aligned when capabilities or pricing change.

## Current contract

- Free Web tools: Full, Focus, and Fan; local trees and editing; cropped profile
  photos and relationship dates; English, Indonesian, and Malaysian Malay;
  separate relationship-language selection; GEDCOM import/export, HD PNG, PDF, SVG,
  and encrypted `.heritg` backups. Share/export privacy controls omit selected
  birth dates, relationship dates, photos, and ages. Do not describe native app
  feature parity. PDF is included per the owner's product-copy correction;
  its implementation is tracked separately in `feat/web-pdf-export`.
- Free shares: one active link per device, with 7, 30, or 90 days of retention.
- Family+: optional Web synchronization and authenticated sharing options for
  365 days, 1095 days, or while Family+ is active. This is not live co-editing.
- Production plans: six months Rp49.000, one year Rp79.000, three years
  Rp199.000. These are full upfront IDR amounts, not monthly charges. DOKU
  one-time payments, manual renewal, no automatic billing. In-app prices remain
  backend-owned; this content change must not change billing behavior.
- Signing in does not enable sync. Core local use is account-free; online
  features require internet. Client-encrypted sync with server-managed recovery
  must not be described as operator-blind or guaranteed data recovery.
- Product analytics remain disabled in the deployed release.

Sources: `web/src/SharePanel.tsx`, `web/src/ProPaywallDialog.tsx`,
`web/src/i18n.ts`, `docs/CLOUDFLARE_PRODUCTION.md`, `docs/CHECKOUT_UX.md`,
`docs/terms/index.html`, and the `web-0.9.0` release changelog.

## Store availability

- App Store app ID: `6796645792`, corroborated by `ios/RELEASE.md` and the live
  [Indonesian listing](https://apps.apple.com/id/app/heritg-family-tree/id6796645792).
  The buttons use the region-independent app-ID link.
- Android package: `tech.robihamanto.heritg.android`. Its Google Play URL
  returned 404 on the review date. Until the owner supplies a verified published
  listing, show a static “Coming soon” status with the working Web option nearby.
  Do not link to a store homepage or another similarly named app.
- Download controls retain a Web globe, the Apple mark, and the multicolour
  Google Play mark as local vector assets. Brand-mark sources are recorded in
  the SVG files; Apple and Google retain their respective trademarks.

Run `npm --prefix web test -- src/landingPages.test.ts src/FamilyPlusBenefits.test.tsx`
after editing these surfaces. Update the store-availability checks when an actual
listing is published. Inspect English and Indonesian at desktop and phone widths,
and Family+ in all three app languages without creating a payment.
