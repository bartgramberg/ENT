/**
 * netlify/functions/lib/ndff.mjs
 * Dunne client voor de eigen NDFF-laag (Supabase/PostGIS). NDFF zelf heeft geen
 * live query-API of landelijke bulk-dump — waarnemingen komen uit handmatige
 * Flora & Fauna Verkenner-exports, geïmporteerd in deze database per pilotgebied.
 *
 * De twee RPC's hieronder zijn de enige toegang: RLS staat aan op de tabellen,
 * dus alleen deze SECURITY DEFINER-functies mogen naar buiten — en die geven
 * nooit individuele waarnemingspunten terug, alleen aggregaten per soortgroep
 * (zelfde privacyhouding als NDFF's eigen vertroebeling van kwetsbare soorten).
 */

async function rpc(cfg, fn, args, { timeoutMs = 3000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for rpc/${fn}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Is dit punt binnen een al geïmporteerd NDFF-gebied? Retourneert null indien niet. */
export async function gebiedGedekt(cfg, rd, opts) {
  const rows = await rpc(cfg, "gebied_gedekt", { px: rd.x, py: rd.y }, opts);
  return rows?.[0] || null;
}

/** Geaggregeerde waarnemingen per soortgroep binnen radius_m van het punt. */
export async function nearbyWaarnemingen(cfg, rd, radius_m, opts) {
  const rows = await rpc(cfg, "nearby_waarnemingen", { px: rd.x, py: rd.y, radius_m }, opts);
  return rows || [];
}
