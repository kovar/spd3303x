/**
 * WebSerialTransport — Web Serial API (Chromium only) for SCPI text protocol.
 *
 * Events emitted:
 *   'connected', 'disconnected', 'line', 'log', 'error'
 *
 * Unlike the Kern version, this emits raw 'line' events (text strings)
 * instead of parsed 'reading' events — parsing is handled by ScpiQueue.
 */
export class WebSerialTransport extends EventTarget {
  #port = null;
  #reader = null;
  #running = false;

  static isSupported() {
    return 'serial' in navigator;
  }

  async connect() {
    try {
      this.#port = await navigator.serial.requestPort();
      await this.#port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });
      this.#running = true;
      this.#emit('connected');
      this.#emit('log', { message: 'Web Serial connected' });
      this.#readLoop();
    } catch (err) {
      this.#emit('error', { message: err.message });
      throw err;
    }
  }

  async disconnect() {
    this.#running = false;
    if (this.#reader) {
      try { await this.#reader.cancel(); } catch (_) {}
      this.#reader = null;
    }
    if (this.#port) {
      try { await this.#port.close(); } catch (_) {}
      this.#port = null;
    }
    this.#emit('disconnected');
  }

  async send(cmd) {
    if (!this.#port?.writable) {
      this.#emit('error', { message: 'Serial port not writable' });
      return;
    }
    const encoder = new TextEncoder();
    const writer = this.#port.writable.getWriter();
    try {
      await writer.write(encoder.encode(cmd.trim() + '\n'));
      this.#emit('log', { message: 'Sent: ' + cmd.trim() });
    } finally {
      writer.releaseLock();
    }
  }

  async #readLoop() {
    const decoder = new TextDecoder();
    let buffer = '';

    while (this.#running && this.#port?.readable) {
      try {
        this.#reader = this.#port.readable.getReader();
        while (this.#running) {
          const { value, done } = await this.#reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx;
          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (line) {
              this.#emit('log', { message: 'Received: ' + line });
              this.#emit('line', { line });
            }
          }
        }
      } catch (err) {
        if (this.#running) {
          this.#emit('error', { message: 'Read error: ' + err.message });
        }
      } finally {
        if (this.#reader) {
          try { this.#reader.releaseLock(); } catch (_) {}
          this.#reader = null;
        }
      }
    }
    if (this.#running) this.disconnect();
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
