import pytest

from build import build, clean, headsign
from validate import validate


@pytest.fixture(scope="module")
def data(tmp_path_factory):
    return build(tmp_path_factory.mktemp("data"), log=lambda *_: None)


def test_name_cleanup():
    assert clean("Station To Bapod Baypas") == "Station To Bapod Bypass"
    assert clean("Axar Aparatment  To Sation") == "Axar Apartment To Station"


def test_headsign():
    assert headsign("Station To Tarsali") == "Tarsali"
    assert headsign("Tarsali To Station") == "Station"


def test_generated_data_is_valid(data):
    errors, _ = validate(data)
    assert errors == []


def test_every_route_has_a_pattern(data):
    with_patterns = {p["route_id"] for p in data["route_stops"]}
    assert {r["id"] for r in data["routes"]} == with_patterns


def test_patterns_are_flagged_as_estimated(data):
    assert all(p["estimated"] for p in data["route_stops"])


def test_outbound_routes_start_at_station(data):
    stops = {s["id"]: s for s in data["stops"]}
    for p in data["route_stops"]:
        names = [stops[sid]["name"] for sid in p["stop_ids"]]
        if "Station" in names and p["direction"] == "out":
            assert names[0] == "Station", p["route_id"]
