/**
 * netlify/functions/lib/plek.mjs
 *
 * Sociale en verhalende context van een plek, uit gratis open bronnen. Geodata
 * (bodem, water, soorten) vertelt wat er fysiek is; dit vertelt wat voor plek
 * het is voor mensen — de geschiedenis, de verhalen, hoe het gegroeid is.
 *
 * Bron: Wikipedia (nl.wikipedia.org), gratis en zonder sleutel:
 *  - geosearch op lat/lon → welke artikelen liggen rond deze plek (buurten,
 *    buitenplaatsen, natuurgebieden, forten, molens, historische kernen…).
 *    Dat is "begrip van de huidige plek" + de directe omgeving.
 *  - intro-extracts van die artikelen → Wikipedia-intro's dragen etymologie,
 *    ontstaan en waar een plek om bekend staat. Dat is "het verhaal van de plek".
 *
 * Bewust licht: één geosearch + één batch-extract, korte snippets, één timeout.
 * Dit is achtergrond voor de toon, geen harde data — de content is van derden
 * en wordt als referentie behandeld, niet als vaststaand feit.
 */

import { fetchWithTimeout } from "./geo.mjs";

const WIKI = "https://nl.wikipedia.org/w/api.php";

async function getJson(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Knip een extract tot de kern: max twee zinnen, en niet langer dan ~limiet. */
function beknopt(tekst, limit = 260) {
  if (!tekst) return "";
  let t = tekst.replace(/\s+/g, " ").trim();
  // Eerste twee zinnen (punt gevolgd door spatie + hoofdletter/cijfer).
  const zinnen = t.split(/(?<=\.)\s+(?=[A-ZÀ-Ý0-9])/);
  t = zinnen.slice(0, 2).join(" ");
  if (t.length > limit) t = t.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
  return t;
}

/**
 * Haal de plek-context op rond een WGS84-coördinaat.
 * @param {{lat:number, lon:number}} ll
 * @param {{ naam?: string, timeoutMs?: number, radius_m?: number, max?: number }} opts
 * @returns {Promise<{ omgeving: Array<{naam, afstand_m, tekst}> } | null>}
 */
export async function plekVerhaal(ll, { timeoutMs = 4000, radius_m = 10000, max = 6 } = {}) {
  if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) return null;

  // 1) Welke artikelen liggen rond deze plek? Gesorteerd op afstand.
  const geoUrl = `${WIKI}?${new URLSearchParams({
    action: "query", list: "geosearch", format: "json",
    gscoord: `${ll.lat}|${ll.lon}`,
    gsradius: String(Math.min(radius_m, 10000)), // API-max 10 km
    gslimit: "15",
  })}`;
  const geo = await getJson(geoUrl, { timeoutMs });
  const treffers = geo?.query?.geosearch || [];
  if (!treffers.length) return null;

  // Kies de dichtstbijzijnde, maar filter ruis (lijst-/categorie-/jaartalpagina's).
  const gekozen = treffers
    .filter((t) => t.title && !/^(Lijst van|Categorie:|\d{4})\b/.test(t.title))
    .slice(0, max);
  if (!gekozen.length) return null;

  // 2) Intro-extracts in één call (prop=extracts, exintro, platte tekst).
  const titels = gekozen.map((t) => t.title);
  const extUrl = `${WIKI}?${new URLSearchParams({
    action: "query", format: "json", prop: "extracts",
    exintro: "1", explaintext: "1", redirects: "1",
    titles: titels.join("|"),
  })}`;
  const ext = await getJson(extUrl, { timeoutMs });
  const pages = ext?.query?.pages || {};
  const extractByTitle = new Map();
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    if (p?.title && p?.extract) extractByTitle.set(p.title, p.extract);
  }

  const omgeving = gekozen
    .map((t) => ({
      naam: t.title,
      afstand_m: Math.round(t.dist),
      tekst: beknopt(extractByTitle.get(t.title) || ""),
    }))
    .filter((o) => o.tekst);

  return omgeving.length ? { omgeving } : null;
}
