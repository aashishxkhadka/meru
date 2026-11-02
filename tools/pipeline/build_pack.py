#!/usr/bin/env python3
"""Build a Meru offline data pack.

Runs terrain -> peaks -> viewpoints. Peaks stop at a review CSV; after a human has
reviewed it, run with --finalize-peaks to write peaks.json.

Terrain part (SPEC section 5, items 1-3):
  1. Download Copernicus DEM GLO-30 tiles covering the region bbox (cached).
  2. Mosaic, crop to bbox, resample to N arc-seconds with bilinear, fill small nodata holes.
  3. Write dem.bin (Int16 little-endian, north row first) + the dem block of manifest.json.

Peaks and viewpoints (SPEC section 5, items 4-8): one cached Overpass query each, clean,
dedupe, rank, must-have check, DEM sanity check, peaks.review.csv, viewpoints.json.

Usage:
  python tools/pipeline/build_pack.py --region annapurna                     # everything
  python tools/pipeline/build_pack.py --region annapurna --only peaks viewpoints
  python tools/pipeline/build_pack.py --region annapurna --finalize-peaks    # after review
  python tools/pipeline/build_pack.py --region annapurna --list-tiles        # no download
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
import requests
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from rasterio.merge import merge
from rasterio.transform import from_bounds
from rasterio.warp import reproject

import peaks as peaks_mod
import viewpoints as viewpoints_mod
from elev import load as load_dem
from regions import REGIONS

ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT / "tools" / "pipeline"
REVIEW_CSV = PIPELINE_DIR / "peaks.review.csv"
CACHE_DIR = ROOT / "tools" / "pipeline" / "cache"
PACKS_DIR = ROOT / "assets" / "packs"

# Copernicus DEM GLO-30 Public, AWS Open Data (bucket copernicus-dem-30m, eu-central-1).
# Docs: https://copernicus-dem-30m.s3.amazonaws.com/readme.html
COP30_BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"
COP30_NATIVE_RES_DEG = 1 / 3600  # 1 arc-second (true for |lat| < 50)

NODATA_INT16 = -32768
FILL_MAX_SEARCH_PX = 10  # "small holes": interpolate gaps up to ~10 output pixels (~900 m)
VALID_MIN_M, VALID_MAX_M = -500, 9000

# Licence for Copernicus WorldDEM-30, Article 6(b) and 6(c) (data are resampled = modified).
COPERNICUS_ATTRIBUTION = (
    "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and "
    "Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; "
    "all rights reserved"
)
COPERNICUS_LIABILITY = (
    "The organisations in charge of the Copernicus programme by law or by delegation do not "
    "incur any liability for any use of the Copernicus WorldDEM-30"
)
OSM_ATTRIBUTION = "Peak data © OpenStreetMap contributors (ODbL)"


# --------------------------------------------------------------------------- tiles


def tile_name(lat_deg: int, lon_deg: int) -> str:
    ns = "N" if lat_deg >= 0 else "S"
    ew = "E" if lon_deg >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat_deg):02d}_00_{ew}{abs(lon_deg):03d}_00_DEM"


def tiles_for_bbox(north: float, south: float, west: float, east: float) -> list[str]:
    """1x1 degree tiles are named by their south-west corner."""
    names = []
    for lat in range(math.floor(south), math.ceil(north)):
        for lon in range(math.floor(west), math.ceil(east)):
            names.append(tile_name(lat, lon))
    return names


def download_tile(name: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{name}.tif"
    url = f"{COP30_BASE_URL}/{name}/{name}.tif"

    head = requests.head(url, timeout=30)
    if head.status_code == 404:
        raise SystemExit(f"Tile not found (ocean or unreleased?): {url}")
    head.raise_for_status()
    expected_bytes = int(head.headers.get("Content-Length", 0))

    if dest.exists() and (expected_bytes == 0 or dest.stat().st_size == expected_bytes):
        print(f"  cached   {name}")
        return dest

    print(f"  download {name} ({expected_bytes / 1e6:.1f} MB)")
    tmp = dest.with_suffix(".tif.part")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    if expected_bytes and tmp.stat().st_size != expected_bytes:
        tmp.unlink()
        raise SystemExit(f"Size mismatch downloading {name}; try again.")
    tmp.rename(dest)
    return dest


# --------------------------------------------------------------------------- terrain


def build_dem(region: dict, tile_paths: list[Path]) -> tuple[np.ndarray, dict]:
    north, south, west, east = region["north"], region["south"], region["west"], region["east"]
    res_deg = region["resolution_arcsec"] / 3600
    width = round((east - west) / res_deg)
    height = round((north - south) / res_deg)

    # 1. Mosaic at native 1" over the bbox plus a small margin, so the bilinear kernel
    #    at the bbox edge and at tile seams always has real neighbours.
    margin = 4 * res_deg
    sources = [rasterio.open(p) for p in tile_paths]
    try:
        src_nodata = sources[0].nodata
        mosaic, mosaic_transform = merge(
            sources,
            bounds=(west - margin, south - margin, east + margin, north + margin),
            res=(COP30_NATIVE_RES_DEG, COP30_NATIVE_RES_DEG),
            nodata=np.nan,
            dtype="float32",
        )
        crs = sources[0].crs
    finally:
        for s in sources:
            s.close()
    mosaic = mosaic[0]
    if src_nodata is not None and not math.isnan(src_nodata):
        mosaic[mosaic == src_nodata] = np.nan

    # 2. Resample to the target grid (pixel-is-area, bounds exactly the bbox).
    dst_transform = from_bounds(west, south, east, north, width, height)
    dem = np.full((height, width), np.nan, dtype="float32")
    reproject(
        source=mosaic,
        destination=dem,
        src_transform=mosaic_transform,
        src_crs=crs,
        src_nodata=np.nan,
        dst_transform=dst_transform,
        dst_crs=crs,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )

    # 3. Fill small holes by inverse-distance interpolation from the edges.
    invalid = ~np.isfinite(dem) | (dem < VALID_MIN_M) | (dem > VALID_MAX_M)
    nodata_before = int(invalid.sum())
    if nodata_before:
        dem[invalid] = 0
        dem = fillnodata(dem, mask=(~invalid).astype("uint8"), max_search_distance=FILL_MAX_SEARCH_PX)
        # fillnodata leaves pixels it could not reach unchanged (0) — mark them nodata again.
        still_invalid = invalid & (dem == 0)
    else:
        still_invalid = invalid

    out = np.rint(dem).astype("<i2")
    out[still_invalid] = NODATA_INT16

    dem_block = {
        "file": "dem.bin",
        "width": width,
        "height": height,
        "north": north,
        "south": south,
        "west": west,
        "east": east,
        "noData": NODATA_INT16,
        "resolutionArcSec": region["resolution_arcsec"],
        "dataType": "int16le",
        "rowOrder": "north-first",
        "verticalDatum": "EGM2008",
        "source": f"Copernicus GLO-30, resampled to {region['resolution_arcsec']} arc-seconds (bilinear)",
    }
    stats = {"nodata_before_fill": nodata_before, "nodata_after_fill": int(still_invalid.sum())}
    return out, {"dem": dem_block, "stats": stats}


def write_pack(region_id: str, region: dict, dem: np.ndarray, dem_block: dict) -> Path:
    pack_dir = PACKS_DIR / region_id
    pack_dir.mkdir(parents=True, exist_ok=True)
    (pack_dir / ".gitkeep").unlink(missing_ok=True)

    dem_path = pack_dir / "dem.bin"
    dem_path.write_bytes(dem.astype("<i2", copy=False).tobytes(order="C"))

    manifest_path = pack_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    prev_version = manifest.get("version", 0)
    attribution = [COPERNICUS_ATTRIBUTION, COPERNICUS_LIABILITY]
    attribution += [a for a in manifest.get("attribution", []) if a not in attribution]
    manifest.update(
        {
            "regionId": region_id,
            "name": region["name"],
            "version": max(prev_version, 1),
            "createdAt": dt.date.today().isoformat(),
            "dem": dem_block,
            "attribution": attribution,
        }
    )
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return dem_path


# --------------------------------------------------------------------------- main


def add_attribution(region_id: str, line: str) -> None:
    path = PACKS_DIR / region_id / "manifest.json"
    manifest = json.loads(path.read_text())
    if line not in manifest.setdefault("attribution", []):
        manifest["attribution"].append(line)
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


def run_terrain(region_id: str, region: dict) -> None:
    names = tiles_for_bbox(region["north"], region["south"], region["west"], region["east"])
    print(f"[terrain] Copernicus GLO-30 tiles for {region_id} ({len(names)} tiles) -> {CACHE_DIR}")
    paths = [download_tile(n) for n in names]
    print("[terrain] Mosaic, crop, resample, fill holes")
    dem, info = build_dem(region, paths)
    dem_path = write_pack(region_id, region, dem, info["dem"])

    valid = dem[dem != NODATA_INT16]
    d = info["dem"]
    print()
    print("Terrain summary")
    print(f"  grid           {d['width']} x {d['height']} @ {d['resolutionArcSec']}\"")
    print(f"  bbox           N {d['north']}  S {d['south']}  W {d['west']}  E {d['east']}")
    print(f"  elevation      min {int(valid.min())} m, max {int(valid.max())} m")
    print(f"  nodata         {info['stats']['nodata_before_fill']} before fill, "
          f"{info['stats']['nodata_after_fill']} after fill")
    print(f"  dem.bin        {dem_path.relative_to(ROOT)}  {dem_path.stat().st_size / 1e6:.2f} MB")
    print()


def run_peaks(region_id: str, region: dict, force: bool, refresh: bool) -> None:
    print("[peaks] OpenStreetMap natural=peak with a name")
    elements = peaks_mod.fetch(region_id, region, refresh)
    peaks, info = peaks_mod.clean(elements, region)
    grid, header = load_dem(region_id)
    peaks_mod.dem_sanity(peaks, grid, header)

    print()
    print("Peaks summary")
    print(f"  from OSM               {len(elements)} named peaks")
    print(f"  dropped, no elevation  {len(info['no_ele'])}")
    print(f"  dropped, duplicate     {len(info['dropped'])}  (within {peaks_mod.DEDUPE_RADIUS_M} m)")
    for p, kept in info["dropped"]:
        print(f"      {p['osm_name']} {p['ele_m']} m (osm:node/{p['osm_id']}) -> kept {kept['name']} {kept['ele_m']} m")
    by_rank = {r: sum(p["rank"] == r for p in peaks) for r in (1, 2, 3)}
    print(f"  kept                   {len(peaks)}  (rank 1: {by_rank[1]}, rank 2: {by_rank[2]}, rank 3: {by_rank[3]})")

    print()
    print("Must-have peaks")
    for canonical in region["must_have_peaks"]:
        hit = next((p for p in peaks if p["must_have"] == canonical), None)
        if hit:
            print(f"  OK       {canonical:26} {hit['ele_m']:>5} m  osm:node/{hit['osm_id']}  (OSM name: {hit['osm_name']})")
    for line in peaks_mod.must_have_report(peaks, info["no_ele"], region):
        print(f"  PROBLEM  {line}")

    print()
    flagged = [p for p in peaks if any(f.startswith("DEM-DIFF") for f in p["flags"])]
    print(f"DEM sanity check: {len(flagged)} peaks differ from the DEM by more than {peaks_mod.SANITY_LIMIT_M} m")
    print(f"  {'peak':28} {'OSM':>5} {'DEM':>5} {'diff':>5} {'max500m':>7} {'offset':>6}  verdict")
    for p in sorted(flagged, key=lambda p: -abs(p["diff_m"])):
        verdict = next(f for f in p["flags"] if f.startswith("DEM-DIFF")).split(":")[1]
        print(f"  {p['name'][:28]:28} {p['ele_m']:>5} {p['dem_m']:>5} {p['diff_m']:>5} {p['dem_max_500m']:>7} "
              f"{p['summit_offset_m']:>5}m  {verdict}")

    needs_name = [p for p in peaks if "NEEDS-ENGLISH-NAME" in p["flags"]]
    if needs_name:
        print()
        print(f"Peaks without an English name ({len(needs_name)}) - fill the 'name' column in the CSV:")
        for p in needs_name:
            print(f"  {p['osm_name']} ({p['ele_m']} m, osm:node/{p['osm_id']})")

    print()
    if peaks_mod.write_review_csv(REVIEW_CSV, peaks, force):
        print(f"Wrote {REVIEW_CSV.relative_to(ROOT)} - review it, then run with --finalize-peaks")
    print()


def run_viewpoints(region_id: str, region: dict, refresh: bool) -> None:
    print("[viewpoints] OpenStreetMap lookup")
    elements = viewpoints_mod.fetch(region_id, region, refresh)
    grid, header = load_dem(region_id)
    vps, report = viewpoints_mod.build(region, elements, grid, header)
    out = PACKS_DIR / region_id / "viewpoints.json"
    viewpoints_mod.write(out, vps)
    add_attribution(region_id, OSM_ATTRIBUTION)

    print()
    print("Viewpoints (coordinates from OpenStreetMap)")
    for r in report:
        if r["status"] != "OK":
            print(f"  TODO  {r['name']:26} {r['why']}")
            continue
        print(f"  OK    {r['name']:26} {r['lat']:.5f}, {r['lon']:.5f}  DEM {r['dem_m']} m"
              f"{'  OSM ele ' + r['osm_ele'] if r['osm_ele'] else ''}")
        print(f"        source: {r['url']}  \"{r['osm_name']}\" {r['kind']}")
    print(f"Wrote {out.relative_to(ROOT)} ({len(vps)} viewpoints)")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", required=True, choices=sorted(REGIONS))
    parser.add_argument("--list-tiles", action="store_true", help="print tiles and URLs, then exit")
    parser.add_argument("--only", nargs="+", choices=["terrain", "peaks", "viewpoints"],
                        help="run only these parts (default: all)")
    parser.add_argument("--finalize-peaks", action="store_true",
                        help="write peaks.json from the reviewed peaks.review.csv")
    parser.add_argument("--force", action="store_true",
                        help="allow overwriting peaks.review.csv / a reviewed peaks.json")
    parser.add_argument("--refresh-osm", action="store_true", help="re-run Overpass queries instead of using cache")
    args = parser.parse_args()
    region = REGIONS[args.region]

    if args.list_tiles:
        for n in tiles_for_bbox(region["north"], region["south"], region["west"], region["east"]):
            print(f"{COP30_BASE_URL}/{n}/{n}.tif")
        return 0

    if args.finalize_peaks:
        out = PACKS_DIR / args.region / "peaks.json"
        peaks = peaks_mod.finalize(REVIEW_CSV, out, region, args.force)
        add_attribution(args.region, OSM_ATTRIBUTION)
        no_desc = [p["name"] for p in peaks if p["rank"] == 1 and not p["description"]]
        print(f"Wrote {out.relative_to(ROOT)}: {len(peaks)} peaks "
              f"(rank 1: {sum(p['rank'] == 1 for p in peaks)})")
        if no_desc:
            print(f"Note: {len(no_desc)} rank-1 peaks have no description: {', '.join(no_desc)}")
        return 0

    parts = args.only or ["terrain", "peaks", "viewpoints"]
    if "terrain" in parts:
        run_terrain(args.region, region)
    if "peaks" in parts:
        run_peaks(args.region, region, args.force, args.refresh_osm)
    if "viewpoints" in parts:
        run_viewpoints(args.region, region, args.refresh_osm)
    return 0


if __name__ == "__main__":
    sys.exit(main())
