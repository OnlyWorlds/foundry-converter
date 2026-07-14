/**
 * Synthetic OnlyWorlds world FOLDER fixture (R8) — original SFW content, shaped
 * per the OW Folder Format: world.json + elements/<type>/<slug>--<tail>.json.
 *
 * Exercises: >=4 types (Character, Location, Object, Event, plus Institution);
 * multi-link fields, single-link fields, ONE dangling UUID (never resolved), a
 * name with diacritics, and an x_test_field extension. Run:
 *   node fixtures/make_fixture.js
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "world");

// Fixed UUIDs so tests can assert exact resolution / dangling behavior.
const ID = {
  gullwrack: "00000000-0000-7000-8000-000000000010",
  lantern: "00000000-0000-7000-8000-000000000011",
  maren: "00000000-0000-7000-8000-000000000020",
  casperan: "00000000-0000-7000-8000-000000000021",
  guild: "00000000-0000-7000-8000-000000000025",
  ledger: "00000000-0000-7000-8000-000000000050",
  fog: "00000000-0000-7000-8000-000000000060",
  // Referenced but intentionally NOT written as any element — the dangling link.
  ghostPilot: "00000000-0000-7000-8000-0000000000ff",
};

const world = { id: "00000000-0000-7000-8000-0000000000aa", name: "Gullwrack Sound" };

const elements = {
  location: [
    {
      id: ID.gullwrack,
      name: "Gullwrack",
      description:
        "A fog-prone harbor town built on pilings over its own drowned first street.\n\nThe tide decides which streets exist each morning.",
      supertype: "Settlement",
      climate: "cold maritime",
    },
    {
      id: ID.lantern,
      name: "The Ninth Lantern",
      description: "A decommissioned lighthouse at the harbor mouth, dark for thirty years.",
      supertype: "Landmark",
      parent_location: ID.gullwrack, // single link
    },
  ],
  character: [
    {
      id: ID.maren,
      name: "Maren Søback", // diacritics in a name
      description: "A weather-worn canal pilot who reads the harbor's moods.",
      supertype: "NPC",
      mentality: "Dry-humored, unhurried.",
      physicality: "Wiry; rope-scarred hands.",
      location: ID.gullwrack, // single link
      objects: [ID.ledger], // multi link (one target)
      institutions: [ID.guild, ID.ghostPilot], // multi link (one resolves, one dangles)
      x_test_field: "provenance-value",
    },
    {
      id: ID.casperan,
      name: "Old Casperan",
      description: "The late founder of the Pilots' Guild.",
      supertype: "NPC",
      physicality: "[Deceased]",
    },
  ],
  institution: [
    {
      id: ID.guild,
      name: "The Pilots' Guild",
      description: "Chartered guild holding the exclusive right to pilot ships through the shallows.",
      supertype: "Guild",
      location: ID.gullwrack,
    },
  ],
  object: [
    {
      id: ID.ledger,
      name: "The Tide Ledger",
      description: "Maren's leather-bound record of every passage & every drowned street.",
      supertype: "Document",
      location: ID.gullwrack,
    },
  ],
  event: [
    {
      id: ID.fog,
      name: "The Nine-Day Fog",
      description: "The spring fog that would not lift.",
      supertype: "Historical",
      locations: [ID.gullwrack], // multi link
    },
  ],
};

function slugTail(name, id) {
  const tail = id.replaceAll("-", "").slice(-8);
  const slug = String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "element"}--${tail}.json`;
}

if (existsSync(root)) rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "world.json"), JSON.stringify(world, null, 2) + "\n");

let count = 0;
for (const [type, rows] of Object.entries(elements)) {
  const dir = join(root, "elements", type);
  mkdirSync(dir, { recursive: true });
  for (const el of rows) {
    writeFileSync(join(dir, slugTail(el.name, el.id)), JSON.stringify(el, null, 2) + "\n");
    count++;
  }
}

console.log(`wrote fixtures/world/ — ${count} elements across ${Object.keys(elements).length} types`);
