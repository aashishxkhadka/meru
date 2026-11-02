"""Peaks: OSM fetch -> clean -> dedupe -> rank -> review CSV -> (after human review) peaks.json.

SPEC section 5, items 4-8.
"""

from __future__ import annotations

import csv
import json
import math
import re
import unicodedata
from pathlib import Path

import numpy as np

import overpass
from elev import elevation_at

DEDUPE_RADIUS_M = 500
SANITY_LIMIT_M = 150
LOCAL_MAX_RADIUS_M = 500
NODE_NEAR_SUMMIT_M = 250  # node this close to the highest DEM cell = DEM smoothing, not a bad node
NAME_TAGS = ("name", "name:en", "int_name", "alt_name", "old_name", "name:ne", "official_name")

CSV_COLUMNS = [
    "keep", "id", "name", "name_ne", "lat", "lon", "ele_m", "rank", "must_have",
    "dem_m", "diff_m", "dem_max_500m", "summit_offset_m", "flags", "description", "prominence_m",
    "osm_name", "source",
]


# --------------------------------------------------------------------------- helpers


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).casefold()
    s = re.sub(r"[\s\-_.,()]+", " ", s)
    return s.strip()


def is_latin(s: str) -> bool:
    return all(not c.isalpha() or unicodedata.name(c, "").startswith("LATIN") for c in s)


def is_devanagari(s: str) -> bool:
    """Devanagari letters only; a trailing Roman numeral ('अन्नपूर्णा II') is allowed."""
    s = re.sub(r"\s+[IVX]+$", "", s.strip())
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all(unicodedata.name(c, "").startswith("DEVANAGARI") for c in letters)


def latin_part(s: str) -> str:
    """'热德纳峰  Ratna Chuli' -> 'Ratna Chuli'."""
    runs = re.findall(r"[A-Za-zÀ-ɏḀ-ỿ][A-Za-zÀ-ɏḀ-ỿ0-9 '\-()]*", s)
    return max((r.strip() for r in runs), key=len, default="")


def parse_ele(raw: str | None) -> float | None:
    """'8091', '8,091 m', '5587m', '26545 ft' -> metres. None if unusable."""
    if not raw:
        return None
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)", raw)
    if not m:
        return None
    value = float(m.group(1).replace(",", ""))
    if re.search(r"ft|feet|'", raw, re.I):
        value *= 0.3048
    return value if 0 < value < 9000 else None


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "peak"


# --------------------------------------------------------------------------- fetch + clean


def fetch(region_id: str, region: dict, refresh: bool = False) -> list[dict]:
    bbox = f"({region['south']},{region['west']},{region['north']},{region['east']})"
    ql = f'[out:json][timeout:180];\nnode["natural"="peak"]["name"]{bbox};\nout body;'
    return overpass.query(f"peaks_{region_id}", ql, refresh=refresh)["elements"]


def match_must_have(tags: dict, must_have: dict[str, list[str]]) -> str | None:
    names = {norm(tags[k]) for k in NAME_TAGS if tags.get(k)}
    for t in NAME_TAGS:  # alt_name may hold several names separated by ';'
        for part in tags.get(t, "").split(";"):
            if part.strip():
                names.add(norm(part))
    for canonical, aliases in must_have.items():
        if names & {norm(a) for a in aliases}:
            return canonical
    return None


def display_name(tags: dict) -> tuple[str, list[str]]:
    flags: list[str] = []
    for key in ("name:en", "int_name"):
        if tags.get(key) and is_latin(tags[key]):
            return tags[key].strip(), flags
    name = tags["name"].strip()
    if is_latin(name):
        return name, flags
    part = latin_part(name)
    if part:
        return part, ["name-from-mixed-script"]
    for key in ("alt_name", "name:ne"):
        for alt in tags.get(key, "").split(";"):
            if alt.strip() and is_latin(alt):
                return alt.strip(), ["name-from-alt_name"]
    return name, ["NEEDS-ENGLISH-NAME"]


def nepali_name(tags: dict) -> str:
    """name:ne if it is really Devanagari, else a Devanagari `name`, else ''."""
    for key in ("name:ne", "name"):
        value = tags.get(key, "").strip()
        if value and is_devanagari(value):
            return value
    return ""


def clean(elements: list[dict], region: dict) -> tuple[list[dict], dict]:
    must_have = region["must_have_peaks"]
    peaks, no_ele = [], []
    for e in elements:
        t = e["tags"]
        canonical = match_must_have(t, must_have)
        ele = parse_ele(t.get("ele"))
        if ele is None:
            no_ele.append((e, canonical))
            continue
        name, flags = display_name(t)
        prominence = parse_ele(t.get("prominence"))
        peaks.append({
            "osm_id": e["id"],
            "osm_name": t["name"],
            "name": name,
            "name_ne": nepali_name(t),
            "lat": e["lat"],
            "lon": e["lon"],
            "ele_m": round(ele),
            "prominence_m": round(prominence) if prominence else None,
            "must_have": canonical or "",
            "flags": flags,
            "richness": len(t) + (5 if "wikidata" in t else 0),
        })

    # Dedupe within 500 m: keep must-have match, then richer tagging, then higher elevation.
    peaks.sort(key=lambda p: (p["must_have"] == "", -p["richness"], -p["ele_m"]))
    kept, dropped = [], []
    for p in peaks:
        dup = next((k for k in kept if haversine_m(p["lat"], p["lon"], k["lat"], k["lon"]) < DEDUPE_RADIUS_M), None)
        if dup:
            dropped.append((p, dup))
        else:
            kept.append(p)

    claimed: set[str] = set()
    for p in kept:  # kept is ordered must-have first, richest tagging first
        canonical = p["must_have"]
        if not canonical:
            continue
        if canonical in claimed:
            p["flags"].append(f"ALSO-MATCHES-MUST-HAVE:{canonical}")
            p["must_have"] = ""
            continue
        claimed.add(canonical)
        if norm(canonical) != norm(p["name"]):
            p["flags"].append(f"renamed-from:{p['name'].replace(' ', '_')}")
            p["name"] = canonical

    for p in kept:
        p["rank"] = 1 if (p["ele_m"] >= 7000 or p["must_have"]) else 2 if p["ele_m"] >= 6000 else 3

    # Stable unique ids from display names.
    used: set[str] = set()
    kept.sort(key=lambda p: (p["rank"], -p["ele_m"]))
    for p in kept:
        base = slugify(p["name"]) if is_latin(p["name"]) else f"osm-{p['osm_id']}"
        pid, n = base, 2
        while pid in used:
            pid, n = f"{base}-{n}", n + 1
        used.add(pid)
        p["id"] = pid

    return kept, {"no_ele": no_ele, "dropped": dropped}


# --------------------------------------------------------------------------- checks


def dem_sanity(peaks: list[dict], grid: np.ndarray, header: dict) -> None:
    dx = (header["east"] - header["west"]) / header["width"]
    dy = (header["north"] - header["south"]) / header["height"]
    for p in peaks:
        dem = elevation_at(grid, header, p["lat"], p["lon"])
        p["dem_m"] = None if dem is None else round(dem)
        p["diff_m"] = None if dem is None else p["ele_m"] - round(dem)
        # Highest DEM cell within ~500 m: tells "DEM smooths the summit" from "node misplaced".
        k_lat = math.ceil(LOCAL_MAX_RADIUS_M / 111_320 / dy)
        k_lon = math.ceil(LOCAL_MAX_RADIUS_M / (111_320 * math.cos(math.radians(p["lat"]))) / dx)
        c = int((p["lon"] - header["west"]) / dx)
        r = int((header["north"] - p["lat"]) / dy)
        r0, c0 = max(r - k_lat, 0), max(c - k_lon, 0)
        win = grid[r0: r + k_lat + 1, c0: c + k_lon + 1].astype(float)
        win[win == header["noData"]] = -np.inf
        p["dem_max_500m"] = p["summit_offset_m"] = None
        if np.isfinite(win.max()):
            wr, wc = np.unravel_index(int(win.argmax()), win.shape)
            max_lat = header["north"] - (r0 + wr + 0.5) * dy
            max_lon = header["west"] + (c0 + wc + 0.5) * dx
            p["dem_max_500m"] = int(win.max())
            p["summit_offset_m"] = round(haversine_m(p["lat"], p["lon"], max_lat, max_lon))
        if p["diff_m"] is None:
            p["flags"].append("OUTSIDE-DEM")
        elif abs(p["diff_m"]) > SANITY_LIMIT_M:
            osm_below_terrain = p["diff_m"] < 0  # catalogued summit lower than the ground under it
            near = p["summit_offset_m"] is not None and p["summit_offset_m"] <= NODE_NEAR_SUMMIT_M
            ok = near and not osm_below_terrain
            p["flags"].append("DEM-DIFF:summit-smoothing" if ok else "DEM-DIFF:check-position")


def must_have_report(peaks: list[dict], no_ele: list, region: dict) -> list[str]:
    present = {p["must_have"] for p in peaks}
    lines = []
    for canonical in region["must_have_peaks"]:
        if canonical in present:
            continue
        noele = [e for e, c in no_ele if c == canonical]
        if noele:
            ids = ", ".join(f"osm:node/{e['id']}" for e in noele)
            lines.append(f"{canonical}: in OSM but has NO ELEVATION ({ids})")
        else:
            lines.append(f"{canonical}: MISSING from OSM data")
    return lines


# --------------------------------------------------------------------------- review CSV / peaks.json


def write_review_csv(path: Path, peaks: list[dict], force: bool) -> bool:
    if path.exists() and not force:
        print(f"  {path.name} already exists (may contain your review edits) - not overwritten. Use --force.")
        return False
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for p in peaks:
            w.writerow({
                "keep": "Y", "id": p["id"], "name": p["name"], "name_ne": p["name_ne"],
                "lat": f"{p['lat']:.6f}", "lon": f"{p['lon']:.6f}", "ele_m": p["ele_m"],
                "rank": p["rank"], "must_have": p["must_have"], "dem_m": p["dem_m"],
                "diff_m": p["diff_m"], "dem_max_500m": p["dem_max_500m"], "summit_offset_m": p["summit_offset_m"],
                "flags": " ".join(p["flags"]), "description": "",
                "prominence_m": p["prominence_m"] or "", "osm_name": p["osm_name"],
                "source": f"osm:node/{p['osm_id']}",
            })
    return True


def finalize(csv_path: Path, out_path: Path, region: dict, force: bool) -> list[dict]:
    if out_path.exists() and not force:
        raise SystemExit(f"{out_path} exists (reviewed data). Refusing to overwrite without --force.")
    if not csv_path.exists():
        raise SystemExit(f"{csv_path} not found. Run build_pack.py first to create it.")

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r["keep"].strip().upper() in ("Y", "YES", "1", "TRUE")]

    errors, ids, peaks = [], set(), []
    for i, r in enumerate(rows, start=2):
        try:
            lat, lon, ele, rank = float(r["lat"]), float(r["lon"]), int(float(r["ele_m"])), int(r["rank"])
        except ValueError:
            errors.append(f"row {i} ({r['id']}): lat/lon/ele_m/rank not a number")
            continue
        if not (region["south"] <= lat <= region["north"] and region["west"] <= lon <= region["east"]):
            errors.append(f"row {i} ({r['id']}): coordinate outside the region")
        if rank not in (1, 2, 3):
            errors.append(f"row {i} ({r['id']}): rank must be 1, 2 or 3")
        if not r["id"].strip() or r["id"] in ids:
            errors.append(f"row {i}: id empty or duplicate ({r['id']!r})")
        if not r["name"].strip() or not is_latin(r["name"]):
            errors.append(f"row {i} ({r['id']}): needs an English (Latin-script) name")
        ids.add(r["id"])
        prom = r.get("prominence_m", "").strip()
        peaks.append({
            "id": r["id"].strip(), "name": r["name"].strip(), "nameNe": r["name_ne"].strip(),
            "lat": round(lat, 6), "lon": round(lon, 6), "elevationM": ele,
            "prominenceM": int(float(prom)) if prom else None, "rank": rank,
            "description": r["description"].strip(), "source": r["source"].strip(),
        })

    present = {r["must_have"] for r in rows if r.get("must_have")}
    missing = [m for m in region["must_have_peaks"] if m not in present]
    if missing:
        errors.append("must-have peaks not kept: " + ", ".join(missing))
    if errors:
        raise SystemExit("Review CSV has problems, peaks.json NOT written:\n  " + "\n  ".join(errors))

    peaks.sort(key=lambda p: (p["rank"], -p["elevationM"]))
    out_path.write_text(json.dumps(peaks, indent=2, ensure_ascii=False) + "\n")
    return peaks
