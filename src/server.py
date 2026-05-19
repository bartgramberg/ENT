#!/usr/bin/env python3
"""
ENT Demo v8 — server.py
Lokale Python server die de Claude API aanroept en HTML bestanden serveert.
Draait op localhost:8766

Routes:
  GET  /                → onboarding (ENT_onboarding_v1.html)
  GET  /onboarding      → onboarding
  GET  /demo            → chat interface (ENT_demo_v8.html)
  GET  /console         → operator console — deprecated but still functional
  GET  /state           → session state JSON
  GET  /sessie-meta     → session meta JSON
  GET  /session-config  → export current intake config as JSON
  POST /intake          → receive IntakeConfig, compose system prompt, start session
  POST /setup           → legacy operator setup (console) — preserved for compatibility
  POST /chat            → send message to Claude
  POST /reset           → clear conversation history
  POST /session-config  → import intake config (replay a saved setup)
"""

import json
import os
import sys
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import urllib.request

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(os.path.dirname(BASE_DIR), "assets")
LOGS_DIR   = os.path.join(os.path.dirname(BASE_DIR), "logs")
PORT = 8766

# Make compose.py importable from the same directory
sys.path.insert(0, BASE_DIR)
try:
    from compose import compose as compose_prompt
    COMPOSE_AVAILABLE = True
except ImportError:
    COMPOSE_AVAILABLE = False

# ── Defaults (used by legacy /setup when no config file is uploaded) ──
PERSONA_DEFAULTS = {
    "egel": (
        "Je bent een egel die spreekt vanuit het perspectief van de natuur in "
        "gebiedsontwikkelingsprocessen. Je reageert kort, scherp en vanuit je eigen "
        "leefwereld: de grond, de struiken, de nacht. Je bent kwetsbaar maar eigenwijs. "
        "Je stelt één prikkelende vraag of maakt één concreet punt. Nooit meer dan 3 zinnen in je stem."
    ),
    "boom": (
        "Je bent een boom die spreekt vanuit het perspectief van de natuur in "
        "gebiedsontwikkelingsprocessen. Je bent geworteld, geduldig en systemisch. "
        "Je ziet verbindingen die mensen missen. Je spreekt rustig maar met gezag. "
        "Je maakt één ecologisch punt of stelt één vraag. Nooit meer dan 3 zinnen in je stem."
    ),
}

# ── Session state (in-memory, single session) ──
state = {
    "api_key":              "",
    "system_prompt":        "",
    "conversation_history": [],
    "persona":              "boom",
    "location":             "",
    "intake_config":        {},
    "meta": {
        "ent_config_file":      "",
        "project_files":        "",
        "project_instructions": "",
        "persona_label":        "",
        "location":             "",
    },
}


# ── Utilities ──

def parse_overwegingen(raw):
    blocks = []
    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
    for para in paragraphs:
        lines = [l.strip() for l in para.split("\n") if l.strip()]
        if len(lines) >= 2:
            blocks.append({"title": lines[0], "body": " ".join(lines[1:])})
        elif lines:
            blocks.append({"title": lines[0], "body": lines[0]})
    if not blocks:
        blocks = [{"title": "Ecologische afweging", "body": raw}]
    return json.dumps(blocks)


def log_intake(config: dict):
    """Append an anonymous usage record to logs/usage.jsonl."""
    try:
        os.makedirs(LOGS_DIR, exist_ok=True)
        entry = {
            "ts":                  datetime.datetime.utcnow().isoformat() + "Z",
            "user_role":           config.get("user_role"),
            "audience_mode":       config.get("audience_mode"),
            "purpose":             config.get("purpose"),
            "voice_subject":       config.get("voice_subject"),
            "has_location":        bool(config.get("location")),
            "has_situation":       bool(config.get("situation")),
            "has_audience_details":bool(config.get("audience_details")),
            "lang":                config.get("lang", "nl"),
        }
        with open(os.path.join(LOGS_DIR, "usage.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass  # logging must never crash the server


# ── HTTP Handler ──

class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # suppress default access log

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        routes = {
            "/":           ("ENT_onboarding_v1.html", "text/html"),
            "/onboarding": ("ENT_onboarding_v1.html", "text/html"),
            "/demo":       ("ENT_demo_v8.html",        "text/html"),
            "/console":    ("ENT_console_v8.html",     "text/html"),  # deprecated
            "/image/egel-dicht":  ("images/Egel_mond_dicht.png", "image/png"),
            "/image/egel-open":   ("images/Egel_mond_open.png",  "image/png"),
            "/image/boom-dicht":  ("images/Boom_mond_dicht.png", "image/png"),
            "/image/boom-open":   ("images/Boom_mond_open.png",  "image/png"),
            "/background":        ("images/ENT_background.png",  "image/png"),
        }

        if path in routes:
            self.serve_file(*routes[path])

        elif path == "/state":
            self.send_json({
                "has_api_key":    bool(state["api_key"]),
                "persona":        state["persona"],
                "location":       state["location"],
                "message_count":  len(state["conversation_history"]),
            })

        elif path == "/sessie-meta":
            self.send_json(state["meta"])

        elif path == "/session-config":
            # Export current intake config for session replay
            self.send_json(state["intake_config"] or {})

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path   = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length)) if length > 0 else {}

        # ── /intake — new onboarding-driven setup ──
        if path == "/intake":
            if not COMPOSE_AVAILABLE:
                self.send_json({"error": "compose.py not found"}, 500)
                return

            api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
            if not api_key:
                self.send_json(
                    {"error": "ANTHROPIC_API_KEY not set on server. "
                              "Run: export ANTHROPIC_API_KEY=sk-ant-..."},
                    500,
                )
                return

            config = {
                "user_role":        body.get("user_role",        "other"),
                "user_role_other":  body.get("user_role_other",  ""),
                "audience_mode":    body.get("audience_mode",    "self"),
                "purpose":          body.get("purpose",          "explore"),
                "purpose_other":    body.get("purpose_other",    ""),
                "voice_subject":    body.get("voice_subject",    "boom"),
                "location":         body.get("location",         "").strip(),
                "situation":        body.get("situation",        "").strip(),
                "audience_details": body.get("audience_details", "").strip(),
                "lang":             body.get("lang",             "nl"),
            }

            preserve = body.get("preserve_history", False)

            system_prompt = compose_prompt(config)
            persona       = config["voice_subject"]
            persona_labels = {"boom": "Boom als vertegenwoordiger van de natuur", "egel": "Egel"}

            state["api_key"]       = api_key
            state["persona"]       = persona
            state["location"]      = config["location"]
            state["system_prompt"] = system_prompt
            state["intake_config"] = config
            if not preserve:
                state["conversation_history"] = []
            state["meta"] = {
                "ent_config_file":      "",
                "project_files":        "",
                "project_instructions": config["situation"],
                "persona_label":        persona_labels.get(persona, persona),
                "location":             config["location"],
            }

            log_intake(config)
            self.send_json({"status": "ok", "persona": persona})

        # ── /session-config (POST) — replay a saved config ──
        elif path == "/session-config":
            if not body:
                self.send_json({"error": "Empty config"}, 400)
                return
            # Re-use intake logic
            self.rfile = None  # prevent double-read confusion
            # Reconstruct as intake POST
            api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
            if not api_key:
                self.send_json({"error": "ANTHROPIC_API_KEY not set"}, 500)
                return
            if COMPOSE_AVAILABLE:
                system_prompt = compose_prompt(body)
                state["api_key"]              = api_key
                state["persona"]              = body.get("voice_subject", "boom")
                state["location"]             = body.get("location", "")
                state["system_prompt"]        = system_prompt
                state["intake_config"]        = body
                state["conversation_history"] = []
                self.send_json({"status": "ok"})
            else:
                self.send_json({"error": "compose.py not available"}, 500)

        # ── /setup — legacy console setup (deprecated) ──
        elif path == "/setup":
            api_key              = body.get("api_key",              "").strip()
            ent_config           = body.get("ent_config",           "").strip()
            ent_config_file      = body.get("ent_config_file",      "").strip()
            project_files        = body.get("project_files",        "").strip()
            project_file_names   = body.get("project_file_names",   "").strip()
            project_instructions = body.get("project_instructions", "").strip()
            persona              = body.get("persona",              "boom").strip()
            location             = body.get("location",             "").strip()

            # Fall back to env var if no key entered
            if not api_key:
                api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
            if not api_key:
                self.send_json({"error": "Geen API key ingevuld"}, 400)
                return

            state["api_key"] = api_key
            state["persona"] = persona
            state["location"] = location

            persona_labels = {
                "boom": "Boom als vertegenwoordiger van de natuur",
                "egel": "Egel",
            }
            state["meta"] = {
                "ent_config_file":      ent_config_file,
                "project_files":        project_file_names,
                "project_instructions": project_instructions,
                "persona_label":        persona_labels.get(persona, persona),
                "location":             location,
            }

            parts = []
            if ent_config:
                parts.append(ent_config)
            else:
                default = PERSONA_DEFAULTS.get(persona, PERSONA_DEFAULTS["boom"])
                if location:
                    default += (
                        f"\n\nJe bevindt je in of nabij: {location}. "
                        "Verwijs naar deze specifieke plek waar dat relevant is."
                    )
                parts.append(default)

            if project_files:
                parts.append("# Projectdocumenten\n\n" + project_files)
            if project_instructions:
                parts.append("# Aanvullende instructies\n\n" + project_instructions)

            parts.append(
                "Sluit elk antwoord af met de markering [OVERWEGINGEN]. "
                "Geef daarna max 3 ecologische feiten, risico's of beleidscontext. "
                "Elke overweging heeft een korte titel op de eerste regel en een verklarende "
                "zin op de tweede. Scheid overwegingen met een lege regel.\n\n"
                "Het deel VOOR [OVERWEGINGEN] = jouw stem: kort, max 3 zinnen, poëtisch-zakelijk.\n"
                "Het deel NA [OVERWEGINGEN] = de feiten."
            )

            state["system_prompt"]        = "\n\n---\n\n".join(parts)
            state["conversation_history"] = []
            self.send_json({"status": "ok", "persona": state["persona"]})

        # ── /chat ──
        elif path == "/chat":
            user_message = body.get("message", "").strip()
            if not user_message:
                self.send_json({"error": "Geen bericht"}, 400)
                return
            if not state["api_key"]:
                self.send_json({"error": "Geen API key ingesteld"}, 400)
                return

            state["conversation_history"].append(
                {"role": "user", "content": user_message}
            )

            api_body = {
                "model":      "claude-sonnet-4-20250514",
                "max_tokens": 700,
                "messages":   state["conversation_history"],
            }
            if state["system_prompt"]:
                api_body["system"] = state["system_prompt"]

            payload = json.dumps(api_body).encode("utf-8")
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=payload,
                headers={
                    "Content-Type":      "application/json",
                    "x-api-key":         state["api_key"],
                    "anthropic-version": "2023-06-01",
                },
                method="POST",
            )

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result    = json.loads(resp.read())
                    full_text = result["content"][0]["text"]

                    if "[OVERWEGINGEN]" in full_text:
                        split        = full_text.split("[OVERWEGINGEN]", 1)
                        stem         = split[0].strip()
                        overwegingen = parse_overwegingen(split[1].strip())
                    else:
                        stem         = full_text.strip()
                        overwegingen = ""

                    state["conversation_history"].append(
                        {"role": "assistant", "content": full_text}
                    )
                    self.send_json(
                        {"stem": stem, "overwegingen": overwegingen, "persona": state["persona"]}
                    )

            except urllib.error.HTTPError as e:
                self.send_json(
                    {"error": f"API fout: {e.code} — {e.read().decode()}"}, 500
                )
            except Exception as e:
                self.send_json({"error": str(e)}, 500)

        # ── /reset ──
        elif path == "/reset":
            state["conversation_history"] = []
            self.send_json({"status": "reset"})

        else:
            self.send_response(404)
            self.end_headers()

    def serve_file(self, filename, content_type):
        try:
            base = ASSETS_DIR if filename.startswith("images/") else BASE_DIR
            with open(os.path.join(base, filename), "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    api_key_set = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())
    print(f"\nENT v8 draait op http://localhost:{PORT}")
    print(f"  Onboarding:  http://localhost:{PORT}/")
    print(f"  Demo:        http://localhost:{PORT}/demo")
    print(f"  Console:     http://localhost:{PORT}/console  (deprecated)")
    print(f"  API key:     {'[OK via ANTHROPIC_API_KEY]' if api_key_set else '[NIET INGESTELD — export ANTHROPIC_API_KEY=sk-ant-...]'}")
    print(f"  Compose:     {'[OK]' if COMPOSE_AVAILABLE else '[NIET BESCHIKBAAR — compose.py niet gevonden]'}")
    print("\nStop met Ctrl+C\n")
    HTTPServer(("", PORT), Handler).serve_forever()
