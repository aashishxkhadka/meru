# BUILD_STEPS.md — Step-by-step build guide for Claude Code

> Place at `docs/BUILD_STEPS.md`. Work through the steps **in order**. Each step has a prompt to paste into Claude Code and acceptance criteria. Don't start the next step until the current one passes.

## How to use this file

1. Unzip the `meru` folder (it already has `CLAUDE.md`, `README.md` and `docs/`).
2. In a terminal: `cd meru && claude` to start Claude Code in that folder.
3. For each step, type: `Do step N from docs/BUILD_STEPS.md` (or paste the step's prompt). Let it work, then check the acceptance criteria yourself. Commit after every passing step (`git commit -m "step N: ..."`).
4. Start a fresh session (`/clear`) between steps so context stays small; CLAUDE.md is loaded automatically every time.
5. If something fails, tell Claude Code exactly what you saw (screenshot, error, wrong peak) rather than asking it to "fix it".

**You'll need:** Node 20+, Python 3.11+, Android Studio (emulator + a real Android phone), Xcode on a Mac for iOS (can come later), an Expo account for EAS builds.

**Rough timeline:** steps 0–4 in week 1–2, steps 5–9 in week 3–4, steps 10–12 in week 5–6.

---

## Step 0 — Project setup

**Prompt:**
```
Read CLAUDE.md and docs/SPEC.md fully. Then set up the project:
- Create an Expo app named "Meru" (slug: meru, bundle id com.obsyd.meru) with TypeScript (strict) and expo-router in this folder, keeping CLAUDE.md, README.md and docs/.
- Create the folder structure from CLAUDE.md (src/core, src/data, src/sensors, src/components, src/store, tools/pipeline, tests/fixtures, assets/packs).
- Set up Jest with ts-jest for src/core, plus one passing sample test.
- Add ESLint + Prettier with sensible defaults.
- Add a .gitignore that ignores tools/pipeline/cache/ and node_modules.
- Initialise git and make the first commit.
- Update the Commands section of CLAUDE.md with the real commands.
Don't install camera/sensor modules yet.
```

**Done when:** `npm test` passes, `npx expo start` runs, folder structure matches CLAUDE.md.

---

## Step 1 — Data pipeline: terrain

**Prompt:**
```
Build tools/pipeline/build_pack.py (terrain part only) per docs/SPEC.md section 5, items 1–3.
- Python 3.11, dependencies in tools/pipeline/requirements.txt (rasterio, numpy, requests).
- Download the Copernicus DEM GLO-30 tiles covering lat 27.6–29.4, lon 83.0–85.0. First verify the correct public URL pattern and licence/attribution text, and tell me what you found before downloading.
- Cache tiles in tools/pipeline/cache/.
- Mosaic, crop to the bbox, resample to 3 arc-seconds with bilinear, fill small nodata holes.
- Write assets/packs/annapurna/dem.bin (Int16 little-endian, north row first) and manifest.json with the dem block and attribution.
- Print a summary: width, height, min/max elevation, file size, nodata count.
- Add a tiny script that prints the elevation at a given lat/lon from dem.bin so I can spot-check.
```

**Done when:** `dem.bin` exists (~10 MB). Spot-check: Pokhara Lakeside should be roughly 750–850 m, Sarangkot ridge roughly 1,500–1,600 m, and the high Annapurna summits should come out above 7,000 m (DEM smooths sharp summits, so a bit lower than official heights is normal).

---

## Step 2 — Data pipeline: peaks and viewpoints

**Prompt:**
```
Extend the pipeline per docs/SPEC.md section 5, items 4–8.
- Fetch named peaks from the Overpass API for the same bbox (one cached query).
- Clean, dedupe, assign rank, write tools/pipeline/peaks.review.csv.
- Check the must-have peak list and print any that are missing or have no elevation.
- Run the elevation sanity check against dem.bin and flag differences over 150 m.
- After I confirm the review, write assets/packs/annapurna/peaks.json (never overwrite a reviewed file without --force).
- Create viewpoints.json for the viewpoints listed in SPEC 4. Look the coordinates up from OpenStreetMap (named places/viewpoints) and show me the sources. Don't guess coordinates; mark any you can't find as TODO.
- Add Nepali names (name:ne) where OSM has them; leave empty otherwise.
```

**Done when:** you've reviewed the CSV (fix names, remove junk peaks, add descriptions for the top ~20), all must-have peaks are present, and every viewpoint has a sourced coordinate.

---

## Step 3 — Core geo library + tests

**Prompt:**
```
Implement src/core/geo.ts, src/core/dem.ts and src/core/filters.ts per docs/SPEC.md section 6.1, 6.2 and 6.7, with full Jest tests per section 10.
- Pure TypeScript, no React/Expo imports.
- dem.ts must accept an ArrayBuffer + manifest header so it works in Node (tests) and on device.
- Add a Node script (scripts/elev.ts) that loads the real pack and prints elevation at a lat/lon.
Run the tests and show me the results.
```

**Done when:** all tests pass; `elev.ts` agrees with the Python spot-check from step 1.

---

## Step 4 — Horizon + visibility engine, checked against reality

**Prompt:**
```
Implement src/core/horizon.ts and src/core/visibility.ts per docs/SPEC.md 6.3 and 6.4, with synthetic-DEM tests from section 10.
Then build scripts/panorama.ts (runs in Node) that:
- takes a viewpoint id from viewpoints.json,
- computes the horizon and visible peaks,
- renders a 360° panorama PNG (e.g. 3600 x 600, azimuth on x, elevation angle on y) with the skyline, ridge layers shaded near-dark/far-light, and visible peak labels with azimuth and distance,
- prints a table of visible and hidden peaks with azimuth, elevation angle, distance and occludedByM,
- prints the compute time.
Use a lightweight PNG/canvas library that works in Node.
Generate panoramas for sarangkot, world-peace-pagoda and pokhara-lakeside into tools/out/.
```

**Done when:** you compare the Sarangkot panorama with a real panorama photo from Sarangkot (your own, or one from the web) and the skyline shape and peak order match. **This is the most important checkpoint of the whole project.** If it's wrong here, everything on the phone will be wrong. Then ask Claude Code to add the verified Sarangkot results as a snapshot test.

---

## Step 5 — Mobile app shell + offline data loading

**Prompt:**
```
Set up the app shell:
- Install and configure: react-native-vision-camera, @shopify/react-native-skia, expo-sensors, expo-location, expo-file-system, expo-asset, expo-media-library, zustand, react-native-mmkv (or AsyncStorage). Set up a development build (expo prebuild / expo-dev-client). Explain any native setup steps I must do.
- Lock orientation to portrait.
- Bundle assets/packs/annapurna into the app and implement PackStore (SPEC section 7) that loads it on startup into memory (DEM as Int16Array). Show a splash/loading state.
- Create the screens from SPEC section 3 as placeholders with expo-router: onboarding, camera (home), calibration, panorama, peak detail sheet, viewpoint picker, photo preview, about.
- About screen shows the attribution from manifest.json.
- Add a hidden debug screen (long-press the app name on About) that shows pack info and load time.
Make sure everything works in airplane mode.
```

**Done when:** the app runs on a real Android phone in airplane mode, the debug screen shows the pack loaded, load time is under ~1 s.

---

## Step 6 — Location, viewpoints and scene computation

**Prompt:**
```
Implement LocationStore and SceneStore (SPEC section 7):
- GPS via expo-location with high accuracy; statuses: searching, fixed (±accuracy), simulated.
- Viewpoint picker sets a simulated location; "Use my GPS" switches back.
- SceneStore recomputes horizon + visible peaks only when position changes > 50 m, off the UI thread (chunked async or a worklet), caches by ~50 m grid.
- Show compute time on the debug screen.
- Show a clear "Finding your location… (this can take 1–3 min without signal)" state with a button to pick a viewpoint instead.
```

**Done when:** picking Sarangkot on the phone produces the same visible-peak list as the Node script in step 4; recompute stays under ~500 ms on your test phone.

---

## Step 7 — Panorama mode (no camera)

**Prompt:**
```
Build panorama mode (SPEC section 3.4) with Skia:
- 360° horizontal strip, ridge layers shaded by distance, skyline, peak labels using declutter.ts (implement it now per SPEC 6.6 with tests).
- Drag to rotate; when sensors are available, follow the phone's heading.
- Tap a label to open the peak detail sheet (SPEC 3.5).
- Also make this screen work in the Expo web build (no sensors, drag only) as a demo.
```

**Done when:** panorama for Sarangkot on the phone looks like the step 4 PNG; it's smooth while dragging; web build shows it in a browser.

---

## Step 8 — Sensors + live camera overlay (the core feature)

**Prompt:**
```
Build the camera view (SPEC sections 3.2, 6.5, 6.7):
- OrientationStore: true heading from expo-location watchHeadingAsync, pitch/roll from expo-sensors DeviceMotion, smoothed with filters.ts, updated at display rate.
- Implement projection.ts with tests (SPEC 6.5). Read the camera FOV from vision-camera's device format when available; otherwise default hFov 50 / vFov 66 for portrait.
- Full-screen vision-camera preview with a Skia canvas overlay that draws the projected skyline and decluttered labels (name, height, distance) with leader lines to the summit.
- Top bar: GPS status + heading + heading accuracy. Prompt figure-8 calibration when the compass reports low accuracy.
- Hint when the phone points at the ground.
- Pause camera after 3 minutes idle.
Keep heavy math out of the render loop: only projection runs per frame.
```

**Done when:** on a real phone at a window or rooftop in Pokhara, the drawn skyline roughly follows the real ridgeline and labels sit near the right peaks (they may be offset by a few degrees until calibration). Overlay is smooth, no shimmer when holding still.

---

## Step 9 — Calibration

**Prompt:**
```
Build the calibration screen (SPEC section 3.3):
- Camera view with the skyline. User drags horizontally (heading offset, ±20°) and vertically (pitch offset, ±10°) until the drawn skyline sits on the real ridge.
- Alternative: two sliders.
- Alternative: "tap a peak label, then tap where that peak really is" to compute the heading offset.
- Advanced (collapsed): horizontal FOV slider.
- Save offsets in CalibrationStore (persisted), apply in projection, reset button.
- From the camera view, the calibrate button opens this; show a small "calibrated" badge after.
```

**Done when:** after a 10-second calibration at Sarangkot or a rooftop, labels sit on the right summits within about 1°.

---

## Step 10 — Photo capture and share

**Prompt:**
```
Implement photo export per SPEC section 8:
- Shutter button captures a still with vision-camera, records heading/pitch/roll at capture time.
- Re-project labels for the still's resolution and FOV, composite with Skia offscreen: photo + skyline + labels + a bottom frame ("Meru" wordmark, location/viewpoint name, date, list of peaks shown).
- Photo preview screen with Save (expo-media-library) and Share (share sheet).
- Do not use react-native-view-shot for the camera layer.
```

**Done when:** a saved photo shows labels on the right peaks and looks good enough that you'd post it on Instagram.

---

## Step 11 — Onboarding, polish, offline analytics, builds

**Prompt:**
```
Finish the prototype:
- Onboarding (SPEC 3.1): 3 slides + permission requests, shown only on first launch.
- Offline event log (SPEC section 9) with export from the debug screen.
- All UI strings in one strings file (English).
- App icon and splash placeholders.
- Performance pass: measure cold start, recompute time, frame rate; fix anything outside SPEC section 11.
- Test the full flow in airplane mode on Android and iOS.
- Set up EAS Build: Android APK profile for testers, iOS TestFlight profile. Document the release steps in CLAUDE.md.
```

**Done when:** you can install the APK on 5+ phones and run TestFlight on at least one iPhone; everything works with airplane mode on.

---

## Step 12 — Field test (you, not Claude Code)

Go out with 3+ different phones (cheap Android, mid-range Android, iPhone) on a clear morning.

| Location | What to check |
|---|---|
| Sarangkot | Label accuracy before and after calibration; all major Annapurna peaks; photo export |
| World Peace Pagoda | Peaks partly hidden behind ridges are handled correctly |
| Lakeside / Phewa | Low viewpoint; hidden peaks not shown |
| Pumdikot or Australian Camp | A second high viewpoint |

For each location record: phone model, heading offset needed, % labels correct, time to first labels, battery use over 10 minutes, any wrong peak (screenshot).

Then show it to **20+ tourists/trekkers and 10 agencies/guides** and note: did they say "whoa", did they want the photo, would agencies pay, what they asked for. Bring the notes back to Claude Code to plan the next phase, and decide go/no-go (Gate 1 in the business plan).

---

## When something goes wrong

- **Labels consistently offset to one side:** heading problem; check calibration and that you're using *true* heading, not magnetic.
- **Labels too high/low:** pitch sign or FOV wrong; check projection tests and the FOV value.
- **Skyline shape wrong in the step 4 PNG:** check curvature/refraction, azimuth direction (clockwise from north), DEM row order (north row first).
- **Hidden peak shown as visible:** sampling step too coarse near the observer, or peak coordinates wrong in peaks.json; check the sanity report.
- **Jittery labels:** smoothing α and dead-band in filters.ts.
