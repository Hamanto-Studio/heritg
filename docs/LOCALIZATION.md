# Web localization

## Bahasa Melayu (Malaysia)

The Web interface supports `ms` with Malaysian date/number conventions (`ms-MY`).
The user-facing language name is **Bahasa Melayu (Malaysia)**. This is Malay,
not Burmese (`my`), and not a word-substitution variant of Bahasa Indonesia.
Browser language matching accepts `ms` and regional `ms-*` tags; a saved choice
takes priority. English and Indonesian remain available.

### Voice and terminology

Use clear, courteous Malaysian task language: **anda**, **Tetapan**, **Log masuk**,
**Log keluar**, **kata laluan**, **pautan**, **muat turun**, **muat naik**,
**sandaran**, **pelayar**, **peranti**, **luar talian**, **penyegerakan** and
**salasilah keluarga**. Buttons describe actions; error messages retain recovery
instructions. Payment amounts and currencies remain the real offer, never an
invented conversion to ringgit. Brand names, formats and technical identifiers
(Heritg, Family+, DOKU, GEDCOM, AES-GCM) remain unchanged.

Kinship labels distinguish **saudara seibu atau sebapa** from **saudara tiri**.
Use **bapa/ibu saudara**, **anak saudara**, **datuk/nenek**, **mentua**, **menantu**
and **ipar** where supported by the recorded relationship. Do not invent
relative age: use **adik-beradik lelaki/perempuan**, not abang/kakak/adik when
birth dates or ordering are unknown. **Penjaga** does not imply a religious
wali. Angkat and pelihara preserve the app's separate adoptive/foster types;
labels describe records, not a legal determination. Cousin generation gaps stay
explicit rather than being mislabeled as tiri.

Terminology references: [DBP, adik-beradik](https://prpmv1.dbp.gov.my/Search.aspx?k=adik-beradik),
[DBP, bapa saudara](https://prpmv1.dbp.gov.my/Search.aspx?d=10&k=bapa+saudara),
[DBP, salasilah](https://prpm.dbp.gov.my/Cari1?d=175768&keyword=salasilah).
This is an authored Malaysian localization, not a claim of professional native-speaker certification.

### Behavior and compatibility

- App language and relationship language are independent existing preferences.
  Both offer Malay in Settings. New Malay workspaces default both to Malay;
  changing the app language does not overwrite a chosen cultural vocabulary.
- All app messages and fan-navigation copy have complete Malay catalogs with
  placeholder parity tests. The calendar includes Malay screen-reader labels.
- Language choices survive encrypted local storage and supported Web backups.
  `.heritg` imports preserve the receiving workspace's interface language.
- Names (including bin/binti), notes, places, ISO dates, photos and relationship
  types are not translated or rewritten. GEDCOM structural tags remain standard.
- Existing recognized editor/sharing diagnostics receive Malay recovery copy.
  Unexpected third-party technical diagnostics are preserved rather than hiding
  information needed for recovery. External payment/legal pages and third-party
  sign-in interfaces are controlled by their providers.
- This change adds Web support only. It does not add Malay to iOS/Android or
  change their archive readers. Older Web builds do not recognize the new `ms`
  preference; use an updated build to restore Malay JSON backups.

Maintain `web/src/i18n.ms.ts`, `kinship.ms.ts` and `explorerCopy.ts` together.
Run `malay.test.tsx`, the full Web suite, lint and build. Check Settings, the date
picker, sharing and fan view at desktop and phone widths with synthetic data.
Do not log or export a user's real family to validate localization.
