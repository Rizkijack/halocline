// Probe the play scene's exact final frame (development tool): how many hazards exist, how many
// the ping lit, and where they sit on screen relative to the sub.
import { createRandom } from '../game/src/random.js';
import { createWorld } from '../game/src/world.js';
import { stageShot } from '../game/src/shots.js';

for (const seed of [7, 11, 23]) {
  const world = createWorld(createRandom(seed));
  const scene = stageShot('play', world);
  const state = world.state;
  const active = world.hazards.filter((h) => h.active);
  const lit = active.filter((h) => world.hazardVisibility(h) > 0.55);
  const near = active.filter((h) => Math.hypot(h.x - state.subX, h.y - state.subY) < 430);
  console.log(`seed ${seed} screen=${scene.screen} depth=${Math.floor(state.depth)} pingAge=${state.pingAge.toFixed(2)} charge=${state.charge.toFixed(2)}`);
  console.log(`  sub at (${Math.round(state.subX)}, ${Math.round(state.subY)})  active=${active.length} near430=${near.length} lit=${lit.length} spotted=${state.spotted}`);
  for (const h of active.slice(0, 8)) {
    console.log(`    ${h.kind} at (${Math.round(h.x)}, ${Math.round(h.y)}) r=${h.radius} vis=${world.hazardVisibility(h).toFixed(2)}`);
  }
  console.log(`  pickups active=${world.pickups.filter((p) => p.active).length}`);
}
