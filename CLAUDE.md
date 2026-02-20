# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web application for communicating with Siglent SPD3303X dual-channel programmable DC power supplies using SCPI commands over virtual serial USB. Reads voltage/current from both channels, displays live readings with statistics, plots measurements in real-time, and exports to CSV.

## Architecture

```
index.html              → HTML shell (links CSS + JS modules, CDN scripts)
css/styles.css          → All styles, CSS custom properties for dark/light theming
js/
  main.js               → Entry point: imports modules, wires DOM events
  protocol.js            → SCPI command constants, ScpiQueue (serialized request-response), parsers
  serial.js             → WebSerialTransport (Web Serial API, Chromium only)
  websocket.js          → WebSocketTransport (connects to bridge.py)
  connection.js         → ConnectionManager: picks transport, uniform event interface
  chart-manager.js      → DualChartManager: two stacked charts (voltage + current), 2 datasets each
  recorder.js           → Recorder with Blob-based CSV export (4 data columns)
  stats.js              → StatsTracker (Welford's algorithm for live statistics)
  ui.js                 → Readout, CV/CC badges, output indicators, stats display

bridge.py               → WebSocket ↔ serial bridge (pyserial + websockets)
.github/workflows/static.yml → GitHub Pages deployment (deploys on push to main)
```

No build step. No npm. ES modules loaded via `<script type="module">`. Chart.js + date adapter loaded from CDN with pinned versions.

## Transport Layer

Two transport backends implement the same EventTarget interface:
- **Web Serial** (`serial.js`) — direct USB access in Chromium browsers
- **WebSocket** (`websocket.js`) — connects to `bridge.py` for Firefox/Safari/any browser

Both emit `line` events with raw text responses. The `ScpiQueue` in `protocol.js` handles request-response matching.

`ConnectionManager` (`connection.js`) auto-detects browser capabilities and presents appropriate connect options.

## SCPI Protocol

The SPD3303X uses ASCII SCPI commands over virtual serial USB (9600 8N1). Unlike simple instruments, it requires a **request-response** pattern: queries return a single line of text.

### Key Commands

| Command | Returns | Purpose |
|---------|---------|---------|
| `MEASure:VOLTage? CH1` | `"30.000"` | Read actual voltage |
| `MEASure:CURRent? CH1` | `"1.000"` | Read actual current |
| `CH1:VOLTage 25.000` | (none) | Set voltage |
| `CH1:CURRent 1.000` | (none) | Set current limit |
| `OUTPut CH1,ON` | (none) | Enable output |
| `SYSTem:STATus?` | `"0x0224"` | Status bits (CV/CC, output on/off) |
| `*IDN?` | ID string | Device identification |

### ScpiQueue

The `ScpiQueue` class serializes SCPI queries: sends one command at a time, waits for a response line, then sends the next. This prevents response mismatching on the single serial channel.

## Deployment

The site is deployed to GitHub Pages automatically on push to `main` via `.github/workflows/static.yml`.

## Running

**Web UI (local development):**
```bash
uv run serve.py     # starts http://localhost:8000 and opens browser
```
Do NOT open `index.html` directly — ES modules require HTTP, not `file://`.

- Chrome/Edge: can connect directly via USB (Web Serial API)
- Firefox/Safari: use the WebSocket bridge
- Any browser: click Demo to test with fake data

**WebSocket Bridge (for non-Chromium browsers):**
```bash
uv run bridge.py                        # auto-detect serial port
uv run bridge.py /dev/cu.usbserial-10   # specify port
```
Dependencies (`pyserial`, `websockets`, `influxdb-client`) are declared inline via PEP 723 — `uv` installs them automatically.

**Linux: USBTMC device (`/dev/usbtmc0`)**

On Linux the SPD3303X presents as a USBTMC instrument rather than a virtual serial port. The bridge auto-detects this and uses `/dev/usbtmc0` directly. Access requires a udev rule:
```bash
echo 'SUBSYSTEM=="usbmisc", KERNEL=="usbtmc*", ATTRS{idVendor}=="f4ec", MODE="0666"' \
  | sudo tee /etc/udev/rules.d/99-siglent-spd3303x.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

**Optional InfluxDB logging:**
The bridge can optionally log readings to InfluxDB 2.x. At startup it prompts `Enable InfluxDB logging? [y/N]` — answering N (or pressing Enter) skips it entirely. If enabled, it collects 4 measurement responses per cycle and writes a single point with fields `ch1_voltage, ch1_current, ch2_voltage, ch2_current`.
