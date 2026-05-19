#!/usr/bin/env python3
"""
ENT Demo v8 — server.py
Lokale Python server die de Claude API aanroept en HTML bestanden serveert.
Draait op localhost:8766
"""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(os.path.dirname(BASE_DIR), "assets")
PORT = 8766

PERSONA_DEFAULTS = {
    "egel": "Je bent een egel die spreekt vanuit het perspectief van de natuur in gebiedsontwikkelingsprocessen. Je reageert kort, scherp en vanuit je eigen leefwereld: de grond, de struiken, de nacht. Je bent kwetsbaar maar eigenwijs. Je stelt één prikkelende vraag of maakt één concreet punt. Nooit meer dan 3 zinnen in je stem.",
    "boom": "Je bent een boom die spreekt vanuit het perspectief van de natuur in gebiedsontwikkelingsprocessen. Je bent geworteld, geduldig en systemisch. Je ziet verbindingen die mensen missen. Je spreekt rustig maar met gezag. Je maakt één ecologisch punt of stelt één vraag. Nooit meer dan 3 zinnen in je stem."
}

state = {
    "api_key": "",
    "system_prompt": "",
    "conversation_history": [],
    "persona": "boom",
    "location": "",
    "meta": {
        "ent_config_file": "",
        "project_files": "",
        "project_instructions": "",
        "persona_label": "",
        "location": ""
    },
    "usage": {"input_tokens": 0, "output_tokens": 0, "requests": 0}
}


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


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        routes = {
            "/": ("ENT_console_v8.html", "text/html"),
            "/console": ("ENT_console_v8.html", "text/html"),
            "/demo": ("ENT_demo_v8.html", "text/html"),
            "/image/egel-dicht": ("images/Egel_mond_dicht.png", "image/png"),
            "/image/egel-open": ("images/Egel_mond_open.png", "image/png"),
            "/image/boom-dicht": ("images/Boom_mond_dicht.png", "image/png"),
            "/image/boom-open": ("images/Boom_mond_open.png", "image/png"),
            "/background": ("images/ENT_background.png", "image/png"),
        }

        if path in routes:
            self.serve_file(*routes[path])
        elif path == "/state":
            self.send_json({
                "has_api_key": bool(state["api_key"]),
                "persona": state["persona"],
                "location": state["location"],
                "message_count": len(state["conversation_history"])
            })
        elif path == "/sessie-meta":
            self.send_json(state["meta"])
        elif path == "/usage":
            self.send_json(state["usage"])
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}

        if path == "/setup":
            api_key              = body.get("api_key", "").strip()
            ent_config           = body.get("ent_config", "").strip()
            ent_config_file      = body.get("ent_config_file", "").strip()
            project_files        = body.get("project_files", "").strip()
            project_file_names   = body.get("project_file_names", "").strip()
            project_instructions = body.get("project_instructions", "").strip()
            persona              = body.get("persona", "boom").strip()
            location             = body.get("location", "").strip()

            if not api_key:
                self.send_json({"error": "Geen API key ingevuld"}, 400)
                return

            state["api_key"] = api_key
            state["persona"] = persona
            state["location"] = location

            persona_labels = {
                "boom": "Boom als vertegenwoordiger van de natuur",
                "egel": "Egel"
            }
            state["meta"] = {
                "ent_config_file": ent_config_file,
                "project_files": project_file_names,
                "project_instructions": project_instructions,
                "persona_label": persona_labels.get(persona, persona),
                "location": location
            }

            parts = []
            if ent_config:
                parts.append(ent_config)
            else:
                default = PERSONA_DEFAULTS.get(persona, PERSONA_DEFAULTS["egel"])
                if location:
                    default += f"\n\nJe bevindt je in of nabij: {location}. Verwijs naar deze specifieke plek waar dat relevant is."
                parts.append(default)

            if project_files:
                parts.append("# Projectdocumenten\n\n" + project_files)
            if project_instructions:
                parts.append("# Aanvullende instructies\n\n" + project_instructions)

            parts.append("""Sluit elk antwoord af met de markering [OVERWEGINGEN]. Geef daarna max 3 ecologische feiten, risico's of beleidscontext. Elke overweging heeft een korte titel op de eerste regel en een verklarende zin op de tweede. Scheid overwegingen met een lege regel.

Het deel VOOR [OVERWEGINGEN] = jouw stem: kort, max 3 zinnen, poëtisch-zakelijk.
Het deel NA [OVERWEGINGEN] = de feiten.""")

            state["system_prompt"] = "\n\n---\n\n".join(parts)
            state["conversation_history"] = []
            state["usage"] = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
            self.send_json({"status": "ok", "persona": state["persona"]})

        elif path == "/chat":
            user_message = body.get("message", "").strip()
            if not user_message:
                self.send_json({"error": "Geen bericht"}, 400)
                return
            if not state["api_key"]:
                self.send_json({"error": "Geen API key ingesteld"}, 400)
                return

            state["conversation_history"].append({"role": "user", "content": user_message})

            api_body = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 700,
                "messages": state["conversation_history"]
            }
            if state["system_prompt"]:
                api_body["system"] = state["system_prompt"]

            payload = json.dumps(api_body).encode("utf-8")
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": state["api_key"],
                    "anthropic-version": "2023-06-01"
                },
                method="POST"
            )

            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result = json.loads(resp.read())
                    usage = result.get("usage", {})
                    state["usage"]["input_tokens"]  += usage.get("input_tokens", 0)
                    state["usage"]["output_tokens"] += usage.get("output_tokens", 0)
                    state["usage"]["requests"]      += 1
                    full_text = result["content"][0]["text"]

                    if "[OVERWEGINGEN]" in full_text:
                        split = full_text.split("[OVERWEGINGEN]", 1)
                        stem = split[0].strip()
                        overwegingen = parse_overwegingen(split[1].strip())
                    else:
                        stem = full_text.strip()
                        overwegingen = ""

                    state["conversation_history"].append({"role": "assistant", "content": full_text})
                    self.send_json({"stem": stem, "overwegingen": overwegingen, "persona": state["persona"]})

            except urllib.error.HTTPError as e:
                self.send_json({"error": f"API fout: {e.code} — {e.read().decode()}"}, 500)
            except Exception as e:
                self.send_json({"error": str(e)}, 500)

        elif path == "/reset":
            state["conversation_history"] = []
            state["usage"] = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
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
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"ENT Demo v8 draait op http://localhost:{PORT}")
    print(f"Console:  http://localhost:{PORT}/console")
    print(f"Demo:     http://localhost:{PORT}/demo")
    print("Stop met Ctrl+C")
    HTTPServer(("", PORT), Handler).serve_forever()
