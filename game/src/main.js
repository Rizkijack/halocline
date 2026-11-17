// Boot and the one loop. Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused, and the results card, which offers a restart.
//
// ?seed=N fixes the trench, so a run replays exactly. ?shot=start|play|end|win&seed=N stages
// that scene instead of running the loop, paints it twice, and sets window.__shotReady, which
// is how the screenshots in screenshots/ were taken from this same code.

import { BEST_KEY, STEP, SUB } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_DENY, EVENT_HIT, EVENT_OVER, EVENT_PING, EVENT_SALVAGE, EVENT_TANK, EVENT_WIN, EVENT_ZONE } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PING, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createTrench } from './trench.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);
const trench = createTrench(random);
const renderer = createRenderer(canvas, trench);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Paint a staged scene twice, then flag it ready: the second pass settles fonts and gradients. */
function runShot(name) {
  const scene = stageShot(name, world, random);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let elapsedVisible = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    world.reset();
    trench.reset();
    accumulator = 0;
    elapsedVisible = 0;
    screen = SCREEN_PLAY;
    announce(`Diving. ${SUB.maxHull} hull, full air. Reach the trench floor at 2000 metres.`);
  }

  function endRun() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.play(world.state.won ? 'win' : 'lose');
    announce(world.state.won
      ? `Trench floor reached. Depth ${Math.floor(world.state.depth)} metres. Score ${world.state.score}. Best ${best}.`
      : `${world.state.lostTo}. Depth ${Math.floor(world.state.depth)} metres. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.toggleMute();

    if (screen === SCREEN_TITLE && actions & ACTION_CONFIRM) {
      audio.unlock();
      startRun();
      return;
    }
    if (screen === SCREEN_OVER && actions & ACTION_CONFIRM) {
      startRun();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        return;
      }
      if (actions & ACTION_PING) {
        const pinged = world.ping();
        if (pinged === EVENT_DENY) audio.play('deny');
        else if (pinged & EVENT_PING) audio.play('ping');
        return;
      }
    }
    if (screen === SCREEN_PAUSED && actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
      screen = SCREEN_PLAY;
      announce('Diving.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { horizontal: 0, vertical: 0 }, true);
      return;
    }
    const controls = { horizontal: input.horizontal(), vertical: input.vertical() };
    const events = world.step(STEP, controls, false);
    if (events & EVENT_PING) audio.play('ping');
    if (events & EVENT_TANK) audio.play('tank');
    if (events & EVENT_SALVAGE) audio.play('salvage');
    if (events & EVENT_HIT) audio.play('hit');
    if (events & EVENT_ZONE) {
      audio.play('zone');
      announce(`Entering ${world.state.zone + 1} of 4. Depth ${Math.floor(world.state.depth)} metres.`);
    }
    if (events & EVENT_OVER) endRun();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
        elapsedVisible += STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world);
  }

  // Leaving the tab pauses a running dive rather than sinking unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Halocline. Press Space or click to dive.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
