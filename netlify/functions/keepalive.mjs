/**
 * netlify/functions/keepalive.mjs
 * Houdt het gratis Supabase-project van de NDFF-laag wakker. Supabase pauzeert
 * een gratis project na 7 dagen zonder activiteit; daarna levert de scan voor
 * soorten alleen nog een data_gap op. Deze functie doet twee keer per week een
 * echte RPC-query, zodat het nooit zo ver komt.
 *
 * Twee keer per week, niet één: een wekelijkse run zit precies op de grens van
 * 7 dagen en één gemiste run is dan al een pauze. pg_cron in Supabase zelf
 * helpt niet (interne activiteit telt niet), en een GitHub Actions-cron valt
 * stil na 60 dagen zonder commits.
 *
 * Scheduled functions draaien alleen op de productie-deploy (`main`). Een
 * project dat al gepauzeerd is, maakt deze functie niet wakker; dat herstel je
 * in het Supabase-dashboard.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ndffDekking } from "./lib/ndff.mjs";

export const config = { schedule: "17 6 * * 1,4" }; // ma en do, 06:17 UTC

function resolveRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../netlify/functions
  for (const base of [process.cwd(), path.resolve(here, "../.."), path.resolve(here, "..")]) {
    if (existsSync(path.join(base, "data", "bronnen.json"))) return base;
  }
  return process.cwd();
}

export default async function handler() {
  const bronnen = JSON.parse(await readFile(path.join(resolveRoot(), "data", "bronnen.json"), "utf8"));
  const cfg = bronnen.sources?.ndff;
  if (!cfg?.url || !cfg?.anonKey) throw new Error("keepalive: NDFF-laag niet geconfigureerd in data/bronnen.json");

  // Een willekeurig RD-punt (Amersfoort, de oorsprong van het stelsel): of het
  // km-hok gedekt is maakt niet uit, het gaat om de query zelf.
  const t = Date.now();
  try {
    await ndffDekking(cfg, { x: 155000, y: 463000 }, { timeoutMs: 10000 });
  } catch (err) {
    console.error(`keepalive: Supabase niet bereikt (${err.message})`);
    throw err;
  }
  console.log(`keepalive: ok (${Date.now() - t} ms)`);
  return new Response("ok");
}
