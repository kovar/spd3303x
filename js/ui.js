/**
 * UI helpers — readout display, CV/CC badges, output indicators,
 * button states, stats display.
 * Theme is handled by inline script in index.html.
 */

export function setConnectionState(connected) {
  const dot = document.getElementById('statusDot');
  const connectSerialBtn = document.getElementById('connectSerial');
  const connectWsBtn = document.getElementById('connectWs');
  const disconnectBtn = document.getElementById('disconnect');
  const wsUrlInput = document.getElementById('wsUrl');

  if (dot) dot.classList.toggle('connected', connected);
  if (connectSerialBtn) connectSerialBtn.disabled = connected;
  if (connectWsBtn) connectWsBtn.disabled = connected;
  if (disconnectBtn) disconnectBtn.disabled = !connected;
  if (wsUrlInput) wsUrlInput.disabled = connected;

  const cmdBtns = document.querySelectorAll('[data-requires-connection]');
  cmdBtns.forEach(btn => btn.disabled = !connected);
}

export function setMeasurementState(active) {
  const startBtn = document.getElementById('startMeasure');
  const stopBtn = document.getElementById('stopMeasure');
  if (startBtn) {
    startBtn.disabled = active;
    startBtn.classList.toggle('active', false);
  }
  if (stopBtn) {
    stopBtn.disabled = !active;
    stopBtn.classList.toggle('active', active);
  }
}

export function setRecordingState(active) {
  const startBtn = document.getElementById('startRecord');
  const stopBtn = document.getElementById('stopRecord');
  if (startBtn) {
    startBtn.disabled = active;
    startBtn.classList.toggle('active', false);
  }
  if (stopBtn) {
    stopBtn.disabled = !active;
    stopBtn.classList.toggle('active', active);
  }
}

/**
 * Update the 2-channel readout display with voltage, current, and power.
 * @param {{ch1: {voltage, current}, ch2: {voltage, current}}} reading
 */
export function updateReadout(reading) {
  for (const ch of ['ch1', 'ch2']) {
    const v = reading[ch].voltage;
    const i = reading[ch].current;
    const vEl = document.getElementById(`${ch}Voltage`);
    const iEl = document.getElementById(`${ch}Current`);
    const pEl = document.getElementById(`${ch}Power`);

    if (vEl) vEl.textContent = v !== null ? v.toFixed(3) : '---';
    if (iEl) iEl.textContent = i !== null ? i.toFixed(3) : '---';
    if (pEl) {
      if (v !== null && i !== null) {
        pEl.textContent = (v * i).toFixed(3);
      } else {
        pEl.textContent = '---';
      }
    }
  }
  const timeEl = document.getElementById('readoutTime');
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
}

/**
 * Update the status display (CV/CC badges and output indicators).
 * @param {{ch1Mode, ch2Mode, ch1Output, ch2Output, trackingMode}} status
 */
export function updateStatus(status) {
  if (!status) return;

  for (const ch of ['ch1', 'ch2']) {
    const badge = document.getElementById(`${ch}Mode`);
    if (badge) {
      badge.textContent = status[`${ch}Mode`];
      badge.className = `mode-badge mode-${status[`${ch}Mode`].toLowerCase()}`;
    }

    const outEl = document.getElementById(`${ch}OutputState`);
    if (outEl) {
      const on = status[`${ch}Output`];
      outEl.textContent = on ? 'ON' : 'OFF';
      outEl.className = `output-state ${on ? 'output-on' : 'output-off'}`;
    }
  }

  const trackEl = document.getElementById('trackingMode');
  if (trackEl) trackEl.textContent = status.trackingMode;
}

/**
 * Update stats display for all 4 measurements (CH1V, CH1I, CH2V, CH2I).
 * @param {{ch1v, ch1i, ch2v, ch2i}} stats — each is a stats object from StatsTracker
 */
export function updateStats(stats) {
  const fmt = (v, decimals = 3) => v === null ? '---' : v.toFixed(decimals);
  const set = (id, v, decimals) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmt(v, decimals);
  };

  set('statCh1VMin', stats.ch1v.min);
  set('statCh1VMax', stats.ch1v.max);
  set('statCh1VMean', stats.ch1v.mean);
  set('statCh1IMin', stats.ch1i.min);
  set('statCh1IMax', stats.ch1i.max);
  set('statCh1IMean', stats.ch1i.mean);
  set('statCh2VMin', stats.ch2v.min);
  set('statCh2VMax', stats.ch2v.max);
  set('statCh2VMean', stats.ch2v.mean);
  set('statCh2IMin', stats.ch2i.min);
  set('statCh2IMax', stats.ch2i.max);
  set('statCh2IMean', stats.ch2i.mean);

  const countEl = document.getElementById('statCount');
  if (countEl) countEl.textContent = stats.ch1v.count;
}

export function appendLog(message) {
  const el = document.getElementById('logOutput');
  if (!el) return;
  const now = new Date().toLocaleTimeString();
  el.textContent += `[${now}] ${message}\n`;
  el.scrollTop = el.scrollHeight;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 * @param {number} duration ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  const dismiss = () => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  };
  el.addEventListener('click', dismiss);
  if (duration > 0) setTimeout(dismiss, duration);
}
