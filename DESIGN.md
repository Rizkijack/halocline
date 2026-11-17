# HALOCLINE — design decision

**Bounty:** make.fun `best-game-01` ("Make the best game"), $1,000 pool, deadline 2026-11-18T18:00Z.
**Entrant:** @rizkijack, signing wallet `E7Q9z5auTwHFQ4CwDLN7fnubdJ42yL7stHsZ5FmP2y1w`.

## What decides the place (read from the brief, not assumed)

The judge sees each entry as **one contact sheet of screenshots (≈768×480) plus a short
source outline** — a few dozen declaration lines, ~1,536 input tokens total. So:

1. Screenshots are ~80% of the verdict. The house's own calibration says more than four in
   five of the judge's reasons named a **start, title, end or restart** screen. The judge must
   see, in the pictures: title → play with HUD → win/lose with restart.
2. The outline only shows **file paths and declaration names**. File names and function names
   must read as English descriptions of what the code does.
3. Originality is a hard tiebreaker against copies. The game must not resemble a commercial
   title by name, art, character or level design.

## Decision: don't enter the genre everyone else enters

Most entries in a "best game" bounty are pixel-art platformers, top-down shooters and
neon-on-black dodgers. A polished entry in a crowded genre wins on feel alone and loses on
"look and originality". So: pick a **mechanic with a built-in tension nobody else will build**,
and an art direction that reads at thumbnail size.

**HALOCLINE** — a sonar-lit descent down an ocean trench.

- A *halocline* is a real boundary layer where salinity changes sharply; it scatters sonar and
  hides everything below it. The title is the mechanic.
- The screen is genuinely dark. Rock, mines and vent plumes are drawn as faint ghosts. A **sonar
  ping** is the only way to see them clearly — and the ping costs charge that regenerates
  slowly. So the core choice is *when to spend your one reveal*, every few seconds, for two
  minutes. That is a choice that matters and a loop worth repeating, not a dodge reflex.
- Screenshots come out **high contrast and legible shrunk**: near-black field, one cyan ring,
  amber sub, red hazards, a hard HUD strip. Distinct from the neon-grid and pastel-platformer
  mass without needing custom art assets.

## Completeness (judge criterion 1, the one that decides ties)

Every one of these is visible in the four screenshots:

| Element | Where it shows |
|---|---|
| Goal | Title screen states "reach the trench floor at 2,000 m" |
| Rules + controls | Title screen control block, always on screen at start |
| Win state | Results screen `TRENCH FLOOR REACHED` with depth and score |
| Lose state | Results screen `HULL BREACH` / `OUT OF AIR` |
| Restart | Results screen prints `PRESS R TO DIVE AGAIN`, and R works |
| HUD | Depth, oxygen, hull pips, sonar charge, score — live during play |

Two distinct end states, both with restart, means the loop is provably closed in the pictures.

## Five depth zones, four hues

Depth drives both difficulty and palette, so four screenshots from different zones never look
like the same frame twice: Sunlit Shelf (teal) → Twilight Drift (indigo) → Midnight Vein
(violet) → Hadal Rift (near-black crimson). Win at 2,000 m.

## Architecture (judge criterion 5 — names are most of the outline)

One file, one job, named for the job:

```
game/index.html          canvas host, no inline logic
game/src/config.js       every tuning number and colour
game/src/random.js       seeded RNG so a seed always replays the same trench
game/src/audio.js        WebAudio cues synthesised at runtime, no asset files
game/src/input.js        keyboard + mouse, edge-detected actions
game/src/trench.js       procedural gate/hazard/sample placement by depth
game/src/world.js        the simulation: descent, collisions, resources, scoring
game/src/render.js       canvas painting, zones, HUD
game/src/shots.js        ?shot= staging that plays the real rules forward
game/src/main.js         boot, fixed-step loop, screen transitions
```

No vendored engine. Everything is plain ES modules, so `game/` is static files served by any
static server and the references gate passes with relative paths only.

## Constraints honoured

- Node 22 `main.ts` at repo root, standard library only, copies `game/` + `screenshots/` and
  writes `dossier.json` via the kit's `buildDossier`. Runs twice byte-identical (pure copy).
- `vendor/makefun-game.ts` copied from the kit unchanged.
- No network request at runtime: no fonts, no images, no audio files — sound is synthesised,
  art is drawn.
- 3–4 screenshots, 1280×720, real renders of this code.
