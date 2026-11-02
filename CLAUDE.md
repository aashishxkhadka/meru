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
npm run elev -- 28.24625 83.94881   # elevation at lat lon from the real pack via src/core/dem.ts (tsx)
npm run panorama -- sarangkot world-peace-pagoda pokhara-lakeside   # PNGs + peak table + timings -> tools/out/

# Development build (native modules; not Expo Go). android/ and ios/ are generated, git-ignored:
npx expo prebuild --clean          # regenerate native projects after app.json/plugin changes
npm run android                    # npx expo run:android  (debug, JS from Metro over USB/Wi-Fi)
npx expo run:android --variant release   # JS embedded in the APK: use this for airplane-mode tests
npm run ios                        # npx expo run:ios (needs full Xcode)
npx expo export --platform android # bundle-only check, no SDK needed (verifies dem.bin is packaged)

# Data pipeline (Python 3.11+, venv in tools/pipeline/.venv, git-ignored):
python3 -m venv tools/pipeline/.venv && tools/pipeline/.venv/bin/pip install -r tools/pipeline/requirements.txt
tools/pipeline/.venv/bin/python tools/pipeline/build_pack.py --region annapurna   # tiles cached in tools/pipeline/cache/
tools/pipeline/.venv/bin/python tools/pipeline/build_pack.py --region annapurna --list-tiles
tools/pipeline/.venv/bin/python tools/pipeline/build_pack.py --region annapurna --only peaks viewpoints
tools/pipeline/.venv/bin/python tools/pipeline/build_pack.py --region annapurna --finalize-peaks  # reviewed CSV -> peaks.json
# peaks.review.csv and peaks.json are never overwritten without --force (they hold human review).
# Region config (bbox, must-have peaks, viewpoint OSM ids) lives in tools/pipeline/regions.py.
tools/pipeline/.venv/bin/python tools/pipeline/make_elev_fixture.py   # regenerate tests/fixtures/annapurna_elev_reference.json after rebuilding dem.bin
tools/pipeline/.venv/bin/python tools/pipeline/elev.py 28.2442 83.9486           # spot-check elevation at lat lon
```

Notes:
- Expo SDK 58, React Native 0.88, TypeScript 6, expo-router (routes live in `app/`). Typed routes are off (they depend on a file only the dev server generates).
- react-native-vision-camera is v5 (Nitro): needs react-native-nitro-modules + react-native-nitro-image and has NO config plugin; camera permission is set in app.json (`ios.infoPlist`, `android.permissions`). Microphone is blocked.
- dem.bin is bundled via Metro (`metro.config.js` adds `bin` to assetExts) and loaded by `src/data/loadBundledPack.ts`; packs are registered in `src/data/bundledPacks.ts`.
- Storage: AsyncStorage (not MMKV). UI strings: `src/strings.ts`. Shared UI kit: `src/components/ui.tsx`.
- Camera pose (step 8), verified from expo-sensors native source: `DeviceMotion.accelerationIncludingGravity` points DOWN in device axes on both platforms (face-up ⇒ z ≈ −9.81); `Magnetometer` is the calibrated field on both. Device axes: x right, y top, z towards the user; back camera = −z. Pitch/roll come from gravity and heading from a tilt-compensated compass in `src/core/orientation.ts` — do NOT use DeviceMotion `rotation` Euler angles (platform conventions differ and they gimbal-lock when the phone is upright) or expo-location heading for the camera direction (it tracks the phone's top edge). expo-location heading is used only for accuracy (figure-8 prompt) and declination.
- Camera FOV: VisionCamera v5 has no FOV field; `focalLength` is 35 mm-equivalent → `sensorFovFromFocalLength35mm`, then `visibleFovForCover` because the full-screen preview crops the sides (~34° visible on a tall phone, not 50°).
- Jest uses `tsconfig.jest.json`; tests import `describe/it/expect` from `@jest/globals` (TS 6 does not pick up Jest globals automatically).
- Node-only files (`scripts/`, real-data tests in `tests/`) start with `/// <reference types="node" />`; Node types are not loaded for the app.
- `tests/dem.real.test.ts` checks `src/core/dem.ts` against the Python reader on the real pack (1,008 reference points).
- `tests/__snapshots__/visibility.real.test.ts.snap` holds the visible/hidden peaks from Sarangkot (verified against a real photo, 2026-11-02) and Lakeside. Never update it with `jest -u` without the user re-checking the panorama and approving.

## Things to watch out for

- Phone compasses are often 5–15° off. Never trust heading blindly; the calibration screen exists for this.
- Copernicus DEM is a surface model (includes trees/buildings). Fine at 90 m resolution.
- Always apply earth curvature + atmospheric refraction in line-of-sight math, otherwise distant peaks are wrong.
- `react-native-view-shot` often captures a black camera preview. Composite photos with Skia from a captured frame instead.
- First GPS fix with no data connection can take 1–3 minutes. Show a clear "Finding your location…" state and allow manual viewpoint selection.
- Data attribution (Copernicus, OpenStreetMap) must appear on an About screen.
