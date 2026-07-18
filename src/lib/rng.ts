/**
 * Deterministic, seeded pseudo-random number generator.
 *
 * `mulberry32` is a tiny, fast 32-bit PRNG. Given the same seed it always
 * produces the same sequence, which is exactly what we want so the stub demo
 * data is stable across reloads. When the real backend lands this whole module
 * (and the seed layer that uses it) goes away.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small helper set built on a single seeded stream. */
export class SeededRandom {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
