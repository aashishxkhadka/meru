#!/usr/bin/env python3
"""Build a Meru offline data pack.

Terrain part (SPEC section 5, items 1-3):
  1. Download Copernicus DEM GLO-30 tiles covering the region bbox (cached).
  2. Mosaic, crop to bbox, resample to N arc-seconds with bilinear, fill small nodata holes.
  3. Write dem.bin (Int16 little-endian, north row first) + the dem block of manifest.json.

Usage:
  python tools/pipeline/build_pack.py --region annapurna
  python tools/pipeline/build_pack.py --region annapurna --list-tiles   # show tiles, no download
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

from regions import REGIONS

ROOT = Path(__file__).resolve().parents[2]
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", required=True, choices=sorted(REGIONS))
    parser.add_argument("--list-tiles", action="store_true", help="print tiles and URLs, then exit")
    args = parser.parse_args()

    region = REGIONS[args.region]
    names = tiles_for_bbox(region["north"], region["south"], region["west"], region["east"])

    if args.list_tiles:
        for n in names:
            print(f"{COP30_BASE_URL}/{n}/{n}.tif")
        return 0

    print(f"[1/3] Copernicus GLO-30 tiles for {args.region} ({len(names)} tiles) -> {CACHE_DIR}")
    paths = [download_tile(n) for n in names]

    print("[2/3] Mosaic, crop, resample, fill holes")
    dem, info = build_dem(region, paths)

    print("[3/3] Write pack")
    dem_path = write_pack(args.region, region, dem, info["dem"])

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
    return 0


if __name__ == "__main__":
    sys.exit(main())
