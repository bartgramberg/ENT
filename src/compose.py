#!/usr/bin/env python3
"""
ENT compose.py
Assembles the ENT system prompt from an IntakeConfig dict + versioned prompt files.

Architecture:
  prompts/ent/voices/{voice}.md     — complete self-contained voice identity
  prompts/ent/audiences/{type}.md   — register tuning per audience type
  prompts/ent/purposes/{purpose}.md — shape/format tuning per purpose
  prompts/ent/format/overwegingen.md — technical parse contract (always last)

Adding a new voice:      add {voice}.md to voices/, add key to AVAILABLE_VOICES
Adding a new audience:   add {type}.md to audiences/, add key to ROLE_TO_AUDIENCE
                         and AUDIENCE_TYPE_TO_FILE
Adding a new purpose:    add {purpose}.md to purposes/, add key to PURPOSE_TO_FILE
"""

import os

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
PROMPTS       = os.path.join(BASE_DIR, "..", "prompts", "ent")
VOICES_DIR    = os.path.join(PROMPTS, "voices")

# Voices with a complete voice file — extend this list as new voices are added
AVAILABLE_VOICES = ["boom"]

# Maps user_role (Q1) → audience prompt file (without .md)
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

# Maps audience_type (Q2b) → audience prompt file (without .md)
AUDIENCE_TYPE_TO_FILE = {
    "residents":     "residents",
    "designers":     "designers",
    "ecologists":    "ecologists",
    "civil_servant": "civil-servants",
    "developer":     "developers",
    "children":      "children",
    "mixed":         "mixed",
    "children":      "children",
    "other":         "mixed",
}

# Maps purpose (Q3) → purpose prompt file (without .md)
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


def _read(relative_path: str) -> str:
    """Read a prompt file relative to PROMPTS dir. Returns empty string if missing."""
    path = os.path.join(PROMPTS, relative_path)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def _load_voice(voice_subject: str) -> str:
    """
    Load the complete voice prompt for the given voice key.
    Falls back to boom.md if the requested voice file does not exist.
    """
    path = os.path.join(VOICES_DIR, f"{voice_subject}.md")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        fallback = os.path.join(VOICES_DIR, "boom.md")
        with open(fallback, "r", encoding="utf-8") as f:
            return f.read().strip()


def compose(config: dict) -> str:
    """
    Assemble and return the ENT system prompt string.

    config keys:
        user_role        str  — "designer" | "ecologist" | "civil_servant" |
                                "developer" | "resident" | "facilitator" |
                                "researcher" | "other"
        audience_mode    str  — "self" | "group"
        audience_type    str  — audience key (only when audience_mode = "group")
        audience_details str  — free text (only when audience_type = "mixed")
        purpose          str  — "open" | "respond" | "story" | "provoke" |
                                "codesign" | "closing" | "explore" | "other"
        voice_subject    str  — "boom" (only available voice for now)
        location         str  — free text
        situation        str  — free text
        documents        list — [{"filename": str, "text": str}, ...]
        lang             str  — "nl" | "en"
    """
    parts = []

    # 1. Complete voice identity
    voice_subject = config.get("voice_subject", "boom")
    voice_prompt  = _load_voice(voice_subject)
    if voice_prompt:
        parts.append(voice_prompt)

    # 2. Audience tuning
    audience_mode = config.get("audience_mode", "self")
    if audience_mode == "self":
        role          = config.get("user_role", "other")
        audience_file = ROLE_TO_AUDIENCE.get(role, "mixed")
        content       = _read(f"audiences/{audience_file}.md")
        if content:
            parts.append(f"# Publiek\n\n{content}")
    elif audience_mode == "group":
        audience_type = config.get("audience_type", "mixed")
        audience_file = AUDIENCE_TYPE_TO_FILE.get(audience_type, "mixed")
        content       = _read(f"audiences/{audience_file}.md")
        if content:
            parts.append(f"# Publiek\n\n{content}")

    # Always inject audience_details if present (regardless of mode)
    details = config.get("audience_details", "").strip()
    if details:
        parts.append(f"# Wie zit er in de zaal\n\n{details}")

    # 3. Purpose tuning
    purpose      = config.get("purpose", "explore")
    purpose_file = PURPOSE_TO_FILE.get(purpose, "explore")
    content      = _read(f"purposes/{purpose_file}.md")
    if content:
        parts.append(f"# Doel en vorm\n\n{content}")

    # 4. Session context
    ctx  = []
    lang = config.get("lang", "nl")
    ctx.append(f"Taal / Language: {lang}")

    location  = config.get("location",  "").strip()
    situation = config.get("situation", "").strip()
    if location:
        ctx.append(f"Locatie: {location}")
    if situation:
        ctx.append(f"Context: {situation}")
    parts.append("# Sessie context\n\n" + "\n".join(ctx))

    # 5. Project documents (optional, session-only)
    documents = config.get("documents", [])
    if documents:
        MAX_TOTAL_CHARS = 8000
        total = sum(len(d.get("text", "")) for d in documents)

        doc_parts = [
            "# Projectdocumenten\n\n"
            "De volgende documenten zijn aangeleverd als projectcontext.\n"
            "Gebruik ze om je antwoorden te verankeren in het specifieke project.\n"
            "Verzin geen details die er niet in staan."
        ]

        if total > MAX_TOTAL_CHARS:
            # Proportional truncation per file
            for doc in documents:
                text = doc.get("text", "")
                share = len(text) / total if total else 0
                cap   = int(MAX_TOTAL_CHARS * share)
                if len(text) > cap:
                    text = text[:cap] + "\n[Tekst ingekort vanwege lengte]"
                doc_parts.append(f"---\n[Bestand: {doc.get('filename', 'onbekend')}]\n{text}")
        else:
            for doc in documents:
                doc_parts.append(
                    f"---\n[Bestand: {doc.get('filename', 'onbekend')}]\n{doc.get('text', '')}"
                )

        parts.append("\n\n".join(doc_parts))

    # 6. Output format / parse contract — always last
    fmt = _read("format/overwegingen.md")
    if fmt:
        parts.append(fmt)

    return "\n\n---\n\n".join(parts)


if __name__ == "__main__":
    # Smoke test
    test = {
        "user_role":       "resident",
        "audience_mode":   "group",
        "audience_type":   "residents",
        "purpose":         "open",
        "voice_subject":   "boom",
        "location":        "Buiksloterham, Amsterdam",
        "situation":       "Herontwikkeling van de Papaverweg-strook",
        "audience_details":"Bewoners van de buurt, gefocust op woningen, bezorgd over groen",
        "lang":            "nl",
    }
    result = compose(test)
    # Print first 300 chars and last 300 chars to verify structure
    print("=== FIRST 300 ===")
    print(result[:300])
    print("\n=== LAST 300 ===")
    print(result[-300:])
    print(f"\n=== TOTAL LENGTH: {len(result)} chars ===")
