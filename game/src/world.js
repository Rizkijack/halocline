// The simulation. Depth is the clock: the sub sinks at a fixed rate, hazards and salvage rise
// to meet it, and the run ends either at the trench floor (a win) or when the hull or the air
// runs out (a loss). Everything here is plain arithmetic on a fixed step, so one seed always
// replays the same trench, and the screenshot scenes can play the real rules forward.
//
// The sonar is the game's one decision. Hazards are near-invisible until a ping lights them,
// a ping costs charge that comes back slowly, and a hazard cleared while lit scores. So every
// few seconds the player spends their only reveal on the stretch ahead they cannot read.

import {
  DESCENT, HAZARD, OXYGEN, POOL_SIZE, SAMPLE, SONAR, STEP, SUB, TRENCH_FLOOR, ZONE,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_SALVAGE = 2;
export const EVENT_TANK = 4;
export const EVENT_PING = 8;
export const EVENT_ZONE = 16;
export const EVENT_WIN = 32;
export const EVENT_OVER = 64;
export const EVENT_DENY = 128;

/** Kinds of hazard: a drifting mine, or a spur of rock that holds its line. */
export const HAZARD_MINE = 'mine';
export const HAZARD_SPUR = 'spur';

/** Kinds of pickup: a breather tank (a large refill) or a vent plume (a small one). */
export const PICKUP_TANK = 'tank';
export const PICKUP_VENT = 'vent';

/** How fast the world rises past the sub, in pixels a second, at the first zone. */
const SCROLL_BASE = 210;
/** How much faster each zone scrolls. */
const SCROLL_PER_ZONE = 54;
/** The sub holds this fraction of the field's height; the world rises past it. */
const SUB_ANCHOR = 0.62;
/** A hazard this close to the sub shimmers even unlit, so a blind hit is never a total surprise. */
const PROXIMITY_HINT = 132;

function makePool(size, factory) {
  const items = new Array(size);
  for (let index = 0; index < size; index += 1) items[index] = factory();
  return items;
}

function resetHazard(item) {
  item.active = false;
  item.x = 0;
  item.y = 0;
  item.vx = 0;
  item.vy = 0;
  item.radius = 0;
  item.kind = HAZARD_MINE;
  item.litUntil = 0;
  item.spotted = false;
}

function resetPickup(item) {
  item.active = false;
  item.x = 0;
  item.y = 0;
  item.vy = 0;
  item.radius = 0;
  item.kind = PICKUP_VENT;
  item.wobble = 0;
}

export function createWorld(random) {
  const hazards = makePool(POOL_SIZE, () => {
    const item = {};
    resetHazard(item);
    return item;
  });
  const pickups = makePool(POOL_SIZE, () => {
    const item = {};
    resetPickup(item);
    return item;
  });

  const state = {
    depth: 0,
    oxygen: OXYGEN.max,
    hull: SUB.maxHull,
    score: 0,
    charge: SONAR.max,
    elapsed: 0,
    zone: 0,
    invulnerable: 0,
    pingAge: Number.POSITIVE_INFINITY,
    pingX: 0,
    pingY: 0,
    subX: 640,
    subY: 400,
    won: false,
    lost: false,
    lostTo: '',
    spotted: 0,
    cleared: 0,
    salvageTaken: 0,
    bestCombo: 0,
  };

  let hazardTimer = HAZARD.spawnInterval;
  let pickupTimer = SAMPLE.interval;

  function reset() {
    for (const item of hazards) resetHazard(item);
    for (const item of pickups) resetPickup(item);
    state.depth = 0;
    state.oxygen = OXYGEN.max;
    state.hull = SUB.maxHull;
    state.score = 0;
    state.charge = SONAR.max;
    state.elapsed = 0;
    state.zone = 0;
    state.invulnerable = SUB.invulnerable;
    state.pingAge = Number.POSITIVE_INFINITY;
    state.subX = 640;
    state.subY = 400;
    state.won = false;
    state.lost = false;
    state.lostTo = '';
    state.spotted = 0;
    state.cleared = 0;
    state.salvageTaken = 0;
    state.bestCombo = 0;
    hazardTimer = HAZARD.spawnInterval;
    pickupTimer = SAMPLE.interval;
  }

  function zoneOf(depth) {
    return Math.min(ZONE.names.length - 1, Math.floor(depth / ZONE.span));
  }

  /** How much harder the trench is at this depth: 0 at the shelf, 1 at the rift. */
  function severity() {
    return state.zone / (ZONE.names.length - 1);
  }

  function scrollSpeed() {
    return SCROLL_BASE + SCROLL_PER_ZONE * state.zone;
  }

  function freeHazard() {
    for (const item of hazards) if (!item.active) return item;
    return null;
  }

  function freePickup() {
    for (const item of pickups) if (!item.active) return item;
    return null;
  }

  /**
   * Spawn one row of hazards rising from the bottom of the field. The row's size grows with the
   * zone, and a spur appears more often deeper down, where the rock is closer.
   */
  function spawnHazardRow() {
    const hard = severity();
    const count = 1 + random.integer(0, state.zone >= 2 ? 2 : state.zone >= 1 ? 1 : 1);
    for (let index = 0; index < count; index += 1) {
      const item = freeHazard();
      if (item === null) return;
      resetHazard(item);
      const spur = random.chance(0.24 + hard * 0.2);
      item.active = true;
      item.kind = spur ? HAZARD_SPUR : HAZARD_MINE;
      item.radius = spur ? HAZARD.mineRadius + 13 : HAZARD.mineRadius;
      item.x = random.between(item.radius + 24, 1280 - item.radius - 24);
      item.y = 720 + item.radius + random.between(0, 130) + index * 46;
      item.vy = scrollSpeed() * random.between(0.9, 1.08);
      item.vx = spur ? 0 : random.between(-1, 1) * HAZARD.drift * (1 + hard);
    }
  }

  /** Spawn one pickup: mostly vent plumes, with a breather tank when the air is worth the risk. */
  function spawnPickup() {
    const item = freePickup();
    if (item === null) return;
    resetPickup(item);
    const tankShare = state.oxygen < OXYGEN.max * 0.55 ? 0.62 : 0.34;
    const tank = random.chance(tankShare);
    item.active = true;
    item.kind = tank ? PICKUP_TANK : PICKUP_VENT;
    item.radius = tank ? SAMPLE.radius + 5 : SAMPLE.radius - 2;
    item.x = random.between(40, 1240);
    item.y = 720 + item.radius + random.between(0, 90);
    item.vy = scrollSpeed() * 0.96;
    item.wobble = random.between(0, Math.PI * 2);
  }

  /** Spend one ping, lighting every hazard inside its radius. Returns the event to report. */
  function ping() {
    if (state.charge < 1) return EVENT_DENY;
    state.charge -= 1;
    state.pingAge = 0;
    state.pingX = state.subX;
    state.pingY = state.subY;
    let spottedNow = 0;
    for (const item of hazards) {
      if (!item.active) continue;
      const dx = item.x - state.subX;
      const dy = item.y - state.subY;
      if (dx * dx + dy * dy > SONAR.radius * SONAR.radius) continue;
      item.litUntil = state.elapsed + SONAR.revealTime;
      if (!item.spotted) {
        item.spotted = true;
        spottedNow += 1;
      }
    }
    if (spottedNow > 0) {
      state.spotted += spottedNow;
      state.score += spottedNow * SONAR.spotPoints;
    }
    return EVENT_PING;
  }

  function hurt() {
    if (state.invulnerable > 0 || state.won || state.lost) return EVENT_NONE;
    state.hull -= 1;
    state.invulnerable = SUB.invulnerable;
    if (state.hull <= 0) {
      state.hull = 0;
      state.lost = true;
      state.lostTo = 'HULL BREACH';
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  /**
   * Advance the world by one fixed step. `controls` gives horizontal and vertical input in
   * [-1, 1]; `calm` runs the trench without collisions or damage, which the title screen and
   * the screenshot scenes use to show the water behind a menu.
   */
  function step(dt, controls, calm = false) {
    let events = EVENT_NONE;
    state.elapsed += dt;
    if (state.pingAge !== Number.POSITIVE_INFINITY) state.pingAge += dt;

    if (!calm) {
      state.depth = Math.min(TRENCH_FLOOR, state.depth + DESCENT * dt);
      const zone = zoneOf(state.depth);
      if (zone !== state.zone) {
        state.zone = zone;
        events |= EVENT_ZONE;
      }
      state.oxygen = Math.max(0, state.oxygen - OXYGEN.drain * dt);
      if (state.charge < SONAR.max) state.charge = Math.min(SONAR.max, state.charge + dt / SONAR.recharge);
      if (state.invulnerable > 0) state.invulnerable = Math.max(0, state.invulnerable - dt);
    }

    // The sub: horizontal free, vertical inside its lane, and it always sinks.
    const horizontal = controls?.horizontal ?? 0;
    const vertical = controls?.vertical ?? 0;
    state.subX += horizontal * SUB.speed * dt;
    state.subX = Math.min(1280 - SUB.width / 2 - 8, Math.max(SUB.width / 2 + 8, state.subX));
    state.subY += vertical * SUB.verticalSpeed * dt;
    state.subY = Math.min(SUB.laneBottom, Math.max(SUB.laneTop, state.subY));

    if (calm) {
      // A slow idle drift keeps the title scene alive without changing any rule.
      state.subX += Math.sin(state.elapsed * 0.9) * 26 * dt;
    }

    // Spawning. Calm scenes keep the water populated but never spawn on a menu's frame.
    hazardTimer -= dt;
    if (hazardTimer <= 0) {
      spawnHazardRow();
      const tightest = HAZARD.spawnInterval * Math.pow(HAZARD.intervalScale, state.zone + 1);
      hazardTimer = Math.max(tightest, HAZARD.spawnInterval * Math.pow(HAZARD.intervalScale, state.zone))
        * random.between(0.86, 1.14);
    }
    pickupTimer -= dt;
    if (pickupTimer <= 0) {
      spawnPickup();
      pickupTimer = SAMPLE.interval * random.between(1 - SAMPLE.intervalJitter / 2, 1 + SAMPLE.intervalJitter / 2);
    }

    const rise = scrollSpeed() * dt;
    const subRadius = SUB.width * 0.36;

    for (const item of hazards) {
      if (!item.active) continue;
      item.y -= rise * 0.0 + item.vy * dt;
      item.x += item.vx * dt;
      if (item.x < item.radius + 6) {
        item.x = item.radius + 6;
        item.vx = Math.abs(item.vx);
      } else if (item.x > 1280 - item.radius - 6) {
        item.x = 1280 - item.radius - 6;
        item.vx = -Math.abs(item.vx);
      }

      if (!calm) {
        const dx = item.x - state.subX;
        const dy = item.y - state.subY;
        const reach = item.radius + subRadius;
        if (dx * dx + dy * dy <= reach * reach) {
          const before = state.hull;
          events |= hurt();
          if (state.hull < before) {
            // A hit knocks the hazard aside so it cannot hit twice in the same frame.
            item.vx = dx >= 0 ? Math.abs(item.vx) + 60 : -Math.abs(item.vx) - 60;
          }
        }
      }

      if (item.y < -item.radius - 8) {
        // Cleared: passing a hazard the sonar lit scores.
        if (item.spotted) {
          state.cleared += 1;
          state.score += HAZARD.clearPoints;
        }
        resetHazard(item);
      }
    }

    for (const item of pickups) {
      if (!item.active) continue;
      item.y -= item.vy * dt;
      item.wobble += dt * 3.1;
      item.x += Math.sin(item.wobble) * 22 * dt;

      if (!calm) {
        const dx = item.x - state.subX;
        const dy = item.y - state.subY;
        const reach = item.radius + subRadius + 4;
        if (dx * dx + dy * dy <= reach * reach) {
          if (item.kind === PICKUP_TANK) {
            state.oxygen = Math.min(OXYGEN.max, state.oxygen + OXYGEN.tankRefill);
            state.score += SAMPLE.points;
            state.salvageTaken += 1;
            events |= EVENT_TANK;
          } else {
            state.oxygen = Math.min(OXYGEN.max, state.oxygen + OXYGEN.ventRefill);
            state.score += 8;
            state.salvageTaken += 1;
            events |= EVENT_SALVAGE;
          }
          resetPickup(item);
          continue;
        }
      }

      if (item.y < -item.radius - 8) resetPickup(item);
    }

    if (!calm && !state.won && !state.lost) {
      if (state.depth >= TRENCH_FLOOR) {
        state.won = true;
        state.score += 500;
        state.score += Math.round(state.oxygen * 6);
        state.score += state.hull * 150;
        events |= EVENT_WIN | EVENT_OVER;
      } else if (state.oxygen <= 0) {
        state.lost = true;
        state.lostTo = 'OUT OF AIR';
        events |= EVENT_OVER;
      }
    }

    return events;
  }

  /** How strongly a hazard reads right now, 0 (unseen) to 1 (fully lit). */
  function hazardVisibility(item) {
    if (state.elapsed < item.litUntil) return 1;
    const dx = item.x - state.subX;
    const dy = item.y - state.subY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance >= PROXIMITY_HINT) return 0;
    return 0.34 * (1 - distance / PROXIMITY_HINT);
  }

  /** Progress through the current zone, 0 to 1, for the depth gauge. */
  function zoneProgress() {
    const into = state.depth - state.zone * ZONE.span;
    return Math.max(0, Math.min(1, into / ZONE.span));
  }

  return {
    state,
    hazards,
    pickups,
    step,
    reset,
    ping,
    hazardVisibility,
    zoneProgress,
    scrollSpeed,
    severity,
    stepDuration: STEP,
  };
}
