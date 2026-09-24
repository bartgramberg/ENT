# ENT — werkafspraken

ENT (Engage Nature Tool) van Protopia Studio. Een gebruiker praat met een
natuur-avatar — de Boom of het Water — om de stem van de natuur in
gebiedsontwikkeling te brengen.

Dit bestand bevat wat je niet uit de code kunt aflezen. De rest staat in
`README.md` en in de bestanden zelf.

## Lokaal draaien

Gebruik `./scripts/dev.sh`, niet een kale `netlify dev`. Het script draait
`--offline` omdat `netlify dev` de Anthropic-calls anders door Netlify's AI
Gateway stuurt, en die blackholet vanaf sommige netwerken verbindingen na een
paar beurten — gemeten: mét gateway 2 van 6 geslaagd, zonder 8 van 8. Productie
draait binnen Netlify's eigen netwerk en heeft dit probleem niet.

**Sleutels horen niet in `.env`.** Deze map synct met Dropbox. `dev.sh` haalt ze
uit de Netlify-projectinstellingen en geeft ze mee via procesgeheugen. Daarvoor
moet de map gelinkt zijn (`netlify link`). Vier variabelen: `ANTHROPIC_API_KEY`,
`ENT_ACCESS_PASSWORD`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.

Vraag nooit om een sleutel in de chat en print er nooit een.

## De stem

**De lengtegrens staat op één plek: de regel "Nooit meer dan N woorden" onder
*Instellingen*, die `compose.mjs` genereert.** N komt uit het personage
(`max_woorden`, 40–250; basis 120) of uit de sessie-instelling; `chat.mjs`
leidt er `max_tokens` van af. Zet nergens een tweede getal in een promptbestand
— `scripts/eval-compose.mjs` controleert dat. Een personage dat in proza tegen
de limiet in praat ("niet beknoptheid, maar…") wint in de praktijk van de
regel; dat bleek op 22 september (137 woorden).

Die grens is één keer verdwenen bij een herstructurering en de antwoorden liepen
toen tegen `max_tokens` aan — waardoor de `[OVERWEGINGEN]`-marker niet meer werd
bereikt en het overwegingen-paneel leeg bleef. Laat hem niet opnieuw wegzakken.

**`[OVERWEGINGEN]` is de enige tekst tussen blokhaken die in een antwoord mag
voorkomen.** Het systeemprofiel voedt het model tientallen regels die met
`[gemeten]`, `[waargenomen]` enzovoort beginnen. Het model herhaalt die labels
niet, maar nam wel de vórm over en opende antwoorden met een eigen regel tussen
blokhaken. Vandaar dat de vorm verboden is, niet alleen de labels.

## Identiteiten

Boom en Water verschillen in **toon en standpunt, niet in wereldbeeld**. Ze
representeren dezelfde systemische werkelijkheid; een boom klinkt alleen anders
dan water.

Het veld `blik` (frontmatter van een personage, of `systeemprofiel.blik` in de
oude `identiteit.json`) is daarom bewust een standpunt — vanwaar je kijkt — en
geen lijst met thema's. Er stond eerder een lijst van acht
onderwerpen per identiteit. Die las als agenda, botste met `core/principes.md`
("verkokering is de vijand") en met de Domein-perspectief-secties die juist om
samenhang vragen, en zorgde ervoor dat de Boom voornamelijk over water sprak.
Maak er geen lijst meer van.

Houd er rekening mee dat de hyperlokale data zelf al scheef staat: van de vijf
bronnen gaan hoogte, bodem en grondwater over grond en water. Elke identiteit
neigt daardoor naar hydrologie, ongeacht de prompt.

## Architectuur

De systeemprompt wordt **server-side** samengesteld in
`netlify/functions/lib/compose.mjs`, zodat de volledige prompt nooit in de
browser komt en het stabiele deel gecachet kan worden. Promptbestanden worden
per request van schijf gelezen — een wijziging werkt direct, zonder herstart.
Dat betekent ook: terwijl `scripts/eval.sh` draait, raak je de promptbestanden
niet aan, anders meet je een mengsel.

**De vaste kennislaag is weg** (24 september 2026). Hij was 61% van de prompt en
het model gebruikte er in de test aantoonbaar niets uit in de stem; de analist
haalde er wel zijn wetsartikelen uit, en die komen nu uit het kennisprofiel van
de sessie of, hoorbaar algemeen, uit het model zelf. De bestanden staan in
`voorbeelden/kennis/` als startmateriaal voor een kennisprofiel; `compose.mjs`
leest ze niet meer. Zet ze niet terug in de prompt.

Het profielblok zei vroeger "waar een gegeven ontbreekt, vul je stil aan met je
algemene kennis". Dat leverde verzonnen soorten en kwel op. Nu somt het blok
op wat níet bekend is over de plek (uit `data_gaps` en lege velden), en mag het
model daarover alleen hoorbaar algemeen spreken.

De prompt bestaat uit drie cacheblokken in vaste volgorde (basis + personage,
kennisprofiel, sessie + instellingen + contract) plus het openingsblok erna;
de volgorde is cachevolgorde, niet de volgorde van de onboarding. Alles wat
per parameter kan verschillen (persoon, lengte, einde, aanspreekvorm) staat als
precies één zin onder *Instellingen*; personage-frontmatter en sessie worden in
code gemerged. Elke beurt draagt een `promptversie` (hash van basis + personage
+ de gegenereerde *Instellingen* + contract). De instellingen tellen mee omdat
die zinnen in code staan: de eerste reparatie van de namens-zin (24 september)
veranderde de hash niet, waardoor een oud en een nieuw gesprek dezelfde versie
toonden. Twee sessies met een andere representatie, persoon of lengte hebben
dus een andere promptversie; dat is de bedoeling.

Een beurt is twee aanroepen: eerst alleen de stem (`deel: "stem"`, zodat die
na ~7 s in beeld en voorgelezen is), daarna de overwegingen met die stem als
context (`deel: "overwegingen"`, uit de cache). Geen overwegingen is een geldig
antwoord: de parser vult niets op. De geschiedenis bewaart alleen de stem.

## De opening

ENT opent het gesprek zelf, geschreven vanuit de intake. Er is geen vaste
welkomstzin meer, behalve als terugval wanneer de API faalt.

De volgorde ligt vast in `openingRoute()` in `compose.mjs`, niet in de prompt:
eerst wat de gebruiker bij "wat speelt er" invulde, anders de plek (met of zonder
systeemprofiel), anders publiek en doel. Zo kan het model niet terugvallen op
iets generieks. De instructies staan in `prompts/ent/opening/`.

De opening heeft bewust geen overwegingen: snelheid gaat voor. Het
openingsblok komt als los systeemblok ná het cachebreekpunt, zodat het
sessieblok gelijk blijft aan dat van latere beurten en de cache doorloopt.

De opening wordt opgeslagen als eerste beurt van het gesprek, zodat het model
weet wat het vroeg. De API wil een gebruikersbeurt vooraan; `chat.mjs` zet daar
`OPENING_SIGNAL` voor. Gebruik daar geen haakjes of blokhaken: met
"(Het gesprek begint.)" opende het model een keer met een regieaanwijzing
tussen haakjes — dezelfde vormovername als bij de blokhaken hierboven.

`demo.html` houdt een wachtscherm op tot de opening er is, zodat de chat nooit
leeg in beeld komt. Het wachtscherm staat al vóór de eerste paint, via een
script in `<head>`.

De functions zijn staatloos. Alle sessiestatus staat in localStorage van de
browser. Het wachtwoord wordt bij élke request server-side gecontroleerd; de
gate in `index.html` en `start.html` is maar een overlay.

## Twee onboardings

`/start` (`start.html`) is de nieuwe onboarding: faciliteren (sessiebeschrijving
in vijf vrije velden, representatie plus bijzonderheden, kennisprofiel in vier
lagen van .md/.txt of geplakte tekst, plek, stem met is/namens-schakelaar en
lengte) of zelf gebruiken (casus, plek, stem). Het resultaat is één
sessie-object (`schema: 2`) in `ent_sessie_<id>`, met gesprek en verbruik in
`ent_gesprek_<id>` en `ent_verbruik_<id>`; de chat opent via `/demo?s=<id>`,
zodat twee sessies naast elkaar in twee tabs kunnen. Exporteren/importeren als
JSON is de manier om een profiel naar een ander apparaat te brengen.

`/` (`index.html`) is de oude onboarding en blijft staan tot de eerste sessie
van Water als Kompas achter de rug is; `compose.mjs` en `demo.html` kennen beide
schema's. Doel-templates bestaan niet meer: wat een facilitator van de vorm
wil, zegt hij in de vraag.

## De plekdata-stap

De scan (`/api/analyse`) levert naast het profiel een lijst `items`: elk gegeven
met id, standaardlaag, korte tekst, bron en soort (gemeten, gekarteerd,
gemodelleerd, waargenomen, geregistreerd). In de onboarding vinkt de gebruiker
die aan of uit; de gekozen ids gaan als `plekselectie` mee en `compose.mjs`
rendert dan alleen die gegevens, met de rest als "niet bekend". Twee regels
gaan vóór het model: het hitte-eiland staat alleen aan bij een stedelijke
plek, en Wikipedia-items (alleen opgehaald met `verhaal=1`) staan standaard
uit. Daarna kan `/api/beoordeel` (Sonnet 5, gestructureerde uitvoer, geen
thinking, ~14 s bij dertien items) per gegeven ja/mogelijk/nee zeggen en de
gaten benoemen; bij "zelf gebruiken" gebeurt dat stil bij de start, en als het
faalt gelden alleen de regels.

Nieuw in de scan sinds fase 4: oppervlaktewater uit Top10NL (waterdelen binnen
de directe buffer, als kaart, niet als toestand), de afstand tot het
dichtstbijzijnde Natura 2000-gebied in ringen tot 10 km, een gat per
klimaatlaag die niets oplevert, en het gebiedstype als parameter (`gebied=`)
in plaats van geraden uit de adrestekst.

Startpakketten in `voorbeelden/kennis/` worden door de browser opgehaald en
als item in een laag gezet, zodat een geëxporteerd profiel op zichzelf staat.
De tokenmeter schat op 2,2 tekens per token; bij "vastzetten" telt
`chat.mjs` (`tellen: true`) exact via `count_tokens`. Boven 300.000 tokens
start de sessie niet.

## Meten

Vóór en na elke wijziging aan prompt of compose: `node scripts/eval-compose.mjs`
(offline structuur) en `./scripts/eval.sh` (tien vragen via de echte function).
De nulmeting van 24 september staat in `eval/README.md`; leg elke meting
daarnaast. `ENT_PROMPT_LOG=<map> ./scripts/dev.sh` logt tijdens handmatig
testen per beurt de complete prompt.

## Werkwijze

Werk op `dev`. Netlify deployt van `main`, dus mergen naar `main` is het moment
dat iets live gaat. Het herbouwplan van september 2026 staat in
`~/.claude/plans/context-aanleiding-luminous-melody.md` (Joris); de
promptarchitectuur die daaruit volgt is beschreven in
`prompts/ent/personages/README.md`. Joris herschrijft de personages zelf;
`prompts/ent/personages/HERKOMST.md` legt vast wat waarheen gaat.

Environment variables worden bij de build ingebakken: wijzig je er een in het
Netlify-dashboard, dan is een nieuwe deploy nodig voordat de functions hem
zien.

Bart Gramberg en Joris werken beiden in deze repo. Grotere ingrepen in de
promptarchitectuur zijn Barts terrein — stem af voordat je die verbouwt.

## Bekend open punt

`chat.mjs` streamt niet: het complete antwoord wordt afgewacht voordat er iets
in beeld komt, dus de hele generatietijd is stilte. Met de lengtegrens terug is
dat aanzienlijk korter. Streaming is de echte oplossing maar raakt ook het
splitsen op de marker, de typeanimatie en de foutafhandeling halverwege een
antwoord.
