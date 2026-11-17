// main.ts — HALOCLINE's entrypoint (Node 22, standard library only).
//
// The game is the static folder game/: index.html and its ES modules, opened by any
// static file server, played in a desktop browser with no network request. This
// program hands the entry in: it copies game/ and screenshots/ beside it into the
// output directory and writes dossier.json there with the vendored make.fun library,
// which is the summary the judge reads.
//
// Run it locally (MAKEFUN_OUTPUT_DIR stands in for /output outside the grader):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps. Only text_max_bytes shapes the bytes; the rest mirror the
// limits the gate refuses an entry for, so a local run fails the same way it would.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`halocline: wrote ${out}`);
