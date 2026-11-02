# CLAUDE.md — Project context for Claude Code

> Product name: **Meru** (Sanskrit: the sacred mountain at the centre of the world). Use "Meru" in the UI, app config (`name: "Meru"`, `slug: "meru"`), bundle id placeholder `com.obsyd.meru` and photo frames. Read this file and `docs/SPEC.md` before doing anything.

## What we're building

An **offline-first mountain peak finder** for Android and iOS. The user points their phone camera at the mountains and sees every visible peak labeled (name, height, distance), even with **no internet and no SIM**.

This repo is the **validation prototype**. Scope: the Pokhara / Annapurna area of Nepal only. Goal: prove that labels feel accurate and that people react with "whoa". It is NOT the full trek companion yet. Do not add features outside `docs/SPEC.md` without asking.

## Non-negotiable principles

1. **Offline-first.** After install, the app must work with airplane mode on. No network calls on the core path. All terrain and peak data ships with the app.
2. **Accuracy over features.** A peak label on the wrong mountain is the worst possible bug. Every geo function has unit tests with known real-world values.
3. **Battery and performance.** Heavy math runs once per location change, never per frame. The render loop only projects precomputed results.
4. **Region-agnostic code.** Nothing Nepal-specific is hardcoded in logic. Region data (terrain, peaks, viewpoints) is loaded from a data pack so new regions = new data, not new code.
5. **Small, verifiable steps.** Work through `docs/BUILD_STEPS.md` in order. After each step, run tests and confirm the acceptance criteria before moving on.

## Tech stack

| Layer | Choice |
|---|---|
| App | Expo (React Native) + TypeScript, **development build** (not Expo Go, because of native camera/Skia modules) |
| Navigation | expo-router |
| Camera | react-native-vision-camera |
| Drawing overlay + photo compositing | @shopify/react-native-skia |
| Sensors | expo-sensors (DeviceMotion for pitch/roll), expo-location (GPS + `watchHeadingAsync` for true heading) |
| Local files | expo-file-system, expo-asset |
| State | zustand |
| Tests | Jest (ts-jest) for `src/core` |
| Data pipeline | Python 3.11+ in `tools/pipeline` (rasterio, numpy, requests) |
| Builds | EAS Build (Android APK for testers, iOS TestFlight) |

## Repo layout

```
/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── SPEC.md            # full prototype spec (source of truth)
│   └── BUILD_STEPS.md     # ordered steps with acceptance criteria
├── app/                   # expo-router screens
├── src/
│   ├── core/              # PURE TypeScript, no React, no native imports. Fully unit-tested.
│   │   ├── geo.ts         # distance, bearing, destination point, curvature
│   │   ├── dem.ts         # DEM pack reader + bilinear elevation lookup
│   │   ├── horizon.ts     # 360° horizon profile
│   │   ├── visibility.ts  # which peaks are visible from a point
│   │   ├── projection.ts  # azimuth/elevation -> screen x/y
│   │   ├── declutter.ts   # label ranking + overlap removal
│   │   └── filters.ts     # sensor smoothing (angle-aware low-pass)
│   ├── data/              # pack loading on device
│   ├── sensors/           # hooks wrapping expo-sensors / expo-location
│   ├── components/        # UI components
│   └── store/             # zustand stores
├── assets/packs/annapurna/   # generated data pack (committed or produced by pipeline)
├── tools/pipeline/        # Python scripts that build data packs
└── tests/fixtures/        # small DEM crops + expected results for tests
```

**Rule:** `src/core` must never import React, Expo, or any native module. It must run in Node so it can be tested and reused on web and backend later.

## Coding conventions

- TypeScript `strict: true`. No `any` in `src/core`.
- Units in names: `distanceM`, `elevationM`, `azimuthDeg`, `pitchRad`. Never ambiguous numbers.
- Angles: store degrees in data, convert to radians only inside math functions. Azimuth = degrees clockwise from **true north**, 0–360.
- Coordinates: WGS84 `{ lat, lon }` in decimal degrees.
- Pure functions in core; side effects only in hooks/stores.
- Every core function gets tests before it is used in the UI.
- Keep dependencies minimal. Ask before adding a new native module.

## Commands

```
npm install                # install dependencies (use `npx expo install <pkg>` to add Expo/RN packages)
npm start                  # Expo dev server (npx expo start)
npm run web                # web build in the browser (panorama demo, step 7)
npm test                   # Jest unit tests for src/core (ts-jest, Node)
npm run typecheck          # tsc --noEmit
npm run lint               # ESLint (eslint-config-expo + prettier; src/core purity rules)
npm run format             # Prettier write (format:check to verify)

# From step 5 (development build, native modules):
npx expo prebuild
npm run android            # npx expo run:android
npm run ios                # npx expo run:ios

# From step 1 (data pipeline):
python tools/pipeline/build_pack.py --region annapurna
```

Notes:
- Expo SDK 58, React Native 0.88, TypeScript 6, expo-router (routes live in `app/`).
- Jest uses `tsconfig.jest.json`; tests import `describe/it/expect` from `@jest/globals` (TS 6 does not pick up Jest globals automatically).

## Things to watch out for

- Phone compasses are often 5–15° off. Never trust heading blindly; the calibration screen exists for this.
- Copernicus DEM is a surface model (includes trees/buildings). Fine at 90 m resolution.
- Always apply earth curvature + atmospheric refraction in line-of-sight math, otherwise distant peaks are wrong.
- `react-native-view-shot` often captures a black camera preview. Composite photos with Skia from a captured frame instead.
- First GPS fix with no data connection can take 1–3 minutes. Show a clear "Finding your location…" state and allow manual viewpoint selection.
- Data attribution (Copernicus, OpenStreetMap) must appear on an About screen.
