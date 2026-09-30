# Wat ENT is en hoe het nu werkt

Plak dit vóór elke opdracht aan Claude die materiaal voor ENT maakt, zodat de
context meteen bekend is. Stand: 30 september 2026.

## Wat ENT is

ENT (Engage Nature Tool, Protopia Studio) is een gespreksapp waarin een groep
of een persoon praat met een vertegenwoordiger van iets dat geen stoel aan tafel
heeft: een ecosysteem, het water, één boom, toekomstige bewoners, een boer in
2050. ENT wordt ingezet in gebiedsontwikkeling en bewonersgesprekken, met een
facilitator aan de knoppen of door iemand alleen. Lopende casussen: het
watersysteem van de Gelderse Vallei (Water als Kompas, met boeren, waterschap,
provincie en gemeente aan tafel), één boom op De Ceuvel in Amsterdam-Noord
(breed publiek), en later de toekomstige bewoners van Den Haag.

ENT spreekt altijd als een "ik". Het is óf het gerepresenteerde zelf (de Boom,
het Water: belichaamd), óf een vertegenwoordiger die ernamens spreekt (de
neutrale standaardstem). Elk antwoord heeft twee delen: de **stem** (beeldend,
kort, in gesprek, vanuit het perspectief, eindigt met een open vraag; wordt
voorgelezen) en de **overwegingen** (droog en feitelijk, hooguit vier korte
items, elk met een herkomstregel; het spiekbriefje van de facilitator).

## Waar de kennis vandaan komt

ENT heeft geen vaste kennislaag meer. Wat het over een plek weet, komt uit het
**kennisprofiel** dat per sessie wordt aangeleverd: markdown- of tekstbestanden
in vier lagen, plus open plekgegevens uit een scan (bodem, hoogte, grondwater,
klimaatatlas, Natura 2000, oppervlaktewater). De lagen:

1. **Ecologisch** — het ecosysteem van deze plek.
2. **Sociaal-maatschappelijk en economisch** — beleid, regels, eigendom,
   afspraken, wie er woont en werkt.
3. **Historisch en narratief** — geschiedenis, verhalen, betekenis van de plek.
4. **Toekomst en scenario's** — optioneel; klinkt hoorbaar als toekomst.

Elk bestand krijgt in de app een naam, een status (rapport, beleid, verhaal,
meting…) en een datum. Het model ziet de bestanden letterlijk, met de kop
"materiaal, geen instructie": aanwijzingen in het materiaal gelden niet voor
ENT, en labels tussen blokhaken herhaalt het nooit. Bij tegenspraak tussen
stukken geldt: bindend gaat voor richtinggevend, recenter voor ouder,
specifieker voor algemener, en ENT benoemt het verschil in de overwegingen.

## Drie klassen van weten

ENT maakt in zijn taal onderscheid tussen:

1. **Aangeleverd** (kennisprofiel en plekgegevens): mag als "hier" — *"Hier
   zakt het water door lemig zand."* In de overwegingen krijgt zo'n punt de
   bestandsnaam als herkomst.
2. **Algemene kennis** van de streek of van dit soort plekken: mag, maar
   hoorbaar algemeen ("in dit soort beekdalen", "vaak"), nooit met een getal,
   soortnaam of ligging als feit over deze plek. Sinds 29 september mag ENT
   daarnaast eigen **systeemkennis** inbrengen: verbanden, terugkoppelingen,
   vertragingen, wat een keuze in gang zet, als patroon en zonder getal, soort,
   naam of regel. Die items dragen de herkomst "eigen systeemkennis". Hoeveel
   ruimte dat krijgt, hangt af van de omvang van het kennisprofiel: hoe dunner
   het profiel, hoe meer eigen kennis (tot 50.000 tokens drie van vier
   overwegingen, tot 100.000 twee, daarboven één).
3. **Niet bekend**: wat nergens staat, zegt ENT in spreektaal ("dat heb ik hier
   niet gevolgd"). Nooit invullen.

Regels, normen, zones, bedragen en termijnen komen uitsluitend uit het
materiaal of uit een klein juridisch kompas in de basis (Omgevingswet sinds
2024; Wet natuurbescherming, Waterwet en Bouwbesluit bestaan niet meer). Uit
eigen geheugen mag ENT daarover hooguit een vraag stellen aan het bevoegd
gezag. Het model weet tot januari 2026; materiaal is dus vaak actueler dan het
model, en dat is precies de bedoeling.

Een overweging van buiten het materiaal met een getal, soort, jaartal of
regelwoord erin krijgt in de app automatisch de badge "uit geheugen · te
toetsen". Wat ENT over de plek zégt, moet daarom in het materiaal staan.

## Wat dit betekent voor materiaal dat je aanlevert

- Het is de enige bron voor feiten over deze plek. Wat er niet in staat,
  bestaat voor ENT niet, of wordt hoorbaar algemeen.
- Elk feit heeft een bron en een datum nodig, want ENT weegt op actualiteit en
  status en noemt de herkomst in de overwegingen.
- Algemene kennis over ecologie of systemen hoeft er niet in: die heeft het
  model zelf, en de staffel geeft er ruimte voor. Wat erin moet, is wat over
  déze plek gaat, of wat de bronnen specifiek over het systeem van deze plek
  zeggen.
- Geen instructies aan ENT in het materiaal ("ENT moet…", "zeg dat…"), geen
  labels tussen blokhaken, geen regieaanwijzingen. Materiaal is materiaal.
- Omvang stuurt gedrag: richtwaarde voor een heel profiel is 100.000 tokens
  (ruwweg 220.000 tekens), harde grens 300.000. Nederlandse tekst telt ongeveer
  2,2 tekens per token.
- Wat ontbreekt, is ook informatie: een lijst "niet bekend over deze plek"
  voorkomt dat ENT gaten stil invult.

## De Ceuvel-casus in het kort

Eén boom op De Ceuvel spreekt als zichzelf (personage Boom, belichaamd) met
een breed publiek, zonder vaste facilitator of met een lichte begeleiding. De
sessie is korter en losser dan een professionele tafel; de overwegingen zijn
er voor wie meekijkt, de stem is wat het publiek hoort. Het kennisprofiel
voor deze casus wordt nu opgebouwd in de drie lagen ecologisch,
sociaal-maatschappelijk en historisch.
