// VOIDHARVEST — a best-game-01 entry (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), and the program
// hands it in. It copies game/ to /output, decodes the four screenshots from base64 text
// (see below) into /output/screenshots, and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// The game: a twin-stick arena shooter. Pilot a harvester drone through a dying nebula,
// blast the void-spawn, collect stardust to raise your combo, and pick 1 of 3 upgrades
// between waves. Five enemy types, escalating waves, synth sound, best score in localStorage.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The four screenshots the judge reads are stored in this repository as base64 text
// (screenshots/<name>.jpg.b64): the push route carries UTF-8 files only, so the binary JPEGs
// cannot be pushed as files. This program decodes each one into a whole JPEG in /output and
// drops the .b64 text there, so the grader's run and a local run decode the same bytes.
// The .jpg originals live beside the repo in best-game-01-jpg-originals/ for a human reader.
const shotsDir = join(here, 'screenshots');
const encoded = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => n.endsWith('.jpg.b64')) : [];
if (encoded.length !== 4) {
  process.stderr.write(`voidharvest: screenshots/ holds ${encoded.length} base64 views: hand in 4, the title, a fight, the upgrade choice and the game-over screen\n`);
  process.exit(1);
}
for (const name of encoded.sort()) {
  const outName = name.slice(0, -4);
  const bytes = Buffer.from(readFileSync(join(shotsDir, name), 'utf8').replace(/\s+/g, ''), 'base64');
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    process.stderr.write(`voidharvest: screenshots/${name} does not decode to a whole JPEG\n`);
    process.exit(1);
  }
  if (bytes.length > 262144) {
    process.stderr.write(`voidharvest: screenshots/${outName} is ${bytes.length} bytes, past the 256 KiB cap\n`);
    process.exit(1);
  }
  writeFileSync(join(out, 'screenshots', outName), bytes);
  rmSync(join(out, 'screenshots', name), { force: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
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
