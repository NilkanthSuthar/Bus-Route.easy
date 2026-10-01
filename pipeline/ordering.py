"""Estimates the order a bus visits a set of stops.

Every route in the data starts or ends at the city bus station ("Station"),
so we anchor there, pin the far end to the stop furthest from it, and find a
short path between the two (nearest neighbour, then 2-opt). It is a guess:
real routes do not always take the shortest path.
"""

from geo import haversine_m

# Vadodara City Bus Station, used when a route's stops do not include "Station".
HUB = (22.310342, 73.182300)


def _dist(a, b):
    return haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])


def find_anchor(stops):
    for s in stops:
        if s["name"].lower() == "station":
            return s
    return min(stops, key=lambda s: haversine_m(s["lat"], s["lon"], *HUB))


def path_length(path):
    return sum(_dist(a, b) for a, b in zip(path, path[1:]))


def _two_opt(path, closed):
    """Reverse segments while it shortens the path. Endpoints stay fixed."""
    n = len(path)
    last = n if closed else n - 1
    improved = True
    while improved:
        improved = False
        for i in range(1, last - 1):
            for j in range(i + 1, last):
                a, b = path[i - 1], path[i]
                c = path[j]
                d = path[(j + 1) % n] if closed else path[j + 1]
                if _dist(a, c) + _dist(b, d) < _dist(a, b) + _dist(c, d) - 1e-6:
                    path[i:j + 1] = reversed(path[i:j + 1])
                    improved = True
    return path


def order_stops(stops, circular=False):
    """Returns the stops in travel order.

    Outbound stops run from the station outwards. Inbound stops are solved the
    same way and reversed, so they end at the station.
    """
    if len(stops) < 3:
        ordered = sorted(stops, key=lambda s: _dist(s, find_anchor(stops)))
    else:
        anchor = find_anchor(stops)
        rest = [s for s in stops if s is not anchor]
        end = None if circular else max(rest, key=lambda s: _dist(anchor, s))
        pool = [s for s in rest if s is not end]

        path = [anchor]
        while pool:
            nxt = min(pool, key=lambda s: _dist(path[-1], s))
            pool.remove(nxt)
            path.append(nxt)
        if end is not None:
            path.append(end)
        ordered = _two_opt(path, closed=circular)

    if stops and stops[0].get("direction") == "in" and not circular:
        ordered = list(reversed(ordered))
    return ordered
