# Releasing Meru test builds (EAS Build)

Builds run in Expo's cloud (EAS), so no Android Studio or Xcode is needed on the Mac for them.
Profiles live in `eas.json`:

| Profile | What you get | Use it for |
|---|---|---|
| `preview` | Android **APK** (installable by tapping the file); iOS ad-hoc build for registered iPhones | Testers' phones |
| `testflight` | iOS App Store build (auto-incremented build number) → TestFlight; Android AAB | iPhone testers via TestFlight |
| `development` | Dev client (APK / device build), JS from Metro | Day-to-day development |

## One-time setup

1. Create a free Expo account at https://expo.dev/signup.
2. Log in and link the project (this adds `extra.eas.projectId` to `app.json`; commit that change):
   ```
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
3. iOS only: you need a paid Apple Developer account (99 USD/year). EAS creates the
   certificates and provisioning profiles for you the first time (answer "yes" to its prompts).
   Create the app in App Store Connect with bundle id `com.obsyd.meru` (placeholder: change it
   in `app.json` first if you have a real one).

## Android APK for testers

```
npx eas-cli@latest build --platform android --profile preview
```

When it finishes (~15 min), EAS prints a link + QR code. Testers open it on their phone, download
the APK and install it (Android asks to allow installs from the browser once).

## iPhone via TestFlight

```
npx eas-cli@latest build --platform ios --profile testflight
npx eas-cli@latest submit --platform ios --profile testflight --latest
```

Then in App Store Connect → TestFlight, add testers by email. Internal testers (up to 100 people
on your team) get it right away; external testers need a short Apple review first.

## Before every tester build

1. `npm test && npm run typecheck && npm run lint`
2. Bump `version` in `app.json` when the change is visible to testers (build numbers are bumped
   automatically for TestFlight).
3. Airplane-mode check on one phone with a **release** build (JS embedded, no Metro):
   turn on airplane mode → open app → pick Sarangkot → labels appear → take + save a photo.
4. After a field session, testers export their log: About → long-press "Meru" → Diagnostics →
   Export events (JSON), and send you the file.

## Notes

- `android/` and `ios/` are generated during the build (`expo prebuild`); they are git-ignored.
- The data pack (`assets/packs/annapurna/dem.bin`, ~10 MB) is bundled in the app; nothing is
  downloaded at runtime.
- Icons are placeholders from `npm run make-icons`; replace `assets/*.png` with designed artwork
  before any public release.
