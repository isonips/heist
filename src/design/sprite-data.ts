/**
 * HEIST — sprite-data.js
 * The only place pixel art is authored. sprite-sheet.png is generated from this,
 * and every viewer reads it from here. Characters are palette channels; see PAL.
 *
 * THE CHARACTER — an escaped convict. Black knit beanie (no brim, no band — the
 * ribbing is dark-on-dark texture, never a light line), white prison jumpsuit
 * with black stripes, and the gold lottery ticket in his hand: the draw that buys
 * his freedom. Nothing else is worn. No hat, no scarf, no belt, no boots.
 *
 * HANDS ARE A STATE, NOT AN ACCESSORY. He holds the ticket until he lifts
 * something; then a wallet appears in one hand and a painting in the other, and
 * the ticket is out of sight until he has cashed the loot.
 */

export const PAL: Record<string, string> = {
  K: '#05060a', k: '#10131d', T: '#171b28', S: '#2b3350', s: '#4c5878', C: '#8b98bd',
  P: '#d7def2', W: '#ffffff', A: '#ffa11f', a: '#d1690a', b: '#7a3b04', G: '#ffd84d',
  R: '#ff2f2f', B: '#2358ff', V: '#2f5d3a', x: '#1d2230',

  /* SNES-era shading tones. The hues are the ones the game already had — these
   * are the mid and light steps that turn a flat fill into a rendered surface. */
  n: '#1f2434',   // asphalt, lit speck
  j: '#0e111a',   // asphalt, patched / oil
  d: '#6e7a9c',   // pavement shade, kerb face
  e: '#a8b2cf',   // pavement light, top of a slab
  g: '#2f6b3f',   // foliage mid
  l: '#4f9161',   // foliage light
  q: '#1a3a25',   // foliage dark
  u: '#8a5220',   // trunk light
  f: '#e8b48a',   // skin
  h: '#b87a52',   // skin shade
  L: '#ffd07a'    // bodywork highlight (swapped per car colour)
};

/**
 * THE FIGURE IS CHIBI, the way a 16-bit overworld draws a person: the head is
 * nearly half of him, the eyes are two dark blocks, the body is a short striped
 * barrel and the legs are stubs. He is read at 2x on a moving road, so silhouette
 * beats anatomy every time.
 *
 * Rows 0-16, shared by every pose: beanie, face, torso, both arms, fists.
 */
const TOP = [
  '.....KKKKKKKKKK.....',
  '....KKKKKKKKKKKK....',
  '....KKkkkkkkkkKK....',
  '....KKKKKKKKKKKK....',
  '....KffffffffffK....',
  '....KfKKffffKKfK....',
  '....KfKKffffKKfK....',
  '....KffffffffffK....',
  '....KfffhhhhfffK....',
  '....KKffffffffKK....',
  '.....KKKKKKKKKK.....',
  '..KPPKPPPPPPPPKPPK..',
  '..KKKKKKKKKKKKKKKK..',
  '..KPPKPPPPPPPPKPPK..',
  '..KKKKKKKKKKKKKKKK..',
  '..KPPKPPPPPPPPKPPK..',
  '..KKKKPPPPPPPPKKKK..'
];

/* Rows 17-23. Hips, one stripe, then stubs. Steel shoes, part of him. */
const LEGS = {
  stand: ['.....KPPPPPPPPK.....','.....KKKKKKKKKK.....','.....KPPK..KPPK.....','.....KKKK..KKKK.....','....KSSSK.KSSSK.....','....KKKKK.KKKKK.....','....................'],
  walk1: ['.....KPPPPPPPPK.....','.....KKKKKKKKKK.....','....KPPK....KPPK....','...KKKK......KKKK...','..KSSSK......KSSSK..','..KKKKK......KKKKK..','....................'],
  walk2: ['.....KPPPPPPPPK.....','.....KKKKKKKKKK.....','......KPPPPPPK......','......KKKKKKKK......','.....KSSSSSSSSK.....','.....KKKKKKKKKK.....','....................'],
  walk3: ['.....KPPPPPPPPK.....','.....KKKKKKKKKK.....','.....KPPK..KPPK.....','....KKKK....KKKK....','...KSSSK....KSSSK...','...KKKKK....KKKKK...','....................'],
  tuck:  ['.....KPPPPPPPPK.....','.....KKKKKKKKKK.....','.....KPPK..KPPK.....','.....KSSK..KSSK.....','......KKK..KKK......','....................','....................'],
  splay: ['.....KPPPPPPPPK.....','.....KKKKKKKKKK.....','....KPPK....KPPK....','...KPPK......KPPK...','..KSSK........KSSK..','..KKKK........KKKK..','....................']
};

/* Knocked back by a car: the whole figure is TIPPED — head low and thrown left,
 * feet kicked out right — by shearing every row against a pivot at the hips, and
 * he is dropped four rows so his head sits at mid-frame instead of standing tall.
 * The ticket is out of his hand and still on the arc it left on. */
/* Knocked back by a car: he is FLAT ON HIS BACK, body axis horizontal — head
 * left, feet right, both arms thrown up off the torso. The jumpsuit stripes run
 * perpendicular to the body, so they still read as clothing rather than as bands
 * painted on an object, and the ticket is a couple of pixels off the hand it just
 * left. This frame shows for a few cels only, so the silhouette has to be instant. */
/* Knocked back by a car. He RECOILS UPRIGHT — the 16-bit damage convention, and
 * the only one that stays legible at this size: same chibi vocabulary as every
 * other pose, arms flung above the shoulders, legs splayed off balance, and the
 * ticket popping out of the hand it left. A figure laid on its back needs more
 * pixels than a 20x24 cell with an 8px head has to give. */
const HIT: string[] = (() => {
  const g: string[][] = Array.from({ length: 24 }, () => '.'.repeat(20).split(''));
  const put = (y: number, x: number, s: string) => { for (let i = 0; i < s.length; i++) if (s[i] !== '.') g[y][x + i] = s[i]; };

  /* the ticket, just above the hand that let go, with a speck of its path */
  ['KKKK', 'KGGK', 'KKKK'].forEach((s, i) => put(4 + i, 16, s));
  put(7, 18, 'W');

  /* head, snapped back, rows 3-13 */
  (
    [
      [3, 5, 'KKKKKKKKKK'], [4, 4, 'KKKKKKKKKKKK'], [5, 4, 'KKkkkkkkkkKK'],
      [6, 4, 'KKKKKKKKKKKK'], [7, 4, 'KffffffffffK'], [8, 4, 'KfKKffffKKfK'],
      [9, 4, 'KfKKffffKKfK'], [10, 4, 'KffffffffffK'], [11, 4, 'KfffhhhhfffK'],
      [12, 4, 'KKffffffffKK'], [13, 5, 'KKKKKKKKKK'],
    ] as [number, number, string][]
  ).forEach(([y, x, s]) => put(y, x, s));

  /* both arms flung up and out, hands at the top corners */
  (
    [[8, 0, 'KKK'], [9, 0, 'KPK'], [10, 1, 'KPK'], [11, 1, 'KPK'], [12, 2, 'KPK'], [13, 3, 'KPK'],
     [8, 17, 'KKK'], [9, 17, 'KPK'], [10, 16, 'KPK'], [11, 16, 'KPK'], [12, 15, 'KPK'], [13, 14, 'KPK']] as [number, number, string][]
  ).forEach(([y, x, s]) => put(y, x, s));

  /* torso, striped as everywhere else, then the legs splayed off balance */
  ['KKKKKKKKKK', 'KPPPPPPPPK', 'KKKKKKKKKK', 'KPPPPPPPPK', 'KKKKKKKKKK', 'KPPPPPPPPK']
    .forEach((s, i) => put(14 + i, 5, s));
  put(20, 4, 'KKKK'); put(20, 12, 'KKKK');
  put(21, 3, 'KPPK'); put(21, 13, 'KPPK');
  put(22, 2, 'KSSK'); put(22, 14, 'KSSK');
  put(23, 2, 'KKKK'); put(23, 14, 'KKKK');

  return g.map((r) => r.join(''));
})();

export const POSES: Record<string, string[]> = {};
Object.keys(LEGS).forEach((k) => { POSES[k] = TOP.concat(LEGS[k as keyof typeof LEGS]); });
POSES.hit = HIT;

/* Caught: back behind bars. The two outer bars run the full height, and the
 * middle one starts at his shoulders — a bar straight down the nose reads as a
 * broken sprite, not as a cell. */
POSES.caught = POSES.stand.map((row, y) => {
  const r = row.split('');
  const bar = (x: number) => { r[x] = 'K'; if (x + 1 < 20) r[x + 1] = 's'; };
  bar(1); bar(17);
  if (y >= 11) bar(9);
  return r.join('');
});

/* -------------------------------------------------------------- in his hands */
type Patch = { y: number; x: number; s: string }
const blank24 = () => Array.from({ length: 24 }, () => '.'.repeat(20));
function layer(patches: Patch[]) {
  const rows = blank24();
  patches.forEach((p) => {
    const r = rows[p.y].split('');
    for (let i = 0; i < p.s.length; i++) { const x = p.x + i; if (x < 20 && p.s[i] !== '.') r[x] = p.s[i]; }
    rows[p.y] = r.join('');
  });
  return rows;
}

/** Held in the fists at the ends of the arms (row 16, x2-3 and x16-17).
 *  Drawn over the pose, never masked to it — the item sticks out past him. */
export const HELD = {
  ticket:   layer([{ y: 14, x: 16, s: 'GGGG' }, { y: 15, x: 16, s: 'GbbG' }, { y: 16, x: 16, s: 'GGGG' }]),
  wallet:   layer([{ y: 14, x: 0, s: 'aaaa' }, { y: 15, x: 0, s: 'aGGa' }, { y: 16, x: 0, s: 'aaaa' }, { y: 17, x: 0, s: 'KKKK' }]),
  /** Bigger than the ticket on purpose: at 1x a small gold block reads as the
   *  ticket. Gold frame, painted centre. */
  painting: layer([{ y: 11, x: 15, s: 'GGGGG' }, { y: 12, x: 15, s: 'GVVPG' }, { y: 13, x: 15, s: 'GVPPG' }, { y: 14, x: 15, s: 'GPVVG' }, { y: 15, x: 15, s: 'GGGGG' }])
};

/** What is in his hands, as states. Nothing else is ever added to the figure.
 *  He can lift the wallet alone, the painting alone, or both — the ticket is out
 *  of sight the moment he is holding anything he has stolen. */
export const HANDS = {
  ticket:   ['ticket'],
  wallet:   ['wallet'],
  painting: ['painting'],
  both:     ['wallet', 'painting'],
  empty:    []
};

/* ------------------------------------------------------------------- traffic */
/**
 * A vehicle FILLS its lane. Drawn small with a corridor of empty band above it,
 * a car reads as something the escapee can slip past — and he cannot. So the car
 * is 48x20 in a 24px lane and the truck 68x28 in a 32px lane, both wider than he
 * is and taller than his stride. Lane ownership is carried by the flat shadow
 * inside the band, not by empty space above the roof.
 *
 * Built from boxes rather than hand-authored rows, so a size change stays exact.
 */
type Grid = string[][]
const grid = (w: number, h: number): Grid => Array.from({ length: h }, () => '.'.repeat(w).split(''))
const rowsOf = (g: Grid) => g.map((r) => r.join(''))
function box(g: Grid, x: number, y: number, w: number, h: number, fill: string, edge: string | null) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const gy = y + yy, gx = x + xx;
    if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length) continue;
    const isEdge = edge && (xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1);
    g[gy][gx] = isEdge ? edge : fill;
  }
}

/** A chamfered box — the way 16-bit sprites round a corner: cut the diagonal,
 *  then run the outline along the cut. r=0 is an ordinary box. */
function rbox(g: Grid, x: number, y: number, w: number, h: number, fill: string, edge: string | null, r: number) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const gy = y + yy, gx = x + xx;
    if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length) continue;
    const dx = Math.min(xx, w - 1 - xx), dy = Math.min(yy, h - 1 - yy);
    if (dx + dy < r) continue;
    const isEdge = edge && (dx + dy === r || xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1);
    g[gy][gx] = isEdge ? edge : fill;
  }
}

/** Fat round tyre with a bright hub — the single detail that says "drawn", not
 *  "filled". 11x7, sitting on the band floor. */
const WHEEL = ['..KKKKKKK..', '.KKKKKKKKK.', 'KKKkkkkkKKK', 'KKKkCCCkKKK', 'KKKkkkkkKKK', '.KKKKKKKKK.', '..KKKKKKK..'];
function wheel(g: Grid, x: number, y: number) {
  for (let yy = 0; yy < WHEEL.length; yy++) for (let xx = 0; xx < WHEEL[yy].length; xx++) {
    const ch = WHEEL[yy][xx];
    if (ch === '.') continue;
    const gy = y + yy, gx = x + xx;
    if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length) continue;
    g[gy][gx] = ch;
  }
}

type VehicleOpts = { body?: string; shade?: string; glass?: string; bar?: string }

/**
 * Side view, facing right, drawn in the overworld manner: a long chamfered body,
 * a cabin set back from the nose with a split screen, one bright shoulder line,
 * and fat wheels. body/shade/L are palette channels the engine swaps per colour.
 */
function makeCar(opts?: VehicleOpts) {
  const w = 48, h = 20, o = opts || {};
  const body = o.body || 'A', shade = o.shade || 'a', glass = o.glass || 'P';
  const g = grid(w, h);
  rbox(g, 0, 8, w, 10, body, 'K', 3);        // body, nose and tail chamfered
  rbox(g, 12, 1, 24, 9, body, 'K', 3);       // cabin, set back
  box(g, 16, 2, 16, 1, 'L', null);           // roof highlight
  rbox(g, 15, 4, 8, 5, glass, 'K', 1);       // rear window
  rbox(g, 26, 4, 8, 5, glass, 'K', 1);       // windscreen
  box(g, 4, 10, w - 8, 1, 'L', null);        // shoulder line
  box(g, 3, 15, w - 6, 2, shade, null);      // rocker shade
  rbox(g, w - 4, 10, 4, 4, 'G', 'K', 1);     // headlight
  rbox(g, 0, 10, 3, 4, 'R', 'K', 1);         // tail light
  wheel(g, 5, 13);
  wheel(g, 31, 13);
  if (o.bar) {                               // lightbar, sat on the roof
    box(g, 17, 0, 15, 2, 'K', null);
    box(g, 18, 0, 6, 1, o.bar, null);
    box(g, 25, 0, 6, 1, o.bar === 'B' ? 'R' : 'B', null);
  }
  return { w, h, rows: rowsOf(g) };
}

function makeTruck(opts?: VehicleOpts) {
  const w = 68, h = 28, o = opts || {};
  const body = o.body || 'A', shade = o.shade || 'a';
  const g = grid(w, h);
  rbox(g, 0, 0, 44, 21, body, 'K', 2);       // container
  box(g, 3, 2, 38, 1, 'L', null);
  for (let x = 5; x < 40; x += 6) box(g, x, 4, 1, 12, shade, null);   // ribbed panels
  box(g, 3, 16, 38, 1, shade, null);
  rbox(g, 42, 6, 26, 15, body, 'K', 3);      // cab, rounded nose
  box(g, 46, 7, 18, 1, 'L', null);
  rbox(g, 50, 9, 14, 6, 'P', 'K', 1);        // windscreen
  box(g, 2, 18, w - 6, 2, shade, null);
  rbox(g, w - 4, 15, 4, 4, 'G', 'K', 1);
  wheel(g, 6, 21);
  wheel(g, 24, 21);
  wheel(g, 50, 21);
  return { w, h, rows: rowsOf(g) };
}

export const VEHICLES = {
  car:      makeCar(),
  truck:    makeTruck(),
  police_a: makeCar({ body: 'P', shade: 'C', glass: 'S', bar: 'B' }),
  police_b: makeCar({ body: 'P', shade: 'C', glass: 'S', bar: 'R' })
};

/* ------------------------------------------------------------- the getaway */
/** A straight run between two points, thickened by `w` pixels — the frame
 *  tubes a bike needs and box()/rbox() can't give (axis-aligned only). */
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, col: string, w = 1) {
  const dx = x1 - x0, dy = y1 - y0
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps), y = Math.round(y0 + (dy * i) / steps)
    for (let ty = 0; ty < w; ty++) for (let tx = 0; tx < w; tx++) {
      const gy = y + ty, gx = x + tx
      if (gy >= 0 && gy < g.length && gx >= 0 && gx < g[0].length) g[gy][gx] = col
    }
  }
}

/** Two wheels and a frame, the way a side-view bike reads at this scale:
 *  triangle of tubes between the axles and a seat post, nothing anatomical
 *  — same "silhouette over detail" rule the rest of this file follows. Sat
 *  under the thief's own POSES for the ticket-only getaway (HeistRun draws
 *  the two together), so it only needs to carry the bike, not a rider. */
function makeBike() {
  const w = 30, h = 22
  const g = grid(w, h)
  const rearX = 6, frontX = 24, axleY = 15
  wheel(g, rearX - 5, axleY - 3)
  wheel(g, frontX - 5, axleY - 3)
  const bbX = 14, bbY = axleY - 1, seatX = 10, seatY = 3, barX = 21, barY = 5
  line(g, rearX, axleY, bbX, bbY, 'K', 2)
  line(g, bbX, bbY, frontX, axleY, 'K', 2)
  line(g, bbX, bbY, seatX, seatY, 'K', 2)
  line(g, seatX, seatY, barX, barY, 'S', 2)
  line(g, barX, barY, frontX, axleY, 'K', 2)
  box(g, seatX - 2, seatY - 1, 5, 2, 'K', null)
  box(g, barX - 1, barY - 2, 3, 2, 'K', null)
  return { w, h, rows: rowsOf(g) }
}

/** Side view, blades a flat blur line rather than drawn spinning — legible
 *  at 1x, and it reads as motion the way the truck's ribbed panels read as
 *  metal rather than as a decoration. */
function makeHelicopter() {
  const w = 52, h = 26
  const g = grid(w, h)
  rbox(g, 10, 9, 26, 12, 'P', 'K', 3)
  rbox(g, 16, 12, 12, 6, 'S', 'K', 1)
  box(g, 34, 13, 16, 3, 'C', 'K')
  rbox(g, 48, 8, 4, 10, 'K', null, 0)
  box(g, 12, 21, 22, 1, 'K', null)
  box(g, 14, 22, 2, 2, 'K', null)
  box(g, 30, 22, 2, 2, 'K', null)
  box(g, 22, 5, 2, 4, 'K', null)
  box(g, 1, 4, 50, 1, 'C', null)
  return { w, h, rows: rowsOf(g) }
}

export const OUTRO = {
  bike:       makeBike(),
  helicopter: makeHelicopter()
};

/* ------------------------------------------------------------- environment */
/** Verge furniture and the bus stop where the loot appears. Authored at their
 *  own sizes; rows are right-padded when the sheet is packed. */
/**
 * STREET FURNITURE, drawn the way a 16-bit tileset draws it: black outline all
 * the way round, then three steps of the same hue — light where the sky is,
 * mid across the face, dark on the side that turns away. Nothing here is
 * fantasy: a street tree, a council bin, a bus shelter, a bollard.
 */
export const ENV = {
  tree: { w: 16, h: 22, rows: [
    '.....KKKKKK.....',
    '...KKllllllKK...',
    '..KllllllllggK..',
    '.KlllllllgggggK.',
    '.KllllllgggggqK.',
    'KlllllgggggggqqK',
    'KllllgggggggqqqK',
    'KllgggggggggqqqK',
    'KlggggggggggqqqK',
    'KggggggggggqqqqK',
    '.KgggggggggqqqK.',
    '.KggggggggqqqqK.',
    '..KggggggqqqqK..',
    '...KKggggqqKK...',
    '.....KKKKKK.....',
    '......KuuK......',
    '......KubK......',
    '......KubK......',
    '......KubK......',
    '.....KuubbK.....',
    '....KKuubbKK....',
    '....KKKKKKKK....'
  ] },
  bin: { w: 12, h: 14, rows: [
    '...KKKKKK...',
    '..KeeeeeeK..',
    '..KKKKKKKK..',
    '.KKKKKKKKKK.',
    '.KCeeCCCCdK.',
    '.KCeeCCCCdK.',
    '.KCCCCCCCdK.',
    '.KCeeCCCCdK.',
    '.KCeeCCCCdK.',
    '.KCCCCCCCdK.',
    '.KCeeCCCCdK.',
    '.KCCCCCCddK.',
    '.KKKKKKKKKK.',
    '..KKKKKKKK..'
  ] },
  bollard: { w: 6, h: 12, rows: ['.KKKK.','KeAAaK','KeAAaK','KePPdK','KePPdK','KeAAaK','KeAAaK','KeAAaK','KKKKKK','.KKKK.'] },
  /** The shelter: roof slab with a lit top edge, a glazed back panel with the
   *  glare running down it, and a bench on legs. */
  busStop: { w: 30, h: 22, rows: [
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KeeeeeeeeeeeeeeeeeeeeeeeeeeeeK',
    'KCCCCCCCCCCCCCCCCCCCCCCCCCCCCK',
    'KddddddddddddddddddddddddddddK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    '.KsK......................KsK.',
    '.KsK..KKKKKKKKKKKKKKKKKK..KsK.',
    '.KsK..KCSSSSSSSSSSSSSSSK..KsK.',
    '.KsK..KSCSSSSSSSSSSSSSSK..KsK.',
    '.KsK..KSSCSSSSSSSSSSSSSK..KsK.',
    '.KsK..KKKKKKKKKKKKKKKKKK..KsK.',
    '.KsK......................KsK.',
    '.KsK..KKKKKKKKKKKKKKKKKK..KsK.',
    '.KsK..KeeeeeeeeeeeeeeeeK..KsK.',
    '.KsK..KCCCCCCCCCCCCCCCCK..KsK.',
    '.KsK..KKKKKKKKKKKKKKKKKK..KsK.',
    '.KsK...KsK..........KsK...KsK.',
    '.KsK...KsK..........KsK...KsK.',
    '.KsK...KsK..........KsK...KsK.',
    '.KsK...KKK..........KKK...KsK.',
    '.KsK......................KsK.',
    '.KKK......................KKK.'
  ] },
  bystander: { w: 14, h: 18, rows: [
    '...KKKKKKKK...',
    '..KKbbbbbbKK..',
    '..KbbbbbbbbK..',
    '..KffffffffK..',
    '..KfKKffKKfK..',
    '..KffffffffK..',
    '..KKffffffKK..',
    '...KKKKKKKK...',
    '..KgVVVVVVqK..',
    '.KgVVVVVVVVqK.',
    '.KgVVVVVVVVqK.',
    '.KgVVVVVVVVqK.',
    '..KVVVVVVVVK..',
    '..KKVVVVVVKK..',
    '...KSSKKSSK...',
    '...KSdKKSdK...',
    '...KSSKKSSK...',
    '...KKKKKKKK...'
  ] }
};

/* ------------------------------------------------------------------ the law */
/**
 * TWO OFFICERS ON FOOT. Side-view cars closing from below never read right — a
 * car is drawn broadside and cannot travel up the frame — so the pursuit is two
 * running men: navy cap with a blue crown, pale blue shirt, dark trousers.
 * Two cels, alternated per tick and offset between the pair so they never run
 * in lockstep.
 */
const COP_TOP = [
  '.....KKKKKK.....',
  '...KKKKKKKKKK...',
  '...KBBBBBBBBK...',
  '...KKKKKKKKKK...',
  '..KKKKKKKKKKKK..',
  '...KffffffffK...',
  '...KfKKffKKfK...',
  '...KffffffffK...',
  '...KfffhhfffK...',
  '....KKKKKKKK....',
  '..KCCCCCCCCCCK..',
  '.KCKCCCCCCCCKCK.',
  '.KCKCCCCCCCCKCK.',
  '.KKKCCCCCCCCKKK.',
  '...KKKKKKKKKK...'
];

export const COPS = [
  COP_TOP.concat(['....KSSKKSSK....', '....KSSKKSSK....', '...KSSK..KSSK...', '..KSSK....KSSK..', '..KKKK....KKKK..', '................', '................']),
  COP_TOP.concat(['....KSSKKSSK....', '.....KSSSSK.....', '.....KSSSSK.....', '....KSSKKSSK....', '....KKKKKKKK....', '................', '................'])
];
export const COP_W = 16;

/* --------------------------------------------------------------------- icons */
export const ICONS = {
  disk:       ['PPPPPPPP','PkkkkkkP','PkPPPPkP','PkPPPPkP','PkkkkkkP','PPPPPPPP','PkkkkkkP','PPPPPPPP'],
  min:        ['........','........','........','........','........','PPPPPPPP','PPPPPPPP','........'],
  close:      ['P......P','PP....PP','.PP..PP.','..PPPP..','..PPPP..','.PP..PP.','PP....PP','P......P'],
  heartFull:  ['.RR..RR.','RRRRRRRR','RRRRRRRR','RRRRRRRR','.RRRRRR.','..RRRR..','...RR...','........'],
  heartEmpty: ['.CC..CC.','C..CC..C','C......C','.C....C.','..C..C..','...CC...','........','........'],
  ticket:     ['........','KKKKKKKK','KGGGGGGK','KGbbbbGK','KGGGGGGK','KKKKKKKK','........','........'],
  wallet:     ['........','.KKKKKK.','.KCCCCK.','.KCGGCK.','.KCCCCK.','.KKKKKK.','........','........'],
  painting:   ['GGGGGGGG','GKKKKKKG','GKVVPPKG','GKVPPPKG','GKPPVVKG','GKKKKKKG','GGGGGGGG','........'],
  coin:       ['..GGGG..','.GGGGGG.','GGGaaGGG','GGGaaGGG','GGGaaGGG','GGGaaGGG','.GGGGGG.','..GGGG..'],
  siren:      ['...RR...','..RRRR..','.RRRRRR.','RRRRRRRR','.KKKKKK.','.KKKKKK.','........','........'],
  escape:     ['.KKKKK..','.KPPPK..','.KPPPK.G','.KPPPKGG','.KPPPK.G','.KPPPK..','.KKKKK..','........'],
  draw:       ['...G....','.G.G.G..','..GGG...','GGGGGGG.','..GGG...','.G.G.G..','...G....','........'],
  running:    ['...KK...','...KK...','C..KKK..','CC.KKKK.','C..KK.K.','...KK.K.','..KK..KK','........'],
  speech:     ['.PPPPPP.','PPPPPPPP','PPKPKPKP','PPPPPPPP','.PPPPPP.','..PP....','.P......','........'],
  oldMan:     ['..PP....','..PP....','.PPPP.C.','PPPPPPC.','.PPPP.C.','.PP.P.C.','PP..PPC.','........'],
  pileUp:     ['..k.k...','.k.k.k..','RRRR....','RRRRBBBB','KKKKBBBB','.KK.KKKK','....KK.K','........'],
  shortcut:   ['KKKKKKKK','K.G....K','K.GG...K','K.GGGG.K','K.GG...K','K.G....K','KKKKKKKK','........'],
  safe:       ['..GGGG..','.GK..KG.','.GK..KG.','GGGGGGGG','GGGbbGGG','GGGbbGGG','GGGGGGGG','........'],
  haul:       ['G..G..G.','GG.GG.GG','GGGGGGGG','GGGGGGGG','GaGaGaG.','GGGGGGGG','........','........'],
  chevron:    ['........','........','P......P','PP....PP','.PP..PP.','..PPPP..','...PP...','........'],
  online:     ['........','..VVVV..','.VVVVVV.','.VVVVVV.','.VVVVVV.','..VVVV..','........','........']
};

export const LINES = {
  caught: 'AH SHIT, HERE WE GO AGAIN',
  ticketLost: 'THE TICKET. GET THE TICKET.',
  escaped: 'STILL HOLDING IT.'
};
