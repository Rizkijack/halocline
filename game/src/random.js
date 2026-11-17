// A small seeded random number generator, so a seed always places the same trench: the same
// seed gives the same hazard rows, the same salvage and the same rocks, which is what lets
// ?seed=N reproduce a screenshot and lets a player learn a run. mulberry32: 32 bits of state,
// a good enough spread for spawn positions and drift directions.

export function createRandom(seed) {
  let state = seed >>> 0;

  /** The next float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [low, high). */
  function between(low, high) {
    return low + next() * (high - low);
  }

  /** An integer in [low, high], both ends included. */
  function integer(low, high) {
    return Math.floor(between(low, high + 1));
  }

  /** True with probability p. */
  function chance(p) {
    return next() < p;
  }

  /** One of the array's entries, evenly. */
  function pick(items) {
    return items[Math.floor(next() * items.length)];
  }

  return { next, between, integer, chance, pick, seed };
}
