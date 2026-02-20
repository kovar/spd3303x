#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "pyserial",
#     "websockets",
#     "influxdb-client",
# ]
# ///
"""
bridge.py — WebSocket ↔ Serial bridge for Siglent SPD3303X power supply.

Relays SCPI text commands between a WebSocket client and the USB virtual
serial port. For InfluxDB logging, tracks pending measurement queries and
collects 4 responses (CH1/CH2 voltage/current) before writing a point.

Usage:
    uv run bridge.py                        # auto-detect serial port
    uv run bridge.py /dev/cu.usbserial-10   # specify port
    uv run bridge.py COM3                   # Windows

The web app connects to ws://localhost:8765 (default).
"""

import asyncio
import getpass
import glob
import re
import sys

import serial
import serial.tools.list_ports
import websockets


BAUD_RATE = 9600
WS_HOST = "localhost"
WS_PORT = 8765

# SCPI measurement query patterns for InfluxDB tracking
MEAS_QUERIES = {
    "MEASure:VOLTage? CH1": "ch1_voltage",
    "MEASure:CURRent? CH1": "ch1_current",
    "MEASure:VOLTage? CH2": "ch2_voltage",
    "MEASure:CURRent? CH2": "ch2_current",
}

# InfluxDB state
_influx = None
# Pending measurement tracking for InfluxDB
_pending_fields = []  # FIFO of field name strings
_collected = {}  # accumulates fields until all 4 present


def _is_usb_port(p):
    """Return True if this port looks like a USB serial device."""
    if p.vid is not None:
        return True
    name = p.device.lower()
    return any(s in name for s in ("ttyusb", "ttyacm", "cu.usb", "cu.wch"))


def find_device():
    """Find the SPD3303X — as a USB serial port or a USBTMC device.

    On macOS/Windows the device presents as a virtual serial port.
    On Linux it typically presents as /dev/usbtmc0 (USBTMC class).
    Returns (transport, path) where transport is 'serial' or 'usbtmc'.
    """
    # Try USB serial ports first
    all_ports = list(serial.tools.list_ports.comports())
    usb_ports = [p for p in all_ports if _is_usb_port(p)]

    if usb_ports:
        if len(usb_ports) == 1:
            p = usb_ports[0]
            vid_pid = f"  VID:PID={p.vid:04X}:{p.pid:04X}" if p.vid is not None else ""
            print(f"Found serial port: {p.device} [USB]  —  {p.description}{vid_pid}")
            return "serial", p.device
        print("USB serial devices found:\n")
        for i, p in enumerate(usb_ports, 1):
            vid_pid = f"  VID:PID={p.vid:04X}:{p.pid:04X}" if p.vid is not None else ""
            print(f"  [{i}]  {p.device}  —  {p.description}{vid_pid}")
        print()
        while True:
            try:
                choice = input(f"Type a number [1-{len(usb_ports)}] and press Enter: ").strip()
                idx = int(choice) - 1
                if 0 <= idx < len(usb_ports):
                    return "serial", usb_ports[idx].device
            except (ValueError, EOFError):
                pass
            print(f"  Please enter a number between 1 and {len(usb_ports)}")

    # No USB serial ports — try USBTMC (Linux: SPD3303X presents as /dev/usbtmc*)
    usbtmc_devs = sorted(glob.glob("/dev/usbtmc*"))
    if usbtmc_devs:
        if len(usbtmc_devs) == 1:
            print(f"Found USBTMC device: {usbtmc_devs[0]}")
            return "usbtmc", usbtmc_devs[0]
        print("Multiple USBTMC devices found:\n")
        for i, d in enumerate(usbtmc_devs, 1):
            print(f"  [{i}]  {d}")
        print()
        while True:
            try:
                choice = input(f"Type a number [1-{len(usbtmc_devs)}] and press Enter: ").strip()
                idx = int(choice) - 1
                if 0 <= idx < len(usbtmc_devs):
                    return "usbtmc", usbtmc_devs[idx]
            except (ValueError, EOFError):
                pass
            print(f"  Please enter a number between 1 and {len(usbtmc_devs)}")

    # Last resort: show all serial ports (non-USB)
    if all_ports:
        print("No USB serial or USBTMC devices found — showing all serial ports:")
        if len(all_ports) == 1:
            print(f"Found serial port: {all_ports[0].device}  —  {all_ports[0].description}")
            return "serial", all_ports[0].device
        for i, p in enumerate(all_ports, 1):
            print(f"  [{i}]  {p.device}  —  {p.description}")
        print()
        while True:
            try:
                choice = input(f"Type a number [1-{len(all_ports)}] and press Enter: ").strip()
                idx = int(choice) - 1
                if 0 <= idx < len(all_ports):
                    return "serial", all_ports[idx].device
            except (ValueError, EOFError):
                pass
            print(f"  Please enter a number between 1 and {len(all_ports)}")


def open_serial(port_name):
    """Open serial port with SPD3303X default settings."""
    return serial.Serial(
        port=port_name,
        baudrate=BAUD_RATE,
        bytesize=serial.EIGHTBITS,
        stopbits=serial.STOPBITS_ONE,
        parity=serial.PARITY_NONE,
        timeout=0.1,
    )


def setup_influxdb():
    """Interactively configure InfluxDB logging. Returns config dict or None."""
    global _influx
    try:
        answer = input("\nEnable InfluxDB logging? [y/N]: ").strip().lower()
    except EOFError:
        return None
    if answer != "y":
        return None

    from influxdb_client import InfluxDBClient

    print("\n── InfluxDB Setup ──────────────────────────────────")
    url = input("URL [http://localhost:8086]: ").strip() or "http://localhost:8086"
    org = input("Organization: ").strip()
    bucket = input("Bucket: ").strip()
    print("API Token")
    print("  (Find yours at: InfluxDB UI → Load Data → API Tokens)")
    token = getpass.getpass("  Token: ")
    measurement = input("Measurement name: ").strip()
    print("  Use snake_case, e.g. spd3303x_bench1")

    if not all([org, bucket, token, measurement]):
        print("Missing required fields — InfluxDB logging disabled.")
        return None

    print("\nTesting connection... ", end="", flush=True)
    client = InfluxDBClient(url=url, token=token, org=org)
    try:
        health = client.health()
        if health.status != "pass":
            print(f"✗ ({health.message})")
            client.close()
            return None
    except Exception as e:
        print(f"✗ ({e})")
        client.close()
        return None
    print("✓")

    write_api = client.write_api()
    _influx = {
        "client": client,
        "write_api": write_api,
        "bucket": bucket,
        "org": org,
        "measurement": measurement,
    }
    print(f"InfluxDB logging enabled → {org}/{bucket}/{measurement}\n")
    return _influx


def close_influxdb():
    """Flush pending writes and close the InfluxDB client."""
    global _influx
    if _influx:
        print("Flushing InfluxDB...", end=" ", flush=True)
        try:
            _influx["write_api"].close()
            _influx["client"].close()
        except Exception:
            pass
        print("done.")
        _influx = None


def track_query(cmd):
    """If cmd is a measurement query, record which field we expect next."""
    cmd_upper = cmd.strip().upper()
    for pattern, field_name in MEAS_QUERIES.items():
        if cmd_upper == pattern.upper():
            _pending_fields.append(field_name)
            return
    # Also match with a '?' query but ignore non-measurement queries
    # (like SYSTem:STATus? or *IDN?) — those don't produce numeric data


def track_response(line):
    """Match a serial response to a pending measurement query and collect for InfluxDB."""
    global _collected
    if not _influx or not _pending_fields:
        return

    field_name = _pending_fields.pop(0)
    try:
        value = float(line.strip())
    except ValueError:
        return

    _collected[field_name] = value

    # When we have all 4 fields, write the point
    required = {"ch1_voltage", "ch1_current", "ch2_voltage", "ch2_current"}
    if required.issubset(_collected.keys()):
        write_influx_point(_collected)
        _collected = {}


def write_influx_point(fields):
    """Write a complete measurement point to InfluxDB."""
    if not _influx:
        return

    from influxdb_client import Point

    point = Point(_influx["measurement"])
    for name, value in fields.items():
        point = point.field(name, value)

    try:
        _influx["write_api"].write(
            bucket=_influx["bucket"],
            org=_influx["org"],
            record=point,
        )
    except Exception as e:
        print(f"  InfluxDB write error: {e}")


async def serial_to_ws(ser, ws):
    """Read lines from serial and send to WebSocket."""
    loop = asyncio.get_event_loop()
    buffer = ""
    while True:
        data = await loop.run_in_executor(None, ser.read, 256)
        if data:
            buffer += data.decode("ascii", errors="replace")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if line:
                    try:
                        await ws.send(line)
                    except websockets.ConnectionClosed:
                        return
                    track_response(line)
        else:
            await asyncio.sleep(0.05)


async def ws_to_serial(ser, ws):
    """Read commands from WebSocket and write to serial."""
    try:
        async for message in ws:
            cmd = message.strip()
            if cmd:
                ser.write((cmd + "\n").encode("ascii"))
                print(f"  → Sent to PSU: {cmd}")
                track_query(cmd)
    except websockets.ConnectionClosed:
        pass


async def handler(ws, ser):
    """Handle a single WebSocket connection (serial transport)."""
    peer = getattr(ws, "remote_address", None)
    print(f"  Client connected: {peer}")
    try:
        await asyncio.gather(
            serial_to_ws(ser, ws),
            ws_to_serial(ser, ws),
        )
    finally:
        print(f"  Client disconnected: {peer}")


async def handler_usbtmc(ws, f):
    """Handle a single WebSocket connection (USBTMC transport).

    USBTMC is strictly request-response: write a command, then immediately
    read the response for query commands (those containing '?').
    """
    peer = getattr(ws, "remote_address", None)
    print(f"  Client connected: {peer}")
    loop = asyncio.get_event_loop()
    try:
        async for message in ws:
            cmd = message.strip()
            if not cmd:
                continue
            await loop.run_in_executor(None, f.write, (cmd + "\n").encode("ascii"))
            print(f"  → Sent to PSU: {cmd}")
            track_query(cmd)
            if "?" in cmd:
                raw = await loop.run_in_executor(None, f.read, 4096)
                line = raw.decode("ascii", errors="replace").strip()
                if line:
                    try:
                        await ws.send(line)
                    except websockets.ConnectionClosed:
                        break
                    track_response(line)
    except websockets.ConnectionClosed:
        pass
    finally:
        print(f"  Client disconnected: {peer}")


async def main():
    if len(sys.argv) > 1:
        # Explicit path given — detect type by name
        path = sys.argv[1]
        transport = "usbtmc" if "usbtmc" in path else "serial"
    else:
        transport, path = find_device()

    if not path:
        print("No serial port or USBTMC device found. Connect the SPD3303X and try again.")
        print("  Serial:  uv run bridge.py /dev/ttyUSB0")
        print("  USBTMC:  uv run bridge.py /dev/usbtmc0")
        sys.exit(1)

    if transport == "usbtmc":
        print(f"Opening USBTMC device: {path}")
        try:
            f = open(path, "r+b", buffering=0)
        except PermissionError:
            print(f"Permission denied: {path}")
            print("Add a udev rule to grant access:")
            print("  echo 'SUBSYSTEM==\"usbmisc\", KERNEL==\"usbtmc*\", ATTRS{idVendor}==\"f4ec\", MODE=\"0666\"' \\")
            print("    | sudo tee /etc/udev/rules.d/99-siglent-spd3303x.rules")
            print("  sudo udevadm control --reload-rules && sudo udevadm trigger")
            sys.exit(1)
        setup_influxdb()
        print(f"Starting WebSocket server on ws://{WS_HOST}:{WS_PORT}")
        print("Web app can now connect via the Bridge button.\n")
        async with websockets.serve(lambda ws: handler_usbtmc(ws, f), WS_HOST, WS_PORT):
            await asyncio.Future()
    else:
        print(f"Opening serial port: {path} at {BAUD_RATE} baud")
        ser = open_serial(path)
        print(f"Serial port opened: {ser.name}")
        setup_influxdb()
        print(f"Starting WebSocket server on ws://{WS_HOST}:{WS_PORT}")
        print("Web app can now connect via the Bridge button.\n")
        async with websockets.serve(lambda ws: handler(ws, ser), WS_HOST, WS_PORT):
            await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        close_influxdb()
        print("\nBridge stopped.")
