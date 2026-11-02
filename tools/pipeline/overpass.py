"""Cached Overpass API queries. Each named query is fetched once and stored in cache/."""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

CACHE_DIR = Path(__file__).resolve().parent / "cache"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "meru-data-pipeline/0.1 (offline peak finder prototype)"


def query(cache_name: str, ql: str, refresh: bool = False) -> dict:
    """Run an Overpass QL query once; later calls read the cached JSON."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"overpass_{cache_name}.json"
    if path.exists() and not refresh:
        print(f"  cached   overpass {cache_name}")
        return json.loads(path.read_text())

    print(f"  query    overpass {cache_name}")
    for attempt in range(3):
        r = requests.post(OVERPASS_URL, data={"data": ql}, headers={"User-Agent": USER_AGENT}, timeout=200)
        if r.status_code in (429, 504) and attempt < 2:
            wait_s = 30 * (attempt + 1)
            print(f"  overpass busy ({r.status_code}), retrying in {wait_s}s")
            time.sleep(wait_s)
            continue
        r.raise_for_status()
        break
    data = r.json()
    data["_query"] = ql
    data["_fetched"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    return data
