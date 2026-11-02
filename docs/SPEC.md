# SPEC.md — Meru validation prototype

> Source of truth for the prototype. Place at `docs/SPEC.md`. If something here conflicts with a request, ask before deviating.

## 1. Goal and success criteria

Build an Android + iOS app that, fully offline, shows labeled mountain peaks on top of the live camera view around Pokhara and the Annapurna region.

The prototype succeeds if, in field tests at Sarangkot, World Peace Pagoda and Pokhara Lakeside:

| Metric | Target |
|---|---|
| Correct peak under each label (after calibration) | ≥ 90% of labels within ~1° of the real summit |
| Time from opening app to labels on screen (GPS already fixed) | < 3 s |
| Works in airplane mode | 100% of core features |
| Testers who say "whoa" / want to share a photo | Most of them (qualitative) |
| Hidden peaks wrongly shown as visible | Near zero from main viewpoints |

## 2. Scope

**In scope**
1. Offline Annapurna data pack (terrain + peaks + viewpoints) bundled in the app
2. Live camera view with peak labels (name, height, distance)
3. Drawn skyline line from terrain data over the camera
4. Manual calibration (align skyline to the real ridge)
5. Panorama mode: 360° drawn horizon with labels, no camera needed (also used for testing and web demo)
6. Peak detail sheet (name, Nepali name, height, distance, short description)
7. Viewpoint picker: simulate standing at a known viewpoint (for testing and when GPS is slow)
8. Photo capture with labels and a branded frame, saved/shared
9. About screen with data attribution

**Out of scope (later phases):** trek maps, teahouses, permits, SOS, visibility forecasts, accounts, backend, region downloads, automatic skyline matching, guide/agency features, payments.

## 3. Screens

1. **Onboarding (first launch only):** 3 short slides + permission requests (location, camera). Explain that it works without signal.
2. **Camera view (home):**
   - Full-screen camera
   - Skyline line (thin, semi-transparent)
   - Peak labels: name, height, distance. Leader line from label down to the summit point
   - Top bar: GPS status (searching / accuracy ±m / simulated viewpoint name), compass heading
   - Bottom bar: shutter button, panorama mode toggle, calibrate button, menu
   - Tap a label → peak detail sheet
   - If the phone is pointed down (pitch < −30°), show hint "Point your phone at the mountains"
3. **Calibration:** user drags horizontally/vertically so the drawn skyline sits on the real ridge. Two sliders as an alternative: heading offset (±20°), pitch offset (±10°). Optional: tap a known peak then tap where it actually is. Save offsets per device; reset button.
4. **Panorama mode:** horizontal scrollable 360° strip, drawn ridges in layers (near = darker, far = lighter), labels. Rotates with heading when sensors available; draggable otherwise. Works on web.
5. **Peak detail sheet:** name (EN), name (NE, Devanagari), elevation, distance, bearing, "visible from here" flag, 2–3 line description.
6. **Viewpoint picker:** list of viewpoints from the pack + "Use my GPS location".
7. **Photo preview:** composited photo with labels + frame (app name, location name, date, peaks shown). Save to gallery / share sheet.
8. **About:** version, data sources and attribution, feedback contact.

## 4. Data pack format

Directory: `assets/packs/<regionId>/`

```
manifest.json
dem.bin          # Int16 little-endian elevations in meters, row-major, north row first
peaks.json
viewpoints.json
```

### manifest.json
```json
{
  "regionId": "annapurna",
  "name": "Annapurna & Pokhara",
  "version": 1,
  "createdAt": "2026-11-02",
  "dem": {
    "file": "dem.bin",
    "width": 2400,
    "height": 2160,
    "north": 29.4,
    "south": 27.6,
    "west": 83.0,
    "east": 85.0,
    "noData": -32768,
    "resolutionArcSec": 3,
    "source": "Copernicus GLO-30, resampled to 3 arc-seconds"
  },
  "attribution": [
    "Contains Copernicus DEM data (verify exact attribution text from the official licence)",
    "Peak data © OpenStreetMap contributors (ODbL)"
  ]
}
```

Pixel (col, row) center = `lon = west + (col + 0.5) * (east - west) / width`, `lat = north - (row + 0.5) * (north - south) / height`.

### peaks.json
```json
[
  {
    "id": "machhapuchhre",
    "name": "Machhapuchhre",
    "nameNe": "माछापुच्छ्रे",
    "lat": 0,
    "lon": 0,
    "elevationM": 0,
    "prominenceM": null,
    "rank": 1,
    "description": "Fishtail mountain. Sacred and closed to climbing.",
    "source": "osm:node/123"
  }
]
```
`rank`: 1 = always show if visible, 2 = show if space, 3 = show only when zoomed/close. Coordinates and elevations come from the pipeline (OSM), then are checked by a human. **Never invent coordinates.**

### viewpoints.json
```json
[
  { "id": "sarangkot", "name": "Sarangkot", "lat": 0, "lon": 0, "eyeHeightM": 1.7 }
]
```
Initial viewpoints (coordinates to be looked up and verified): Sarangkot, World Peace Pagoda, Pokhara Lakeside (Phewa), Pumdikot, Australian Camp, Dhampus, Poon Hill, Ghandruk, Annapurna Base Camp, Machhapuchhre Base Camp, Mardi Himal High Camp.

## 5. Data pipeline (`tools/pipeline`)

`build_pack.py --region annapurna` must:

1. **Download DEM tiles** for the bounding box (lat 27.6–29.4, lon 83.0–85.0) from the Copernicus DEM GLO-30 open dataset (public AWS bucket, Cloud-Optimized GeoTIFFs, 1°×1° tiles named like `Copernicus_DSM_COG_10_N28_00_E083_00_DEM`). Verify the exact URL pattern and licence before use. Cache downloads in `tools/pipeline/cache/`.
2. **Mosaic, crop, resample** to 3 arc-seconds (~90 m) with bilinear resampling. Fill small no-data holes by interpolation.
3. **Write** `dem.bin` (Int16 LE) + DEM block of `manifest.json`. Expect ~10 MB raw.
4. **Fetch peaks** from the OpenStreetMap Overpass API: `node["natural"="peak"]["name"]` in the bbox. Keep `name`, `name:ne`, `ele`, OSM id.
5. **Clean peaks:** drop peaks without elevation; drop duplicates within 500 m; assign `rank` (≥7,000 m or famous = 1, ≥6,000 m = 2, rest = 3).
6. **Write** `peaks.review.csv` for human review, then `peaks.json` after review. The pipeline must not overwrite a reviewed `peaks.json` without `--force`.
7. **Check the must-have list** exists in the output and print any missing: Annapurna I, Annapurna II, Annapurna III, Annapurna IV, Annapurna South, Gangapurna, Hiunchuli, Machhapuchhre, Gandharba Chuli, Tent Peak (Tharpu Chuli), Lamjung Himal, Manaslu, Himalchuli, Dhaulagiri I, Tukuche Peak, Nilgiri, Tilicho Peak, Mardi Himal.
8. **Sanity report:** compare each peak's OSM elevation with the DEM elevation at its coordinates; flag differences > 150 m (often a misplaced node or DEM smoothing at sharp summits).
9. **Render check images** (`tools/pipeline/render_panorama.py --viewpoint sarangkot`): a 360° panorama PNG with labels, using the same algorithm as the app (port of `horizon.ts` / `visibility.ts`, or run the TS core via Node). Used to compare against real photos.

Use only free/open data. Respect Overpass usage limits (one query, cached).

## 6. Core algorithms (`src/core`)

Constants: `EARTH_RADIUS_M = 6_371_000`, `REFRACTION_K = 0.13`.

### 6.1 geo.ts
- `haversineDistanceM(a, b)`
- `initialBearingDeg(a, b)` (true north, 0–360)
- `destinationPoint(origin, bearingDeg, distanceM)`
- `curvatureDropM(distanceM) = (distanceM² / (2R)) × (1 − K)` — apparent drop of a distant point due to earth curvature, reduced by refraction.
- `elevationAngleDeg(observerElevM, targetElevM, distanceM) = atan2(targetElevM − curvatureDropM(d) − observerElevM, d)` in degrees.

### 6.2 dem.ts
- `loadDem(buffer, header) → Dem`
- `elevationAt(dem, lat, lon)` — bilinear interpolation; returns `null` outside bounds or on noData.
- Observer elevation = `elevationAt(position) + eyeHeightM` (if GPS altitude is available and within 50 m of DEM, still prefer DEM for consistency).

### 6.3 horizon.ts — 360° skyline
`computeHorizon(dem, observer, options) → Horizon`
- Rays every `azimuthStepDeg` (default 0.25° → 1,440 rays).
- Along each ray, sample from `minDistM` (default 100 m) to `maxDistM` (default 150 km or DEM edge). Step: 45 m up to 10 km, 90 m beyond (matches DEM resolution). Optimise later only if profiling says so.
- For each sample: elevation angle via `elevationAngleDeg`. Track the running maximum.
- Output per ray: `maxAngleDeg`, `distAtMaxM`, plus a list of "ridge layers" (local maxima that set a new running max, with their distance) for drawing near/far ridges.
- Must complete in < 500 ms on a mid-range Android phone. Run it off the UI thread (InteractionManager / worklet / chunked async) and cache by rounded position (≈50 m grid).

### 6.4 visibility.ts — which peaks are visible
`computeVisiblePeaks(dem, observer, peaks, options) → VisiblePeak[]`
For each peak within `maxDistM`:
1. distance, azimuth, elevation angle of the summit (use peak's catalogued elevation).
2. Walk the line from observer to peak (same sampling as horizon) up to `0.98 × distance`, track max terrain angle.
3. Visible if `summitAngle ≥ maxTerrainAngle − toleranceDeg` (default 0.05°).
4. Also return `occludedByM` (how much the summit is below the blocking ridge) for debugging.
Output: `{ peak, distanceM, azimuthDeg, elevationAngleDeg, visible }`, sorted by rank then distance.

### 6.5 projection.ts
Inputs: device true heading (deg), pitch (deg, 0 = horizon, positive = up), roll (deg), camera horizontal/vertical FOV (deg), screen size, calibration offsets.
- Apply offsets: `heading' = heading + headingOffset`, `pitch' = pitch + pitchOffset`.
- For a target (az, el): `dAz = wrapTo180(az − heading')`, `dEl = el − pitch'`.
- Pinhole projection: `x = cx + (tan(dAz) / tan(hFov/2)) × (w/2)`, `y = cy − (tan(dEl) / tan(vFov/2)) × (h/2)`, then rotate around the screen center by `−roll`.
- Return `null` when `|dAz| > hFov/2 + margin`.
- Default FOV: portrait, main camera, hFov ≈ 50°, vFov ≈ 66° (verify per device; expose FOV in calibration as an advanced setting and read the device-reported FOV from vision-camera when available).

### 6.6 declutter.ts
- Visible peaks within the screen, sorted by rank, then elevation.
- Place labels in up to 3 vertical rows above the skyline; skip a label if its box overlaps an already placed label in every row.
- Rank-1 peaks always win placement.
- Max 12 labels at once.

### 6.7 filters.ts — sensor smoothing
- Angle-aware low-pass (handles 359°→0° wrap): smooth on the unit circle (`sin`, `cos`) with α ≈ 0.15 at 30–60 Hz.
- Dead-band of 0.2° to stop label shimmer.
- Pitch/roll from DeviceMotion rotation; heading from `expo-location` `trueHeading` (fallback `magHeading` + declination, which is small in Nepal). Show heading accuracy when the platform reports it; prompt figure-8 calibration when accuracy is poor.

## 7. App architecture

- `PackStore` (zustand): loads `manifest.json`, `dem.bin`, `peaks.json`, `viewpoints.json` from bundled assets into memory on start. DEM as `Int16Array`.
- `LocationStore`: GPS fix (or simulated viewpoint), accuracy, status.
- `SceneStore`: horizon + visible peaks for the current position. Recomputed only when position moves > 50 m.
- `OrientationStore`: smoothed heading/pitch/roll at display rate.
- `CalibrationStore`: offsets persisted with AsyncStorage/MMKV.
- Camera screen renders: `<Camera>` + `<Canvas>` (Skia) overlay drawing skyline + labels from `SceneStore` projected with `OrientationStore` every frame.
- Lock app to **portrait** for the prototype.

## 8. Photo export

1. Capture a still with vision-camera `takePhoto()`.
2. Record heading/pitch/roll at capture time.
3. Re-project labels for the still's resolution and FOV.
4. Composite with Skia offscreen surface: photo + skyline + labels + bottom frame (app name, viewpoint/location, date, "Peaks: A, B, C").
5. Save to gallery (expo-media-library) and open share sheet.

## 9. Analytics (prototype only, offline)

Log a local event list (app open, labels shown count, calibration offsets used, photo taken, shared) to a file. A hidden debug screen can export it as JSON via share sheet. No network analytics in the prototype.

## 10. Testing

**Unit tests (Jest, `src/core`)**
- geo: distance/bearing between two known points match reference values within 0.1%.
- curvature: drop at 100 km ≈ 683 m (with K = 0.13, ≈ 785 m × 0.87).
- dem: elevation lookup on a tiny synthetic grid (exact values), bilinear midpoint correct, out-of-bounds returns null.
- visibility on a synthetic DEM: a peak behind a taller near ridge is hidden; same peak with ridge removed is visible.
- projection: target straight ahead projects to screen center; target at heading + hFov/2 projects to the right edge; wrap-around at 0/360.
- filters: smoothing across 359°→1° does not swing through 180°.

**Real-data tests (fixtures from the generated pack)**
- From Sarangkot: Machhapuchhre, Annapurna South and Hiunchuli are visible; Machhapuchhre azimuth in a plausible north-to-north-east range (exact expected values are filled in after the pipeline runs and a human checks them against a real photo).
- From Pokhara Lakeside: list of visible peaks is saved as a snapshot; changes need explicit approval.

**Field test checklist:** see `docs/BUILD_STEPS.md`, step 12.

## 11. Non-functional requirements

- App size: < 60 MB install (DEM ~10 MB raw, compress in assets if needed).
- Cold start to camera: < 2 s on a mid-range Android phone.
- Horizon recompute: < 500 ms, off the UI thread.
- Overlay frame rate: ≥ 30 fps, no visible jitter at rest.
- Battery: 10 minutes of camera mode should use a reasonable amount; add a 3-minute idle auto-pause of the camera.
- Android 9+ and iOS 15+.
- English UI first; strings in a single file for later translation (Nepali next).
