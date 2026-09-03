/**
 * HEIST — theme.ts
 * The single contract with the developer. No colour, no duration, no frame count
 * and no pixel offset appears anywhere in the codebase outside this file.
 *
 * Art direction: palette A (SODIUM), character: THE ESCAPEE.
 *
 * The character: an escaped convict in a striped knit beanie and orange prison
 * jumpsuit striped in black, and the gold lottery ticket in his fist. The ticket
 * is his freedom. He must not drop it. When he lifts something there is a wallet
 * in one hand and a painting in the other, and the ticket is out of sight.
 *
 * Rules encoded here that are requirements, not preferences:
 *  - 16 colours, no more. Anything not in `palette` does not exist.
 *  - No border-radius, no box-shadow, no gradient, no opacity fade, no smooth easing.
 *    Depth is a 1px bevel; tonal transition is dither.
 *  - Every icon is a sprite from sprites.png, referenced by name (`icon:siren`).
 *    No emoji, no icon font, no inline glyph, no runtime SVG.
 *  - Type is a bitmap face at two hand-made sizes. Never a fractional size,
 *    never a scale transform on text.
 *  - Nothing carries meaning by colour alone (see `colourBlind`).
 */

export const theme = {
  meta: {
    name: 'HEIST',
    paletteName: 'SODIUM',
    characterDirection: 'THE ESCAPEE',
    outfit: 'black knit beanie, white jumpsuit with black stripes, steel shoes',
    maxColours: 16,
  },

  /* ---------------------------------------------------------------- palette */
  /** All 16. Keys are the sprite-sheet channel letters, so a sprite row like
   *  '..KSSK..' maps character-for-character onto these. */
  palette: {
    ink:      '#05060a', // K — outlines, window shadow edge, the void
    shade:    '#10131d', // k — panel interior, keyhole
    road:     '#171b28', // T — road surface, the plate sprites sit on
    steel:    '#2b3350', // S — chrome, title bars, the suit
    steelLt:  '#4c5878', // s — bevel light edge, dividers, rim
    concrete: '#8b98bd', // C — secondary text, pavement, toolbelt
    pale:     '#d7def2', // P — body text, mask band, windscreen
    white:    '#ffffff', // W — highlight only, never a fill
    amber:    '#ffa11f', // A — the dominant. Primary action, active tab, cap
    amberDk:  '#d1690a', // a — amber bevel shadow, cap underside
    amberDp:  '#7a3b04', // b — pressed amber, siren wash ground
    gold:     '#ffd84d', // G — loot, headlights, legendary halo
    sirenRed: '#ff2f2f', // R — police, lost heart, danger. Never for text
    sirenBlu: '#2358ff', // B — police only. Never for UI
    verge:    '#2f5d3a', // V — grass verge
    chrome:   '#1d2230', // x — inactive tab, disabled control
  },

  /** Semantic aliases. UI code uses these names, never the raw palette keys. */
  role: {
    pageBg: 'road',
    panelBg: 'shade',
    panelBevelLight: 'steelLt',
    panelBevelDark: 'ink',
    titleBarBg: 'steel',
    titleBarText: 'white',
    tabActiveBg: 'shade',
    tabActiveText: 'amber',
    tabIdleBg: 'chrome',
    tabIdleText: 'concrete',
    textPrimary: 'pale',
    textSecondary: 'concrete',
    textDim: 'steelLt',
    actionBg: 'amber',
    actionText: 'ink',
    actionBevelLight: 'gold',
    actionBevelDark: 'amberDp',
    lootText: 'gold',
    dangerFill: 'sirenRed',
  },

  /* ------------------------------------------------------------------- type */
  /** Bitmap face at two hand-made sizes. No third size, no fractional value. */
  type: {
    family: '"Silkscreen", monospace',
    /** Three hand-made sizes, no fourth and never a fractional value. 8 is the
     *  face at 1x and exists for one reason: fifteen wire entries have to fit in
     *  420px at 300px wide. 16 is the game and the UI. 32 is a number you shout. */
    size: { feed: 8, body: 16, display: 32 },
    lineHeight: { tight: 1, read: 1.6 },
    letterSpacing: 0,
    /** Text is never scaled, never rotated, never faded. */
    forbidden: ['transform: scale', 'opacity transition', 'text-shadow'],
  },

  /* ------------------------------------------------------------------ chrome */
  chrome: {
    bevel: 1,                 // px, always 1
    borderRadius: 0,
    /** Pressed state: invert the bevel and shift the label 1px down-right. */
    pressShift: { x: 1, y: 1 },
    titleBarHeight: 28,
    tabHeight: 32,
    windowPadding: 32,
    panelPadding: 20,
    gridGap: 24,
  },

  /* -------------------------------------------------------------- the thief */
  thief: {
    box: { w: 20, h: 24 },    // sprite cell
    /** Drawn inside a 22x32 cell so the hop can rise 9px without reframing.
     *  Feet always sit on row `footRow` of the cell, at every scale. */
    cell: { w: 22, h: 32, footRow: 8, xOffset: 1 },
    /** Integer scales only. 300px-wide hero = scale 13 on the 22px cell. */
    scales: { game: 3, hud: 2, sheet: 4, hero: 13 },
  },

  /* ---------------------------------------------------------------- the road */
  /**
   * LANE OWNERSHIP — a bug fix promoted to a requirement.
   * Players died believing they had room, because a vehicle drawn high in its
   * band reads as belonging to the band above. Two rules fix it:
   *
   *  1. Every vehicle is drawn in the LOWER part of its own band, with
   *     `clearTop` px of empty band above it. Nothing ever overlaps a boundary.
   *  2. Every object on the road — vehicle, obstacle, bystander, the thief —
   *     casts a flat ground shadow INSIDE its own band. The shadow is what
   *     makes lane ownership unambiguous at a glance.
   *
   * LANE MARKINGS sit on the BOUNDARY between two bands, never inside one.
   * A dashed line down the middle of a band reads as a separator and misleads.
   */
  road: {
    laneHeight: 24,           // px, one band — a car lane
    /**
     * REVISED: a vehicle FILLS its lane. Drawn small with a corridor of empty band
     * above it, a car read as something the escapee could slip past — and he
     * cannot. The corridor is gone; the flat shadow inside the band carries lane
     * ownership on its own.
     */
    vehicle: {
      clearTop: 2,            // px. Just enough to keep the roof off the boundary.
      bottomInset: 2,         // px from the band's lower boundary to the wheels
      maxHeight: 20,          // a car. The truck owns a taller band.
      /** Every vehicle is wider than the escapee and taller than his stride. */
      widerThanThief: true,
    },
    /** Flat ground shadow. No blur, no gradient, no opacity — one flat colour. */
    shadow: {
      colour: 'ink',
      /** Solid for vehicles, 50% dither for light objects, so a shadow never
       *  reads as a hole in the road. */
      fill: { vehicle: 'solid', obstacle: 'dither50', thief: 'dither50' },
      height: 2,              // px, flat slab under the object
      inset: 1,               // px narrower than the object on each side
      offsetY: 0,             // sits on the ground line, never detached
      /** Anchored to the object's own band. Never drawn across a boundary. */
      clampToBand: true,
    },
    /** Markings are boundary objects. `on` names the boundary they belong to. */
    marking: {
      laneDash:   { on: 'road|road',      style: 'dash', dash: 6, gap: 6, thickness: 2, colour: 'concrete' },
      edgeLine:   { on: 'road|pavement',  style: 'solid', thickness: 2, colour: 'pale' },
      kerb:       { on: 'road|verge',     style: 'solid', thickness: 3, colour: 'concrete', capColour: 'pale' },
      centreLine: { on: 'road|road',      style: 'solid', thickness: 2, colour: 'gold', note: 'two-way boundary only' },
      /** Never permitted: any marking drawn inside a band rather than on a boundary. */
      forbidden: 'dash inside a band',
    },
    surface: { road: 'road', pavement: 'concrete', verge: 'verge' },
  },

  /* ---------------------------------------------------------------- traffic */
  traffic: {
    /** 7 colourways. Body colour only — windscreen, lights and outline are fixed. */
    colourways: ['amber', 'sirenRed', 'sirenBlu', 'pale', 'concrete', 'verge', 'gold'],
    fixed: { outline: 'ink', windscreen: 'pale', headlight: 'gold' },
    sizes: {
      car:   { w: 48, h: 20 },
      truck: { w: 68, h: 28 },
    },
    /** Trucks are taller than `vehicle.maxHeight`, so they own a band with a
     *  raised laneHeight. The engine must not place a truck in a 32px band. */
    truckLaneHeight: 32,
  },

  police: {
    cars: 2,                  // two abreast, always
    lightbar: { frames: 2, ms: 180, colours: ['sirenBlu', 'sirenRed'] },
    /** Distance banner while they are off-screen below. */
    /** The banner counts SECONDS to arrest, never metres. */
    banner: { height: 28, bg: 'sirenRed', text: 'white', icon: 'icon:siren', unit: 'seconds' },
    sirenAudibleFromSeconds: 18,
    /**
     * WHAT THE PLAYER IS TOLD. The engine keeps the exact distance; the banner
     * never shows it. Three overlapping pressure bands, edges jittered per run,
     * a line held for a random 2.6-4.8s. Never a countdown, never a gauge.
     */
    disclosure: {
      exactSecondsToPlayer: false,
      bands: ['far', 'mid', 'near'],
      bandEdgesSeconds: [13, 6.5],
      bandEdgeJitterSeconds: 1.5,
      holdMs: [2600, 4800],
      edgeStripSteps: [3, 5, 8],
      randomnessLivesIn: 'presentation only — never the engine, the seed or a replay',
      /** Green relief is an EVENT: it fires only once he has bought back this
       *  much time from his worst moment, then locks out for the cooldown. */
      reliefRecoverSeconds: 2.6,
      reliefCooldownMs: 9000,
      reliefHoldMs: 2000,
      reliefFloorSeconds: 8,
      /** Red is a STATE driven by real proximity. No figure is ever shown. */
      criticalSeconds: 3.4,
      criticalShakePx: { desktop: 2, mobile: 1 },
      criticalWash: 'stepped dither on alternate cels, never a fade',
    },
    /** Caught: the siren floods the screen. Stepped, not a fade. */
    floodMs: 500,
    floodFrames: 4,
  },

  /**
   * NOTHING ON THE ROAD IS FIXED.
   * Bus stop position, which loot sits on which bench, which lane the truck owns,
   * traffic gaps and phases: all rolled per run. The player must walk to the loot
   * and cross for it. A bot that learns one layout learns nothing.
   */
  spawn: {
    fixed: false,
    busStopsPerRun: [1, 2],
    busStopEdgeMargin: 24,
    lootRoll: ['wallet', 'painting', 'both', 'none'],
    truckLaneRolled: true,
    trafficPhaseRolled: true,
    obstaclesRolled: true,
  },

  /**
   * CONTROLS. The player moves; the game never moves him. He may stop and wait
   * anywhere on the road, mid-lane included — the heart rule is the only penalty.
   */
  run: {
    seconds: 60,
    /** The door arms at twenty crossings. Twenty inside fifty seconds is the
     *  shape of a good run. */
    escapeAtCrossings: 10,
    targetSeconds: 50,
    trafficPxPerFrame: 4,
    /** The law gains ground every frame. Waiting out the clock is not a plan. */
    policePxPerFrame: 1.4,
    /** Rubber band: past this lead they push at 2.6x. No 56-second walkovers. */
    policeMaxLeadSeconds: 16,
    /** Traffic speed climbs one step every third crossing, capped at +3. */
    trafficRampPerCrossings: 3,
    trafficRampCap: 3,
    /** His head start, rolled per run so the pressure is never memorised. */
    policeHeadStartSeconds: [12, 15],
    /** Derived from the head start, never a fixed distance. */
    policeStartBehind: 'headStartSeconds x policePxPerFrame, plus the catch length',
    /** A crossing is one pavement to the next, whatever it cost. */
    crossingIs: 'pavement to pavement',
    lanesPerSection: [1, 4],
    /** Non-negotiable: directions alternate inside a section and each lane's
     *  phase is rolled, or four same-way lanes make the section uncrossable. */
    laneDirections: 'alternating within a section',
    lanePhase: 'rolled per lane, never derived from the lane index',
    spacingWidensWithLanes: 0.1,
  },

  /** Loot presence is NOT the client's decision. */
  loot: {
    fromCrossing: 6,
    perRun: 'rolled — an item may not exist at all in a given run',
    frequencyOwner: 'smart contract',
    oneOfEach: true,
    placement: "at its owner's feet at a bus stop, never on the shelter",
  },

  controls: {
    forward: 'ArrowUp',
    back: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    hopPxPerFrame: 12,
    lateralPxPerPress: 6,
    /** Mobile: the same four moves as 44px targets, never over the play area. */
    touch: { minHitTarget: 44, layout: 'thumb pad under the road, never on it' },
    waitAnywhere: true,
  },

  /* ------------------------------------------------------------------ lives */
  lives: {
    max: 3,
    heart: { w: 8, h: 8, gap: 6, scale: 2 },
    /** Drained hearts read as hollow, not faded — see colourBlind. */
    fullFill: 'sirenRed',
    emptyFill: 'shade',
    emptyOutline: 'concrete',
    /** Drain: the heart collapses in 3 cels in the corner of the eye. No pull. */
    drain: { frames: 3, ms: 90 },
    /**
     * A heart is lost the moment traffic covers the thief AFTER he was clear.
     * While continuously covered, no further heart is lost. The blink is
     * information only: he is fully vulnerable throughout, there is no
     * invulnerability window, no knockback lock and no freeze.
     */
    blink: { frames: 10, ms: 125, totalMs: 1250, invulnerable: false },
  },

  /* -------------------------------------------------------------- animation */
  /** Stepped, fixed rate, no easing. One thing moves at a time. */
  anim: {
    stepped: true,
    easing: 'none',
    priority: ['hit', 'walletOpen', 'hop', 'itemEffect', 'caught'],
    thief: {
      walk:   { frames: 4, ms: 110, loop: true,  cels: ['walk1', 'walk2', 'walk3', 'walk2'] },
      hop:    { frames: 4, ms: 90,  loop: false, cels: ['stand', 'tuck', 'splay', 'tuck'], riseY: [1, -5, -9, -2] },
      hit:    { frames: 6, ms: 130, loop: false, then: 'blink' },
      blink:  { frames: 10, ms: 125, loop: false },
      caught: { frames: 4, ms: 160, loop: false },
    },
    hud: {
      crossingPulse: { frames: 3, ms: 80 },
      lootFlash:     { frames: 4, ms: 70 },
      escapeArm:     { frames: 4, ms: 120, loop: true },
    },
    /** The payoff. The single most important sequence in the game. */
    walletOpen: { frames: 12, ms: 110, totalMs: 1320, holdOnRevealMs: 900 },
  },

  /* ------------------------------------------------------------------- items */
  /** Effects are the stream moment. Each one is a stepped sequence, not a fade. */
  items: {
    oldMan:   { rarity: 'common',    effect: { frames: 6, ms: 130 }, durationMs: 8000 },
    pileUp:   { rarity: 'common',    effect: { frames: 8, ms: 110 } },
    shortcut: { rarity: 'rare',      effect: { frames: 6, ms: 120 }, headStartMs: 5000 },
    safe:     { rarity: 'rare',      effect: { frames: 5, ms: 140 }, freezeDays: 7 },
    haul:     { rarity: 'legendary', effect: { frames: 8, ms: 150 }, bonusCapPct: 110 },
  },
  /** An item plays its effect over the road. It NEVER adds anything to the figure. */
  itemsNeverDressHim: true,
  /**
   * NO ACCESSORIES. No hat, no scarf, no belt, no boots, nothing worn and nothing
   * added. The only thing that changes on the figure is what is in his two fists.
   */
  hands: {
    states: ['ticket', 'wallet', 'painting', 'both', 'empty'],
    default: 'ticket',
    /** He can lift either one alone, or both. Wallet is always the left fist. */
    loot: { left: 'wallet', right: 'painting' },
    /** While he is carrying loot the ticket is out of sight. It comes back the
     *  moment the loot is cashed. */
    ticketHiddenWhileLooting: true,
    fists: { left: { x: 3, y: 12 }, right: { x: 16, y: 12 } },
  },

  /* -------------------------------------------------------------------- feed */
  /** HEIST WIRE. 300px is a hard constraint: it embeds in a streamer overlay. */
  feed: {
    window:   { w: 300, h: 420, collapsedH: 28 },
    entry:    { minH: 24, padX: 8, padY: 6, gap: 2, fontSize: 8, lineHeight: 1.4, iconSize: 8, carriedIconSize: 8 },
    /** 15 held in the window; about 10 sit in view at 8px, since a 70-character
     *  line wraps to two rows at 300px. */
    maxLines: 15,
    linesInView: 10,
    windowMinutes: 10,
    /** Older entries step out over 3 cels. Not an opacity fade. */
    retire:  { frames: 3, ms: 120 },
    slideIn: { frames: 3, ms: 90 },
    pinMs: 4000,
    pulse:   { frames: 4, ms: 150, repeat: 2, colour: 'amber' },
    composer: { messagePriceUsd: 0.10, maxChars: 70, height: 36 },
    plate: {
      system: 'shade',
      player: 'steel',
      pinned: 'amberDp',
      embed:  'ink',
    },
    /** Chrome-free streamer embed: same entry design, nothing around it. */
    embed: { w: 300, entries: 8, bg: 'transparent', chrome: false, composer: false },
  },

  /* --------------------------------------------------------- accessibility */
  colourBlind: {
    /** Nothing carries meaning by colour alone. */
    policeVsThief: 'shape — police are two wide boxes with a lightbar; the thief is a narrow figure',
    heartState: 'fill — full is solid, empty is hollow with a light outline',
    laneOwnership: 'flat ground shadow inside the band, plus clearTop above every vehicle',
    outcome: 'sprite silhouette, distinguishable in greyscale, never the plate colour',
    playerVsSystem: 'plate + author name, never colour alone',
  },

  /* ------------------------------------------------------------------ mobile */
  mobile: {
    minHitTarget: 44,
    /** The feed becomes a bottom bar. It may never cover the play area. */
    feedMode: 'collapsedBar',
    feedBarHeight: 44,
    playAreaOverlap: 0,
  },
} as const;

/** Copy that belongs to a moment, not a screen. */
export const lines = {
  "caught": "AH SHIT, HERE WE GO AGAIN",
  "ticketLost": "THE TICKET. GET THE TICKET.",
  "escaped": "STILL HOLDING IT."
} as const;

export type Theme = typeof theme;
export type PaletteKey = keyof typeof theme.palette;
