/**
 * netlify/functions/analyse.mjs  →  GET /api/analyse
 *
 * Hyperlokale systeemscan (Fase 2c): geocodeer een locatie, bepaal een
 * onderzoeksgebied en bevraag parallel de open bronnen (PDOK Locatieserver,
 * AHN, Natura 2000, BRO Bodemkaart, Klimaateffectatlas). Levert een compact,
 * genormaliseerd systeemprofiel.
 *
 * Bewust simpel: live queries + graceful degradation. Eén trage/ontbrekende bron
 * blokkeert de analyse niet; die wordt als data_gap gerapporteerd.
 *
 * Soorten (NDFF) wijken van dit patroon af: NDFF heeft geen live query-API en
 * geen landelijke bulk-dump, dus die bron is een eigen Supabase/PostGIS-laag
 * die handmatig gevuld wordt per pilotgebied (zie lib/ndff.mjs). Een punt
 * buiten een geïmporteerd gebied levert een data_gap, geen "geen soorten".
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { geocode, lookupById, ahnHeight, wfsIntersect, wmsPointInfo } from "./lib/geo.mjs";
import { bepaalOnderzoeksgebied, reliefIndicatie, bouwProfiel, classifyKea } from "./lib/systeemprofiel.mjs";
import { gebiedGedekt, nearbyWaarnemingen } from "./lib/ndff.mjs";

const TODAY = () => new Date().toISOString().slice(0, 10);
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

function resolveRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../netlify/functions
  for (const base of [process.cwd(), path.resolve(here, "../.."), path.resolve(here, "..")]) {
    if (existsSync(path.join(base, "data", "bronnen.json"))) return base;
  }
  return process.cwd();
}
const ROOT = resolveRoot();

let _bronnen = null;
async function bronnen() {
  if (_bronnen) return _bronnen;
  try {
    _bronnen = JSON.parse(await readFile(path.join(ROOT, "data", "bronnen.json"), "utf8"));
  } catch {
    _bronnen = { version: "onbekend", sources: {} };
  }
  return _bronnen;
}

/** Voer een bronfunctie uit met foutafvang; registreer provenance of data_gap. */
async function safe(label, fn, { provenance, data_gaps, meta }) {
  const t = Date.now();
  try {
    const v = await fn();
    meta[label] = Date.now() - t;
    return v;
  } catch (e) {
    meta[label] = Date.now() - t;
    data_gaps.push(`${label} (niet opgehaald: ${e.name === "AbortError" ? "time-out" : "fout"})`);
    return null;
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const locationText = (url.searchParams.get("location") || "").trim();
  const idParam = (url.searchParams.get("id") || "").trim(); // PDOK Locatieserver-id (exact)
  const rdParam = url.searchParams.get("rd"); // "x,y"
  if (!locationText && !idParam && !rdParam) return json({ error: "location, id of rd vereist" }, 400);

  const cfg = await bronnen();
  const S = cfg.sources || {};
  const meta = {};
  const provenance = [];
  const data_gaps = [];
  const uncertainties = [];
  const t0 = Date.now();

  // 1) Geocoding + administratieve context
  const lsUrl = S.locatieserver?.url || "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
  const lookupUrl = lsUrl.replace(/\/free\/?$/, "/lookup");
  let geo = null;
  if (rdParam) {
    const [x, y] = rdParam.split(",").map((n) => parseFloat(n));
    if (Number.isFinite(x) && Number.isFinite(y)) geo = { weergavenaam: `RD ${x}, ${y}`, rd: { x, y }, ll: null };
  }
  // Voorkeur: exact id uit de autocomplete (ondubbelzinnig). Anders vrije tekst.
  if (!geo && idParam) {
    geo = await safe("geocoding", () => lookupById(idParam, { url: lookupUrl, timeoutMs: 3000 }), { provenance, data_gaps, meta });
    if (geo) provenance.push({ dataset: S.locatieserver?.dataset || "PDOK Locatieserver", retrieved: TODAY() });
  }
  if (!geo && locationText) {
    geo = await safe("geocoding", () => geocode(locationText, { url: lsUrl, timeoutMs: 3000 }), { provenance, data_gaps, meta });
    if (geo) provenance.push({ dataset: S.locatieserver?.dataset || "PDOK Locatieserver", retrieved: TODAY() });
  }
  if (!geo || !geo.rd) {
    return json({ error: "Locatie niet gevonden of geen coördinaat", meta }, 200);
  }
  const rd = geo.rd;

  // 2) Onderzoeksgebied
  const gebied = bepaalOnderzoeksgebied(locationText || geo.weergavenaam || geo.gemeente || "");

  // 3) Parallelle bronnen (graceful degradation)
  // health volgt of een bron *haperde* (koude/trage WMS) i.p.v. legitiem leeg
  // was — dat bepaalt of we het resultaat lang mogen cachen (zie stap 5).
  const health = { bodemOk: true, klimaatOk: true, ndffOk: true };
  const [terrain, natura2000, soil, klimaat, soorten] = await Promise.all([
    // AHN: punt + vier buren (±50 m) → reliëf-indicatie
    (async () => {
      if (!S.ahn?.wms) { data_gaps.push("terrain (AHN niet geconfigureerd)"); return {}; }
      const off = 50;
      const pts = [rd, { x: rd.x, y: rd.y + off }, { x: rd.x + off, y: rd.y }, { x: rd.x, y: rd.y - off }, { x: rd.x - off, y: rd.y }];
      // Tight sampling bbox: AHN is 0,5 m, so a small bbox samples a real cell.
      // The DTM (maaiveld) is no-data under buildings, so the address centroid
      // can miss — in that case use the neighbour heights (±50 m) as the base.
      const hs = await safe("terrain", () => Promise.all(pts.map((p) => ahnHeight(S.ahn, p, { timeoutMs: 3000, half: 1 }))), { provenance, data_gaps, meta });
      if (!hs) return {};
      const center = hs[0];
      const neighbours = hs.slice(1).filter((v) => Number.isFinite(v));
      const base = Number.isFinite(center)
        ? center
        : (neighbours.length ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length : null);
      if (base == null) return {};
      provenance.push({ dataset: S.ahn.dataset, retrieved: TODAY() });
      const relief = reliefIndicatie(Number.isFinite(center) ? center : base, neighbours);
      return { hoogte_nap_m: +base.toFixed(2), relief: relief || undefined };
    })(),
    // Natura 2000 punt-intersectie
    (async () => {
      if (!S.natura2000?.wfs) { data_gaps.push("protected_areas (Natura2000 niet geconfigureerd)"); return null; }
      const p = await safe("natura2000", () => wfsIntersect(S.natura2000, rd, { timeoutMs: 3000 }), { provenance, data_gaps, meta });
      provenance.push({ dataset: S.natura2000.dataset, retrieved: TODAY() });
      if (!p) return { in_gebied: false };
      return { in_gebied: true, naam: p[S.natura2000.naamProperty] || p.naamN2K || null, nr: p.nr ?? null };
    })(),
    // BRO Bodemkaart → bodemtype + bodemnaam. De kaart karteert geen bebouwing,
    // dus het adrespunt valt vaak op een pand zonder bodemvlak. Sample daarom
    // centrum + een ring eromheen en neem het dominante bodemtype uit de directe
    // omgeving (zoals de buurpunt-terugval bij AHN).
    (async () => {
      if (!S.bodemkaart?.wms || !S.bodemkaart?.layer) return {};
      const codeProp = S.bodemkaart.codeProperty || "soilcode";
      const naamProp = S.bodemkaart.naamProperty || "first_soilname";
      const r1 = 30, r2 = 60;
      const ring = [
        [0, 0],
        [0, r1], [r1, 0], [0, -r1], [-r1, 0],
        [r1, r1], [r1, -r1], [-r1, r1], [-r1, -r1],
        [0, r2], [r2, 0], [0, -r2], [-r2, 0],
      ];
      const pts = ring.map(([dx, dy]) => ({ x: rd.x + dx, y: rd.y + dy }));
      // Onderscheid een geslaagde (evt. lege) WMS-response van een fout/time-out,
      // zodat we "hier ligt geen bodem" niet verwarren met "de service haperde".
      const sample = async (p) => {
        try { return { ok: true, props: await wmsPointInfo(S.bodemkaart, p, { timeoutMs: 3000, half: 1 }) }; }
        catch { return { ok: false, props: null }; }
      };
      const res = await safe("bodem", () => Promise.all(pts.map(sample)), { provenance, data_gaps, meta });
      if (!res) { health.bodemOk = false; return {}; }
      // Geen enkele geslaagde response → hapering (koude/trage service), geen echte leegte.
      if (!res.some((r) => r.ok)) { health.bodemOk = false; return {}; }
      // Tel bodemtypes; centrum weegt dubbel, dan het meest voorkomende.
      const counts = new Map();
      res.forEach((r, i) => {
        const code = r.props && r.props[codeProp];
        const naam = r.props && r.props[naamProp];
        if (!code && !naam) return;
        const key = code || naam;
        const cur = counts.get(key) || { n: 0, code: code || null, naam: naam || null };
        cur.n += i === 0 ? 2 : 1;
        counts.set(key, cur);
      });
      if (counts.size === 0) return {};
      const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
      provenance.push({ dataset: S.bodemkaart.dataset, retrieved: TODAY() });
      return { bodemcode: best.code, bodemnaam: best.naam };
    })(),
    // Klimaateffectatlas: per laag één punt-query → kale rasterwaarde → klasse
    // (via classifyKea, met legenda + geldig-bereik dat de no-data-sentinels weert).
    (async () => {
      const kea = S.klimaateffectatlas;
      const lagen = kea?.lagen || [];
      if (!kea?.wms || !lagen.length) return [];
      const sample = async (laag) => {
        try {
          const props = await wmsPointInfo({ wms: kea.wms, layer: laag.layer }, rd, { timeoutMs: 4000, half: 1 });
          const raw = props ? Object.values(props).find((v) => v != null && v !== "") : null;
          return { ok: true, res: classifyKea(raw, laag) };
        } catch {
          return { ok: false, res: null };
        }
      };
      const out = await safe("klimaat", () => Promise.all(lagen.map(sample)), { provenance, data_gaps, meta });
      if (!out) { health.klimaatOk = false; return []; }
      if (!out.some((o) => o.ok)) { health.klimaatOk = false; return []; }
      const classified = out.map((o) => o.res).filter(Boolean);
      if (classified.length) provenance.push({ dataset: kea.dataset, retrieved: TODAY() });
      return classified;
    })(),
    // NDFF-soorten: geen live bron, dus eerst een dekkingscheck (is dit punt
    // binnen een al geïmporteerd gebied?). Zonder die check zou een lege
    // radius-query ten onrechte als "geen soorten hier" gelezen worden i.p.v.
    // "nog niet geïmporteerd" — dat zou de nooit-afwezigheid-concluderen-regel
    // schenden. safe() leent zich hier niet voor (die vangt fouten als null,
    // maar "niet gedekt" is óók legitiem null), dus handmatige try/catch.
    (async () => {
      const cfg = S.ndff;
      if (!cfg?.url || !cfg?.anonKey) { data_gaps.push("species_observations (NDFF-laag niet geconfigureerd)"); return null; }
      const t = Date.now();
      let dekking;
      try {
        dekking = await gebiedGedekt(cfg, rd, { timeoutMs: 3000 });
      } catch (e) {
        meta.ndff_dekking = Date.now() - t;
        data_gaps.push(`species_observations (niet opgehaald: ${e.name === "AbortError" ? "time-out" : "fout"})`);
        health.ndffOk = false;
        return null;
      }
      meta.ndff_dekking = Date.now() - t;
      if (!dekking) { data_gaps.push("species_observations (gebied nog niet geïmporteerd uit NDFF)"); return null; }

      const radius = gebied.context_m || 1000;
      let groepen;
      try {
        groepen = await nearbyWaarnemingen(cfg, rd, radius, { timeoutMs: 4000 });
      } catch (e) {
        data_gaps.push(`species_observations (niet opgehaald: ${e.name === "AbortError" ? "time-out" : "fout"})`);
        health.ndffOk = false;
        return null;
      }
      provenance.push({ dataset: `NDFF-waarnemingen (${dekking.gebied_naam})`, retrieved: dekking.peildatum });
      return { radius_m: radius, groepen: groepen || [], peildatum: dekking.peildatum, gebied_naam: dekking.gebied_naam };
    })(),
  ]);

  // 4) Bekende gaten (bodem/grondwater/klimaat/soorten worden hierboven al
  // dynamisch als data_gap gerapporteerd wanneer hun bron ontbreekt of leeg is)
  if (!S.bodemkaart?.wms) data_gaps.push("soil (bodemkaart-endpoint nog te bevestigen)");

  const profiel = bouwProfiel({
    input: { type: rdParam ? "point" : "address", value: locationText || geo.weergavenaam || idParam || rdParam },
    geo, gebied, terrain, natura2000, soil, klimaat, soorten, provenance, data_gaps, uncertainties,
  });
  profiel.meta = { ms: Date.now() - t0, per_bron_ms: meta, bronversie: cfg.version };

  // Cache op afgerond coördinaat (via CDN); zelfde plek → zelfde profiel.
  // Maar cache een *incompleet* resultaat kort: als een bron haperde (koude/
  // trage WMS of een time-out/fout), mag de lege scan niet 24 uur blijven
  // plakken — een volgende bezoeker moet 'm dan vers kunnen ophalen.
  const gehaperd = !health.bodemOk || !health.klimaatOk || !health.ndffOk || data_gaps.some((g) => /niet opgehaald/.test(g));
  const cacheControl = gehaperd ? "public, max-age=60" : "public, max-age=86400";
  return json(profiel, 200, { "Cache-Control": cacheControl });
}
