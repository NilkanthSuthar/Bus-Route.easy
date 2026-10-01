// CARTO tiles need an API key (since Aug 2026). Without one we fall back to
// standard OpenStreetMap tiles, darkened with a CSS filter in dark mode.
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function basemap({ dark, cartoKey }) {
  if (cartoKey) {
    const style = dark ? 'dark_all' : 'light_all';
    return {
      url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
      options: {
        attribution: `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
        subdomains: 'abcd',
        maxZoom: 19,
      },
    };
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      className: dark ? 'osm-tiles osm-dark' : 'osm-tiles',
    },
  };
}
