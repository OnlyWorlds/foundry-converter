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

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { journalId, pageId } from "./ids.js";
import { readWorldFolder, typeLabel, typePlural } from "./folder.js";
import { buildPageHtml } from "./html.js";

/**
 * Distribution defaults for the emitted manifest (R1/R2).
 *
 * The GitHub repo has no canonical remote configured yet, so these point at the
 * placeholder org repo. Override any of them per-build via CLI options
 * (--repo-url, --author, --license, --version). The url/manifest/download fields
 * follow the GitHub-Releases manifest-URL install pattern (see RELEASING.md):
 *   - manifest → releases/latest/download/module.json  (stable "always latest",
 *     drives Foundry auto-update)
 *   - download → releases/download/v<version>/module.zip (a version-pinned asset,
 *     so old versions stay installable and updates are detected)
 */
export const DEFAULT_REPO_URL = "https://github.com/OnlyWorlds/world-to-foundry";
export const DEFAULT_AUTHOR = "OnlyWorlds";
export const DEFAULT_LICENSE = "MIT";

/** Read this converter's own package.json version as the version fallback (R2). */
export function packageVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

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
export function buildModule({ world, types, byId }, moduleId, opts = {}) {
  const worldName = world.name || "Untitled World";
  const worldId = world.id || moduleId;

  const version = opts.version || packageVersion();
  const repoUrl = (opts.repoUrl || DEFAULT_REPO_URL).replace(/\/+$/, "");
  const author = opts.author || DEFAULT_AUTHOR;
  const license = opts.license || DEFAULT_LICENSE;

  // Resolver: OW uuid → { packRef, journalId, pageId, name } for @UUID enricher refs.
  // packRef makes emitted links ABSOLUTE (Compendium.<moduleId>.lore....) — required
  // for cross-document navigation inside a compendium (bare uuids resolve against
  // the world collection and dead-end).
  const resolve = (uuid) => {
    const hit = byId.get(uuid);
    if (!hit) return null;
    return {
      packRef: `${moduleId}.lore`,
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
      // foundryvtt-cli requires an explicit _key on EVERY doc incl. embedded
      // pages; docs without one are silently skipped at compile (verified
      // against cli source: package.mjs `if (!doc._key) continue`).
      _key: `!journal.pages!${jid}.${pageId(el.id || `${type}:${el.name}:${i}`)}`,
      name: el.name || "Unnamed",
      type: "text",
      title: { show: true, level: 1 },
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
      _key: `!journal!${jid}`,
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
    version,
    authors: [{ name: author }],
    // verified: "14" is EVIDENCE, not a guess: full licensed render check on
    // Foundry v14.364 (2026-07-14) -- pack loads 18/18, pages render, absolute
    // @UUID cross-links navigate. minimum stays the v11 LevelDB design floor.
    compatibility: { minimum: "11", verified: "14" },
    // Distribution/discovery fields for the manifest-URL install path (R1).
    url: repoUrl,
    license,
    readme: `${repoUrl}/blob/main/README.md`,
    // manifest = stable "latest" pointer → Foundry auto-update (R2).
    manifest: `${repoUrl}/releases/latest/download/module.json`,
    // download = version-pinned release asset so updates are detected + old
    // versions stay installable (R2).
    download: `${repoUrl}/releases/download/v${version}/module.zip`,
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
export function convert(worldDir, outDir, moduleId, opts = {}) {
  const folder = readWorldFolder(worldDir);
  const id = moduleId || defaultModuleId(folder.world.name);
  const built = buildModule(folder, id, opts);
  const written = writeModule(outDir, built);
  return { moduleId: id, manifest: built.manifest, journals: built.journals, written };
}
