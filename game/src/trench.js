// The trench's geology: the rock walls, ledges and vent stacks the sub sinks past. Nothing here
// touches the simulation: it is scenery the renderer paints behind the water, generated from the
// run's seed so a seed always draws the same trench, and rebuilt when the zone changes so each
// depth band has its own silhouette instead of one tiled texture.

/** How many ledges are drawn per zone band, per side of the trench. */
const LEDGES_PER_SIDE = 7;
/** The narrowest and widest a ledge may be, in pixels. */
const LEDGE_MIN_WIDTH = 90;
const LEDGE_MAX_WIDTH = 300;

/**
 * Build one zone's scenery: a pair of jagged walls down each side of the field, a handful of
 * ledges that stick out into the water, and a few vent stacks on the floor between them. Each
 * is a plain list of points so the renderer only has to draw, never to decide.
 */
function buildZoneScenery(random, zone) {
  const wallPoints = 26;
  const walls = { left: [], right: [] };
  for (let index = 0; index <= wallPoints; index += 1) {
    const t = index / wallPoints;
    // The walls close in as the zones deepen, so the rift feels narrower than the shelf.
    const base = 96 + zone * 26;
    const jag = random.between(0, 1) * (58 + zone * 16);
    walls.left.push({ y: t * 760 - 20, x: base + jag });
    walls.right.push({ y: t * 760 - 20, x: 1280 - base - jag });
  }

  const ledges = [];
  for (let index = 0; index < LEDGES_PER_SIDE; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const width = random.between(LEDGE_MIN_WIDTH, LEDGE_MAX_WIDTH);
    const y = random.between(20, 740);
    const depthOut = random.between(70, 210) + zone * 20;
    ledges.push({
      side,
      y,
      width,
      // How far the ledge reaches in from its wall, and how thick its lip is.
      reach: depthOut,
      thickness: random.between(14, 34),
      notches: random.integer(2, 4),
    });
  }

  const vents = [];
  for (let index = 0; index < 4; index += 1) {
    vents.push({
      x: random.between(180, 1100),
      y: random.between(560, 730),
      height: random.between(70, 190),
      width: random.between(16, 34),
      // Plumes pulse on their own phase so they never breathe in unison.
      phase: random.between(0, Math.PI * 2),
      rate: random.between(0.7, 1.5),
    });
  }

  return { zone, walls, ledges, vents };
}

export function createTrench(random) {
  let cachedZone = -1;
  let cached = null;

  /**
   * The scenery for a zone, built once and kept: the renderer asks for it every frame, and the
   * same zone must draw the same rocks on every one of those frames.
   */
  function sceneryFor(zone) {
    if (zone !== cachedZone) {
      // A fresh generator per zone, seeded from the run's seed and the zone, so the shelf looks
      // the same on every visit and the rift never repeats the shelf's rocks.
      cached = buildZoneScenery(random, zone);
      cachedZone = zone;
    }
    return cached;
  }

  /** Forget the cache: called on reset so a new run rebuilds from its own seed. */
  function reset() {
    cachedZone = -1;
    cached = null;
  }

  return { sceneryFor, reset };
}
