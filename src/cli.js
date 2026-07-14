#!/usr/bin/env node
/**
 * world-to-foundry — convert an OnlyWorlds world FOLDER into an installable
 * Foundry VTT module (a JournalEntry compendium).
 *
 * Usage:
 *   node src/cli.js <world-folder> [--out <module-dir>] [--module-id <id>] [--help]
 *
 * Default module id  = ow-<slugified world name>   (e.g. ow-sikelia)
 * Default out dir     = ./<module-id>/
 *
 * Emits plain-JSON module SOURCE (module.json + packs-source/lore/*.json).
 * Run `npm run pack` afterward to compile packs-source/lore → packs/lore
 * (LevelDB) via the official foundryvtt-cli. Zero runtime dependencies here.
 */

import { readWorldFolder } from "./folder.js";
import { defaultModuleId, buildModule, writeModule } from "./module.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--module-id") args.moduleId = argv[++i];
    else if (a === "--version") args.version = argv[++i];
    else if (a === "--repo-url") args.repoUrl = argv[++i];
    else if (a === "--author") args.author = argv[++i];
    else if (a === "--license") args.license = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else args._.push(a);
  }
  return args;
}

const HELP = `world-to-foundry — OnlyWorlds world folder → Foundry VTT module

Usage:
  node src/cli.js <world-folder> [--out <module-dir>] [--module-id <id>]

Options:
  --out <dir>        output module directory (default: ./<module-id>/)
  --module-id <id>   module id (default: ow-<slugified world name>)
  --version <ver>    module version (default: this converter's package.json version)
  --repo-url <url>   GitHub repo URL for manifest/download/url/readme fields
  --author <name>    module author name (default: OnlyWorlds)
  --license <spec>   module license (default: MIT)
  --help, -h         show this help

Then compile the LevelDB pack:
  npm run pack -- --module <module-dir>
`;

const args = parseArgs(process.argv.slice(2));

if (args.help || args._.length !== 1) {
  console.log(HELP);
  process.exit(args.help ? 0 : 1);
}

try {
  const folder = readWorldFolder(args._[0]);
  const moduleId = args.moduleId || defaultModuleId(folder.world.name);
  const outDir = args.out || `./${moduleId}`;

  const built = buildModule(folder, moduleId, {
    version: args.version,
    repoUrl: args.repoUrl,
    author: args.author,
    license: args.license,
  });
  const written = writeModule(outDir, built);

  const byType = built.journals.map((j) => `${j.doc.name} (${j.doc.pages.length})`);
  console.log(`world: ${folder.world.name}`);
  console.log(`module: ${moduleId} v${built.manifest.version}`);
  console.log(`out: ${outDir}`);
  console.log(`journals: ${built.journals.length} — ${byType.join(", ") || "none"}`);
  console.log(`files: ${written.length}`);
  console.log(`next: npm run pack -- --module ${outDir}`);
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
