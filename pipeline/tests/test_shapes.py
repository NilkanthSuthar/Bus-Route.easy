import pytest

from build import attach_shapes, build
from shapes import chunks, simplify, update_cache
from validate import validate


def stop(sid, lat, lon):
    return {"id": sid, "lat": lat, "lon": lon}


STOPS = {
    "a": stop("a", 22.300, 73.180),
    "b": stop("b", 22.300, 73.185),
    "c": stop("c", 22.300, 73.190),
}


def fake_osrm(detour_leg=None, snapped=None):
    """Answers like OSRM: one leg per stop pair, with a slight bend in the road."""
    calls = []

    def fetch(url):
        calls.append(url)
        coords = [tuple(map(float, c.split(","))) for c in url.split("/driving/")[1].split("?")[0].split(";")]
        legs = []
        for i, ((lon1, lat1), (lon2, lat2)) in enumerate(zip(coords, coords[1:])):
            mid = [(lon1 + lon2) / 2, lat1 + 0.0004]
            distance = 600 if i != detour_leg else 9000
            legs.append({"distance": distance, "steps": [{"geometry": {"coordinates": [[lon1, lat1], mid, [lon2, lat2]]}}]})
        waypoints = [{"distance": (snapped or {}).get(i, 3)} for i in range(len(coords))]
        return {"code": "Ok", "waypoints": waypoints, "routes": [{"legs": legs}]}

    fetch.calls = calls
    return fetch


def run(patterns, cache, fetch):
    return update_cache(patterns, STOPS, cache, fetch=fetch, sleep=lambda _: None, log=lambda *_: None)


PATTERN = {"route_id": "1", "direction": "out", "stop_ids": ["a", "b", "c"]}


def test_caches_one_shape_per_stop_pair():
    cache = {}
    run([PATTERN], cache, fake_osrm())
    assert set(cache) == {"a>b", "b>c"}
    path = cache["a>b"]["path"]
    assert path[0] == [22.3, 73.18] and path[-1] == [22.3, 73.185]
    assert len(path) >= 3  # follows the bend, not a straight line
    assert cache["a>b"]["m"] == 600


def test_does_not_refetch_cached_pairs():
    cache = {}
    fetch = fake_osrm()
    run([PATTERN], cache, fetch)
    run([PATTERN, {**PATTERN, "route_id": "2"}], cache, fetch)
    assert len(fetch.calls) == 1


def test_big_detours_fall_back_to_straight():
    cache = {}
    run([PATTERN], cache, fake_osrm(detour_leg=1))
    assert cache["a>b"]["path"] and cache["b>c"] == {"m": None, "path": None}


def test_stops_far_from_a_road_fall_back_to_straight():
    cache = {}
    run([PATTERN], cache, fake_osrm(snapped={2: 400}))
    assert cache["b>c"]["path"] is None and cache["a>b"]["path"]


def test_chunks_overlap_so_no_pair_is_lost():
    ids = list(range(60))
    pairs = {(a, b) for c in chunks(ids, 25) for a, b in zip(c, c[1:])}
    assert pairs == set(zip(ids, ids[1:]))


def test_simplify_drops_points_on_a_straight_line():
    line = [[22.3, 73.18 + i * 0.001] for i in range(10)]
    assert simplify(line) == [line[0], line[-1]]


def test_simplify_keeps_corners():
    corner = [[22.3, 73.18], [22.3, 73.19], [22.31, 73.19]]
    assert simplify(corner) == corner


def test_attach_shapes_marks_missing_segments():
    pattern = {"stop_ids": ["a", "b", "c"]}
    shapes = {"a>b": {"m": 600, "path": [[22.3, 73.18], [22.3, 73.185]]}}
    assert attach_shapes(pattern, shapes) == 1
    assert pattern["segment_m"] == [600, None]
    assert pattern["segments"][1] is None


@pytest.fixture(scope="module")
def shaped_data(tmp_path_factory):
    return build(tmp_path_factory.mktemp("data"), log=lambda *_: None, shapes={})


def test_build_without_shapes_is_still_valid(shaped_data):
    assert validate(shaped_data)[0] == []
    assert all("segments" not in p for p in shaped_data["route_stops"])
