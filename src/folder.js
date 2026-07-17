/**
 * OnlyWorlds Folder Format reader (R3).
 *
 * Input layout:
 *   <world-folder>/
 *     world.json                      { name, ... }
 *     elements/<type>/<slug>--<tail>.json   one element per file
 *
 * Each element JSON has: id (UUID), name, description, type-specific fields,
 * link fields as UUID arrays (multi) or UUID strings (single), and possible
 * extension fields (x_*, atlas_*, shadow_*).
 *
 * Forward-compatible: any directory under elements/ is read as a type, even
 * unknown ones — its files still become pages under a Journal named for the dir.
 * Unknown fields are preserved; nothing is dropped.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Read a world folder into a normalized structure:
 *   { world: {name, ...}, types: [{ type, elements: [el, ...] }, ...], byId: Map<uuid, {type, element}> }
 * Types are sorted by name; elements within a type sorted by name.
 */
export function readWorldFolder(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  const worldPath = join(dir, "world.json");
  let world = {};
  if (existsSync(worldPath)) {
    world = JSON.parse(readFileSync(worldPath, "utf8"));
  }
  if (!world.name) world.name = "Untitled World";

  const elementsDir = join(dir, "elements");
  const types = [];
  const byId = new Map();

  if (existsSync(elementsDir) && statSync(elementsDir).isDirectory()) {
    const typeDirs = readdirSync(elementsDir)
      .filter((d) => {
        const p = join(elementsDir, d);
        return existsSync(p) && statSync(p).isDirectory();
      })
      .sort();

    for (const type of typeDirs) {
      const typeDir = join(elementsDir, type);
      const elements = [];
      for (const f of readdirSync(typeDir).sort()) {
        if (!f.endsWith(".json")) continue;
        const element = JSON.parse(readFileSync(join(typeDir, f), "utf8"));
        elements.push(element);
        if (element.id) byId.set(element.id, { type, element });
      }
      if (!elements.length) continue; // empty type dir → no Journal (R5)
      elements.sort((a, b) => cmpName(a, b));
      types.push({ type, elements });
    }
    types.sort((a, b) => a.type.localeCompare(b.type));
  }

  return { world, types, byId };
}

function cmpName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""));
}

/** Title-case a type directory name for display ("character" → "Character"). */
export function typeLabel(type) {
  return String(type)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Pluralize a type label for the Journal title ("Character" → "Characters"). */
export function typePlural(label) {
  const irregular = { Species: "Species", Phenomenon: "Phenomena" };
  if (irregular[label]) return irregular[label];
  if (/[^aeiou]y$/i.test(label)) return label.replace(/y$/i, "ies");
  if (/(s|sh|ch|x|z)$/i.test(label)) return label + "es";
  return label + "s";
}
