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

## Weging van de bronnen (optioneel; invullen of weglaten)

Niet alle bronnen wegen even zwaar. Gebruik deze indeling:

- **Leidend:** {LEIDENDE BRONNEN, bijv. "Gedifferentieerd saneringsvoorstel
  bodem De Ceuvel, december 2025"}. Deze bron bepaalt de indeling van het
  bestand en de laatst bekende stand per onderwerp. Neem alles op wat erin
  staat en over deze plek gaat; hij levert het grootste deel van de tekst.
- **Aanvullend:** {AANVULLENDE BRONNEN}. Gebruik ze alleen voor wat de
  leidende bron niet zegt: details, cijfers, tijdlijn, beelden. Herhaal er
  niets uit dat de leidende bron al zegt.
- **Achtergrond:** {ACHTERGRONDBRONNEN}. Alleen voor "Verhalen en betekenis",
  "Beelden en waarnemingen" en de tijdlijn; geen feiten in de tabel, tenzij
  een leidende of aanvullende bron ze bevestigt.

Bij tegenspraak wint de leidende bron, tenzij een andere bron recenter én
officiëler is; dan noem je beide onder "Waar bronnen elkaar tegenspreken" en
zeg je welke je hebt gevolgd. Noteer in stap 1 achter elke bron in welke
groep hij zit, en in stap 3 waar de leidende bron je tekort schoot.

## Werk in drie stappen

**Stap 1. Bronnenlijst.** Noem elke bron met: korte naam, soort (zie de
bronsoorten hieronder), auteur of organisatie of "auteur onbekend", datum of
jaar (uit het document, de bestandsgegevens of geschat op de inhoud, en zeg
welke van de drie), en in één zin hoe specifiek voor deze plek hij is en met
welk voorbehoud je hem gebruikt. Let op datums: alles van vóór 2024 over
regels moet je markeren, want sinds 1 januari 2024 geldt de Omgevingswet en
bestaan de Wet natuurbescherming, de Waterwet en het Bouwbesluit niet meer.
Als twee bronnen elkaar tegenspreken, noteer dat hier al; als een latere bron
een eerdere achterhaalt, is dat geen tegenspraak maar ontwikkeling.

**Stap 2. Het bestand.** Schrijf het markdownbestand volgens de structuur
hieronder. Alleen wat in de bronnen staat; niets uit eigen kennis erbij, ook
geen "algemeen bekende" ecologie of beleidskaders. ENT heeft die kennis zelf
en krijgt daar aparte ruimte voor. Wat erin hoort, is wat over déze plek gaat,
of wat een bron specifiek over het systeem van deze plek zegt.

## Soorten bronnen, en hoe je ze gebruikt

Niet alleen officiële rapporten tellen. Werkdocumenten, gespreksverslagen,
jaarverslagteksten, oude rondleidersinstructies, een profielwerkstuk, een
filmtranscript: ze bevatten vaak de meest plekgebonden kennis die er is. Het
verschil zit niet in wél of niet gebruiken, maar in hoe je het opschrijft.
Geef elk feit een **status** en een **datum**, dan kan ENT het juiste gewicht
geven.

| Bronsoort | Hoe je hem gebruikt | Bronvermelding |
|---|---|---|
| Officieel onderzoek of besluit (bureau, gemeente, waterschap, universiteit) | Als vastgesteld feit, met datum | (naam bureau of instantie, jaar) |
| Eigen onderzoek of meting van de organisatie (bijv. HXRF-metingen door De Ceuvel) | Als gerapporteerd feit, met de methode en het voorbehoud dat de bron zelf noemt ("nog niet statistisch aantoonbaar") | (eigen onderzoek De Ceuvel, titel, jaar) |
| Intern werkdocument, plan, actielijst, voorstel | Wat gedáán of gemeten is als feit; wat gepland of geadviseerd is als **voornemen** of **advies**, nooit als uitgevoerd | (werkdocument De Ceuvel, titel, datum) |
| Gespreksverslag, notulen | Uitspraken toeschrijven aan de rol van de spreker ("de bodemdeskundige van de omgevingsdienst, oktober 2025"), als **standpunt** of **inschatting** | (verslag gesprek, datum) |
| Publiekstekst: jaarverslag, nieuwsbrief, rondleidersinstructie, website | Feiten en cijfers met jaar; de toon van de bron is niet de toon van het bestand | (jaarverslagtekst De Ceuvel, jaar) |
| Verhaal, interview, film, profielwerkstuk, column | Naar "Verhalen en betekenis" en "Beelden en waarnemingen"; feiten eruit alleen als ze elders bevestigd worden, anders als "volgens (bron)" | (soort bron, spreker of maker in rol, jaar) |
| Ouder dan tien jaar | Volwaardig gebruiken, maar altijd als **destijds**: "in 2016 werd de vervuiling vooral in de bovenste 50 tot 80 cm aangetroffen". Nooit als huidige stand | zoals hierboven, met het jaar |

Twee gevolgen. Ten eerste: per onderwerp geef je de **laatst bekende stand** met
datum, en de weg ernaartoe als tijdlijn. Zo zegt ENT "in 2019 bleek… en het
laatste wat bekend is, uit december 2025, is…", niet iets van 2016 als feit
van nu. Ten tweede: wat een bron zelf als onzeker aanmerkt, blijft onzeker;
maak het niet steviger dan de bron doet, en niet zwakker.

Namen: organisaties, functies en publieke rollen mogen (de landschapsarchitect,
de coördinator van het park, een bodemdeskundige van instantie X). Namen van
studenten, vrijwilligers, buren en andere particulieren niet; noem hun rol.

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
Per onderwerp de laatst bekende stand vooraan, met datum.

## Beelden en waarnemingen
Wat er hier te zien, te ruiken, te horen en te voelen is volgens de bronnen,
met jaar: de populieren die boven de boten uitkomen, de schaduw op een hete
dag, welke dieren er gezien zijn, hoe de grond eruitziet. Zintuiglijk en
plekgebonden; dit is wat de stem van ENT nodig heeft om als deze plek te
klinken. Geen algemeenheden.

## Hoe het systeem hier werkt
Wat de bronnen zeggen over samenhang en werking op deze plek: oorzaak en
gevolg, wat wat beïnvloedt, wat er in de tijd gebeurt. Alleen als een bron het
over deze plek zegt; algemene mechanismen laat je weg.

## Kaders, afspraken en cijfers
Een tabel: | wat | waarde of inhoud | status | datum | bron |
Status is één van: wetgeving, verordening of omgevingsplan, vergunning,
contract of afspraak, beleid, richtlijn, advies, voornemen, meting (officieel),
meting (eigen onderzoek), model, schatting, standpunt, verhaal.
Getallen altijd met eenheid en datum. Geen artikelnummers die niet letterlijk
in de bron staan.

## Tijdlijn
Per jaar wat er gebeurde, gemeten of besloten werd, met bron. Ook uit oude en
informele stukken; daar komt de ontwikkeling van de plek vandaan.

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
  bron in de lijst, met (bronnaam, jaar) achter de zin of in de tabel. Een
  werkdocument zonder auteur is ook een bron: dan staat er (werkdocument De
  Ceuvel, titel, datum). Als een bron iets beweert zonder onderbouwing,
  schrijf je "volgens (bron, jaar)".
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
  "mogelijk vervallen, te toetsen". Een plan of actielijst is een voornemen
  totdat een latere bron zegt dat het is gedaan.
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
