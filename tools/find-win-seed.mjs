// Finds seeds on which the win scene really reaches the trench floor (development tool). The win
// screenshot must be a real win produced by the game's own rules, so this searches seeds with the
// same stageShot code the browser runs and reports the first few that end in a win.
//
// Run: node tools/find-win-seed.mjs [--limit 400]

import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { stageShot } from '../game/src/shots.js';
import { SCREEN_OVER } from '../game/src/render.js';

const argOf = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : Number(process.argv[at + 1]);
};
const LIMIT = argOf('--limit', 400);

const wins = [];
for (let seed = 1; seed <= LIMIT; seed += 1) {
  const world = createWorld(createRandom(seed));
  const scene = stageShot('win', world);
  if (scene.screen === SCREEN_OVER && world.state.won) {
    wins.push({ seed, depth: Math.floor(world.state.depth), score: world.state.score, hull: world.state.hull });
    if (wins.length >= 6) break;
  }
}
if (wins.length === 0) {
  console.log(`no winning seed among the first ${LIMIT}: the win scene cannot reach the floor`);
} else {
  for (const win of wins) console.log(`seed ${win.seed}: won at ${win.depth} m, score ${win.score}, hull ${win.hull}`);
}
