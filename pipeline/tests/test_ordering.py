from ordering import order_stops, path_length


def stop(name, lat, lon, direction="out"):
    return {"name": name, "lat": lat, "lon": lon, "direction": direction}


def line(direction="out"):
    # Five stops roughly east of the station along one road, given shuffled.
    return [
        stop("C", 22.310, 73.200, direction),
        stop("Station", 22.310, 73.182, direction),
        stop("E", 22.310, 73.220, direction),
        stop("B", 22.310, 73.190, direction),
        stop("D", 22.310, 73.210, direction),
    ]


def test_outbound_starts_at_station_and_follows_the_road():
    assert [s["name"] for s in order_stops(line())] == ["Station", "B", "C", "D", "E"]


def test_inbound_ends_at_station():
    assert [s["name"] for s in order_stops(line("in"))] == ["E", "D", "C", "B", "Station"]


def test_two_opt_fixes_a_zigzag():
    stops = [
        stop("Station", 22.300, 73.180),
        stop("A", 22.301, 73.190),
        stop("B", 22.320, 73.191),
        stop("C", 22.302, 73.200),
        stop("D", 22.321, 73.201),
        stop("End", 22.330, 73.230),
    ]
    ordered = order_stops(stops)
    assert ordered[0]["name"] == "Station" and ordered[-1]["name"] == "End"
    assert path_length(ordered) <= path_length(stops)


def test_circular_route_starts_at_station():
    ordered = order_stops(line(), circular=True)
    assert ordered[0]["name"] == "Station"
    assert len(ordered) == 5
