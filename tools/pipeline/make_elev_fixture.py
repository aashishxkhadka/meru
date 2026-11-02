#!/usr/bin/env python3
"""Write tests/fixtures/<region>_elev_reference.json: elevations computed by elev.py at
random + edge points, used by Jest to check src/core/dem.ts against the Python reader."""

import argparse
import json
import random
from pathlib import Path

from elev import ROOT, elevation_at, load

p = argparse.ArgumentParser()
p.add_argument("--region", default="annapurna")
p.add_argument("--count", type=int, default=1000)
a = p.parse_args()

grid, h = load(a.region)
rng = random.Random(42)
points = [(rng.uniform(h["south"], h["north"]), rng.uniform(h["west"], h["east"])) for _ in range(a.count)]
points += [  # corners, edges, just outside
    (h["north"], h["west"]), (h["south"], h["east"]), (h["north"], h["east"]), (h["south"], h["west"]),
    ((h["north"] + h["south"]) / 2, h["west"]), (h["north"], (h["west"] + h["east"]) / 2),
    (h["north"] + 1e-6, h["west"] + 0.5), (h["south"] - 1e-6, h["west"] + 0.5),
]
cases = []
for lat, lon in points:
    e = elevation_at(grid, h, lat, lon)
    cases.append({"lat": lat, "lon": lon, "elevationM": None if e is None else float(e)})
out = ROOT / "tests" / "fixtures" / f"{a.region}_elev_reference.json"
out.write_text(json.dumps({"region": a.region, "generatedBy": "tools/pipeline/make_elev_fixture.py", "cases": cases}))
print(f"wrote {out.relative_to(ROOT)} ({len(cases)} cases, {out.stat().st_size / 1e3:.0f} kB)")
