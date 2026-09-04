// Seeded xorshift32. No Math.random anywhere in the sim path — every call
// site threads the RNG state explicitly so a run replays identically from a
// seed. Folded in from the old src/engine/ track (see DECISIONS.md) — this
// file is the one part of that track the live engine actually needed.

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

/** Returns [value in [0, 1), nextState] — for the rare spot that needs a
 *  continuous roll (e.g. the police head-start seconds, or the wallet's
 *  three-way outcome split) rather than an integer bucket. */
export function nextFloat(state: RngState): [number, RngState] {
  const s = nextState(state)
  return [s / 4294967296, s] // s is a uint32; 2**32
}

/** Fisher-Yates using the seeded stream — replaces any `arr.sort(() =>
 *  Math.random() - 0.5)`, which is both unseeded and not actually uniform. */
export function shuffle<T>(state: RngState, arr: T[]): [T[], RngState] {
  const out = arr.slice()
  let s = state
  for (let i = out.length - 1; i > 0; i--) {
    let j: number
    ;[j, s] = nextInt(s, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return [out, s]
}

/** Derives an independent stream for one gameplay "domain" from a single run
 *  seed, so consuming more or fewer draws in one domain (e.g. adding a new
 *  furniture roll) never shifts the sequence any other domain sees. Two
 *  xorshift rounds after mixing in the tag is enough to decorrelate streams
 *  seeded from adjacent seeds or adjacent tags — this doesn't need to be
 *  cryptographic, only independent in practice. */
export function deriveStream(seed: number, tag: number): RngState {
  let x = (seed ^ Math.imul(tag, 0x9e3779b1)) >>> 0
  x = nextState(rngFromSeed(x))
  x = nextState(x)
  return x
}
