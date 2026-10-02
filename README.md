# Bus-Route.easy

A trip planner for Vadodara's city buses: 23 lines and about 250 stops on a map.
Started at Smart India Hackathon 2023 (Top 6/500 finalist).

**Live:** https://nilkanthsuthar.github.io/Bus-Route.easy

## Features

- Trip planner with fastest and fewest-changes options and step-by-step directions on the map
- Plan from or to a stop, an address or place, a point on the map, or your location
- Lines near you, with walking time to the closest stop, updating as you move
- Line pages with every stop in both directions; stop pages with every line that serves it
- Search for stops and line numbers
- Recent trips and stops, stored only in your browser
- Installable, and works offline after the first visit (map tiles still need a connection)
- Phone and desktop layouts, light and dark mode

## Limitations

- **Stop order is estimated.** The source data says which lines serve a stop, not the order they visit stops in. The pipeline guesses the order (below) and the app marks it as estimated.
- **Trip times are estimates.** There are no timetables or live positions. The planner assumes buses at ~18 km/h, a 10 min wait per bus, and walking at ~4.8 km/h with 30% added for street detours (`web/src/routing/planner.js`, `web/src/lib/geo.js`).

## Run locally

Needs Node 22.12+ and Python 3.10+.

```bash
pip install -r pipeline/requirements.txt
npm install
npm run data       # builds web/public/data/ from the shapefiles
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run data` | Builds `web/public/data/*.json` from the shapefiles |
| `npm run dev` | Vite dev server (run `npm run data` first) |
| `npm run build` | Data plus production build into `dist/` |
| `npm test` | JS tests (Vitest) |
| `npm run test:data` | Pipeline tests (pytest) |
| `npm run shapes` | Fetches road paths for new stop pairs from the public OSRM server into `pipeline/shapes.json` |

Road shapes are committed in `pipeline/shapes.json`, so `npm run shapes` is only needed after stops change. Pairs whose road route looks wrong (a big detour, or a stop far from the road) stay straight lines.

## Deploy

`.github/workflows/ci.yml` runs both test suites and the build on every push and pull request. Pushes to `master` also deploy `dist/` to GitHub Pages (Settings → Pages → Source must be **GitHub Actions**).

## Project layout

```
pipeline/        Python: shapefiles -> JSON
  build.py       stops, lines and depots -> web/public/data/
  ordering.py    estimated stop order per line
  shapes.py      road shapes between stops (OSRM) -> shapes.json
  validate.py    data checks that fail the build
web/src/
  data/          loads the JSON and builds lookups
  lib/           geo, search, place search (Photon), GPS tracking, recents
  routing/       trip planner (Dijkstra over stops and line segments)
  ui/            map, bottom sheet, views
vadodara-bus-*/  raw GIS data (stops in each direction, depots)
```

Stack: vanilla JS, Vite, Leaflet with OpenStreetMap tiles, Photon place search, Python with pyshp. No API keys.

## How stop order is estimated

Every line starts or ends at the city bus station. For each line and direction, `pipeline/ordering.py` anchors at the station, pins the far end to the stop furthest from it, builds a path through the rest (nearest neighbour, then 2-opt), and `build.py` drops stops more than 4 km from every other stop on the line as likely mis-tags. Real buses don't always take the shortest path; a known stop order can replace the estimate in the pipeline.

## Roadmap

- Feedback and complaints
- Live bus positions, if a GPS feed becomes available
