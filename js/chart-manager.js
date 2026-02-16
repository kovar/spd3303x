/**
 * DualChartManager — two stacked Chart.js charts (voltage + current),
 * each with 2 datasets (CH1 red, CH2 blue).
 */

const CH1_COLOR = { border: '#e74c3c', fill: 'rgba(231,76,60,0.08)' };
const CH2_COLOR = { border: '#3498db', fill: 'rgba(52,152,219,0.08)' };

export class DualChartManager {
  #voltageChart = null;
  #currentChart = null;
  #vData = { ch1: [], ch2: [] };
  #iData = { ch1: [], ch2: [] };
  #timeWindow = 300; // seconds

  constructor(voltageCanvas, currentCanvas) {
    this.#voltageChart = createChart(voltageCanvas, 'Voltage (V)', this.#vData);
    this.#currentChart = createChart(currentCanvas, 'Current (A)', this.#iData);
  }

  /**
   * Add a reading for both channels.
   * @param {{ch1: {voltage, current}, ch2: {voltage, current}}} reading
   */
  addReading(reading) {
    const now = new Date();
    pushIfValid(this.#vData.ch1, now, reading.ch1.voltage);
    pushIfValid(this.#vData.ch2, now, reading.ch2.voltage);
    pushIfValid(this.#iData.ch1, now, reading.ch1.current);
    pushIfValid(this.#iData.ch2, now, reading.ch2.current);
    this.#prune(now);
    this.#voltageChart.update('none');
    this.#currentChart.update('none');
  }

  clear() {
    this.#vData.ch1.length = 0;
    this.#vData.ch2.length = 0;
    this.#iData.ch1.length = 0;
    this.#iData.ch2.length = 0;
    this.#voltageChart.update();
    this.#currentChart.update();
  }

  setTimeWindow(seconds) {
    this.#timeWindow = seconds;
    this.#prune(new Date());
    this.#voltageChart.update();
    this.#currentChart.update();
  }

  destroy() {
    if (this.#voltageChart) { this.#voltageChart.destroy(); this.#voltageChart = null; }
    if (this.#currentChart) { this.#currentChart.destroy(); this.#currentChart = null; }
  }

  #prune(now) {
    const cutoff = now.getTime() - this.#timeWindow * 1000;
    for (const ds of [this.#vData.ch1, this.#vData.ch2, this.#iData.ch1, this.#iData.ch2]) {
      while (ds.length > 0 && ds[0].x.getTime() < cutoff) {
        ds.shift();
      }
    }
  }
}

function pushIfValid(arr, time, value) {
  if (typeof value === 'number' && !isNaN(value)) {
    arr.push({ x: time, y: value });
  }
}

function createChart(canvas, yLabel, dataRefs) {
  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'CH1',
          data: dataRefs.ch1,
          borderColor: CH1_COLOR.border,
          backgroundColor: CH1_COLOR.fill,
          borderWidth: 2,
          pointRadius: 1,
          pointHoverRadius: 5,
          tension: 0.1,
          fill: false,
        },
        {
          label: 'CH2',
          data: dataRefs.ch2,
          borderColor: CH2_COLOR.border,
          backgroundColor: CH2_COLOR.fill,
          borderWidth: 2,
          pointRadius: 1,
          pointHoverRadius: 5,
          tension: 0.1,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'second',
            displayFormats: { second: 'HH:mm:ss' },
          },
          title: { display: false },
        },
        y: {
          title: { display: true, text: yLabel },
          beginAtZero: true,
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}`,
          },
        },
        legend: {
          display: true,
          position: 'top',
        },
      },
      animation: false,
    },
  });
}
