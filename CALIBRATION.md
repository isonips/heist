# Calibration status (phase 1 checkpoint)

The engine and harness (`src/engine/`, `src/harness/`) are complete and match
the API contract in `heistcodebrief.md` section 3: deterministic integer
simulation, seeded xorshift32, reachability-constrained map generation,
trailing + elastic police, once-per-run reinforcement, `buildMap` /
`simulate` / `step` / `escape`.

## Known gap: default generation constants are too easy

The first full 1000-seed sweep (`harness-out/`) shows the harness bot
clearing the entire 60-lane map (`MAXLANE`) in well under a third of the
60s budget, at every density x speedMul config, then eventually getting
caught while idling at the end (the trailing-police model correctly
punishes standing still — see `src/engine/police.ts` — but the map should
never be short enough for a strong player to run out of road first).

This isn't an engine bug: the reachability-guaranteed traffic geometry
(`src/engine/laneGeometry.ts`, `map.ts`) makes gaps too easy to find at
every point on the current density/speedMul grid, so a fast, hesitation-free
bot barely gets slowed down. Real numbers (success rate 60-65%, impossible
share 30-35%, relative gap <= 0.06, etc., per the code brief section 4) need
iterative retuning of the generation constants in `src/engine/constants.ts`
(`SLOTS_MIN/MAX`, `PERIOD_MIN/MAX`, `BASE_SPEED_FP_PER_TICK`,
`TICKS_PER_MOVE`) and possibly the density/speedMul grid itself.

Per the project owner's direction: rather than keep tuning against a bot
(faster/more consistent than any human), calibration continues once the
renderer/page (phase 2) is playable, using real playtesting alongside
`npx tsx src/harness/cli.ts <seedsPerConfig>` for quick sweeps.

## Fixed in this pass

`buildMap` could previously end on a live 'road' lane with no closing verge
after it (when the last road run landed exactly on `MAXLANE`), stranding the
player in traffic they could never leave. The map now always closes on a
verge, adding one more if needed.
