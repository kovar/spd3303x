/**
 * StatsTracker — running statistics using Welford's online algorithm.
 */
export class StatsTracker {
  #count = 0;
  #mean = 0;
  #m2 = 0;
  #min = Infinity;
  #max = -Infinity;

  addValue(n) {
    if (typeof n !== 'number' || isNaN(n)) return;
    this.#count++;
    const delta = n - this.#mean;
    this.#mean += delta / this.#count;
    const delta2 = n - this.#mean;
    this.#m2 += delta * delta2;
    if (n < this.#min) this.#min = n;
    if (n > this.#max) this.#max = n;
  }

  reset() {
    this.#count = 0;
    this.#mean = 0;
    this.#m2 = 0;
    this.#min = Infinity;
    this.#max = -Infinity;
  }

  getStats() {
    if (this.#count === 0) {
      return { min: null, max: null, mean: null, stddev: null, count: 0 };
    }
    const variance = this.#count > 1 ? this.#m2 / (this.#count - 1) : 0;
    return {
      min: this.#min,
      max: this.#max,
      mean: this.#mean,
      stddev: Math.sqrt(variance),
      count: this.#count,
    };
  }
}
