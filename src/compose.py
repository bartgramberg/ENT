#!/usr/bin/env python3
"""
ENT compose.py
Assembles the ENT system prompt from an IntakeConfig dict + versioned prompt files.

Prompt files live in prompts/ent/ (relative to repo root, one level above src/).
Adding a new audience: drop a .md file in prompts/ent/audiences/ and add its key
to ROLE_TO_AUDIENCE below.
Adding a new purpose: drop a .md file in prompts/ent/purposes/ and add its key
to PURPOSE_TO_FILE below.
"""

import os
import json

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
PROMPTS    = os.path.join(BASE_DIR, "..", "prompts", "ent")

# Maps user_role values → audience prompt file (without .md)
ROLE_TO_AUDIENCE = {
    "designer":      "designers",
    "ecologist":     "ecologists",
    "civil_servant": "civil-servants",
    "developer":     "developers",
    "resident":      "residents",
    "facilitator":   "mixed",
    "researcher":    "mixed",
    "other":         "mixed",
}

# Maps purpose values → purpose prompt file (without .md)
PURPOSE_TO_FILE = {
    "open":     "open",
    "respond":  "respond",
    "story":    "story",
    "provoke":  "provoke",
    "codesign": "codesign",
    "closing":  "closing",
    "explore":  "explore",
    "other":    "explore",
}

# Short voice-grounding block injected after base.md
VOICE_FRAME = {
    "boom": (
        "Je spreekt als De Boom. Je bent geworteld, geduldig, systemisch. "
        "Je hebt wortels die diep gaan en een kroon die schaduwen geeft. "
        "Je hebt generaties mensen zien komen en gaan. "
        "In het gesprek ben je: De Boom."
    ),
    "egel": (
        "Je spreekt als De Egel. Je bent klein, nachtelijk, kwetsbaar maar eigenwijs. "
        "Je leeft dicht bij de grond, je ruikt wat mensen niet zien, "
        "en je weet welke plekken veilig zijn en welke niet. "
        "In het gesprek ben je: De Egel."
    ),
}


def _read(relative_path: str) -> str:
    """Read a prompt file relative to PROMPTS dir. Returns empty string if missing."""
    path = os.path.join(PROMPTS, relative_path)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def compose(config: dict) -> str:
    """
    Assemble and return the ENT system prompt string.

    config keys:
        user_role        str   — "designer" | "ecologist" | "civil_servant" |
                                 "developer" | "resident" | "facilitator" |
                                 "researcher" | "other"
        audience_mode    str   — "self" | "group" | "mixed"
        purpose          str   — "open" | "respond" | "story" | "provoke" |
                                 "codesign" | "closing" | "explore" | "other"
        voice_subject    str   — "boom" | "egel"
        location         str   — free text, e.g. "Buiksloterham, Amsterdam"
        situation        str   — free text describing the plan / question on the table
        audience_details str   — free text (only when audience_mode != "self")
    """
    parts = []

    # 1. Immutable core
    base = _read("base.md")
    if base:
        parts.append(base)

    # 2. Voice frame — who is speaking
    voice = config.get("voice_subject", "boom")
    frame = VOICE_FRAME.get(voice, VOICE_FRAME["boom"])
    parts.append(f"# Wie spreekt\n\n{frame}")

    # 3. Audience tuning
    audience_mode = config.get("audience_mode", "self")
    if audience_mode == "self":
        role          = config.get("user_role", "other")
        audience_file = ROLE_TO_AUDIENCE.get(role, "mixed")
        content       = _read(f"audiences/{audience_file}.md")
        if content:
            parts.append(f"# Publiek\n\n{content}")
    else:
        # group or mixed: use mixed.md register + inject who's in the room
        content = _read("audiences/mixed.md")
        if content:
            parts.append(f"# Publiek\n\n{content}")
        details = config.get("audience_details", "").strip()
        if details:
            parts.append(f"# Wie zit er in de zaal\n\n{details}")

    # 4. Purpose tuning
    purpose      = config.get("purpose", "explore")
    purpose_file = PURPOSE_TO_FILE.get(purpose, "explore")
    content      = _read(f"purposes/{purpose_file}.md")
    if content:
        parts.append(f"# Doel en vorm\n\n{content}")

    # 5. Session context — injected last so it overrides anything generic above
    ctx = []
    location  = config.get("location",  "").strip()
    situation = config.get("situation", "").strip()
    if location:
        ctx.append(f"Locatie: {location}")
    if situation:
        ctx.append(f"Context: {situation}")
    if ctx:
        parts.append("# Sessie context\n\n" + "\n".join(ctx))

    # 6. Overwegingen format instruction — always the final block
    parts.append(
        "Sluit elk antwoord af met de markering [OVERWEGINGEN]. "
        "Geef daarna max 3 ecologische feiten, risico's of beleidscontext. "
        "Elke overweging heeft een korte titel op de eerste regel en een verklarende zin op de tweede. "
        "Scheid overwegingen met een lege regel.\n\n"
        "Het deel VOOR [OVERWEGINGEN] = jouw stem: kort, max 3 zinnen, poëtisch-zakelijk.\n"
        "Het deel NA [OVERWEGINGEN] = de feiten."
    )

    return "\n\n---\n\n".join(parts)


if __name__ == "__main__":
    # Quick smoke test
    test = {
        "user_role":       "resident",
        "audience_mode":   "group",
        "purpose":         "open",
        "voice_subject":   "boom",
        "location":        "Buiksloterham, Amsterdam",
        "situation":       "Herontwikkeling van de Papaverweg-strook",
        "audience_details": "Bewoners van de buurt, gefocust op woningen, bezorgd over groen",
    }
    print(compose(test))
