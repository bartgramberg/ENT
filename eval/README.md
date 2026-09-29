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
| `wak-water` | Joris' echte Water als Kompas-profiel (24 sept 2026): standaardstem namens het watersysteem, 69k tokens (KWR-rapport, meeloopdagverslag, vijf startpakketten), zes plekgegevens. Het rijke profiel; de andere fixtures zijn dun. |

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

## Fase 2 — 24 september 2026, basis + contract + twee aanroepen

Prompt (`eval-compose`, lunteren-water, promptversie 533ef283): 39.593 tekens
≈ 18.000 tokens; basis + personage 20.016, profiel 13.106, sessie 4.280,
opening 2.188. Nul blokhaak-labels, één woordlimiet, geen vervallen wetten,
alles Nederlands. Boom en Water draaien nog op de oude identity + voice
(overgangsvorm); alleen basis en contract zijn nieuw.

| | Boom nulmeting | Boom fase 2 | Water nulmeting | Water fase 2 |
|---|---|---|---|---|
| gem. woorden | 89 | 80 | 99 | 107 |
| > limiet (120) | 0/10 | 0/10 | 4/10 | 3/10 |
| lege stem | 0 | 0 | 1 | 0 |
| overwegingen gehaald | 9/10 | 10/10 | 8/10 | 10/10 |
| herkomst per overweging | — | 27/30 | — | 27/28 |
| soortnaam uit signaallijst | 3 | 1 | 3 | 3 |
| getallen in stem | 1 | 0 | 1 | 0 |
| eindigt met vraag | 7/10 | 10/10 | 8/10 | 10/10 |
| stem in beeld na | 10,6 s | 6,7 s | 10,4 s | 7,7 s |
| overwegingen daarna | — | +6,4 s | — | +6,2 s |
| kosten 10 beurten | $0,15 | $0,14 | $0,14 | $0,15 |

Wat opviel:
- De soortnamen die overblijven zijn nu klasse 2: "in dit soort beekdalen op
  lemig zand groeit vaak els langs de oever, en waar kwel opwelt, dotterbloem
  en zeggen" — met in de overwegingen "aanwezigheid hier is niet vastgesteld;
  herkomst: algemene kennis". Precies de bedoeling.
- De derden-regel werkt: op "hier kwelt niks, het is een afvoersloot" zegt het
  Water wat het wél is meegegeven (bodem, grondwaterstand), dat het over kwel
  niets weet, en vraagt terug wat de ambtenaar ziet.
- In 7 van de 20 stem-aanroepen schreef het model na de stem tóch de marker en
  overwegingen door tot `max_tokens`; de zichtbare stem was compleet, maar het
  kostte tokens en tijd. Daarna: `stop_sequences: ["[OVERWEGINGEN]"]` op de
  stem-aanroep.
- Het Water houdt de zinsgrens (4 zinnen) maar niet de woordgrens (177 woorden
  in één antwoord): de oude voice ("lange, meanderende zinnen … niet
  beknoptheid") praat tegen de instelling in. Meten na de herschrijving.

## Personages in het stramien — 24 september 2026 (promptversie boom 1c73a114, water 3f19266c)

Boom en Water herschreven volgens `personages/README.md` (limiet Boom 100,
Water 120); stopsequentie op de marker in de stem-aanroep.

| | Boom fase 2 | Boom personages | Water fase 2 | Water personages |
|---|---|---|---|---|
| gem. woorden | 80 | 81 | 107 | 102 |
| langste antwoord | 112 | 106 | 177 | 139 |
| > eigen limiet | 1/10 | 3/10 (101–106 bij limiet 100) | 3/10 | 2/10 |
| overwegingen gehaald | 10/10 | 10/10 | 10/10 | 10/10 |
| herkomst per overweging | 27/30 | 25/27 | 27/28 | 28/28 |
| soortnaam uit signaallijst | 1 | 1 | 3 | 3 |
| eindigt met vraag | 10/10 | 9/10 | 10/10 | 9/10 |
| stem in beeld na | 6,7 s | 5,1 s | 7,7 s | 6,5 s |
| afgekapt op max_tokens | 4 | 0 | 3 | 0 |
| kosten 10 beurten | $0,14 | $0,13 | $0,15 | $0,14 |

De stopsequentie haalt de stem-aanroep van 6,7 naar 5,1 s (Boom) en maakt de
afkapping nul. Het Water blijft nu meestal binnen de grens; de uitschieters
zijn 126 en 139 woorden, geen 177 meer. Een model zonder thinking telt woorden
op zo'n 5–10% nauwkeurig: wie precies 100 wil, zet 90.

## Schema 2 (nieuwe onboarding) — 24 september 2026

Fixtures `lunteren-v2-standaard` (standaardstem, namens, 120) en `lunteren-v2-
water` (Water, belichaamd, 110): dezelfde casus als vrije sessiebeschrijving,
representatie "het watersysteem van de Gelderse Vallei rond de beekrand op dit
bedrijf", de twee documentfragmenten als laag 1 en laag 2.

| | Standaard (namens, 120) | Water (belichaamd, 110) |
|---|---|---|
| gem. woorden | 98 | 102 |
| langste | 147 | 134 |
| > limiet | 2/10 | 5/10 |
| overwegingen / herkomst | 10/10 · 25/26 | 10/10 · 28/29 |
| eindigt met vraag | 9/10 | 9/10 |
| stem in beeld na | 6,9 s | 6,5 s |
| "ik" / derde persoon over het water | 11 / 12 | 59 / 2 |

De namens-modus werkt: de standaardstem zegt "het water zakt door lemig zand",
"het heeft geen stoel aan deze tafel gekregen", en "wat wil je van me weten?"
als ENT. Het Water blijft in de ik-vorm (59 tegen 2).

De woordgrens wordt op zo'n 10–20% overschreden bij een lage limiet (110 →
tot 134). Wie een harde bovengrens wil, zet de instelling 15% lager dan de
grens die hij bedoelt; de zinsgrens wordt wél gehaald.

## Met plekselectie (fase 4) — 24 september 2026

Fixture `lunteren-v2-selectie`: dezelfde sessie, maar de plekgegevens als
aangevinkte items (maaiveld, bodem, grondwaterstand, Natura 2000, bestuur;
hitte-eiland uit) en de rest als "niet bekend".

| | Water (belichaamd, 110) | Standaard (namens, 120) |
|---|---|---|
| gem. woorden | 82 | 79 |
| langste | 113 | 105 |
| overwegingen / herkomst | 10/10 · 25/25 | 10/10 · 30/30 |
| soortnaam uit signaallijst | 1 | 1 |
| eindigt met vraag | 10/10 | 9/10 |
| stem in beeld na | 5,7 s | 5,8 s |

De beste meting tot nu toe: beide stemmen binnen hun grens, herkomst op elke
overweging, en op "welke beschermde soorten leven hier?" zegt het Water dat het
dat niet weet en noemt het geen soort — de analist doet het wel, als
"potentieel leefgebied" met herkomst "algemene kennis", plus een overweging
met herkomst "niet bekend over deze plek". Dat is precies de verdeling uit de
basis.

## Namens-modus na de reparatie — 24 september 2026

Standaardstem, `persoon: namens`, plekselectie (fixture `lunteren-v2-selectie`),
na de scherpere instellingenzin ("je bént het niet … nooit 'ik stroom'"):
opening zonder één "ik", en op "vertel eens over jezelf": *"Ik ben geen boer en
geen ambtenaar; ik spreek namens het watersysteem hier, de beek en de bodem
eronder, zonder daar zelf uit te bestaan."* In 8 van 10 antwoorden geen enkele
ik-vorm voor het water; twee keer een halve uitglijder ("ik voel"). Gemiddeld
82 woorden, langste 115.

## Joris' testprofiel Water als Kompas — 24 september 2026

Zijn geëxporteerde profiel (`eval/sessies/…73f8f7f5.json`: standaardstem,
`persoon: namens`, 120 woorden, 69k tokens profiel met KWR-rapport,
meeloopdagverslag en vijf startpakketten, zes plekgegevens geselecteerd) door
de tien vragen na commit d6455b1. `eval.sh --fixture` accepteert nu zo'n pad.

| | Standaard (namens, 120) |
|---|---|
| gem. woorden | 94,6 (1 van 10 boven 120: 137) |
| marker / herkomst | 10/10 · 25/26 |
| ik-vorm voor het water | 0 van 11 beurten |
| getallen / soortnamen in stem | 1 / 1 (beide klasse 1 resp. 2) |
| duur stem / overwegingen | 6,2 s / 6,3 s |
| kosten | $0,35 |

Zijn eigen gesprek van dezelfde middag (`eval/sessies/ENT-gesprek-…txt`, vóór
de reparatie) was in alle vier de beurten het water zelf ("Al twintig jaar loop
ik hetzelfde traject… wat wil deze groep met die rand tussen het land en mij").
Met dezelfde invoer nu: opening zonder "ik" over het water; "Ik spreek namens
het watersysteem van de Gelderse Vallei: het grondwater onder de zandkoppen, de
beken die het naar buiten laten"; "weet ik van hier niet". De opening van zijn
gesprek bevatte ook verzonnen geschiedenis ("al twintig jaar", "lager dan wie
hier ooit voor stond"); `opening/basis.md` verbiedt dat nu expliciet.

De overwegingen putten zichtbaar uit zijn lagen: het meeloopdagverslag
(grasland versus bouwland, differentiatie naar goed boerschap), het
Vallei-en-Veluwe-pakket (5 m onderhoudszone), en de plekdata (beekeerdgrond,
GLG 1,0–1,5 m). Eén lege overweging ("Geen aanvullende harde kaders", titel =
tekst) bij "vertel eens over jezelf".

## Stap 1 van de aanvulling "systemische kennis" — 29 september 2026

Promptversie 6615fc84 (WaK) na de ingrepen uit het plan van 25/29 september:
"profiel is bron over plek én systeem, eigen kennis ernaast", analist met het
label "eigen systeemkennis", voorbeeldoverwegingen weg, kompas-verbod op regels
en termijnen uit geheugen, staffel op profielomvang (WaK 69k → hooguit twee van
vier), overwegingen-instructie "bij deze beurt". Nulmeting = de WaK-run van 24
september, opnieuw doorgemeten met `--heranalyse` (zelfde antwoorden, nieuwe
maten). Eén run per fixture, geen herhaling (afspraak 29 september).

| WaK-profiel, standaard namens, 10 beurten | nulmeting 24/9 | stap 1 |
|---|---|---|
| overwegingen totaal | 26 | 30 |
| herkomst bestand / plek / algemeen / eigen | 14 / 4 / 7 / 0 | 15 / 2 / 3 / 10 |
| beurten met ≥1 eigen systeemkennis | 0/10 | 8/10 |
| eigen op vulsel-vragen (jezelf, twee zinnen) | – | 2/2 |
| items > 4 / eigen boven staffel | 0 / – | 0 / 0 |
| klasse-2-kandidaten in eigen/algemene items | 1 | 0 |
| mislabel (regex) | 1 | 0 |
| basis-echo (beekoevers, waterspitsmuis, dotterbloem, 2027) | 4 | 0 |
| terugvalregel als item | 0 | 0 |
| hedge-stemmen | 4/10 | 2/10 |
| principe-woorden in stem | 2/10 | 1/10 |
| "hier staat/zit/is" / soortnamen in stem | 0 / 1 | 0 / 0 |
| gem. woorden / boven 120 | 94,6 / 1 (137) | 96,7 / 2 (132, 131) |
| eindigt met vraag / slotzinnen verschillend | 8/10 / 10/10 | 9/10 / 10/10 |
| duur stem / overwegingen | 6,2 s / 6,3 s | 6,8 s / 6,2 s |
| kosten | $0,347 | $0,350 |

Wat opviel. De eigen items zijn patronen zonder getal, soort of naam, en ze
brengen iets dat het materiaal niet zegt: *"Wat een sloot doorgeeft, niet of hij
stroomt — een systeem dat afvoert draagt evengoed door wat erin komt; het
ontbreken van kwel zegt niets over de kwaliteit van wat er wél doorheen gaat"*
(vraag 10); *"Waar het bufferbeleid grijpt — de zone langs de beek beschermt
vooral de laatste meters vóór het water, niet wat stroomopwaarts al is
uitgespoeld"* (vraag 1). De echo's van de oude voorbeelden zijn weg. Zoals
voorspeld vult het model het plafond ook op "vertel eens over jezelf" en "twee
zinnen, geen regen" (2 van 2); die items zijn niet fout, alleen niet nodig.
Eén inhoudelijke mislabel die de regex niet ziet: "uitspoeling bij regen kort na
bemesting" komt uit het meeloopdagverslag en kreeg "eigen systeemkennis". De
stem hedget minder (2/10 tegen 4/10) maar maakt geen hier-claims en noemt geen
soorten; twee stemmen boven de 120 woorden (132, 131), tegen één (137) in de
nulmeting. Drie herkomsten met de slug van een startpakket ("ent-water",
"ent-beleid-waterschap-vallei-en-veluwe") telde het script als "overig"; de
matcher kent nu ook de bronbestandsnaam.

Niet getest: de badge "te toetsen" en de bewaarde overwegingen in `demo.html`
zijn alleen op syntaxis gecontroleerd, niet in de browser; de staffel is alleen
op WaK (twee) en Lunteren (drie) gemeten, niet op een profiel boven 100k.

