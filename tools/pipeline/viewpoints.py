"""Viewpoints: coordinates looked up from OpenStreetMap, never typed in.

Each viewpoint in regions.py names one OSM element. Its coordinate (node position, or way
centre from Overpass `out center`) is read from the single cached candidate query.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import overpass
from elev import elevation_at
from peaks import nepali_name

DEFAULT_EYE_HEIGHT_M = 1.7


def fetch(region_id: str, region: dict, refresh: bool = False) -> dict[str, dict]:
    bbox = f"({region['south']},{region['west']},{region['north']},{region['east']})"
    rx = region["viewpoint_search"]
    ql = (
        "[out:json][timeout:180];\n(\n"
        f'  nwr["name"~"{rx}",i]{bbox};\n'
        f'  nwr["name:en"~"{rx}",i]{bbox};\n'
        ");\nout center tags;"
    )
    data = overpass.query(f"viewpoints_{region_id}", ql, refresh=refresh)
    return {f"{e['type']}/{e['id']}": e for e in data["elements"]}


def build(region: dict, elements: dict[str, dict], grid: np.ndarray, header: dict) -> tuple[list[dict], list[dict]]:
    """Returns (viewpoints for the pack, report rows incl. TODOs)."""
    out, report = [], []
    for vp in region["viewpoints"]:
        ref = vp.get("osm")
        e = elements.get(ref) if ref else None
        if e is None:
            report.append({**vp, "status": "TODO", "why": "no OSM source" if not ref else f"{ref} not in cached query"})
            continue
        pos = e.get("center", e)
        lat, lon = round(pos["lat"], 6), round(pos["lon"], 6)
        tags = e.get("tags", {})
        dem = elevation_at(grid, header, lat, lon)
        out.append({
            "id": vp["id"],
            "name": vp["name"],
            "nameNe": nepali_name(tags),
            "lat": lat,
            "lon": lon,
            "eyeHeightM": vp.get("eyeHeightM", DEFAULT_EYE_HEIGHT_M),
            "source": f"osm:{ref}",
        })
        kind = next((f"{k}={tags[k]}" for k in ("tourism", "place", "amenity", "natural", "landuse") if k in tags), "")
        report.append({
            **vp, "status": "OK", "lat": lat, "lon": lon, "osm_name": tags.get("name", tags.get("name:en", "")),
            "kind": kind, "osm_ele": tags.get("ele", ""), "dem_m": None if dem is None else round(dem),
            "url": f"https://www.openstreetmap.org/{ref}",
        })
    return out, report


def write(path: Path, viewpoints: list[dict]) -> None:
    path.write_text(json.dumps(viewpoints, indent=2, ensure_ascii=False) + "\n")
