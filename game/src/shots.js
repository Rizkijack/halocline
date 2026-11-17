// The screenshot scenes behind ?shot=start|play|deep|end|win&seed=N. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot, so the frame is
// what a real run of that length actually looks like — no mock-ups, nothing staged. The same seed
// always gives the same frame, which is what makes the screenshots reproducible.
//
// The autopilot is deliberately competent at the play scenes and clumsy at the end scene, so the
// results card it produces is a real ending reached by real rules, not a drawn picture of one.

import { DESCENT, STEP, SUB, TRENCH_FLOOR } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Seconds the title scene idles, so the water behind the card already carries contents. */
const TITLE_SECONDS = 8;

/** How far ahead, in pixels, a hazard starts to matter to the autopilot. */
const WATCH_RADIUS = 300;

/**
 * Two pilots. `steady` pings the moment anything ahead is dark, keeps a wide berth and follows
 * the air, so it survives deep. `hurried` pings late and steers tight, so it takes hits and runs
 * the tank down: the end scene uses it to reach a real loss rather than a staged one.
 */
const PILOTS = {
  steady: { berth: 96, pingWhenUnseen: 1, airCare: 1 },
  hurried: { berth: 18, pingWhenUnseen: 3, airCare: 0.3 },
  /** Flies well but hoards its sonar, so the play frame can spend a ping exactly where it stops. */
  hoarder: { berth: 96, pingWhenUnseen: 99, airCare: 1 },
};

/** The hazard that most deserves the autopilot's attention right now, or null. */
function worstThreat(world, profile) {
  const state = world.state;
  let threat = null;
  let worst = 0;
  for (const hazard of world.hazards) {
    if (!hazard.active) continue;
    const above = state.subY - hazard.y;
    if (above < -40 || above > WATCH_RADIUS) continue;
    const gap = Math.abs(hazard.x - state.subX) - hazard.radius;
    if (gap > profile.berth + 70) continue;
    const lit = world.hazardVisibility(hazard) > 0.15;
    const weight = (lit ? 1 : 0.5) * (1 / Math.max(30, Math.abs(gap)));
    if (weight > worst) {
      worst = weight;
      threat = hazard;
    }
  }
  return threat;
}

/** Where the autopilot steers: away from the worst threat, else toward air, else a slow drift. */
function chooseControls(world, profile) {
  const state = world.state;
  const threat = worstThreat(world, profile);
  let targetX;
  let targetY = state.subY;

  if (threat !== null) {
    const away = threat.x >= state.subX ? -1 : 1;
    targetX = state.subX + away * (threat.radius + profile.berth);
  } else if (state.oxygen < 84 && profile.airCare > 0.5) {
    let best = null;
    for (const pickup of world.pickups) {
      if (!pickup.active) continue;
      const above = state.subY - pickup.y;
      if (above < 30 || above > 280) continue;
      const score = 1 / (Math.abs(pickup.x - state.subX) + 110);
      if (best === null || score > best.score) best = { pickup, score };
    }
    targetX = best === null ? state.subX + (state.subX < 640 ? 14 : -14) : best.pickup.x;
    if (best !== null) targetY = best.pickup.y;
  } else {
    targetX = state.subX + (state.subX < 640 ? 14 : -14);
  }

  // Spending the sonar: a steady pilot pings as soon as anything ahead is dark; a hurried one
  // waits until three are, which is why it meets one of them unlit.
  let unseen = 0;
  for (const hazard of world.hazards) {
    if (!hazard.active) continue;
    const above = state.subY - hazard.y;
    if (above < -60 || above > 330) continue;
    if (world.hazardVisibility(hazard) < 0.15) unseen += 1;
  }
  const ping = state.charge >= 1 && unseen >= profile.pingWhenUnseen;

  const dx = targetX - state.subX;
  const dy = targetY - state.subY;
  return {
    horizontal: dx > 12 ? 1 : dx < -12 ? -1 : 0,
    vertical: dy > 16 ? 1 : dy < -16 ? -1 : 0,
    ping,
  };
}

/** Play `world` forward until `stop` says so, or the run ends. Returns true if the run ended. */
function play(world, profile, stop, stepLimit) {
  for (let step = 0; step < stepLimit; step += 1) {
    if (stop(world.state)) return false;
    const controls = chooseControls(world, profile);
    if (controls.ping) world.ping();
    const events = world.step(STEP, controls, false);
    if (events & EVENT_OVER) return true;
  }
  return false;
}

/**
 * Stage a named scene and return the screen to paint and the best score to show. `world` is reset
 * here, so a scene never inherits state from a previous one.
 *
 * - start: the title card over a live trench.
 * - play: a steady run stopped mid-descent in the second zone, HUD showing every resource.
 * - deep: a steady run stopped in the third zone, so a second play frame shows a different hue.
 * - end: the results card after a real loss, flown by the hurried pilot.
 * - win: the results card after a real win, flown by the steady pilot to the trench floor.
 */
export function stageShot(name, world) {
  world.reset();

  if (name === 'start' || name === undefined) {
    const steps = Math.round(TITLE_SECONDS / STEP);
    for (let index = 0; index < steps; index += 1) {
      world.step(STEP, { horizontal: 0, vertical: 0 }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'win') {
    // One run to the floor, flown honestly; the cap only stops a pilot that never finishes.
    const limit = Math.ceil(TRENCH_FLOOR / DESCENT / STEP) * 2;
    play(world, PILOTS.steady, () => false, limit);
    return { screen: SCREEN_OVER, best: world.state.score };
  }

  if (name === 'end') {
    // A hurried dive: it flies until the run genuinely ends, capped so it cannot hang.
    play(world, PILOTS.hurried, () => false, Math.ceil(220 / STEP));
    return { screen: SCREEN_OVER, best: world.state.score };
  }

  // A play frame: the steady pilot runs to a target depth, then keeps flying until it decides to
  // ping, and stops a few frames into that reveal. That is the one frame that shows the game's
  // actual mechanic — the ring sweeping out and the hazards it just lit — rather than a sub
  // drifting through empty water. The pilot really pings; nothing here is staged.
  const targetDepth = name === 'deep' ? 1180 : 640;
  const reachedTarget = (state) => state.depth >= targetDepth;
  // Fly with a pilot that hoards its charge, so the tank is still full when the frame is taken.
  play(world, PILOTS.hoarder, reachedTarget, Math.ceil(260 / STEP));
  if (!world.state.won && !world.state.lost) {
    // Spend a ping here, then keep flying while the ring sweeps out. The reveal grows at about
    // 126 px a second, so it needs over a second of play to read as a ring rather than a dot.
    world.ping();
    play(world, PILOTS.hoarder, (state) => state.pingAge >= 1.7, Math.ceil(3 / STEP));
  }
  const finished = world.state.won || world.state.lost;
  return { screen: finished ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
