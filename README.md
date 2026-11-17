# halocline

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Rizkijack/halocline/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Rizkijack/halocline/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A sonar-lit descent: pilot a submersible 2,000 metres down a trench where the water hides
everything, and spend the few sonar pings you have on the stretch ahead you cannot read.

## Run it

```sh
node serve.ts --open
```

## The game

Depth is the clock. The sub sinks whether you steer or not, hazards and air canisters rise to
meet it, and the run ends at the trench floor (a win) or when the hull or the air gives out.

- **The halocline is the mechanic.** Below it the water scatters sonar, so mines and rock spurs
  are near-invisible ghosts. A ping lights everything inside its radius for a few seconds and
  scores every hazard it finds. Three pings, each on a slow recharge, is all the sight you get.
- **Air is a second clock.** It drains always; breather tanks and vent plumes top it up, and the
  tanks are worth points, so the safe route and the scoring route are not the same route.
- **Four zones** — Sunlit Shelf, Twilight Drift, Midnight Vein, Hadal Rift — each with its own
  hue, faster current and tighter hazard spacing, so the trench visibly deepens as you descend.

Controls: `A`/`D` or arrows steer, `W`/`S` dive and climb, `E` or click sounds a ping, `P`
pauses, `R` restarts, `M` mutes. Score comes from salvage, from hazards your sonar lit and then
cleared, and from finishing with air and hull to spare.

## How it is built

`game/` is plain static files with no build step: `index.html` and ES modules under `game/src/`,
opened by any static server and played in a desktop browser with no network request at all. The
art is drawn with the canvas 2D API and the sound is synthesised with WebAudio, so there are no
image or audio assets to load.

| File | Its one job |
| --- | --- |
| `game/src/config.js` | every tuning number and colour |
| `game/src/random.js` | the seeded generator that makes a seed replay |
| `game/src/input.js` | keyboard and mouse, as edge-triggered actions |
| `game/src/audio.js` | every sound, synthesised at run time |
| `game/src/trench.js` | the rock walls, ledges and vents of each zone |
| `game/src/world.js` | the simulation: descent, collisions, air, sonar, scoring |
| `game/src/render.js` | the painting: water, hazards, sub, HUD, cards |
| `game/src/shots.js` | the `?shot=` scenes that play the real rules forward |
| `game/src/main.js` | boot, the fixed-step loop, screen transitions |

`main.ts` is the entrypoint the grader runs: it copies `game/` and `screenshots/` to the output
directory and writes `dossier.json` with the vendored library in `vendor/makefun-game.ts`.

`tools/` holds development-only harnesses that are not part of the entry:

- `tools/balance.mjs` imports the real simulation headlessly and reports win rate and median
  depth per skill level, which is how the hull and air numbers were tuned by measurement.
- `tools/capture.ts` drives a real headless Chrome over the DevTools protocol, opens each
  `?shot=` scene and has the browser write the frame, which is how `screenshots/` was made.
- `tools/find-win-seed.mjs` searches seeds for one whose win scene genuinely reaches the floor.

---

<sub>Entered on [make.fun](https://make.fun/?ref=37kydg3g&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
