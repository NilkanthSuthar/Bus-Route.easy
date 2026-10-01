"""Fetches road shapes so bus lines are drawn along real streets.

For every pair of consecutive stops on a line, asks an OSRM routing server
(OpenStreetMap data) for the driving route between them and caches it in
pipeline/shapes.json. build.py then attaches the shapes and road distances to
the generated data. Run it again after the stops change; pairs already in the
cache are not fetched again.

Usage: python pipeline/shapes.py [--server URL] [--refresh]
"""

import argparse
import json
import math
import sys
import time
import urllib.request
from pathlib import Path

from geo import haversine_m

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"
CACHE = Path(__file__).resolve().parent / "shapes.json"
SERVER = "https://router.project-osrm.org"

# The public OSRM server asks for at most one request per second.
REQUEST_GAP_S = 1.1
# Waypoints per request; long lines are split into overlapping chunks.
CHUNK = 25
# A road route this much longer than the straight line, or one that starts far
# from the stop, is probably a wrong turn or a stop on the wrong road. Those
# stretches fall back to a straight line.
MAX_DETOUR = 3.0
MAX_DETOUR_EXTRA_M = 800
MAX_SNAP_M = 150
# Simplify shapes to this many metres of error to keep the data small.
SIMPLIFY_M = 4


def pair_key(a, b):
    return f"{a}>{b}"


def simplify(points, tolerance_m=SIMPLIFY_M):
    """Douglas-Peucker on [lat, lon] points, always keeping both ends."""
    if len(points) < 3:
        return points

    def offset_m(p, a, b):
        # Distance from p to segment a-b, on a local flat projection.
        ky = 111_320
        kx = ky * math.cos(math.radians(a[0]))
        ax, ay = a[1] * kx, a[0] * ky
        bx, by = b[1] * kx, b[0] * ky
        px, py = p[1] * kx, p[0] * ky
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5

    worst, index = 0, 0
    for i in range(1, len(points) - 1):
        d = offset_m(points[i], points[0], points[-1])
        if d > worst:
            worst, index = d, i
    if worst <= tolerance_m:
        return [points[0], points[-1]]
    left = simplify(points[: index + 1], tolerance_m)
    right = simplify(points[index:], tolerance_m)
    return left[:-1] + right


def http_get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "bus-route-easy shapes script"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def route(stops, server, fetch):
    """One OSRM request through `stops`. Returns a result per leg."""
    coords = ";".join(f"{s['lon']},{s['lat']}" for s in stops)
    url = f"{server}/route/v1/driving/{coords}?overview=false&steps=true&geometries=geojson"
    data = fetch(url)
    if data.get("code") != "Ok":
        raise RuntimeError(f"OSRM error: {data.get('code')} {data.get('message', '')}")

    snapped = [w.get("distance", 0) for w in data["waypoints"]]
    results = []
    for i, leg in enumerate(data["routes"][0]["legs"]):
        a, b = stops[i], stops[i + 1]
        straight = haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
        points = []
        for step in leg["steps"]:
            for lon, lat in step["geometry"]["coordinates"]:
                p = [round(lat, 5), round(lon, 5)]
                if not points or points[-1] != p:
                    points.append(p)
        too_long = leg["distance"] > max(straight * MAX_DETOUR, straight + MAX_DETOUR_EXTRA_M)
        off_road = max(snapped[i], snapped[i + 1]) > MAX_SNAP_M
        if too_long or off_road or len(points) < 2:
            results.append({"m": None, "path": None})
            continue
        # Start and end exactly at the stops so lines meet the stop dots.
        path = [[a["lat"], a["lon"]], *points, [b["lat"], b["lon"]]]
        results.append({"m": round(leg["distance"]), "path": simplify(path)})
    return results


def chunks(items, size=CHUNK):
    """Overlapping chunks so every consecutive pair lands in one chunk."""
    start = 0
    while start < len(items) - 1:
        yield items[start : start + size]
        start += size - 1


def update_cache(patterns, stops, cache, server=SERVER, fetch=http_get_json, sleep=time.sleep, log=print):
    fetched = 0
    for p in patterns:
        ids = p["stop_ids"]
        missing = any(pair_key(a, b) not in cache for a, b in zip(ids, ids[1:]))
        if not missing:
            continue
        for chunk in chunks(ids):
            if all(pair_key(a, b) in cache for a, b in zip(chunk, chunk[1:])):
                continue
            if fetched:
                sleep(REQUEST_GAP_S)
            legs = route([stops[i] for i in chunk], server, fetch)
            fetched += 1
            for (a, b), leg in zip(zip(chunk, chunk[1:]), legs):
                cache[pair_key(a, b)] = leg
        straight = sum(1 for a, b in zip(ids, ids[1:]) if cache[pair_key(a, b)]["m"] is None)
        note = f", {straight} straight" if straight else ""
        log(f"{p['route_id']}/{p['direction']}: {len(ids) - 1} segments{note}")
    return fetched


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default=SERVER)
    parser.add_argument("--refresh", action="store_true", help="ignore the cache and fetch everything")
    args = parser.parse_args(argv)

    try:
        patterns = json.loads((DATA / "route_stops.json").read_text(encoding="utf-8"))
        stops = {s["id"]: s for s in json.loads((DATA / "stops.json").read_text(encoding="utf-8"))}
    except FileNotFoundError:
        print("Run `npm run data` first.", file=sys.stderr)
        return 1

    cache = {} if args.refresh or not CACHE.exists() else json.loads(CACHE.read_text(encoding="utf-8"))
    try:
        fetched = update_cache(patterns, stops, cache, server=args.server)
    finally:
        # Save progress even if the server stops answering halfway.
        CACHE.write_text(json.dumps(cache, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"{fetched} requests, {len(cache)} segments cached in {CACHE.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
