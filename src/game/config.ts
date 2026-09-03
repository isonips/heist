import type { Config } from '@/engine/types'

// Default calibration baseline — not yet tuned to the code brief's targets
// (success rate 60-65%, impossible share 30-35%, etc). See CALIBRATION.md.
// Kept in one place so the harness sweep and the live page can be pointed
// at the same numbers once a config is picked.
export const DEFAULT_CONFIG: Config = {
  density: 0.5,
  speedMul: 1.0,
  policeDelay: 9 * 30,
  grace: 3 * 30,
  ramp: 0.014,
  reinforcement: true,
}
