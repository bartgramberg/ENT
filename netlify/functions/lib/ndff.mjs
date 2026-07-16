/**
 * netlify/functions/lib/ndff.mjs
 * Dunne client voor de eigen NDFF-laag (Supabase/PostGIS). NDFF heeft geen live
 * query-API en geen landelijke bulk-dump; waarnemingen komen uit handmatige
 * Flora & Fauna Verkenner-exports, per pilotgebied geïmporteerd (zie
 * scripts/ndff-import.mjs).
 *
 * De data is per 1x1 km-hok geaggregeerd, niet per punt. Daarom géén radius:
 * een vraag geldt exact het km-vak waarin het punt valt. Een radius zou soorten
 * uit naburige vakken meetellen die daar niet zijn waargenomen.
 *
 * De RPC's zijn de enige toegang: RLS houdt de tabellen dicht, en de functies
 * geven nooit individuele waarnemingen terug — alleen aggregaten per soortgroep
 * plus de beleidsrelevante soorten.
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

/**
 * Valt dit punt in een geïmporteerd km-hok? Zo nee: null — dan is er geen
 * uitspraak te doen over soorten hier (data_gap, geen "niets aangetroffen").
 */
export async function ndffDekking(cfg, rd, opts) {
  const rows = await rpc(cfg, "ndff_dekking", { px: rd.x, py: rd.y }, opts);
  return rows?.[0] || null;
}

/** Soorten per soortgroep in het km-hok; vervaagde records apart geteld. */
export async function ndffSoorten(cfg, rd, opts) {
  return (await rpc(cfg, "ndff_soorten", { px: rd.x, py: rd.y }, opts)) || [];
}

/** Soorten met beleidsstatus (Rode Lijst, Ow-bescherming, exoten). */
export async function ndffBijzonder(cfg, rd, opts) {
  return (await rpc(cfg, "ndff_bijzonder", { px: rd.x, py: rd.y }, opts)) || [];
}
