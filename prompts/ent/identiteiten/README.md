# Identiteiten

Elke identiteit is een eigen gesprekspartner van ENT. De gebruiker kiest een
identiteit (via `voice_subject` in de intake) en krijgt dan een unieke interactie.

Een identiteit = **identity + domein-perspectief(en) + voice + optionele eigen kennis**.
Het gedeelde "ENT-brein" (methodiek/twee lenzen, kernprincipes, grenzen) staat in
`../core/` en geldt voor elke identiteit — dupliceer dat niet per identiteit.

## Een nieuwe identiteit toevoegen

1. Maak een map `identiteiten/<naam>/` met:
   - `identiteit.json` — manifest: `{ "name", "label", "description", "domains": [...], "has_knowledge": bool }`
     `domains` verwijst naar de kennislaag (`knowledge/<domein>.md`) die bij deze identiteit hoort.
   - `identity.md` — wie deze entiteit is (kern, positie in het gesprek, tijdschaal, domein-perspectief, referenties).
   - `voice.md` — spreekstijl, ritme, woordkeuze, referenties, kalibratiezinnen. Geldt voor de systeemstem (🌿), niet voor de analist (🔴).
   - `knowledge.md` — *optioneel*, extra kennis specifiek voor deze identiteit (buiten de gedeelde kennislaag).
2. Voeg `<naam>` toe aan `AVAILABLE_IDENTITIES` in `netlify/functions/lib/compose.mjs`.
3. Voeg de identiteit toe aan de keuze in de onboarding (`index.html`).

## Bestaande identiteiten

- `boom/` — De Boom. Systemisch, gebonden aan één plek; raakt bodem, water, groenstructuur, fauna, biodiversiteit.
- `water/` — Het Water. Stromend en verbindend; ziet het watersysteem als centrale pijler van de plek.
