# Play Console app-content checklist

These answers describe Android version `1.0.0 (1)`. Re-audit them whenever permissions, SDKs, network behavior, authentication, ads, or data processing changes.

## Completed through API

- Store listings: English (United States) and Indonesian.
- Store assets: 512x512 icon, 1024x500 feature graphic, and four phone screenshots.
- Public support email: `robi@hamanto.com`.
- Public website: `https://family.heritg.us/`.
- Data Safety: the app does not collect or share required user data.

The Data Safety answer is based on the release app having no Internet permission, analytics, ads, tracking, account system, or automatic off-device transfer. Family records are processed locally. Explicit exports through Android's system share sheet are user-initiated transfers where the user reasonably expects sharing.

## Console-only declarations

Google does not expose these declarations through the Android Publisher API. Submit them in Play Console exactly as follows.

### Privacy policy

- Privacy policy URL: `https://family.heritg.us/privacy/`

### App access / sign-in details

- All functionality is available without special access: **Yes**.
- Login, membership, location, or other authentication restrictions: **None**.
- Review instructions or credentials: **Not required**.

### Ads

- Does the app contain ads: **No**.

### Content rating

- Contact email: `robi@hamanto.com`.
- App category in the IARC questionnaire: utility/reference or the equivalent non-game category.
- Violence or graphic content: **No**.
- Fear or horror content: **No**.
- Sexual content or nudity: **No**.
- Profanity or crude humor: **No**.
- Controlled substances: **No**.
- Gambling, simulated gambling, or contests: **No**.
- In-app purchases: **No**.
- Users communicate or exchange content inside the app: **No**.
- Shares precise location with other users: **No**.
- Unrestricted web access: **No**.

### Target audience and content

- Target age group: **18 and over** only.
- App intentionally appeals to children: **No**.
- Store listing contains imagery or language that targets children: **No**.

### Government apps

- Is this app developed by or on behalf of a government: **No**.

### Financial features

- Does the app provide financial products, services, payments, banking, lending, investing, cryptocurrency, or financial advice: **No**.

### Health

- Does the app provide health features or access health data: **No**.

### Category and contact details

- Type: **App**.
- Category: **Books & Reference**.
- Contact email: `robi@hamanto.com`.
- Website: `https://family.heritg.us/`.
- Contact phone: leave blank unless a public support number is intentionally provided.

### Main store listing

- Confirm the privacy policy URL is also present in the store-listing contact section.
- English and Indonesian copy and the required graphics are maintained under `android/play/` and synchronized through Play Console CLI.
