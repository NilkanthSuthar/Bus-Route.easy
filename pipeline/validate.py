"""Sanity checks on the generated data. Errors fail the build, warnings don't."""

from geo import haversine_m

# Rough bounding box around Vadodara (lat_min, lat_max, lon_min, lon_max).
BBOX = (22.15, 22.45, 73.05, 73.32)
MAX_GAP_M = 3000


def validate(data):
    errors, warnings = [], []
    stops = {s["id"]: s for s in data["stops"]}
    if len(stops) != len(data["stops"]):
        errors.append("duplicate stop ids")

    for s in data["stops"]:
        lat_min, lat_max, lon_min, lon_max = BBOX
        if not (lat_min <= s["lat"] <= lat_max and lon_min <= s["lon"] <= lon_max):
            errors.append(f"stop {s['id']} {s['name']} is outside Vadodara")

    route_ids = {r["id"] for r in data["routes"]}
    for p in data["route_stops"]:
        label = f"{p['route_id']}/{p['direction']}"
        if p["route_id"] not in route_ids:
            errors.append(f"{label}: unknown route")
        if len(p["stop_ids"]) < 2:
            errors.append(f"{label}: fewer than 2 stops")
        if len(set(p["stop_ids"])) != len(p["stop_ids"]):
            errors.append(f"{label}: repeats a stop")
        missing = [sid for sid in p["stop_ids"] if sid not in stops]
        if missing:
            errors.append(f"{label}: unknown stops {missing}")
            continue
        for key in ("segments", "segment_m"):
            if key in p and len(p[key]) != len(p["stop_ids"]) - 1:
                errors.append(f"{label}: {key} doesn't match the stops")
        seq = [stops[sid] for sid in p["stop_ids"]]
        for a, b in zip(seq, seq[1:]):
            gap = haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
            if gap > MAX_GAP_M:
                warnings.append(f"{label}: {gap / 1000:.1f} km gap {a['name']} -> {b['name']}")
    return errors, warnings
