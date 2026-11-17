// Balance harness (development tool, not part of the entry). It imports the game's own simulation
// — game/src/world.js and game/src/random.js are plain ES modules with no DOM in them — and runs
// them headless, so the tuning in config.js can be measured instead of guessed at.
//
// It plays many seeds with a few bot policies of different skill and prints, per policy: how often
// the run reaches the trench floor, the median depth, the median score, how many hits were taken
// and how much air was left. Run: node tools/balance.mjs [--seeds 40]

import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { DESCENT, OXYGEN, SONAR, STEP, TRENCH_FLOOR } from '../game/src/config.js';

const argOf = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : Number(process.argv[at + 1]);
};
const SEEDS = argOf('--seeds', 40);

/**
 * A policy decides controls each step. `skill` scales how early it pings and how wide a berth it
 * gives a hazard: a careless player pings late and steers tight; a careful one pings early and
 * keeps clear. This is the stand-in for "how hard is this game, really".
 */
function makePolicy(skill) {
  const horizon = 0.34 + skill * 0.36;
  const berth = 30 + skill * 60;
  const pingBelow = 1 - skill * 0.55;

  return function decide(world) {
    const state = world.state;
    let threat = null;
    let worst = 0;
    for (const hazard of world.hazards) {
      if (!hazard.active) continue;
      const dy = state.subY - hazard.y;
      if (dy < -40 || dy > 300) continue;
      const gap = Math.abs(hazard.x - state.subX) - hazard.radius;
      if (gap > berth + 70) continue;
      const lit = world.hazardVisibility(hazard) > 0.15;
      // How much this hazard deserves a reaction: lit ones and close ones count most.
      const proximity = 1 / Math.max(30, Math.abs(gap));
      const weight = (lit ? 1 : 0.5) * proximity;
      if (weight > worst) {
        worst = weight;
        threat = hazard;
      }
    }

    let targetX = state.subX;
    let targetY = state.subY;

    if (threat !== null) {
      const away = threat.x >= state.subX ? -1 : 1;
      targetX = state.subX + away * (threat.radius + berth);
    } else {
      // Drift toward the nearest pickup that is worth the air, staying off the low lane.
      let best = null;
      for (const pickup of world.pickups) {
        if (!pickup.active) continue;
        const dy = state.subY - pickup.y;
        if (dy < 40 || dy > 260) continue;
        const score = 1 / (Math.abs(pickup.x - state.subX) + 120);
        if (best === null || score > best.score) best = { pickup, score };
      }
      if (best !== null && state.oxygen < 78) targetX = best.pickup.x;
      else targetX = state.subX + (state.subX < 640 ? 12 : -12);
    }

    let ping = false;
    if (state.charge >= 1) {
      let unseen = 0;
      for (const hazard of world.hazards) {
        if (!hazard.active) continue;
        const dy = state.subY - hazard.y;
        if (dy < -60 || dy > SONAR.radius * 0.9) continue;
        if (world.hazardVisibility(hazard) < 0.15) unseen += 1;
      }
      ping = unseen >= Math.max(1, Math.round((1 - pingBelow) * 4));
    }

    const dx = targetX - state.subX;
    const dy = targetY - state.subY;
    return {
      horizontal: dx > 12 ? 1 : dx < -12 ? -1 : 0,
      vertical: dy > 14 ? 1 : dy < -14 ? -1 : 0,
      ping,
      horizon,
    };
  };
}

function runSeed(seed, skill) {
  const random = createRandom(seed);
  const world = createWorld(random);
  const decide = makePolicy(skill);
  let hits = 0;
  let maxDepth = 0;
  const limit = Math.ceil((TRENCH_FLOOR / DESCENT) / STEP) * 2;
  for (let step = 0; step < limit; step += 1) {
    const controls = decide(world);
    if (controls.ping) world.ping();
    const before = world.state.hull;
    const events = world.step(STEP, controls, false);
    if (world.state.hull < before) hits += 1;
    maxDepth = Math.max(maxDepth, world.state.depth);
    if (events & 64) break;
  }
  const state = world.state;
  return {
    seed,
    won: state.won,
    lostTo: state.lostTo,
    depth: Math.floor(state.depth),
    seconds: Math.round(state.elapsed),
    score: state.score,
    hits,
    oxygen: Math.round(state.oxygen),
    hull: state.hull,
    spotted: state.spotted,
    salvage: state.salvageTaken,
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
};

for (const [name, skill] of [['careless', 0.15], ['average', 0.5], ['careful', 0.9]]) {
  const runs = [];
  for (let index = 0; index < SEEDS; index += 1) runs.push(runSeed(1000 + index * 37, skill));
  const wins = runs.filter((run) => run.won).length;
  console.log(
    `${name.padEnd(9)} wins ${String(wins).padStart(3)}/${SEEDS}`
    + `  depth med ${String(median(runs.map((r) => r.depth))).padStart(5)}`
    + `  score med ${String(median(runs.map((r) => r.score))).padStart(5)}`
    + `  hits med ${String(median(runs.map((r) => r.hits))).padStart(2)}`
    + `  secs med ${String(median(runs.map((r) => r.seconds))).padStart(3)}`
    + `  air med ${String(median(runs.map((r) => r.oxygen))).padStart(3)}`
    + `  losses ${JSON.stringify(runs.reduce((acc, r) => (r.lostTo ? (acc[r.lostTo] = (acc[r.lostTo] ?? 0) + 1, acc) : acc), {}))}`,
  );
}
