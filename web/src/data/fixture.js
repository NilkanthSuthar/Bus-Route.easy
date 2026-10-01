// A tiny network: line A runs west to east, line B crosses it at "Middle".
export const raw = {
  stops: [
    { id: 'o1', name: 'West End', lat: 22.3, lon: 73.16, ward: '1', zone: 'West', direction: 'out', routes: ['A'] },
    { id: 'o2', name: 'Middle', lat: 22.3, lon: 73.17, ward: '1', zone: 'West', direction: 'out', routes: ['A', 'B'] },
    { id: 'o3', name: 'East End', lat: 22.3, lon: 73.18, ward: '2', zone: 'East', direction: 'out', routes: ['A'] },
    { id: 'i2', name: 'Middle', lat: 22.3002, lon: 73.1701, ward: '1', zone: 'West', direction: 'in', routes: ['A'] },
    { id: 'o4', name: 'North Gate', lat: 22.31, lon: 73.17, ward: '3', zone: 'North', direction: 'out', routes: ['B'] },
    { id: 'o5', name: 'Middle', lat: 22.4, lon: 73.3, ward: '9', zone: 'East', direction: 'out', routes: [] },
  ],
  routes: [
    { id: 'A', name: 'West End To East End', terminus: 'East End', color: '#E5484D', directions: ['out', 'in'] },
    { id: 'B', name: 'Middle To North Gate', terminus: 'North Gate', color: '#0090FF', directions: ['out'] },
  ],
  route_stops: [
    { route_id: 'A', direction: 'out', headsign: 'East End', stop_ids: ['o1', 'o2', 'o3'], estimated: true },
    { route_id: 'A', direction: 'in', headsign: 'West End', stop_ids: ['o3', 'i2', 'o1'], estimated: true },
    { route_id: 'B', direction: 'out', headsign: 'North Gate', stop_ids: ['o2', 'o4'], estimated: true },
  ],
  transfers: [],
  depots: [],
};
