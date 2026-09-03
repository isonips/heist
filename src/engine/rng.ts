// Seeded xorshift32. No Math.random anywhere in the engine — every call site
// threads the RNG state explicitly so a run replays identically from a seed.

export type RngState = number

export function rngFromSeed(seed: number): RngState {
  const s = seed >>> 0
  return s === 0 ? 0x9e3779b9 : s
}

/** Advances the generator, returning the new state (also the raw 32-bit output). */
export function nextState(state: RngState): RngState {
  let x = state >>> 0
  x ^= x << 13
  x >>>= 0
  x ^= x >>> 17
  x ^= x << 5
  x >>>= 0
  return x >>> 0
}

/** Returns [value in [0, max), nextState]. max must be a positive integer. */
export function nextInt(state: RngState, max: number): [number, RngState] {
  const s = nextState(state)
  return [s % max, s]
}

/** Returns [true with probability p (0..1, resolved to /1000 precision), nextState]. */
export function nextChance(state: RngState, p: number): [boolean, RngState] {
  const threshold = Math.round(p * 1000)
  const [v, s] = nextInt(state, 1000)
  return [v < threshold, s]
}

/** Returns [value in [min, max], nextState] inclusive integer range. */
export function nextRange(state: RngState, min: number, max: number): [number, RngState] {
  const [v, s] = nextInt(state, max - min + 1)
  return [min + v, s]
}
