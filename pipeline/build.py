"""Builds the static JSON the web app loads from the raw GIS shapefiles.

The source data says which routes serve each stop but not the order the bus
visits them in, so stop order is estimated from geography (see ordering.py).
Every route sequence produced here is flagged `estimated: true`.

Usage: python pipeline/build.py [--out web/public/data]
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import shapefile

from geo import haversine_m
from ordering import order_stops

ROOT = Path(__file__).resolve().parent.parent
RAW = {
    "out": ROOT / "vadodara-bus-stop_down" / "Vadodara - Bus Stop_Down",
    "in": ROOT / "vadodara-bus-stop_up" / "Vadodara - Bus Stop_Up",
}
DEPOTS = ROOT / "vadodara-bus-depot" / "Vadodara - Bus Depot"
SHAPES = Path(__file__).resolve().parent / "shapes.json"

# Stops closer than this (metres) are treated as an easy walking transfer.
TRANSFER_RADIUS_M = 300
# A stop further than this from every other stop on its route is assumed to be
# mis-tagged in the source data and left off that route.
OUTLIER_M = 4000

# Typos and spelling variants seen in the raw route names.
NAME_FIXES = [
    (r"\bBaypas+\b", "Bypass"),
    (r"\bSation\b", "Station"),
    (r"\bAparatment\b", "Apartment"),
    (r"\bVai\b", "via"),
    (r"\bundera\b", "Undera"),
    (r"\s+", " "),
]

# Distinct, readable line colours (assigned by route order, stable across builds).
PALETTE = [
    "#E5484D", "#0090FF", "#30A46C", "#F76B15", "#8E4EC6", "#12A594",
    "#D6409F", "#3E63DD", "#FFB224", "#00A2C7", "#AD7F58", "#46A758",
    "#E54666", "#6E56CF", "#29A383", "#F2555A", "#0588F0", "#978365",
    "#CA244D", "#5B5BD6", "#2B9A66", "#EF5F00", "#7D66D9", "#0D74CE",
]


def clean(text):
    text = text.strip()
    for pattern, repl in NAME_FIXES:
        text = re.sub(pattern, repl, text)
    return text.strip()


def split_list(text):
    return [part.strip() for part in text.split(",") if part.strip()]


def route_sort_key(route_id):
    m = re.match(r"(\d+)(.*)", route_id)
    return (int(m.group(1)), m.group(2)) if m else (10**6, route_id)


def read_points(path):
    reader = shapefile.Reader(str(path))
    fields = [f[0] for f in reader.fields[1:]]
    for shape_rec in reader.iterShapeRecords():
        props = dict(zip(fields, shape_rec.record))
        lon, lat = shape_rec.shape.points[0][:2]
        yield props, lat, lon


def load_stops():
    stops = []
    for direction, path in RAW.items():
        prefix = "o" if direction == "out" else "i"
        for props, lat, lon in read_points(path):
            stops.append({
                "id": f"{prefix}{int(props['FID']):03d}",
                "name": clean(props["Bus_Stop_N"]),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "ward": str(props["Ward"]).strip(),
                "zone": str(props["Zone"]).strip(),
                "direction": direction,
                "_routes": split_list(props["Bus_Route1"]),
                "_route_names": split_list(props["Bus_Route_"]),
            })
    return stops


def route_names(stops):
    """Pair route ids with names by position, where the raw lists line up."""
    votes = defaultdict(Counter)
    for stop in stops:
        ids, names = stop["_routes"], stop["_route_names"]
        if len(ids) == len(names):
            for rid, name in zip(ids, names):
                votes[(rid, stop["direction"])][clean(name)] += 1
    return {key: c.most_common(1)[0][0] for key, c in votes.items()}


def headsign(name):
    """'Station To Tarsali' -> 'Tarsali', 'Tarsali To Station' -> 'Station'."""
    if "circular" in name.lower():
        return "Circular"
    parts = re.split(r"\s+to\s+", name, flags=re.IGNORECASE)
    return parts[-1].strip() if len(parts) > 1 else name


def drop_outliers(group, label, log):
    kept = []
    for s in group:
        nearest = min((haversine_m(s["lat"], s["lon"], o["lat"], o["lon"])
                       for o in group if o is not s), default=0)
        if nearest > OUTLIER_M:
            log(f"{label}: dropped {s['name']} ({nearest / 1000:.1f} km from the rest of the route)")
        else:
            kept.append(s)
    return kept


def load_shapes(path=SHAPES):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def attach_shapes(pattern, shapes):
    """Adds road shapes and distances from shapes.py, where it has them.

    `segments[i]` is the road path from stop i to stop i+1 and `segment_m[i]`
    its length. Either is null when there's no usable road shape, and the app
    falls back to a straight line for that stretch.
    """
    ids = pattern["stop_ids"]
    found = [shapes.get(f"{a}>{b}") for a, b in zip(ids, ids[1:])]
    if not any(f and f.get("path") for f in found):
        return 0
    pattern["segments"] = [f["path"] if f else None for f in found]
    pattern["segment_m"] = [f["m"] if f else None for f in found]
    return sum(1 for f in found if f and f.get("path"))


def build(out_dir, log=print, shapes=None):
    shapes = load_shapes() if shapes is None else shapes
    stops = load_stops()
    names = route_names(stops)

    members = defaultdict(list)
    for stop in stops:
        for rid in dict.fromkeys(stop["_routes"]):
            members[(rid, stop["direction"])].append(stop)

    route_ids = sorted({rid for rid, _ in members}, key=route_sort_key)
    routes, patterns, dropped = [], [], []
    for index, rid in enumerate(route_ids):
        dirs = []
        for direction in ("out", "in"):
            group = drop_outliers(members.get((rid, direction), []), f"{rid}/{direction}", log)
            if len(group) < 2:
                if group:
                    dropped.append(f"{rid}/{direction} ({len(group)} stop)")
                continue
            name = names.get((rid, direction), f"Route {rid}")
            circular = "circular" in name.lower()
            ordered = order_stops(group, circular=circular)
            patterns.append({
                "route_id": rid,
                "direction": direction,
                "headsign": headsign(name),
                "name": name,
                "stop_ids": [s["id"] for s in ordered],
                "estimated": True,
            })
            dirs.append(direction)
        if not dirs:
            continue
        out_name = names.get((rid, "out")) or names.get((rid, "in"))
        routes.append({
            "id": rid,
            "name": out_name,
            "terminus": headsign(names[(rid, "out")]) if (rid, "out") in names else headsign(out_name),
            "color": PALETTE[index % len(PALETTE)],
            "directions": dirs,
        })

    shaped = sum(attach_shapes(p, shapes) for p in patterns)
    total = sum(len(p["stop_ids"]) - 1 for p in patterns)
    log(f"road shapes: {shaped}/{total} segments" + ("" if shaped else " (run `npm run shapes` to add them)"))

    kept = {r["id"] for r in routes}
    stop_routes = defaultdict(set)
    for p in patterns:
        for sid in p["stop_ids"]:
            stop_routes[sid].add(p["route_id"])
    public_stops = []
    for stop in stops:
        public = {k: v for k, v in stop.items() if not k.startswith("_")}
        public["routes"] = sorted(stop_routes.get(stop["id"], set()) & kept, key=route_sort_key)
        public_stops.append(public)

    transfers = []
    for i, a in enumerate(public_stops):
        for b in public_stops[i + 1:]:
            d = haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
            if d <= TRANSFER_RADIUS_M:
                transfers.append({"from": a["id"], "to": b["id"], "walk_m": round(d)})

    depots = []
    for props, lat, lon in read_points(DEPOTS):
        depots.append({
            "id": f"d{int(props['FID']):02d}",
            "name": clean(props["Name_1"]),
            "address": clean(props["Street_Add"]),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
        })

    data = {
        "stops": public_stops,
        "routes": routes,
        "route_stops": patterns,
        "transfers": transfers,
        "depots": depots,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    for key, value in data.items():
        (out_dir / f"{key}.json").write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    log(f"{len(public_stops)} stops, {len(routes)} routes, {len(patterns)} patterns, "
        f"{len(transfers)} transfers, {len(depots)} depots -> {out_dir}")
    if dropped:
        log("skipped (too few stops): " + ", ".join(dropped))
    return data


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT / "web" / "public" / "data"))
    args = parser.parse_args(argv)
    data = build(Path(args.out))

    from validate import validate
    errors, warnings = validate(data)
    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("error:", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
