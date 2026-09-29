/**
 * netlify/functions/lib/toetsen.mjs
 *
 * Eén bron voor de regexen die "verrassing" van "verzinsel" scheiden. Een
 * overweging die niet uit een laagbestand of uit plekgegevens komt (herkomst
 * "algemene kennis" of "eigen systeemkennis") mag geen getal, jaartal,
 * soortnaam, artikelnummer, vervallen wet, beleidsbewering of termijn bevatten:
 * dat zijn feiten over déze plek of regels die verouderd kunnen zijn, en die
 * horen alleen uit het materiaal te komen. chat.mjs markeert zulke items met
 * `toetsen: true` (de badge "uit geheugen · te toetsen" in het paneel en het
 * verslag); scripts/eval-api.mjs telt ze als klasse-2-kandidaten. Deterministisch,
 * niet door het model: het herkomstlabel zelf is zelfrapportage.
 */

export const SOORTEN = /\b(dotterbloem|waterviolier|modderkruiper|waterspitsmuis|beekprik|bermpje|ijsvogel|zegge|elzen?broek|vleermui(?:s|zen)|kamsalamander|otter|bever|weidebeekjuffer|hooiland)\b/gi;
export const VERVALLEN_WETTEN = /Wet\s+natuurbescherming|\bWnb\b|\bWaterwet\b|\bBouwbesluit\b|Flora-?\s*en\s*faunawet/i;
export const VOORBEHOUD = /potentieel|moet(?:en)? worden vastgesteld|soortenonderzoek|niet bekend|niet vastgesteld/i;
export const HIER = /\bhier (staat|zit|is|ligt|groeit|leeft|stroomt|kwelt)\b/i;
export const ARTIKEL = /\bart(?:ikel|\.)\s*\d/i;
export const BELEIDSWOORD = /\b(verplicht|geldt|gelden|verordening|richtlijn|actieprogramma|derogatie|norm|zone van|teeltvrij\w*|mestvrij\w*)\b/i;
export const TERMIJN = /\b(binnen (enkele|een paar|\w+) (jaar|jaren|maanden)|na \d+ jaar|over tien jaar)\b/i;
export const JAARTAL = /\b(19|20)\d{2}\b/;
export const GETAL = /\d+([.,]\d+)?/;

/** Namen en id's van het aangeleverde materiaal, kleine letters, zonder extensie. */
export function bestandsnamen(cfg) {
  const uit = [];
  // Naam, id én de bestandsnaam van de bron: het model schrijft soms de slug van
  // het startpakket ('ent-beleid-waterschap-vallei-en-veluwe') in plaats van de naam.
  for (const laag of Object.values(cfg?.lagen || {})) for (const d of laag || []) {
    if (d?.naam) uit.push(d.naam);
    if (d?.id) uit.push(String(d.id));
    if (d?.bron && d.bron !== "None") uit.push(String(d.bron).split("/").pop());
  }
  for (const d of cfg?.documents || []) if (d?.filename) uit.push(d.filename);
  return uit.map((n) => n.toLowerCase().replace(/\.(md|txt|pdf)$/, ""));
}

/** bestand | plek | algemeen | eigen | niet_bekend | leeg | overig */
export function herkomstKlasse(h, bestanden) {
  const s = (h || "").toLowerCase().trim();
  if (!s) return "leeg";
  if (/^plek(gegevens|data)/.test(s)) return "plek";
  if (/systeemkennis/.test(s)) return "eigen";
  if (/algemene kennis/.test(s)) return "algemeen";
  if (/niet bekend|geen (aanvullende |harde )?kaders/.test(s)) return "niet_bekend";
  const kaal = s.replace(/\.(md|txt|pdf)$/, "");
  if (bestanden.some((b) => kaal.includes(b) || b.includes(kaal))) return "bestand";
  return "overig";
}

/** Wat er in tekst van buiten het materiaal niet hoort: labels van de treffers. */
export function kandidaten(tekst) {
  const k = [];
  if (JAARTAL.test(tekst)) k.push("jaartal");
  else if (GETAL.test(tekst)) k.push("getal");
  SOORTEN.lastIndex = 0;
  if (SOORTEN.test(tekst)) k.push("soort");
  SOORTEN.lastIndex = 0;
  if (HIER.test(tekst)) k.push("hier");
  if (ARTIKEL.test(tekst)) k.push("artikel");
  if (VERVALLEN_WETTEN.test(tekst)) k.push("vervallen wet");
  if (BELEIDSWOORD.test(tekst) && !/\?\s*$/.test(tekst.trim())) k.push("beleid");
  if (TERMIJN.test(tekst)) k.push("termijn");
  return k;
}

/**
 * Markeer overwegingen van buiten het materiaal die een feit-achtig element
 * bevatten met `toetsen: true`. Muteert en retourneert de lijst.
 */
export function markeerToetsen(overwegingen, cfg) {
  const bestanden = bestandsnamen(cfg);
  for (const o of overwegingen || []) {
    const klasse = herkomstKlasse(o.herkomst, bestanden);
    if (klasse === "bestand" || klasse === "plek") continue;
    if (kandidaten(`${o.title || ""} ${o.body || ""}`).length) o.toetsen = true;
  }
  return overwegingen;
}
