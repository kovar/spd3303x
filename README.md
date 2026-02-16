# SPD3303X Power Supply

Web application for communicating with Siglent SPD3303X dual-channel programmable DC power supplies using SCPI commands over virtual serial USB. Reads voltage and current from both channels, displays live readings with statistics, charts measurements in real-time, and exports to CSV.

![Screenshot — dark mode demo](https://img.shields.io/badge/no_build_step-ES_modules-teal)

## Features

- **Dual-channel live readout** with voltage, current, and power per channel
- **CV/CC mode indicators** and output state badges
- **Two stacked real-time charts** — voltage and current with CH1 (red) and CH2 (blue)
- **Running statistics** — min, max, mean per measurement (Welford's algorithm)
- **CSV recording** — timestamped export with columns CH1_Voltage, CH1_Current, CH2_Voltage, CH2_Current
- **Output controls** — set voltage/current setpoints, toggle outputs ON/OFF
- **Two connection modes** — USB (Web Serial) or WebSocket bridge
- **Dark/light theme** — auto-detects OS preference
- **Demo mode** — try it without hardware

## Quick Start

```bash
uv run serve.py
```

This starts a local server at **http://localhost:8000** and opens your browser.

> Don't open `index.html` directly — ES modules require a web server.

### Connect to your SPD3303X

- **Chrome/Edge:** Click **USB** to connect directly via Web Serial API
- **Firefox/Safari/remote:** Start the bridge, then click **Bridge**:
  ```bash
  uv run bridge.py                        # auto-detect serial port
  uv run bridge.py /dev/cu.usbserial-10   # specify port
  ```
- **No hardware:** Click **Demo** to generate fake data

## Architecture

No build step, no npm, no bundler. Plain ES modules served over HTTP. Chart.js loaded from CDN.

```
index.html          HTML shell (dual-channel power supply UI)
css/styles.css      Styles with CSS custom properties for theming
js/
  main.js           Entry point, poll loop, event wiring
  protocol.js       SCPI commands, ScpiQueue (request-response), parsers
  serial.js         Web Serial transport (Chromium only)
  websocket.js      WebSocket transport (connects to bridge.py)
  connection.js     ConnectionManager — uniform event interface
  chart-manager.js  Dual Chart.js wrapper (voltage + current, 2 datasets each)
  recorder.js       CSV recording and Blob-based download
  stats.js          Welford's online statistics
  ui.js             Readout, CV/CC badges, output indicators, toasts
bridge.py           WebSocket-to-serial relay (pyserial + websockets)
serve.py            Local dev server
```

## SCPI Protocol

ASCII SCPI commands over virtual serial USB. Serial config: 9600 baud, 8N1.

| Command | Returns | Description |
|---------|---------|-------------|
| `MEASure:VOLTage? CH1` | `30.000` | Read actual voltage |
| `MEASure:CURRent? CH1` | `1.000` | Read actual current |
| `CH1:VOLTage 25.000` | — | Set voltage setpoint |
| `CH1:CURRent 1.000` | — | Set current limit |
| `OUTPut CH1,ON` | — | Enable output |
| `SYSTem:STATus?` | `0x0224` | Status register (CV/CC, output, tracking) |
| `*IDN?` | ID string | Device identification |

The full command reference is built into the app under **SCPI Command Reference**.

## Dependencies

**Browser:** None — everything loads from CDN or is vanilla JS.

**Python tools** (managed automatically by `uv` via PEP 723 inline metadata):
- `bridge.py` — `pyserial`, `websockets`, `influxdb-client`
- `serve.py` — stdlib only

## Deployment

Deployed to GitHub Pages on push to `main` via `.github/workflows/static.yml`.
