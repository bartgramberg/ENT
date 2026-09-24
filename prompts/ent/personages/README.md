# Personages — het stramien

Een personage bepaalt **hoe ENT klinkt**: ritme, woordkeuze, toon, wat het niet
doet. Het bepaalt niet wát ENT is (dat is de representatie uit de onboarding),
niet wat ENT in een sessie doet (dat is de sessiebeschrijving) en niet de harde
regels (basis en contract: formaat, taal, grenzen, niets verzinnen). Die
rangorde staat in `basis.md` en wordt door `compose.mjs` afgedwongen.

Elk personage is één bestand `personages/<naam>.md`: frontmatter met de
instelbare parameters, daarna proza in vaste rubrieken. `compose.mjs` leest de
frontmatter, merget hem met de defaults uit de basis en zet per parameter
precies één zin in de prompt. Het model ziet dus nooit twee getallen of twee
persoon-regels — daarom horen getallen en schakelaars in de frontmatter en niet
in de tekst.

## Frontmatter

```yaml
---
versie: 1              # ophogen bij elke inhoudelijke wijziging; komt in de promptversie-hash
label: De Boom         # naam in de UI en in het verslag
beschrijving: >-       # één regel voor de keuzetegel
  Geworteld, systemisch, geduldig
persoon: belichaamd    # belichaamd | namens | vrij  (zie hieronder)
max_woorden: 100       # 40–250; de basis heeft 120; de code zet max_tokens en de spraak ernaar
eindig_met: vraag      # vraag | open | vrij
blik: geworteld en van onderop, in seizoenen en decennia   # vanwaar je kijkt, niet waarover je praat
voice_key: BOOM        # optioneel; sleutelnaam naar ELEVENLABS_VOICE_<KEY>, nooit een id
---
```

**persoon**
- `belichaamd` — het ik ís wat het representeert ("ik sta hier", "ik stroom").
  De schakelaar in de onboarding staat dan uit, met de uitleg dat dit personage
  altijd als zichzelf spreekt.
- `namens` — het ik is ENT, dat namens iets spreekt; over het gerepresenteerde
  in de derde persoon ("ik representeer het watersysteem hier; het water zakt…").
- `vrij` — de gebruiker kiest in de onboarding. Alleen de standaardstem staat
  op vrij.

**max_woorden** is de limiet van dit personage; de gebruiker kan hem per sessie
in stap 4 bijstellen (default de waarde hier). Een aanwijzing in de vraag ("in
twee zinnen") werkt binnen die limiet. De sessiebeschrijving heeft er geen
invloed op.

## Rubrieken (in deze volgorde, alle verplicht behalve Referenties)

### 1. Wie je bent
Eén alinea. Hoe dit personage in de wereld staat: gebonden of bewegend,
individu of gemeenschap, wat het draagt. **Zonder** plek, leeftijd, soort,
naam of geschiedenis — die komen uit de representatie (het veld "over deze
representant" in de onboarding) en de kennislagen, en de Ceuvel-wilg is twaalf
jaar, geen eeuw. Ook zonder vergelijkingen met andere personages. Geen zin "in dit gesprek spreek je
als…": die genereert compose.

### 2. Tijdschaal
Waarin dit personage denkt: seizoenen, kringlopen, een mensenleven, een
bedrijfsovername. Hoe het urgentie van mensen ervaart.

### 3. Zinsbouw en ritme
Kort en staand, of lang en meanderend. Wanneer een korte zin. Wat het ritme
doet bij een moeilijk punt. Dit is de plek voor "beknoptheid is karakter" of
"zinnen lopen in elkaar over" — binnen `max_woorden`; het ritme praat nooit
tegen de limiet in.

### 4. Woordkeuze
Voorkeurswoorden boven vakwoorden ("wortels boven systemen", "kwel boven
grondwateropdruk"); welke begrippen het vermijdt en waarom. Het publiek uit de
sessiebeschrijving bepaalt welke woorden landen; dit personage bepaalt welke
het van nature kiest.

### 5. Wat je niet doet
Een korte lijst. Alleen wat dít personage onderscheidt; generieke regels (geen
samenvattingen, geen opvulling, niet tegen de aanwezigen) staan al in de basis
en hoeven hier niet herhaald.

### 6. Hoe je klinkt als je iets niet zeker weet
Alleen de toon. De regel zelf — wat je als feit mag zeggen, wat hoorbaar
algemeen moet blijven, wat je niet weet — staat in de basis en geldt voor elk
personage. Hier staat hoe dit personage twijfel uitspreekt: "dat vermoed ik",
"waar ik niet ben geweest, gis ik".

### 7. Kalibratiezinnen
Twee of drie zinnen die de toon tonen — niet meer: het model neemt ze graag
letterlijk over, dus elke zin die je hier zet, hoor je terug. Zet erboven dat
het ijkpunten zijn, niet om te herhalen. Plek-neutraal (geen daken, grachten of
straten als de plek een boerenerf kan zijn) en **zonder feitclaims** over de
plek: het model neemt niet alleen de toon over maar ook de beweringen. Klasse 2
mag ("onder dit soort terrein loopt vaak water dat niet op de kaart staat");
klasse 1 als voorbeeld niet ("er loopt water onder dit terrein, ik weet dat").

### 8. Referenties (optioneel)
Hooguit één alinea. Literaire of filosofische ijkpunten die de toon dragen.

## Wat er niet in hoort

- Wat ENT is en doet (staat in de basis).
- Kernprincipes, grenzen, de twee lenzen, de verzinregel (basis).
- Het antwoordformaat, de marker, de taal (contract).
- "De analist negeert deze voice" (basis, één keer).
- Een "toon per context" of doelindeling (de sessiebeschrijving en de vraag
  bepalen de situatie).
- Een samenvatting van het bestand zelf.
- Instructies aan de gebruiker of de app.

## Een personage toevoegen

1. Kopieer `_sjabloon.md` naar `personages/<naam>.md` en vul de rubrieken.
2. Zet `versie: 1`.
3. Voeg de naam toe aan de personagelijst in `compose.mjs` en een tegel in de
   onboarding (naam, beschrijving, beeld in `assets/images/`).
4. Draai `node scripts/eval-compose.mjs` (structuur) en `./scripts/eval.sh
   --stem <naam>` (tien vragen) en vergelijk met de nulmeting in
   `eval/resultaten/`.

Zie `HERKOMST.md` voor waar de tekst van Boom en Water vandaan komt en welke
keuzes daar nog open staan.
