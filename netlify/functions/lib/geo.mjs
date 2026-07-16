/**
 * netlify/functions/lib/geo.mjs
 * Dunne geo-client voor de hyperlokale systeemscan. Bewust minimaal: alleen
 * PDOK/BRO-achtige open services via HTTP, geen zware GIS-libs.
 *
 * Coördinaten: Nederlandse analyses in RD New (EPSG:28992). WGS84 alleen bewaard
 * voor externe services die dat nodig hebben.
 */

/** fetch met timeout (AbortController). Gooit bij time-out of netwerkfout. */
export async function fetchWithTimeout(url, { timeoutMs = 3000, headers } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, headers });
  } finally {
    clearTimeout(t);
  }
}

async function getJson(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Parse een WKT "POINT(x y)" naar {x, y} getallen. */
function parsePoint(wkt) {
  const m = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(wkt || "");
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}

/**
 * Geocodeer een vrije-tekst locatie via de PDOK Locatieserver.
 * Levert RD-coördinaat, WGS84, weergavenaam en administratieve context.
 */
export async function geocode(query, { url, timeoutMs = 3000 } = {}) {
  const base = url || "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
  const fl = "weergavenaam,centroide_rd,centroide_ll,gemeentenaam,provincienaam,waterschapsnaam,type";
  const u = `${base}?q=${encodeURIComponent(query)}&rows=1&fl=${encodeURIComponent(fl)}`;
  const data = await getJson(u, { timeoutMs });
  const doc = data?.response?.docs?.[0];
  if (!doc) return null;
  const rd = parsePoint(doc.centroide_rd);
  const ll = parsePoint(doc.centroide_ll);
  return {
    weergavenaam: doc.weergavenaam || query,
    type: doc.type || null,
    rd, // { x, y } in EPSG:28992
    ll: ll ? { lon: ll.x, lat: ll.y } : null,
    gemeente: doc.gemeentenaam || null,
    provincie: doc.provincienaam || null,
    waterschap: doc.waterschapsnaam || null,
  };
}

/**
 * Zoek een locatie exact op via haar PDOK Locatieserver-id (uit `suggest`).
 * Geen vrije-tekst-heuristiek: het id verwijst ondubbelzinnig naar één object,
 * dus dit vermijdt de "verkeerde plaats"-treffer van een losse tekstzoek.
 */
export async function lookupById(id, { url, timeoutMs = 3000 } = {}) {
  if (!id) return null;
  const base = url || "https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup";
  const fl = "weergavenaam,centroide_rd,centroide_ll,gemeentenaam,provincienaam,waterschapsnaam,type";
  const u = `${base}?id=${encodeURIComponent(id)}&fl=${encodeURIComponent(fl)}`;
  const data = await getJson(u, { timeoutMs });
  const doc = data?.response?.docs?.[0];
  if (!doc) return null;
  const rd = parsePoint(doc.centroide_rd);
  const ll = parsePoint(doc.centroide_ll);
  return {
    weergavenaam: doc.weergavenaam || null,
    type: doc.type || null,
    rd,
    ll: ll ? { lon: ll.x, lat: ll.y } : null,
    gemeente: doc.gemeentenaam || null,
    provincie: doc.provincienaam || null,
    waterschap: doc.waterschapsnaam || null,
  };
}

/** Vierkante RD-bbox rond een punt met halve zijde `half` meter. */
export function bboxAround({ x, y }, half) {
  return [x - half, y - half, x + half, y + half];
}

/**
 * WMS GetFeatureInfo op één punt (klein bbox, 3×3 pixels, centrumpixel).
 * Retourneert het properties-object van de eerste feature, of null.
 */
export async function wmsPointInfo({ wms, layer }, rd, { timeoutMs = 3000, half = 30 } = {}) {
  if (!wms || !layer) return null;
  const [minx, miny, maxx, maxy] = bboxAround(rd, half);
  const params = new URLSearchParams({
    service: "WMS", version: "1.3.0", request: "GetFeatureInfo",
    layers: layer, query_layers: layer, crs: "EPSG:28992",
    bbox: `${minx},${miny},${maxx},${maxy}`,
    width: "3", height: "3", i: "1", j: "1",
    info_format: "application/json",
  });
  const data = await getJson(`${wms}?${params}`, { timeoutMs });
  return data?.features?.[0]?.properties || null;
}

/** Als boven, maar alleen de numerieke AHN-hoogte (property `value_list`). */
export async function ahnHeight(cfg, rd, opts) {
  const p = await wmsPointInfo(cfg, rd, opts);
  const v = p && (p.value_list ?? p.value ?? p.GRAY_INDEX);
  const n = v == null ? null : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * WFS GetFeature met bbox-intersectie rond een punt. Retourneert de eerste
 * feature-properties, of null wanneer er niets snijdt.
 */
export async function wfsIntersect({ wfs, typeName }, rd, { timeoutMs = 3000, half = 5 } = {}) {
  if (!wfs || !typeName) return null;
  const [minx, miny, maxx, maxy] = bboxAround(rd, half);
  const params = new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature",
    typeNames: typeName, count: "1", outputFormat: "application/json",
    srsName: "EPSG:28992",
    bbox: `${minx},${miny},${maxx},${maxy},EPSG:28992`,
  });
  const data = await getJson(`${wfs}?${params}`, { timeoutMs });
  return data?.features?.[0]?.properties || null;
}
