/**
 * Module builder — turn a read world folder into a Foundry VTT module tree.
 *
 * Emits (R5):
 *   <out>/module.json                        the manifest
 *   <out>/packs-source/lore/<name>.json      one file per JournalEntry document
 *   (packs/lore is produced later by `npm run pack` via foundryvtt-cli)
 *
 * One JournalEntry per OW element TYPE present; one JournalEntryPage per element,
 * pages sorted by name (folder reader already sorts). Empty types produce no
 * Journal (folder reader drops them).
 *
 * NOTE (Foundry document schema): the JournalEntry / JournalEntryPage shapes
 * below are built to Foundry v11–v12 data models as understood from public docs
 * (foundryvtt-cli source packs the JSON as-is into LevelDB). They are STRUCTURAL
 * only — not verified in a running Foundry instance. See README honest flags.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { journalId, pageId } from "./ids.js";
import { readWorldFolder, typeLabel, typePlural } from "./folder.js";
import { buildPageHtml } from "./html.js";

export function slugify(name, max = 60) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Default module id for a world name: ow-<slug>. */
export function defaultModuleId(worldName) {
  const slug = slugify(worldName) || "world";
  return `ow-${slug}`;
}

/**
 * Build the in-memory module: { manifest, journals: [{ filename, doc }] }.
 * worldId is used to seed deterministic JournalEntry ids; falls back to the
 * moduleId when the world.json carries no id.
 */
export function buildModule({ world, types, byId }, moduleId) {
  const worldName = world.name || "Untitled World";
  const worldId = world.id || moduleId;

  // Resolver: OW uuid → { journalId, pageId, name } for @UUID enricher refs.
  const resolve = (uuid) => {
    const hit = byId.get(uuid);
    if (!hit) return null;
    return {
      journalId: journalId(worldId, hit.type),
      pageId: pageId(uuid),
      name: hit.element.name || "Unnamed",
    };
  };

  const journals = [];
  for (const { type, elements } of types) {
    const jid = journalId(worldId, type);
    const label = typeLabel(type);
    const title = typePlural(label);

    const pages = elements.map((el, i) => ({
      _id: pageId(el.id || `${type}:${el.name}:${i}`),
      name: el.name || "Unnamed",
      type: "text",
      title: { show: false, level: 1 },
      text: {
        format: 1, // CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML
        content: buildPageHtml(el, resolve),
      },
      sort: (i + 1) * 100000,
      ownership: { default: -1 },
      flags: { "ow-foundry": { uuid: el.id || null, type } },
    }));

    const doc = {
      _id: jid,
      name: title,
      pages,
      sort: 0,
      ownership: { default: 0 },
      flags: { "ow-foundry": { type, world: worldName } },
    };
    journals.push({ filename: `${slugify(title) || type}.json`, doc });
  }

  const manifest = {
    id: moduleId,
    title: `${worldName} (OnlyWorlds)`,
    description: `OnlyWorlds world "${worldName}" imported as a Foundry VTT journal compendium. One journal per element type; every cross-link preserved as an @UUID reference.`,
    version: "0.1.0",
    authors: [{ name: "OnlyWorlds" }],
    compatibility: { minimum: "11", verified: "12" },
    packs: [
      {
        name: "lore",
        label: `${worldName} Lore`,
        path: "packs/lore",
        type: "JournalEntry",
      },
    ],
  };

  return { manifest, journals };
}

/** Write the module tree to disk. Returns list of written file paths. */
export function writeModule(outDir, { manifest, journals }) {
  const written = [];
  mkdirSync(outDir, { recursive: true });

  const manifestPath = join(outDir, "module.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  written.push(manifestPath);

  const sourceDir = join(outDir, "packs-source", "lore");
  // Clean stale source docs so re-runs don't leave orphans behind.
  if (existsSync(sourceDir)) rmSync(sourceDir, { recursive: true, force: true });
  mkdirSync(sourceDir, { recursive: true });

  for (const { filename, doc } of journals) {
    const p = join(sourceDir, filename);
    writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
    written.push(p);
  }

  return written;
}

/** Full pipeline: read folder, build module, write it. */
export function convert(worldDir, outDir, moduleId) {
  const folder = readWorldFolder(worldDir);
  const id = moduleId || defaultModuleId(folder.world.name);
  const built = buildModule(folder, id);
  const written = writeModule(outDir, built);
  return { moduleId: id, manifest: built.manifest, journals: built.journals, written };
}
