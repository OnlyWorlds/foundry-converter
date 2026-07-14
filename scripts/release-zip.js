#!/usr/bin/env node
/**
 * release-zip.js — package a built + packed module directory into module.zip
 * with the internal layout Foundry expects: module.json at the ZIP ROOT,
 * alongside the compiled packs/ directory (NOT nested under a top folder).
 *
 * Usage:
 *   npm run build:zip -- --module <module-dir> [--out <zip-path>]
 *   node scripts/release-zip.js --module <module-dir>
 *
 * Preconditions (fail loud if unmet):
 *   - <module-dir>/module.json exists       (run the converter first)
 *   - <module-dir>/packs/lore exists         (run `npm run pack` first)
 *
 * The zip is DETERMINISTIC (fixed timestamps via scripts/zip.js), so re-running
 * on identical inputs yields a byte-identical module.zip. Attach the resulting
 * module.zip AND the module-dir's module.json to a GitHub Release — see
 * RELEASING.md for the full flow.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zipBuffer } from "./zip.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--module") args.module = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

/** Recursively collect files under `dir`, returning [{ name (zip path), data }]. */
function collect(dir, prefix, entries) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const zipName = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) collect(full, zipName, entries);
    else entries.push({ name: zipName, data: readFileSync(full) });
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.module) {
  console.error("Usage: npm run build:zip -- --module <module-dir> [--out <zip-path>]");
  process.exit(1);
}

const moduleDir = resolve(args.module);
const manifestPath = join(moduleDir, "module.json");
const packsDir = join(moduleDir, "packs", "lore");

if (!existsSync(manifestPath)) {
  console.error(`error: no module.json at ${manifestPath} (run the converter first)`);
  process.exit(1);
}
if (!existsSync(packsDir)) {
  console.error(
    `error: no compiled pack at ${packsDir}\n` +
      `  run: npm run pack -- --module ${args.module}`
  );
  process.exit(1);
}

// module.json at zip root, then packs/ tree — deterministic, sorted.
const entries = [{ name: "module.json", data: readFileSync(manifestPath) }];
collect(join(moduleDir, "packs"), "packs", entries);

const zip = zipBuffer(entries);
const outPath = args.out ? resolve(args.out) : join(moduleDir, "module.zip");
writeFileSync(outPath, zip);

const version = JSON.parse(readFileSync(manifestPath, "utf8")).version;
console.log(`zipped: ${entries.length} entries -> ${outPath} (${zip.length} bytes, v${version})`);
console.log(`attach to a GitHub Release: ${outPath} + ${manifestPath}`);
