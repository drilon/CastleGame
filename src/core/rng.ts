/**
 * Deterministic PRNG. `Math.random` is banned outside of cosmetic particle jitter
 * in render/ — every simulation-affecting random draw must go through this.
 */
export type Rng = () => number;

/** mulberry32: fast, small-state, good-enough distribution for gameplay use. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes an arbitrary string seed into a 32-bit int suitable for mulberry32. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Creates a ready-to-use Rng directly from a string seed. */
export function rngFromSeed(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}

/** Integer in [min, max), using the given rng. */
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min)) + min;
}

/** Float in [min, max), using the given rng. */
export function randRange(rng: Rng, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/** Picks one element deterministically from a non-empty array. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: empty array');
  return arr[randInt(rng, 0, arr.length)]!;
}
