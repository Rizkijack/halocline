// Every tuning number and colour in HALOCLINE, in one place. The playfield is a fixed
// 1280x720 logical area and the renderer scales it to the window, so no rule below depends
// on the size of the screen. Depth is the game's clock: the sub sinks at DESCENT metres a
// second and the run is over at the trench floor.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Metres a second the sub sinks. Depth is therefore time, and the zones below are timings. */
export const DESCENT = 12.5;

/** The trench floor: reaching this depth wins the run. */
export const TRENCH_FLOOR = 2000;

export const SUB = {
  width: 46,
  height: 30,
  /** Horizontal speed in pixels a second; the sub never stops sinking. */
  speed: 470,
  /** Vertical speed while holding dive/climb, and how far it may stray from its lane. */
  verticalSpeed: 300,
  laneTop: 150,
  laneBottom: 620,
  /** Seconds of invulnerability after a hit. */
  invulnerable: 2.1,
  /**
   * Hull pips. Five, not three: measured with tools/balance.mjs, three died around 440 m on
   * every seed because a twelve-and-a-half metre a second descent meets ~40 hazard rows per
   * run, and the floor is at 2,000 m. Five pips plus the longer invulnerability is what makes
   * the floor reachable by a careful player while a careless one still loses the hull.
   */
  maxHull: 5,
};

export const OXYGEN = {
  max: 100,
  /** Units drained a second. A clean run to the floor takes about 160 s, so air alone rarely ends it. */
  drain: 0.42,
  /** A breather tank's refill, and a vent plume's. */
  tankRefill: 34,
  ventRefill: 9,
};

export const SONAR = {
  /** Pings available at once. */
  max: 3,
  /** Seconds to regain one ping. */
  recharge: 5.5,
  /** Seconds a ping's reveal lasts, and the radius it sweeps out. */
  revealTime: 3.4,
  radius: 430,
  /** Score for a hazard first lit by a ping, before it is cleared. */
  spotPoints: 4,
};

export const HAZARD = {
  mineRadius: 16,
  mineDamage: 1,
  /** Metres between hazard rows at the start, and the tightest it ever gets. */
  spawnInterval: 0.95,
  minInterval: 0.42,
  /** Per zone-step tightening. */
  intervalScale: 0.9,
  /** Metres a second a mine drifts sideways. */
  drift: 42,
  /** Score for clearing a hazard by passing it while it is lit. */
  clearPoints: 12,
};

export const SAMPLE = {
  /** Salvage canisters: the score's main source. */
  radius: 13,
  points: 25,
  interval: 1.65,
  intervalJitter: 0.9,
};

export const ZONE = {
  /** Metres per zone; four zones cover the 2,000 m descent. */
  span: 500,
  names: ['Sunlit Shelf', 'Twilight Drift', 'Midnight Vein', 'Hadal Rift'],
};

/** How many gates, hazards and pickups can exist at once; the pools are allocated at boot. */
export const POOL_SIZE = 96;

/**
 * Palette by zone. Each zone is a coherent hue so four screenshots from four depths never read
 * as the same frame twice, and every one keeps the sub, hazards and salvage at high contrast
 * against a near-black field: the screenshots have to survive being shrunk to a contact sheet.
 */
export const PALETTE = {
  zones: [
    { // Sunlit Shelf — teal
      water: '#05171c', deep: '#031014', rock: '#0d3b44', rockLit: '#17616c',
      glow: '#4fe3d0', hazard: '#ff6b5e', salvage: '#ffc247', haze: '#0a2027',
    },
    { // Twilight Drift — indigo
      water: '#0a0f24', deep: '#050813', rock: '#1d2a5c', rockLit: '#2f4494',
      glow: '#6f8dff', hazard: '#ff7a5c', salvage: '#ffd166', haze: '#101736',
    },
    { // Midnight Vein — violet
      water: '#12081f', deep: '#080410', rock: '#3a1d5e', rockLit: '#5b2f8c',
      glow: '#c07bff', hazard: '#ff5f7e', salvage: '#ffcf5c', haze: '#1a0d2c',
    },
    { // Hadal Rift — crimson
      water: '#1a0509', deep: '#0d0204', rock: '#5c1420', rockLit: '#8c2130',
      glow: '#ff6b8a', hazard: '#ff3b30', salvage: '#ffdb70', haze: '#2a0810',
    },
  ],
  sub: '#dff6ff',
  subDark: '#7fb6cc',
  sonar: '#7cf6ff',
  hull: '#6fe3a8',
  hullLost: '#39424d',
  oxygen: '#4fe3d0',
  oxygenLow: '#ff6b5e',
  panel: 'rgba(4, 10, 14, 0.72)',
  panelEdge: 'rgba(124, 246, 255, 0.28)',
  text: '#eaf7fb',
  muted: '#7f95a3',
  black: '#000000',
};

export const FONT = 'ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'halocline.best';
