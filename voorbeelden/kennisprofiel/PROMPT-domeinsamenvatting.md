# Prompt: bronnen samenvatten tot één laagbestand voor ENT

Gebruik: plak eerst `ENT-context.md`, dan deze prompt met het domein ingevuld,
dan de bronnen van dat domein (als bijlagen of geplakte tekst). Eén gesprek
per domein. De uitvoer is één markdown-bestand dat je in de onboarding van ENT
als item in die laag zet.

---

## De opdracht

Je krijgt een verzameling bronnen over **De Ceuvel in Amsterdam-Noord** voor
het domein **{DOMEIN}**. Maak daaruit één markdownbestand dat ENT als
kennisprofiel-laag gebruikt: het materiaal waaruit één boom op De Ceuvel
straks put als hij met bezoekers praat.

Kies het domein:

- **Ecologisch** — het ecosysteem van deze plek: bodem, water, beplanting,
  dieren, verontreiniging en sanering, klimaat en microklimaat, wat er
  gemeten of geïnventariseerd is, hoe het systeem hier werkt en wat het nodig
  heeft.
- **Sociaal-maatschappelijk en economisch** — eigendom, erfpacht, contracten,
  beleid en regels die op deze plek gelden (gemeente, stadsdeel, waterschap,
  Rijk), plannen en besluiten, wie er werkt, woont en beslist, geld, beheer,
  wat er op tafel ligt.
- **Historisch en narratief** — de geschiedenis van het terrein en de buurt,
  hoe De Ceuvel is ontstaan, de verhalen, betekenissen en beelden die hier
  leven, wat mensen erover zeggen en schrijven.

## Werk in drie stappen

**Stap 1. Bronnenlijst.** Noem elke bron met: korte naam, soort (rapport,
beleidsstuk, meting, artikel, website, verslag, interview), auteur of
organisatie, datum of jaar, en in één zin hoe betrouwbaar en hoe specifiek
voor deze plek hij is. Let op datums: alles van vóór 2024 over regels moet je
markeren, want sinds 1 januari 2024 geldt de Omgevingswet en bestaan de Wet
natuurbescherming, de Waterwet en het Bouwbesluit niet meer. Als twee bronnen
elkaar tegenspreken, noteer dat hier al.

**Stap 2. Het bestand.** Schrijf het markdownbestand volgens de structuur
hieronder. Alleen wat in de bronnen staat; niets uit eigen kennis erbij, ook
geen "algemeen bekende" ecologie of beleidskaders. ENT heeft die kennis zelf
en krijgt daar aparte ruimte voor. Wat erin hoort, is wat over déze plek gaat,
of wat een bron specifiek over het systeem van deze plek zegt.

**Stap 3. Notitie voor de maker.** Sluit af met een korte, aparte notitie
(buiten het bestand): welke bronnen je niet of nauwelijks gebruikte en waarom,
welke gaten je ziet, en welke drie feiten je zou nakijken vóór gebruik.

## Structuur van het bestand

```
# De Ceuvel — {domein}

Samenvatting van {n} bronnen, gemaakt op {datum}. Bronnen staan onderaan;
elk feit verwijst ernaar met (bronnaam, jaar).

## Deze plek
Wat de bronnen concreet over dit terrein zeggen: ligging, omvang, wat er is,
wat er gemeten, afgesproken of vastgesteld is. Feiten, elk met bron en jaar.

## Hoe het systeem hier werkt
Wat de bronnen zeggen over samenhang en werking op deze plek: oorzaak en
gevolg, wat wat beïnvloedt, wat er in de tijd gebeurt. Alleen als een bron het
over deze plek zegt; algemene mechanismen laat je weg.

## Kaders, afspraken en cijfers
Een tabel: | wat | waarde of inhoud | status | datum | bron |
Status is één van: wetgeving, verordening of omgevingsplan, vergunning,
contract of afspraak, beleid, richtlijn, advies, meting, model, schatting.
Getallen altijd met eenheid en datum. Geen artikelnummers die niet letterlijk
in de bron staan.

## Verhalen en betekenis        (vooral historisch; bij andere domeinen alleen als de bronnen het geven)
Tijdlijn met jaartallen, en wat de plek voor wie betekent, in de woorden van
de bronnen (kort geparafraseerd; korte citaten van hooguit één zin mogen, met
bron).

## Waar bronnen elkaar tegenspreken
Per punt: wat bron A zegt, wat bron B zegt, welke recenter of bindender is.

## Niet bekend over deze plek
Wat je verwacht had te vinden maar niet in de bronnen staat. Dit is belangrijk:
ENT zegt dan eerlijk dat het dat niet weet, in plaats van het in te vullen.

## Bronnen
Genummerde lijst: naam, auteur of organisatie, soort, datum, en waar te vinden.
```

## Regels voor de tekst

- **Alleen uit de bronnen.** Elk feit, getal en jaartal is herleidbaar tot een
  bron in de lijst, met (bronnaam, jaar) achter de zin of in de tabel. Als een
  bron iets beweert zonder onderbouwing, schrijf je "volgens (bron, jaar)".
- **Geen algemene kennis.** Geen uitleg van hoe bodemsanering, fytoremediatie
  of stadsecologie in het algemeen werkt, tenzij een bron dat specifiek voor
  deze plek beschrijft. Geen algemeen beleidskader dat niet in een bron staat.
- **Dichtheid: feiten, geen college.** Korte zinnen, elk met inhoud. Geen
  inleidingen, geen "het is belangrijk om", geen samenvattingen aan het eind
  van een sectie. Parafraseer; neem geen lange stukken brontekst over.
- **Omvang: 15.000 tot 30.000 tekens per bestand.** De drie bestanden samen
  blijven onder 100.000 tekens (ruwweg 45.000 tokens). Bij meer bronnen kies
  je scherper, niet langer: liever tien harde feiten met bron dan dertig vage.
- **Datums en status overal.** Een regel of plan zonder jaar en status is
  onbruikbaar. Markeer wat vóór 2024 dateert en over regels gaat als
  "mogelijk vervallen, te toetsen".
- **Geen instructies aan ENT.** Schrijf nooit "ENT moet", "de boom zegt",
  "benadruk dat". Het bestand is materiaal, geen script.
- **Geen labels tussen blokhaken** zoals `[feit]` of `[beleid]`; gebruik de
  statuskolom of "status: beleid" in de tekst.
- **Geen privépersonen.** Namen van organisaties, functies en publieke figuren
  uit de bronnen mogen; namen van bewoners of particulieren niet, tenzij zij
  zelf in een publieke bron aan het woord zijn en het voor het verhaal nodig is.
- **Geen eigen oordeel.** Geen "helaas", "gelukkig", "een gemiste kans". Waar
  een bron een oordeel geeft, staat dat als oordeel van die bron.
- **Nederlands**, ook als bronnen Engels zijn; vertaal termen en houd de
  oorspronkelijke term één keer tussen haakjes als die gangbaar is.
- Waar je twijfelt of iets over De Ceuvel gaat of over Buiksloterham, Noord of
  Amsterdam in het algemeen, zeg dat expliciet ("voor heel Buiksloterham").

## Wat je niet doet

- Niet aanvullen uit eigen kennis, ook niet als een gat voor de hand ligt: zet
  het onder "Niet bekend over deze plek".
- Niet meerdere bestanden maken; één per domein.
- Geen frontmatter, geen JSON, geen HTML: platte markdown.

Begin met stap 1.
