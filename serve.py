#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""
Local dev server — serves the app at http://localhost:8000
Required because ES modules don't load over file:// URLs.

Usage:
    uv run serve.py
    open http://localhost:8000
"""
import http.server
import os
import webbrowser
from functools import partial

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
handler = partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
server = http.server.HTTPServer(("", PORT), handler)
print(f"Serving {ROOT} at http://localhost:{PORT}")
webbrowser.open(f"http://localhost:{PORT}")
server.serve_forever()
