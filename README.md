# 🚍 Bus-Route.easy

**A city bus app for Vadodara, started at Smart India Hackathon 2023 (Top 6/500 finalist).**
Find the bus lines near you, see every stop a line makes, and check which lines leave from any stop, all on a map.

## 📌 Overview

Vadodara's city buses have no easy way to answer "which bus do I take from here?". This app puts the city's 23 bus lines and 250+ stops on a map so commuters can find nearby lines, follow a line stop by stop, and see what serves any stop.

We collaborated with local depot authorities and validated the idea with real user input. The project was recognized by the Municipal Corporation for its civic impact and praised by university evaluators for its usability and potential to scale.

> **Note:** the source data lists which lines serve each stop, but not the order a bus visits them in. Stop order is estimated from the map (see [How stop order is estimated](#how-stop-order-is-estimated)) and is marked as estimated in the app. Timetables and live bus positions aren't available yet, so trip times are estimates (~18 km/h buses, ~10 min wait per bus, walking at ~4.8 km/h with 30% added for street detours).

---

## 💡 Features

- ✅ Live GPS location: nearby lines, walking times and directions update as you move
- ✅ Lines near you, with walking time and distance to the closest stop
- ✅ Line pages with every stop on a timeline, in both directions
- ✅ Stop pages with all departing lines and stops a short walk away
- ✅ Search for stops and line numbers
- ✅ Full-screen map with every line drawn in its own colour
- ✅ Works on phones (bottom sheet) and desktop, light and dark mode
- ✅ Remembers recent trips and stops (in your browser only)
- ✅ Installable to the home screen, and works offline after the first visit (map tiles still need a connection)
- ✅ Trip planner: fastest route and fewest changes, with step-by-step directions on the map
- ✅ Plan from or to anywhere: a stop, any place or address (search), a point on the map, or your location
- 🔜 Live bus positions, once a GPS feed is available

---

## 🛠 Tech Stack

| Layer         | Tools                                               |
|---------------|-----------------------------------------------------|
| Frontend      | Vanilla JavaScript, Vite                            |
| Map           | Leaflet, OpenStreetMap tiles (no API key)           |
| Place search  | Photon (OpenStreetMap geocoder, no API key)         |
| Data pipeline | Python, pyshp                                       |
| Data          | Vadodara bus stop and depot shapefiles → static JSON |
| Tests         | Vitest, pytest                                      |
| Hosting       | GitHub Pages via GitHub Actions                     |

---

## 🧪 How to Run Locally

Needs **Node 22.12+** ([nodejs.org](https://nodejs.org), LTS) and **Python 3.10+** ([python.org](https://www.python.org/downloads/); on Windows tick "Add python.exe to PATH").

```bash
git clone https://github.com/NilkanthSuthar/Bus-Route.easy.git
cd Bus-Route.easy
pip install -r pipeline/requirements.txt
npm install
npm run data   # builds web/public/data/*.json from the shapefiles
npm run dev    # http://localhost:5173
```

**Road shapes:** to draw lines along the real streets instead of straight lines between stops, run this once with an internet connection and commit the result:

```bash
npm run shapes   # fetches road paths from the public OSRM server into pipeline/shapes.json (~1 min)
```

It only fetches stop pairs it doesn't have yet. Any stretch where the road route looks wrong (a big detour, or a stop far from a road) stays a straight line. Real road lengths also make the trip times more accurate.

Other commands:

```bash
npm test           # JS unit tests
npm run test:data  # pipeline tests
npm run build      # data + production build into dist/
```

Pushing to `master` runs the tests and deploys `dist/` to GitHub Pages (set **Settings → Pages → Source** to **GitHub Actions** once).

---

## 🗂 Project Layout

```
pipeline/         Python: shapefiles -> JSON
  build.py        reads stops, routes and depots, writes web/public/data/
  ordering.py     estimates stop order for each line
  shapes.py       fetches road shapes between stops (OSRM) into shapes.json
  validate.py     sanity checks (fails the build on bad data)
web/
  index.html
  src/data/       loads the JSON and builds lookups (places, departures, nearby)
  src/lib/        geo and search helpers
  src/routing/    trip planner (Dijkstra over stops and line segments)
  src/ui/         map and panel views
vadodara-bus-*/   raw GIS data (stops in both directions, depots)
```

### How stop order is estimated

Every line starts or ends at the city bus station, so for each line and direction the pipeline:

1. Starts at the station and pins the far end to the stop furthest from it.
2. Builds a path through the remaining stops (nearest neighbour), then shortens it with 2-opt.
3. Drops stops that are kilometres away from the rest of the line (likely tagging mistakes in the source data).

Real buses don't always take the shortest path, so if you know the actual stop order for a line, it can be added to the pipeline to replace the estimate.

---

## 🗺 Roadmap

1. ~~Clean foundation: Vite, CI, Pages deploy~~
2. ~~Data pipeline with estimated stop order~~
3. ~~Trip planner in the browser (fastest route and fewest changes)~~
4. ~~Recent searches, offline support~~
5. Feedback and complaints
6. Live tracking, if a GPS feed becomes available
