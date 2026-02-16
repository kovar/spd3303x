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

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"Serving at http://localhost:{PORT}")
webbrowser.open(f"http://localhost:{PORT}")
http.server.HTTPServer(("", PORT), http.server.SimpleHTTPRequestHandler).serve_forever()
