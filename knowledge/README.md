# ENT vaste kennislaag v2

Deze map bevat uitsluitend platte Markdownbestanden die de applicatie volledig en statisch in de promptprefix kan injecteren. Er is geen index, retrieval, chunking of citaat-ID nodig.

## Selectie

- Injecteer de domeinbestanden die bij de gekozen identiteit horen.
- Injecteer `wetgeving-nl.md` wanneer juridische status of verplichtingen relevant zijn.
- Injecteer beleidsbestanden **selectief op schaal en locatie**. Voeg niet automatisch alle lokale beleidslagen aan iedere prompt toe.
- Voor Amsterdam: `beleid/gemeenten/amsterdam.md`; voor Renswoude: `beleid/gemeenten/renswoude.md`.
- Voeg de toepasselijke provincie en het bevoegde waterschap toe. Voeg een natuurgebiedbestand alleen toe wanneer ligging, invloedssfeer of gebiedsvraag dat rechtvaardigt.
- `beleid/rijk/stikstofbrief-van-essen-2026.md` is uitsluitend een actualiteitsaanvulling op algemene modelkennis en bevat geen algemene samenvatting van rijksbeleid.

## Beleidsstructuur

| Map | Selecteren wanneer |
|---|---|
| `beleid/rijk/` | Alleen voor recente of specialistische rijksinformatie die algemene modelkennis aantoonbaar verdiept. |
| `beleid/provincies/` | De locatie in de provincie ligt of provinciale werking buiten de locatie relevant is. |
| `beleid/gemeenten/` | De locatie binnen de gemeente ligt. |
| `beleid/waterschappen/` | Het waterschap bevoegd is of het watersysteem wordt beïnvloed. |
| `beleid/natuurgebieden/` | De locatie in of nabij het gebied ligt, of het initiatief effecten daarop kan hebben. |
| `beleid/regios/` | Een formeel regionaal programma of samenwerkingskader relevant is. |
| `beleid/omgevingsdiensten/` | Uitvoeringsbeleid, mandaat of regionaal toetsingskader relevant is. |
| `beleid/veiligheidsregios-en-ggd/` | Gezondheid, klimaatveiligheid of rampen-/risicobeheersing relevant is. |
| `beleid/terreinbeheerders/` | Eigenaars- of beheerregels van de concrete locatie relevant zijn. |

De kennislaag bevat bewust geen categorie `projectspecifiek`. Projectstukken, overeenkomsten, tenderregels en ontwerpbesluiten worden via een afzonderlijk applicatiespoor toegevoegd.

## Aanbevolen injectievolgorde

1. systeeminstructie en antwoordregels;
2. relevante algemene ENT-domeinbestanden;
3. `wetgeving-nl.md` wanneer juridische duiding nodig is;
4. geselecteerde bestuurslagen van hoog naar laag;
5. relevant natuurgebied en/of terreinbeheerder;
6. projectspecifieke context uit het afzonderlijke spoor;
7. gebruikersvraag.

Laat het model bij conflicten de **juridische status, actualiteit, geografische precisie en hogere regeling** expliciet wegen. Een lager beleidsdocument kan een hogere bindende regel niet vervangen.

## Schrijfdiscipline

- Houd de vier vaste secties per domein: Systeemblik, Harde kaders & feiten, Instrumenten & portalen, Gezaghebbende bronnen.
- Label harde punten als `[wetgeving]`, `[beleid]`, `[contract]`, `[richtlijn]`, `[feit]` of `[advies]`.
- Neem specifieke drempels, methoden, uitzonderingen en lokale instrumenten op; vermijd algemeen ecologie-college.
- Formuleer geen onbekende waarde als feit. Verwijs bij onzekerheid naar actueel portaal of bevoegd gezag.
- Parafraseer; neem geen lange verbatim brontekst over.

## Actualiseren

Controleer minimaal jaarlijks en bij relevante wets- of beleidswijziging. Werk `checked_at` bij na inhoudelijke controle. Controleer bij iedere wijziging officiële URL, versie, toepassingsgebied, overgangsrecht en status van de uitspraak.

Voor lokale bestanden geldt extra: verifieer omgevingsplan, tender/bouwenvelop, beleidseditie en bevoegd gezag op de projectdatum. Een tenderdrempel is niet automatisch stadsbreed beleid of wetgeving.

Voor provinciale en rijksbestanden geldt: neem alleen specifieke feiten op die algemene modelkennis aanvullen. Label ontwerpbeleid en aangekondigde regelgeving expliciet; injecteer geen algemene bestuurskunde of samenvatting van stabiele landelijke regels.

**Peildatum huidige set:** 15 juli 2026.
