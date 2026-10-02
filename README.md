# Bus-Route.easy

A map-based web app for Vadodara's city buses: find lines near you, browse lines and stops, and plan trips. Started at Smart India Hackathon 2023 (finalist, top 6 of 500).

**Live:** https://nilkanthsuthar.github.io/Bus-Route.easy/

## Features

- **Nearby lines** with walking time to the closest stop, updated live from GPS
- **Line pages**: every stop on a timeline, both directions, drawn along the roads
- **Stop pages**: departing lines and stops a short walk away
- **Trip planner**: fastest and fewest-changes options with step-by-step directions. Start and end can be a stop, any place or address, a point on the map, or your location
- **Search** for stops, line numbers, places and addresses
- **Phone-friendly**: draggable bottom sheet, installable to the home screen, works offline after the first visit (map tiles and place search need a connection)
- Light and dark mode; recent trips and stops are remembered in the browser

## Limitations

- **Stop order is estimated.** The source data lists which lines serve each stop, not the order they visit them. See [How stop order is estimated](#how-stop-order-is-estimated).
- **Times are estimates.** There are no timetables or live bus positions. The planner assumes buses average 18 km/h, a 10-minute wait per bus, and walking at 4.8 km/h, with straight-line distances scaled by 1.3 for street detours.
- **Walking limits.** Trips walk at most 800 m to the first stop or from the last, and 400 m between stops when changing buses.
- **Coverage**: 23 lines and about 250 stops. Three lines in the source data (14A, 18C, 30C) have only one stop each and are left out.

## Running locally

Requires Node 22.12+ and Python 3.10+.

```bash
git clone https://github.com/NilkanthSuthar/Bus-Route.easy.git
cd Bus-Route.easy
pip install -r pipeline/requirements.txt
npm install
npm run data   # build web/public/data/*.json from the shapefiles
npm run dev    # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run data` | Build the app's JSON data from the shapefiles |
| `npm run shapes` | Fetch road shapes from the public OSRM server into `pipeline/shapes.json` (needs internet; only fetches stop pairs not already cached) |
| `npm run dev` | Development server |
| `npm run build` | Data + production build into `dist/` |
| `npm run preview` | Serve the production build (offline mode only works here, not in `dev`) |
| `npm test` | JS unit tests (Vitest) |
| `npm run test:data` | Pipeline tests (pytest) |

GPS only works on `localhost` or HTTPS, so testing location from a phone needs the deployed site.

## Deployment

Pushes to `master` run the tests and deploy `dist/` to GitHub Pages via GitHub Actions. Pages must be enabled once under **Settings → Pages → Source → GitHub Actions**.

## How it works

The app is fully static. A Python pipeline turns the GIS data into JSON at build time, and everything else, including trip planning, runs in the browser.

| Part | Tools |
|---|---|
| Frontend | Vanilla JavaScript, Vite |
| Map | Leaflet with OpenStreetMap tiles |
| Place search | Photon (OpenStreetMap geocoder) |
| Road shapes | OSRM, fetched once and committed |
| Data pipeline | Python, pyshp |

### How stop order is estimated

For each line and direction, `pipeline/ordering.py`:

1. Anchors one end at the city bus station stop (or the stop nearest to it) and the other at the stop furthest from it.
2. Orders the remaining stops by nearest neighbour, then shortens the path with 2-opt.
3. Drops stops more than 4 km from the rest of the line, which are likely tagging mistakes in the source data.

Inbound stops are ordered the same way and reversed, so they end at the station. Real stop sequences can replace these estimates when available.

### Road shapes

`npm run shapes` asks OSRM for the driving route between each pair of consecutive stops. A stretch stays a straight line if the road route is both over 3 times and over 800 m longer than the straight distance, or if a stop is more than 150 m from a road. Road lengths are also used for ride times; without a shape, the planner uses the straight distance × 1.3.

### Trip planner

`web/src/routing/planner.js` runs Dijkstra's algorithm over stops and line segments. "Fastest" minimises total time; "Fewest changes" minimises the number of buses first, then time. If the destination is within 1.5 km, walking is offered as well.

## Project layout

```
pipeline/
  build.py        shapefiles -> web/public/data/*.json
  ordering.py     stop order estimate
  shapes.py       road shapes (OSRM) -> shapes.json
  validate.py     data checks; errors fail the build
  tests/
web/
  index.html
  public/         icons, manifest, service worker
  src/data/       loads the JSON, builds lookups
  src/lib/        geo, search, place search, GPS tracking, recents
  src/routing/    trip planner
  src/ui/         map, views, bottom sheet
scripts/
  python.mjs      runs Python as python3, python or py, whichever is installed
vadodara-bus-stop_down/, vadodara-bus-stop_up/, vadodara-bus-depot/
                  source shapefiles
```

## Roadmap

- Feedback and complaints
- Real stop sequences and timetables, to replace the estimates
- Live bus positions, if a GPS feed becomes available
