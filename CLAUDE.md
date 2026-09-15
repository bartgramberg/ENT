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

**Maximaal zes zinnen en 120 woorden. Geen uitzonderingen.** Ook niet voor de
verhalende purpose. Deze grens staat in `prompts/ent/format/overwegingen.md`,
dat altijd als laatste in de prompt komt en de voice-bestanden overschrijft.

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

Het veld `blik` in `identiteit.json` is daarom bewust een standpunt — vanwaar je
kijkt — en geen lijst met thema's. Er stond eerder een lijst van acht
onderwerpen per identiteit. Die las als agenda, botste met `core/principes.md`
("verkokering is de vijand") en met de Domein-perspectief-secties die juist om
samenhang vragen, en zorgde ervoor dat de Boom voornamelijk over water sprak.
Maak er geen lijst meer van.

Houd er rekening mee dat de hyperlokale data zelf al scheef staat: van de vijf
bronnen gaan hoogte, bodem en grondwater over grond en water. Elke identiteit
neigt daardoor naar hydrologie, ongeacht de prompt.

## Architectuur

De systeemprompt wordt **server-side** samengesteld in
`netlify/functions/lib/compose.mjs`, zodat de kennislaag nooit in de browser
komt en het stabiele deel gecachet kan worden. Promptbestanden worden per
request van schijf gelezen — een wijziging werkt direct, zonder herstart.

Elk antwoord heeft twee delen, gescheiden door `[OVERWEGINGEN]`: de stem en de
analist. `chat.mjs` splitst daarop en geeft ze apart terug.

De functions zijn staatloos. Alle sessiestatus staat in localStorage van de
browser. Het wachtwoord wordt bij élke request server-side gecontroleerd; de
gate in `index.html` is maar een overlay.

## Werkwijze

Werk op `dev`. Netlify deployt van `main`, dus mergen naar `main` is het moment
dat iets live gaat. Environment variables worden bij de build ingebakken: wijzig
je er een in het Netlify-dashboard, dan is een nieuwe deploy nodig voordat de
functions hem zien.

Bart Gramberg en Joris werken beiden in deze repo. Grotere ingrepen in de
promptarchitectuur zijn Barts terrein — stem af voordat je die verbouwt.

## Bekend open punt

`chat.mjs` streamt niet: het complete antwoord wordt afgewacht voordat er iets
in beeld komt, dus de hele generatietijd is stilte. Met de lengtegrens terug is
dat aanzienlijk korter. Streaming is de echte oplossing maar raakt ook het
splitsen op de marker, de typeanimatie en de foutafhandeling halverwege een
antwoord.
