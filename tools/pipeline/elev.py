#!/usr/bin/env python3
"""Print the elevation at one or more lat/lon points from a pack's dem.bin.

Reads only manifest.json + dem.bin with numpy (no rasterio), using the SPEC section 4
pixel-centre convention and bilinear interpolation, so it is an independent check of the
pack and the reference for src/core/dem.ts (step 3).

Usage:
  python tools/pipeline/elev.py 28.2440 83.9488
  python tools/pipeline/elev.py --region annapurna 28.2096 83.9586 28.5961 83.8203
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def load(region_id: str) -> tuple[np.ndarray, dict]:
    pack = ROOT / "assets" / "packs" / region_id
    header = json.loads((pack / "manifest.json").read_text())["dem"]
    grid = np.fromfile(pack / header["file"], dtype="<i2").reshape(header["height"], header["width"])
    return grid, header


def elevation_at(grid: np.ndarray, h: dict, lat: float, lon: float) -> float | None:
    """Bilinear between pixel centres: lon = west + (col + 0.5) * dx, lat = north - (row + 0.5) * dy."""
    dx = (h["east"] - h["west"]) / h["width"]
    dy = (h["north"] - h["south"]) / h["height"]
    # Same rules as src/core/dem.ts: null outside the bbox, clamp to edge pixels within it.
    if not (h["south"] <= lat <= h["north"] and h["west"] <= lon <= h["east"]):
        return None
    col_f = min(max((lon - h["west"]) / dx - 0.5, 0), h["width"] - 1)
    row_f = min(max((h["north"] - lat) / dy - 0.5, 0), h["height"] - 1)
    c0, r0 = min(int(np.floor(col_f)), h["width"] - 2), min(int(np.floor(row_f)), h["height"] - 2)
    c1, r1 = c0 + 1, r0 + 1
    tx, ty = col_f - c0, row_f - r0
    q = grid[[r0, r0, r1, r1], [c0, c1, c0, c1]].astype(float)
    if (q == h["noData"]).any():
        return None
    top = q[0] * (1 - tx) + q[1] * tx
    bottom = q[2] * (1 - tx) + q[3] * tx
    return top * (1 - ty) + bottom * ty


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--region", default="annapurna")
    p.add_argument("coords", nargs="+", type=float, help="lat lon [lat lon ...]")
    a = p.parse_args()
    if len(a.coords) % 2:
        p.error("give coordinates as lat/lon pairs")

    grid, header = load(a.region)
    for lat, lon in zip(a.coords[::2], a.coords[1::2]):
        e = elevation_at(grid, header, lat, lon)
        print(f"{lat:.5f}, {lon:.5f}  ->  " + ("outside DEM / nodata" if e is None else f"{e:.0f} m"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
