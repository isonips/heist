/**
 * HEIST — lines.ts
 * Feed copy. One array per event type, 6-10 variants each, picked from a bag so
 * a viewer watching a three-hour stream never reads the same sentence twice.
 *
 * VOICE — caper film, not scoreboard. The feed is on the thief's side: it never
 * scolds the player and never gloats at them. Losses get the funniest lines,
 * because the player who gets nicked is better content than a quiet win, and he
 * should laugh rather than sulk.
 *
 * RULES ENCODED HERE
 *  - Under 70 characters, always. Longer lines wrap in a 300px embed and the
 *    wire stops scanning.
 *  - Present tense for anything live, past tense for anything finished.
 *  - Names render exactly as the player set them. Never rewritten to fit a joke,
 *    never truncated, never capitalised differently.
 *  - No profanity in system lines. Players can swear in their own paid messages.
 *  - No emoji, ever. The icon is a sprite, referenced by name.
 *
 * TOKENS  {name} {crossings} {lane} {amount} {item}
 * The engine substitutes before measuring length; every variant here fits 70
 * characters with a 16-character name and a 4-digit amount.
 */

export type EventType =
  | 'cleanGetaway' | 'keptRareItem' | 'walletOpened' | 'caught' | 'greedy'
  | 'outOfLives' | 'outOfTime' | 'wonDraw' | 'itemUsed' | 'runInProgress'
  | 'rare' | 'playerMessage';

/** Sprite name from sprites.json for each event type. Never an inline glyph. */
export const eventIcon: Record<EventType, string> = {
  cleanGetaway:  'icon.escape',
  keptRareItem:  'icon.painting',
  walletOpened:  'icon.wallet',
  caught:        'icon.siren',
  greedy:        'icon.siren',
  outOfLives:    'icon.heartEmpty',
  outOfTime:     'icon.running',
  wonDraw:       'icon.draw',
  itemUsed:      'icon.oldMan',
  runInProgress: 'icon.running',
  rare:          'icon.haul',
  playerMessage: 'icon.speech',
};

export const lines: Record<EventType, readonly string[]> = {
  /* ------------------------------------------------ walked away with the loot */
  cleanGetaway: [
    '{name} walks away clean — {crossings} crossings',
    '{name} is in the wind with {crossings} crossings',
    '{name} knows when to quit — {crossings} crossings',
    '{name} took the door at {crossings} and never looked back',
    '{name} is gone. {crossings} crossings, no cuffs',
    '{name} called it at {crossings} — that is how it is done',
    'no sirens for {name} tonight — {crossings} crossings',
    '{name} made the corner with {crossings} on the board',
  ],

  /* ------------------------------------------------------- kept a rare item */
  keptRareItem: [
    '{name} walks off with an old master',
    '{name} just made off with the canvas',
    'that painting is off the wall — {name} took it',
    '{name} is carrying {item} out the front door',
    '{item} belongs to {name} now',
    'nobody stopped {name} leaving with {item}',
    '{name} has {item} under one arm and no witnesses',
  ],

  /* ---------------------------------------------------------- wallet opened */
  walletOpened: [
    '{name} lifted a wallet — {amount} inside',
    '{name} went through the pockets: {amount}',
    "{name}'s got light fingers — {amount}",
    '{name} found {amount} and a bus pass',
    'a wallet walked past {name}. it is {amount} lighter',
    '{name} pockets {amount} without breaking step',
    '{amount} in the wallet, and {name} was not asking',
  ],

  /* ----------------------------------------------------------------- nicked */
  caught: [
    '{name} is in cuffs at crossing {crossings}',
    'the law caught up with {name} on lane {lane}',
    "{name}'s doing ten years for a painting he never sold",
    '{name} got collared one lane short',
    'they read {name} his rights at crossing {crossings}',
    '{name} met the flashing blue at lane {lane}',
    'two cars, one {name}. crossing {crossings}',
    'back inside for {name} — {crossings} crossings deep',
  ],

  /* ------------------------------------------- had the door open and stayed */
  greedy: [
    '{name} got greedy at {crossings} and lost the lot',
    '{name} had the door open and stayed for one more',
    'nobody told {name} when to stop',
    'one more crossing, said {name}. it was not',
    '{name} traded {crossings} crossings for a set of cuffs',
    'the exit was right there, {name}',
    '{name} wanted the painting more than the pavement',
  ],

  /* ----------------------------------------------------------- out of lives */
  outOfLives: [
    '{name} did not look both ways',
    'a delivery van ended {name}\u2019s career',
    '{name} met a bus at lane {lane}',
    'lane {lane} was busier than {name} thought',
    '{name} is out of lives and out of luck',
    'third one hurt. {name} is done at {crossings}',
    'the traffic voted against {name}',
  ],

  /* ------------------------------------------------------------ out of time */
  outOfTime: [
    '{name} ran out of road',
    'the sirens got louder and {name} got slower',
    'time called it before the law did — {name}, {crossings}',
    '{name} was still counting lanes when the clock stopped',
    'sixty seconds is sixty seconds, {name}',
    '{name} needed one more minute and did not get it',
  ],

  /* -------------------------------------------------------------- the draw */
  wonDraw: [
    'DRAW · {name} takes the lot — {amount}',
    'DRAW · {name} is retiring on {amount}',
    'DRAW · the whole pot goes to {name} — {amount}',
    'DRAW · {amount} and {name} never has to run again',
    'DRAW · {name} drew the winning ticket — {amount}',
    'DRAW · {name} cashes {amount} and walks',
  ],

  /* ----------------------------------------------------------- item played */
  itemUsed: [
    '{name} called in the old man — traffic stops dead',
    '{name} staged a pile-up on lane {lane}',
    '{name} ducked down the alley — five seconds clear',
    '{name} put a padlock on the bonus for a week',
    '{name} played {item}. the road did as it was told',
    'the old man steps out and lane {lane} brakes for {name}',
    'two cars folded on lane {lane}. {name} says nothing',
  ],

  /* ------------------------------------------------------------- mid-run */
  runInProgress: [
    'someone is making a run for it — {crossings} and counting',
    '{crossings} crossings deep and still going',
    '{name} is out there right now — {crossings} crossings',
    '{name} is {crossings} in and has not stopped',
    'still running: {name}, {crossings} crossings',
    'the police are close and {name} is still crossing',
  ],

  /* -------------------------------------------------- reserved for real feats */
  /** Held back for twenty crossings, or a legendary kept while both hands were
   *  full. A regular viewer should occasionally see something new. */
  rare: [
    '{name} crossed twenty. twenty. and walked away',
    'both hands full and {crossings} crossings — {name} is a problem',
    'nobody has done {crossings} tonight except {name}',
    '{name} took {item} and the whole board with it',
    'the wire has not seen a run like {name}\u2019s in a while',
  ],

  /* ------------------------------------------------------------- players talk */
  /** Placeholder plate copy only. Real text is whatever the player paid to post. */
  playerMessage: [
    '{name}: {message}',
  ],
} as const;

/**
 * Bag selection. Variants are exhausted before any repeats, so the same sentence
 * never appears twice in a row — and never twice in a bag.
 */
export function createBag<T>(items: readonly T[]) {
  let pool: T[] = [];
  return function next(): T {
    if (pool.length === 0) pool = items.slice();
    const i = Math.floor(Math.random() * pool.length);
    return pool.splice(i, 1)[0];
  };
}

export const bags = Object.fromEntries(
  Object.entries(lines).map(([k, v]) => [k, createBag(v)])
) as Record<EventType, () => string>;

/**
 * POLICE PRESSURE — presentation copy, never a readout.
 * The engine knows the exact distance; the player is never told it. Three bands
 * with overlapping phrasings, picked from a bag, held for a random 2.6-4.8s. No
 * line may contain a figure a player could turn back into seconds.
 */
export const policeAlerts = {
  far: [
    'YOU CAN HEAR THE SIRENS',
    "THEY'RE ON YOUR TRAIL",
    'THE POLICE ARE BACK THERE SOMEWHERE',
    'SIRENS, A COUPLE OF STREETS BACK',
    'THE COPS HAVE YOUR SCENT',
    'SOMETHING BLUE IN THE MIRROR',
  ],
  mid: [
    'THE GAP IS CLOSING',
    'THE SIRENS ARE GETTING LOUDER',
    'THE COPS ARE CLOSING THE GAP',
    'THE POLICE ARE CLOSING IN',
    'THEY ARE GAINING ON YOU',
    'THAT SIREN IS NOT GETTING QUIETER',
    'THEY ARE COMING UP FAST',
  ],
  near: [
    'THE POLICE ARE ALMOST ON YOU',
    "THEY'RE RIGHT BEHIND YOU",
    'THE COPS ARE SECONDS AWAY',
    'ONLY A FEW METRES NOW',
    'YOU CAN SEE THE LIGHTS ON THE ROAD',
    'MOVE. THEY ARE ON YOU',
  ],
  /** Fires once on a real change of trend, never as a running indicator. */
  relief: [
    "YOU'RE PULLING AWAY",
    'THE COPS ARE FALLING BEHIND',
    "YOU'VE GOT SOME DISTANCE",
    'THE GAP IS OPENING',
  ],
  /** Real proximity only. A state, not a countdown. */
  critical: [
    "THEY'RE RIGHT BEHIND YOU",
    'THEY ARE ON YOUR HEELS',
    'HANDS OFF THE ROAD, THEY HAVE YOU IN SIGHT',
  ],
  caught: 'THEY HAVE YOU',
} as const;

/** UI copy that is not feed copy. Kept here so no string is hard-coded. */
export const ui = {
  tabs: ['PLAY', 'DEMO', 'RULES', 'MY HAUL'],
  hud: { crossings: 'CROSSINGS', time: 'TIME', hands: 'IN HAND', heat: 'HEAT' },
  escape: {
    idle: 'ESCAPE LOCKED — TEN CROSSINGS',
    armed: 'ESCAPE NOW',
    cost: 'WALK AWAY AND YOU KEEP WHAT IS IN YOUR HANDS.',
    costEmpty: 'NOTHING IN YOUR HANDS. WALKING AWAY KEEPS NOTHING.',
  },
  police: { banner: 'POLICE {distance}M BEHIND', closing: 'THEY ARE CLOSING' },
  caught: 'AH SHIT, HERE WE GO AGAIN',
  end: {
    paidTitle: 'THE CRIME PAID',
    paidSub: 'KEPT WHAT WAS IN HIS HANDS',
    lostTitle: "CRIME DOESN'T PAY",
    lostSub: 'THE LOOT STAYS WITH THE POLICE',
  },
  demo: 'DEMO — NOTHING AT STAKE',
  wire: { title: 'HEIST WIRE — {online} ONLINE', composer: 'SAY SOMETHING', price: '$0.10', pending: 'CONFIRMING', failed: 'TRANSACTION FAILED — NOT SENT' },
  haul: {
    recorded: 'RECORDED ON-CHAIN AGAINST YOUR ADDRESS',
    notTradeable: 'NOT TRADEABLE YET. MINTING COMES LATER.',
    decided: 'WHAT IS DECIDED: THE ITEM IS YOURS AND THE RECORD IS PERMANENT.',
    undecided: 'WHAT IS NOT DECIDED: WHEN MINTING HAPPENS, AND WHAT ANY OF IT IS WORTH.',
  },
} as const;
