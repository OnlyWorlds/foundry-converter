#!/usr/bin/env node
/**
 * pack.js — compile a module's packs-source/lore/*.json into a LevelDB pack at
 * packs/lore, using the official @foundryvtt/foundryvtt-cli (devDependency only).
 *
 * The converter itself (src/) is zero-runtime-dep and emits plain JSON. This
 * step is optional: a user without the devDep still has the full module SOURCE
 * and Foundry can also be pointed at a JSON pack directory in dev, but the
 * shipped, distributable form is the compiled LevelDB pack.
 *
 * Usage:
 *   npm run pack -- --module <module-dir>
 *   node scripts/pack.js --module <module-dir>
 *
 * If @foundryvtt/foundryvtt-cli is not installed, this prints install guidance
 * and exits non-zero rather than pretending to have packed anything.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--module") args.module = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.module) {
  console.error("Usage: npm run pack -- --module <module-dir>");
  process.exit(1);
}

const moduleDir = resolve(args.module);
const src = join(moduleDir, "packs-source", "lore");
const dest = join(moduleDir, "packs", "lore");

if (!existsSync(src)) {
  console.error(`error: no source pack at ${src} (run the converter first)`);
  process.exit(1);
}

let compilePack;
try {
  ({ compilePack } = await import("@foundryvtt/foundryvtt-cli"));
} catch {
  console.error(
    "@foundryvtt/foundryvtt-cli is not installed.\n" +
      "Install it as a dev dependency, then re-run:\n" +
      "  npm install --save-dev @foundryvtt/foundryvtt-cli\n" +
      "  npm run pack -- --module " +
      args.module
  );
  process.exit(2);
}

try {
  // foundryvtt-cli compilePack(src, dest, options): reads JSON docs from src,
  // writes a classic-level (LevelDB) pack to dest.
  await compilePack(src, dest, { log: true });

  // Verify the compile actually packed entries. The cli SILENTLY SKIPS any
  // source doc without a _key, so a green compile can still be an empty pack
  // (learned live: Foundry indexed 0 of 18 journals). Round-trip and count.
  const { extractPack } = await import("@foundryvtt/foundryvtt-cli");
  const { mkdtempSync, readdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const probe = mkdtempSync(join(tmpdir(), "w2f-verify-"));
  try {
    await extractPack(dest, probe, { log: false });
    const extracted = readdirSync(probe).filter((f) => f.endsWith(".json")).length;
    const { readdirSync: rd } = await import("node:fs");
    const sources = rd(src).filter((f) => f.endsWith(".json")).length;
    if (extracted === 0 || extracted < sources) {
      console.error(
        `pack verification FAILED: ${sources} source docs but ${extracted} extracted from the compiled pack.` +
          ` Likely missing _key fields in source docs.`
      );
      process.exit(1);
    }
    console.log(`verified: ${extracted}/${sources} documents round-trip from the compiled pack`);
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
  console.log(`packed: ${src} -> ${dest}`);
} catch (err) {
  console.error(`pack failed: ${err.message}`);
  process.exit(1);
}
