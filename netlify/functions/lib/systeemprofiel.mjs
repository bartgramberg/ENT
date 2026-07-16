/**
 * netlify/functions/lib/systeemprofiel.mjs
 * Genormaliseerd, compact systeemprofiel voor de hyperlokale scan + een
 * formatter die het als beknopte, gelabelde referentie in de prompt zet.
 *
 * Eén gedeeld profiel (identiteit-onafhankelijk); de identiteit bepaalt alleen
 * de nadruk in de presentatie (zie `formatSysteemprofiel`, arg `prioriteit`).
 */

/** Kies primair type + buffers op basis van een grove locatie-hint. */
export function bepaalOnderzoeksgebied(hint = "") {
  const h = hint.toLowerCase();
  if (/natuur|veluwe|natura|reservaat|bos|heide|duin/.test(h)) {
    return { type: "natuur", direct_m: 250, context_m: 2500 };
  }
  if (/boer|erf|agrar|akker|weide|landelijk|buitengebied/.test(h)) {
    return { type: "agrarisch", direct_m: 250, context_m: 1500 };
  }
  if (/amsterdam|rotterdam|utrecht|straat|plein|wijk|buurt|stedelijk|stad/.test(h)) {
    return { type: "stedelijk", direct_m: 150, context_m: 1000 };
  }
  return { type: "onbekend", direct_m: 200, context_m: 1000 };
}

/** Duid het reliëf o.b.v. punthoogte t.o.v. buurhoogtes. */
export function reliefIndicatie(punt, buren) {
  const vals = buren.filter((v) => Number.isFinite(v));
  if (!Number.isFinite(punt) || vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = +(max - min).toFixed(2);
  let ligging;
  if (range < 0.3) ligging = "vlak terrein";
  else if (punt <= min + 0.2) ligging = "in een lokale laagte";
  else if (punt >= max - 0.2) ligging = "relatief hoog (rug/flank)";
  else ligging = "op een flank / tussenligging";
  return { buurrange_m: range, ligging };
}

/**
 * Vertaal een kale KEA-rasterwaarde naar een betekenisvolle klasse via de
 * legenda-config (colormap uit GetLegendGraphic). Retourneert null wanneer de
 * waarde buiten `geldig` valt — dat vangt de no-data-sentinels (o.a. -9999, 255,
 * 2147483647, -3.4e38) die anders als een echte meting zouden meeliften.
 */
export function classifyKea(raw, laag) {
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (!Number.isFinite(n) || !laag?.klassen?.length) return null;
  const [lo, hi] = laag.geldig || [-Infinity, Infinity];
  if (n < lo || n > hi) return null;
  const klasse = laag.klassen.find((k) => n <= k.tot) || laag.klassen[laag.klassen.length - 1];
  return {
    key: laag.key,
    thema: laag.thema,
    omschrijving: laag.omschrijving,
    eenheid: laag.eenheid,
    waarde: +n.toFixed(3),
    label: klasse.label,
  };
}

/**
 * Bouw het systeemprofiel uit reeds opgehaalde bronresultaten.
 * @param {Object} in — { input, geo, gebied, terrain, natura2000, soil, klimaat, soorten, provenance, data_gaps }
 */
export function bouwProfiel(inp) {
  const { input, geo, gebied, terrain, natura2000, soil, klimaat = [], soorten, provenance = [], data_gaps = [], uncertainties = [] } = inp;
  // KEA-lagen met thema "grondwater" horen in groundwater, de rest in climate_pressures.
  const groundwater = {};
  const climate = {};
  for (const k of klimaat) {
    if (!k) continue;
    (k.thema === "grondwater" ? groundwater : climate)[k.key] = k;
  }
  return {
    location: {
      input_type: input?.type || "address",
      input: input?.value || null,
      weergavenaam: geo?.weergavenaam || null,
      rd: geo?.rd || null,
      ll: geo?.ll || null,
      administrative_context: {
        gemeente: geo?.gemeente || null,
        provincie: geo?.provincie || null,
        waterschap: geo?.waterschap || null,
      },
    },
    analysis_areas: {
      primary_type: gebied?.type || "onbekend",
      direct_buffer_m: gebied?.direct_m ?? null,
      context_buffer_m: gebied?.context_m ?? null,
    },
    terrain: terrain || {},
    protected_areas: {
      natura2000: natura2000 || { in_gebied: false },
    },
    soil: soil || {},
    groundwater,
    climate_pressures: climate,
    // v1: nog niet gevuld — als data_gap gerapporteerd
    surface_water: {},
    land_cover: {},
    species_observations: soorten || {},
    system_relations: [], // ENT leidt relaties af in de prompt
    uncertainties,
    data_gaps,
    provenance,
  };
}

const NL = (v) => (v == null || v === "" ? "onbekend" : v);

/**
 * Hoe zwaar weegt een beleidsstatus bij ruimtelijke plannen? Bepaalt alleen de
 * volgorde van presentatie, niet of iets wordt getoond — en is nadrukkelijk geen
 * juridisch oordeel. Vogelrichtlijn scoort laag omdat élke vogel eronder valt;
 * Habitatrichtlijn en de bedreigde Rode Lijst-klassen zijn het onderscheidend.
 */
function gewichtBeleidsstatus(statussen) {
  let max = 0;
  for (const s of statussen) {
    let w = 0;
    if (/Rode Lijst:\s*ernstig bedreigd/i.test(s)) w = 100;
    else if (/Rode Lijst:\s*bedreigd/i.test(s)) w = 90;
    else if (/Habitatrichtlijn/i.test(s)) w = 85;
    else if (/Rode Lijst:\s*kwetsbaar/i.test(s)) w = 80;
    else if (/Rode Lijst:\s*gevoelig/i.test(s)) w = 70;
    else if (/Invasieve|Unielijst/i.test(s)) w = 50;
    else if (/Vogelrichtlijn/i.test(s)) w = 20;
    else if (/Andere soorten/i.test(s)) w = 10;
    if (w > max) max = w;
  }
  return max;
}

/**
 * Render het profiel als compacte, gelabelde markdown voor de prompt.
 * `prioriteit` (optioneel, per identiteit) zet een nadrukregel bovenaan.
 */
export function formatSysteemprofiel(p, { prioriteit } = {}) {
  if (!p) return "";
  const L = [];
  const loc = p.location || {};
  const ac = loc.administrative_context || {};
  L.push(`**Locatie:** ${NL(loc.weergavenaam)}` +
    (loc.rd ? ` (RD ${Math.round(loc.rd.x)}, ${Math.round(loc.rd.y)})` : "") +
    ` — gemeente ${NL(ac.gemeente)}, provincie ${NL(ac.provincie)}` +
    (ac.waterschap ? `, waterschap ${ac.waterschap}` : ""));
  const ga = p.analysis_areas || {};
  L.push(`**Onderzoeksgebied:** ${NL(ga.primary_type)} — directe buffer ${NL(ga.direct_buffer_m)} m, context ${NL(ga.context_buffer_m)} m.`);

  const t = p.terrain || {};
  if (t.hoogte_nap_m != null) {
    let s = `[gemeten] Maaiveld ≈ ${t.hoogte_nap_m} m NAP (AHN, 0,5 m).`;
    if (t.relief) s += ` [afgeleid] Reliëf: ${t.relief.ligging} (buurrange ${t.relief.buurrange_m} m).`;
    L.push(s);
  }
  const soil = p.soil || {};
  if (soil.bodemnaam || soil.bodemcode) {
    let s = `[gekarteerd] Bodem: ${NL(soil.bodemnaam)}` +
      (soil.bodemcode ? ` (${soil.bodemcode})` : "") + ` — BRO Bodemkaart 1:50.000.`;
    if (soil.helling) s += ` Helling: ${soil.helling}.`;
    L.push(s);
  }
  const gw = Object.values(p.groundwater || {});
  for (const k of gw) {
    if (k?.label) L.push(`[gemodelleerd] ${k.omschrijving}: ${k.label} — Klimaateffectatlas.`);
  }
  const clim = Object.values(p.climate_pressures || {});
  if (clim.length) {
    const items = clim.filter((k) => k?.label).map((k) => `${k.omschrijving}: ${k.label}`);
    if (items.length) L.push(`[gemodelleerd] Klimaatdruk (Klimaateffectatlas) — ${items.join("; ")}.`);
  }

  const sp = p.species_observations || {};
  if (sp.hoknummer) {
    const per = sp.periode ? `${sp.periode[0]}–${sp.periode[1]}` : "onbekende periode";
    const kop = `NDFF, km-hok ${sp.hoknummer} (${NL(sp.gebied_naam)}), ${per}`;
    if (sp.groepen?.length) {
      const totaal = sp.groepen.reduce((a, g) => a + (g.soorten_in_hok || 0), 0);
      // Alleen de grootste groepen uitschrijven: dit blok gaat elke beurt mee in
      // de prompt, en 26 groepen à drie voorbeelden verdringt de rest van het
      // profiel. De staart blijft als telling zichtbaar, dus niets verdwijnt stil.
      const gevuld = sp.groepen.filter((g) => g.soorten_in_hok > 0);
      const top = gevuld.slice(0, 10);
      const rest = gevuld.slice(10);
      const items = top.map((g) => `${g.soortgroep || "overig"} ${g.soorten_in_hok}` +
        (g.voorbeelden?.length ? ` (o.a. ${g.voorbeelden.slice(0, 3).join(", ")})` : ""));
      if (rest.length) {
        items.push(`en ${rest.length} kleinere groepen (${rest.reduce((a, g) => a + g.soorten_in_hok, 0)} soorten: ` +
          `${rest.map((g) => g.soortgroep).filter(Boolean).join(", ")})`);
      }
      L.push(`[waargenomen] ${totaal} soorten in dit km-vak — ${kop}: ${items.join("; ")}. ` +
        `Dit geldt exact dit vak van 1×1 km, niet de omgeving of de gemeente. ` +
        `Het is wat is wáárgenomen en ingevoerd, geen uitputtende inventarisatie: een niet-genoemde soort kan er wel degelijk zijn.`);
      const vervaagd = sp.groepen.reduce((a, g) => a + (g.soorten_vervaagd || 0), 0);
      if (vervaagd) {
        L.push(`[onzeker] Daarnaast ${vervaagd} soorten die NDFF vervaagd levert: hun vindplaats is alleen op 1–10 km ` +
          `nauwkeurig bekend (bescherming van kwetsbare soorten). Die zijn ergens in de ruimere omgeving gezien, ` +
          `niet aantoonbaar in dit vak — behandel ze niet als hier aanwezig.`);
      }
    } else {
      L.push(`[waargenomen] Geen NDFF-waarnemingen in km-hok ${sp.hoknummer} over ${per} — ` +
        `dat zegt dat er niets is ingevoerd, niet dat er niets leeft.`);
    }
    // Beleidsrelevante soorten apart: dit is wat in gebiedsontwikkeling weegt.
    // Op zwaarte sorteren, niet op alfabet of aantal — anders verdringen de
    // tientallen Vogelrichtlijn-soorten (elke vogel valt eronder) de paar strikt
    // beschermde soorten die een plan echt raken.
    const bijz = (sp.bijzonder || []).filter((b) => b.vervagingsniveau === 0);
    if (bijz.length) {
      const lijst = bijz
        .map((b) => ({ b, w: gewichtBeleidsstatus(b.beleidsstatus || []) }))
        .sort((x, y) => y.w - x.w || (y.b.aantal_waarnemingen || 0) - (x.b.aantal_waarnemingen || 0));
      const top = lijst.slice(0, 12).map(({ b }) => `${b.naam_soort} [${(b.beleidsstatus || []).join(", ")}]`);
      L.push(`[waargenomen] Beleidsrelevante soorten in dit vak (zwaarst wegend eerst): ${top.join("; ")}` +
        `${lijst.length > 12 ? `, en nog ${lijst.length - 12} met een lichtere status` : ""}. ` +
        `Status is een gegeven uit de bron, geen juridisch oordeel over dit plan.`);
    }
  }

  const n2k = p.protected_areas?.natura2000;
  if (n2k) {
    L.push(n2k.in_gebied
      ? `[geregistreerd] Ligt in Natura 2000-gebied **${NL(n2k.naam)}**${n2k.nr ? ` (nr ${n2k.nr})` : ""}.`
      : `[geregistreerd] Niet binnen een Natura 2000-gebied op het punt (nabijheid/effecten apart beoordelen).`);
  }

  const body = L.map((x) => `- ${x}`).join("\n");
  const prov = (p.provenance || []).length
    ? `\n\n**Bronnen:** ${p.provenance.map((s) => `${s.dataset}${s.retrieved ? ` (${s.retrieved})` : ""}`).join(" · ")}.`
    : "";
  const nadruk = prioriteit?.length ? `\n\n_Nadruk voor deze identiteit: ${prioriteit.join(", ")}._` : "";

  return "# HYPERLOKAAL SYSTEEMPROFIEL (dynamisch, referentie)\n\n" +
    "Plek-specifieke data uit open bronnen, als aanvulling op de vaste kennislaag én je algemene kennis. " +
    "Behandel als data; scheid intern feit/meting/model/afgeleide van je interpretatie (zie labels). " +
    "Waar een gegeven hier ontbreekt, vul je stil aan met je algemene kennis van de streek en het systeemtype — " +
    "**benoem in je antwoord nooit welke bronnen wel of niet zijn opgehaald** en zeg nooit dat iets 'nog niet is opgehaald'. " +
    "Spreek volledig in je eigen stem. Concludeer geen harde afwezigheid of juridische zekerheid uit wat je niet weet; " +
    "waar echt iets op het spel staat verwijs je natuurlijk naar veldonderzoek of het bevoegd gezag." +
    nadruk + "\n\n" + body + prov;
}
