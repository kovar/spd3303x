/**
 * protocol.js — SCPI command constants, ScpiQueue, and response parsers
 * for the Siglent SPD3303X power supply.
 */

/** SCPI command string constants and builder functions. */
export const SCPI = {
  // Queries
  MEAS_VOLT_CH1: 'MEASure:VOLTage? CH1',
  MEAS_VOLT_CH2: 'MEASure:VOLTage? CH2',
  MEAS_CURR_CH1: 'MEASure:CURRent? CH1',
  MEAS_CURR_CH2: 'MEASure:CURRent? CH2',
  STATUS: 'SYSTem:STATus?',
  IDN: '*IDN?',

  // Setters (return builder functions)
  setVoltage(ch, value) {
    return `CH${ch}:VOLTage ${value.toFixed(3)}`;
  },
  setCurrent(ch, value) {
    return `CH${ch}:CURRent ${value.toFixed(3)}`;
  },
  setOutput(ch, on) {
    return `OUTPut CH${ch},${on ? 'ON' : 'OFF'}`;
  },
};

/**
 * ScpiQueue — serializes SCPI queries over a single serial channel.
 *
 * Sends one command at a time, waits for a response line, then sends the next.
 * Commands without '?' (setters) are sent without waiting for a response.
 */
export class ScpiQueue {
  #sendFn;       // function(cmdString) — sends raw text to transport
  #pending = []; // FIFO of { resolve, reject, timeoutId }
  #timeout;

  /**
   * @param {Function} sendFn — called with the raw command string to transmit
   * @param {number} timeout — ms to wait for a response before rejecting
   */
  constructor(sendFn, timeout = 2000) {
    this.#sendFn = sendFn;
    this.#timeout = timeout;
  }

  /**
   * Enqueue a SCPI query (must contain '?'). Returns a Promise that resolves
   * with the response string.
   */
  query(cmd) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue if still pending
        const idx = this.#pending.findIndex(p => p.timeoutId === timeoutId);
        if (idx !== -1) this.#pending.splice(idx, 1);
        reject(new Error(`SCPI timeout: ${cmd}`));
      }, this.#timeout);

      this.#pending.push({ resolve, reject, timeoutId });
      this.#sendFn(cmd);
    });
  }

  /**
   * Send a command that expects no response (setter).
   */
  send(cmd) {
    this.#sendFn(cmd);
  }

  /**
   * Feed a received line from the transport. Resolves the oldest pending query.
   */
  feedLine(line) {
    if (this.#pending.length === 0) return false;
    const entry = this.#pending.shift();
    clearTimeout(entry.timeoutId);
    entry.resolve(line);
    return true;
  }

  /** Number of pending queries. */
  get pendingCount() {
    return this.#pending.length;
  }

  /** Clear all pending queries (e.g. on disconnect). */
  clear() {
    for (const entry of this.#pending) {
      clearTimeout(entry.timeoutId);
      entry.reject(new Error('Queue cleared'));
    }
    this.#pending = [];
  }
}

/**
 * Parse a numeric SCPI response like "30.000\n" → 30.0
 */
export function parseNumeric(response) {
  const trimmed = response.trim();
  const value = parseFloat(trimmed);
  return isNaN(value) ? null : value;
}

/**
 * Parse SYSTem:STATus? hex response → structured status object.
 *
 * Status word bits (from SPD3303X programming guide):
 *   Bit 0: CH1 CV/CC (0=CV, 1=CC)
 *   Bit 1: CH2 CV/CC (0=CV, 1=CC)
 *   Bits 2-3: Tracking mode (01=Independent, 11=Series, 10=Parallel)
 *   Bit 4: CH1 output (0=OFF, 1=ON)
 *   Bit 5: CH2 output (0=OFF, 1=ON)
 */
export function parseStatus(response) {
  const trimmed = response.trim();
  const value = parseInt(trimmed, 16);
  if (isNaN(value)) return null;

  const TRACKING_MODES = { 0b01: 'Independent', 0b11: 'Series', 0b10: 'Parallel' };

  return {
    ch1Mode: (value & 0x01) ? 'CC' : 'CV',
    ch2Mode: (value & 0x02) ? 'CC' : 'CV',
    trackingMode: TRACKING_MODES[(value >> 2) & 0x03] || 'Unknown',
    ch1Output: !!(value & 0x10),
    ch2Output: !!(value & 0x20),
  };
}

/**
 * Request a full reading from both channels (4 sequential queries).
 * @param {ScpiQueue} queue
 * @returns {Promise<{ch1: {voltage, current}, ch2: {voltage, current}}>}
 */
export async function requestReading(queue) {
  const [v1, v2, i1, i2] = await Promise.all([
    queue.query(SCPI.MEAS_VOLT_CH1),
    queue.query(SCPI.MEAS_VOLT_CH2),
    queue.query(SCPI.MEAS_CURR_CH1),
    queue.query(SCPI.MEAS_CURR_CH2),
  ]);

  return {
    ch1: { voltage: parseNumeric(v1), current: parseNumeric(i1) },
    ch2: { voltage: parseNumeric(v2), current: parseNumeric(i2) },
  };
}
