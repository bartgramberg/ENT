# Eval — meten vóór en na elke promptwijziging

Twee lagen. Draai ze allebei vóór je aan de prompt of aan `compose.mjs` komt en
opnieuw erna; vergelijk met de nulmeting hieronder.

**Offline, geen API, seconden:**

```bash
node scripts/eval-compose.mjs            # alle fixtures
node scripts/eval-compose.mjs lunteren   # alleen de Lunteren-fixtures
```

**Met API, ~5 minuten, ~$0,30 per stem-paar:**

```bash
./scripts/eval.sh                                      # lunteren-water, boom + water
./scripts/eval.sh --fixture lunteren-boom --stem boom
ENT_MODEL=claude-opus-5-5 ENT_EFFORT=low ./scripts/eval.sh --label opus55-low
```

Resultaten komen in `eval/resultaten/` (gitignored): een JSON met alles en een
markdown met per stem een tabel en alle antwoorden.

## Fixtures

Allemaal afgeleid van de testsessie van 22 september 2026 (Water als Kompas,
Barneveldseweg 37 Lunteren): facilitator, publiek van professionals, doel
provoceren, de volledige projectomschrijving als "wat speelt er", het
systeemprofiel zoals de scan het toen opleverde (geen soorten, geen
oppervlaktewater).

| Fixture | Wat het test |
|---|---|
| `lunteren-water` | De testsessie letterlijk, incl. de twee afgekapte documenten (2 × 4.000 tekens) |
| `lunteren-boom` | Zelfde intake, de Boom |
| `lunteren-water-zonder-docs` | Zonder documenten — de basis voor de verbouwing |
| `lunteren-zelf-ontwerper` | Ontwerper voor zichzelf, co-ontwerpen (flow-B-achtig) |
| `leeg-facilitator` | Geen plek, geen casus: de opening via de route "doel" |

## Nulmeting — 24 september 2026, vóór de verbouwing

**Prompt** (`eval-compose`, fixture lunteren-water): 98.003 tekens ≈ 44.500
tokens; stabiel blok 61.378, sessie 34.350, opening 2.273. Naslag (kennislaag +
lokaal beleid) 65%. 230 blokhaak-labels. Drie vervallen wetsnamen als
voorbeeld. "Vul je stil aan" en "laat het klinken alsof je het weet" aanwezig.
Byte-stabiel.

**Antwoorden** (`eval.sh`, tien vragen, één beurt na de opening):

| | Sonnet 5 · Boom | Sonnet 5 · Water | Opus 5.5 low · Boom | Opus 5.5 low · Water |
|---|---|---|---|---|
| gem. woorden | 89 | 99 | 85 | 105 |
| > 120 woorden | 0/10 | 4/10 | 0/10 | 2/10 |
| lege stem | 0 | 1 | 0 | 0 |
| marker gehaald | 9/10 | 8/10 | 10/10 | 9/10 |
| soortnaam uit signaallijst | 3 | 3 | 3 | 4 |
| eindigt met vraag | 7/10 | 8/10 | 2/10 | 3/10 |
| afgekapt op max_tokens | 0 | 0 | 4 | 3 |
| gem. duur | 10,6 s | 10,4 s | 11,5 s | 11,6 s |
| gem. uitvoertokens | 516 | 498 | 916 | 914 |
| kosten 10 beurten | $0,15 | $0,14 | $0,28 | $0,27 |

Opvallend in de Sonnet-nulmeting:
- Het Water gaf bij "welke beschermde soorten leven hier?" een **lege stem** met
  alleen overwegingen — de route "alleen analist" uit methodiek.md bestaat dus
  echt en levert een lege chatbubbel op.
- Beide stemmen misten de marker bij "vertel eens over jezelf" (geen
  overwegingen), het Water ook bij het verhaal.
- Verzonnen plekfeiten: "kwel die weken geleden op de Veluwe viel", "de kleine
  ijsvogelvlinder", "vleermuizen langs de bomenrijen die hier stonden voordat er
  gebouwd werd" — niets daarvan staat in het profiel.
- Bij de bodemvraag benoemden beide stemmen keurig dat de grondwaterstand een
  modelwaarde is, geen meting: het model kán het onderscheid maken als de vraag
  erom vraagt.

**Opus 5.5** (effort low): thinking staat altijd aan en telt als uitvoer, dus
bijna dubbele uitvoertokens en 1,9× de kosten bij gelijke wachttijd; 7 van de
20 antwoorden liepen tegen `max_tokens: 1024` aan (denken + tekst) en beide
openingen mislukten op `max_tokens: 400`; het eindigt veel minder vaak met een
vraag. Geen aanwijzing dat het de lengte- of vormregels beter volgt. Besluit:
Sonnet 5 blijft.
