// Pick the seed whose play frame shows the most revealed hazard in the visible water band
// (development tool). The play screenshot has to prove the sonar mechanic, so it needs hazards the
// ping actually lit, inside the frame's water and not tucked behind the HUD strip.
//
// Run: node tools/score-play-seeds.mjs [--limit 120]

import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { stageShot } from '../game/src/shots.js';

const argOf = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : Number(process.argv[at + 1]);
};
const LIMIT = argOf('--limit', 120);

/** The water the frame actually shows: below the HUD strip, above the control footer. */
const BAND_TOP = 90;
const BAND_BOTTOM = 650;

const rows = [];
for (let seed = 1; seed <= LIMIT; seed += 1) {
  const world = createWorld(createRandom(seed));
  const scene = stageShot('play', world);
  if (scene.screen !== 'play') continue;
  const state = world.state;
  const litInBand = world.hazards.filter((hazard) => {
    if (!hazard.active) return false;
    if (world.hazardVisibility(hazard) < 0.55) return false;
    return hazard.y > BAND_TOP && hazard.y < BAND_BOTTOM;
  });
  const pickupsInBand = world.pickups.filter((p) => p.active && p.y > BAND_TOP && p.y < BAND_BOTTOM);
  rows.push({
    seed,
    lit: litInBand.length,
    pickups: pickupsInBand.length,
    score: state.score,
    depth: Math.floor(state.depth),
    spawned: world.hazards.filter((h) => h.active).length,
  });
}

rows.sort((a, b) => (b.lit - a.lit) || (b.pickups - a.pickups) || (a.seed - b.seed));
console.log('best play seeds (lit hazards in band, pickups in band):');
for (const row of rows.slice(0, 8)) {
  console.log(`  seed ${String(row.seed).padStart(3)}  lit ${row.lit}  pickups ${row.pickups}  depth ${row.depth}  score ${row.score}`);
}
