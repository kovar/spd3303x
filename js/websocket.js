/**
 * WebSocketTransport — connects to bridge.py for non-Chromium browsers.
 *
 * Events emitted (same interface as WebSerialTransport):
 *   'connected', 'disconnected', 'line', 'log', 'error'
 */
export class WebSocketTransport extends EventTarget {
  #ws = null;
  #url = '';
  #shouldReconnect = false;
  #reconnectTimer = null;
  static DEFAULT_URL = 'ws://localhost:8768';

  async connect(url) {
    this.#url = url || WebSocketTransport.DEFAULT_URL;
    this.#shouldReconnect = true;
    return this.#open();
  }

  #open() {
    return new Promise((resolve, reject) => {
      this.#emit('log', { message: 'Connecting to ' + this.#url + '...' });
      this.#ws = new WebSocket(this.#url);

      this.#ws.onopen = () => {
        this.#emit('connected');
        this.#emit('log', { message: 'WebSocket connected to ' + this.#url });
        resolve();
      };

      this.#ws.onerror = () => {
        const msg = 'Connection failed \u2014 run `uv run bridge.py` in a terminal first';
        this.#emit('error', { message: msg });
        this.#shouldReconnect = false;
        reject(new Error(msg));
      };

      this.#ws.onclose = () => {
        this.#emit('disconnected');
        this.#emit('log', { message: 'WebSocket closed' });
        if (this.#shouldReconnect) {
          this.#emit('log', { message: 'Reconnecting in 3s...' });
          this.#reconnectTimer = setTimeout(() => this.#open().catch(() => {}), 3000);
        }
      };

      this.#ws.onmessage = (event) => {
        const lines = event.data.split('\n');
        for (const raw of lines) {
          const trimmed = raw.trim();
          if (!trimmed) continue;
          this.#emit('log', { message: 'Received: ' + trimmed });
          this.#emit('line', { line: trimmed });
        }
      };
    });
  }

  async disconnect() {
    this.#shouldReconnect = false;
    clearTimeout(this.#reconnectTimer);
    if (this.#ws) {
      this.#ws.close();
      this.#ws = null;
    }
  }

  async send(cmd) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      this.#emit('error', { message: 'WebSocket not connected' });
      return;
    }
    this.#ws.send(cmd.trim() + '\n');
    this.#emit('log', { message: 'Sent: ' + cmd.trim() });
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
