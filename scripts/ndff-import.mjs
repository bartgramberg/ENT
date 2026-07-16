#!/usr/bin/env node
/**
 * scripts/ndff-import.mjs
 *
 * Importeert een CSV-export uit de NDFF Flora & Fauna Verkenner in de
 * ndff_hok/ndff_soort-tabellen. NDFF heeft geen live query-API en geen
 * landelijke bulk-dump, dus elk pilotgebied komt via zo'n handmatige export
 * binnen: florafaunaverkenner.nl → hok(ken) selecteren → downloaden als CSV.
 *
 * Gebruik:
 *   node scripts/ndff-import.mjs export.csv [meer.csv ...]
 *
 * Vereist in .env (lokaal, gitignored — nooit committen):
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY=<service role key>
 *
 * De service-key is nodig omdat row-level security de tabellen dichthoudt: de
 * app leest alleen via de geaggregeerde RPC's en heeft géén schrijfrechten.
 * Deze sleutel hoort alleen op je eigen machine, niet in de app of in Netlify.
 *
 * De gebiedsnaam per hok wordt afgeleid via de PDOK Locatieserver (reverse
 * geocode op het hokmidden), zodat je 'm niet handmatig hoeft mee te geven.
 *
 * Exportformaat (4 regels metadata, lege regel, dan de kolomkoppen):
 *   Deze export is aangemaakt op 16-07-26 14:53
 *   Gevraagde hokken: 155 - 460
 *   Gevraagde hok grootte: 1x1km
 *   Gevraagde periode: 2022-2026
 *
 *   Hoknummer,Soortgroep,Naam soort,Wetenschappelijke naam,Beleidsstatus,Vervagingsniveau,Aantal waarnemingen
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimale .env-lezer; geen dependency nodig voor twee regels. */
async function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

/** Minimale RFC4180-parser: de export quote velden die komma's bevatten. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "16-07-26 14:53" (dd-mm-yy) → "2026-07-16" */
function exportDatum(regel) {
  const m = /(\d{2})-(\d{2})-(\d{2})/.exec(regel);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : new Date().toISOString().slice(0, 10);
}

/** "155 - 460" → km-coördinaat van de zuidwesthoek in RD-meters. */
function hokOorsprong(hoknummer) {
  const [kx, ky] = hoknummer.split("-").map((s) => parseInt(s.trim(), 10));
  return { x: kx * 1000, y: ky * 1000 };
}

/** Het 1x1 km-vlak als WKT-polygoon. */
function hokWkt(hoknummer) {
  const { x, y } = hokOorsprong(hoknummer);
  const p = [[x, y], [x + 1000, y], [x + 1000, y + 1000], [x, y + 1000], [x, y]];
  return `SRID=28992;POLYGON((${p.map(([a, b]) => `${a} ${b}`).join(",")}))`;
}

/** Plaatsnaam bij het midden van een hok, via PDOK reverse geocode. */
async function gebiedNaam(hoknummer) {
  const { x, y } = hokOorsprong(hoknummer);
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?X=${x + 500}&Y=${y + 500}&rows=1&fl=woonplaatsnaam,gemeentenaam`;
  try {
    const doc = (await (await fetch(url)).json())?.response?.docs?.[0];
    return doc?.woonplaatsnaam || doc?.gemeentenaam || `hok ${hoknummer}`;
  } catch {
    return `hok ${hoknummer}`;
  }
}

async function rest(cfg, pad, { method = "POST", body, headers = {} } = {}) {
  const res = await fetch(`${cfg.url}/rest/v1/${pad}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pad} → HTTP ${res.status}: ${await res.text()}`);
  const tekst = await res.text();
  return tekst ? JSON.parse(tekst) : null;
}

async function main() {
  await loadEnv();
  const cfg = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  if (!cfg.url || !cfg.key) {
    console.error("Zet SUPABASE_URL en SUPABASE_SERVICE_KEY in ENT/.env (zie .env.example).");
    process.exit(1);
  }
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("Gebruik: node scripts/ndff-import.mjs <export.csv> [...]");
    process.exit(1);
  }

  for (const file of files) {
    const text = (await readFile(file, "utf8")).replace(/^﻿/, "");
    const lines = text.split("\n");
    const datum = exportDatum(lines[0]);
    const periode = /(\d{4})\s*-\s*(\d{4})/.exec(lines[3]) || [null, "0", "0"];

    const rows = parseCsv(lines.slice(5).join("\n"));
    const head = rows.shift().map((h) => h.trim());
    const idx = Object.fromEntries(head.map((h, i) => [h, i]));

    const perHok = new Map();
    for (const r of rows) {
      const hok = (r[idx["Hoknummer"]] || "").trim();
      if (!hok) continue;
      if (!perHok.has(hok)) perHok.set(hok, []);
      perHok.get(hok).push(r);
    }

    for (const [hok, soorten] of perHok) {
      const naam = await gebiedNaam(hok);
      // Herimport van hetzelfde hok vervangt het oude; ndff_soort volgt via cascade.
      await rest(cfg, `ndff_hok?hoknummer=eq.${encodeURIComponent(hok)}`, { method: "DELETE" });
      const [rij] = await rest(cfg, "ndff_hok", {
        body: {
          hoknummer: hok, gebied_naam: naam, geom: hokWkt(hok),
          periode_start: +periode[1], periode_eind: +periode[2], export_datum: datum,
        },
        headers: { Prefer: "return=representation" },
      });

      const payload = soorten.map((r) => ({
        hok_id: rij.id,
        soortgroep: r[idx["Soortgroep"]] || null,
        naam_soort: r[idx["Naam soort"]],
        wetenschappelijke_naam: r[idx["Wetenschappelijke naam"]] || null,
        beleidsstatus: (r[idx["Beleidsstatus"]] || "").split("|").map((s) => s.trim()).filter(Boolean),
        vervagingsniveau: parseInt(r[idx["Vervagingsniveau"]] || "0", 10),
        aantal_waarnemingen: parseInt(r[idx["Aantal waarnemingen"]] || "0", 10),
      }));
      for (let i = 0; i < payload.length; i += 500) {
        await rest(cfg, "ndff_soort", { body: payload.slice(i, i + 500) });
      }
      console.log(`${hok} → ${naam}: ${payload.length} soorten (periode ${periode[1]}–${periode[2]}, export ${datum})`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
