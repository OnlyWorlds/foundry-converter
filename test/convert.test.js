import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { readWorldFolder } from "../src/folder.js";
import { foundryId, journalId, pageId } from "../src/ids.js";
import { buildPageHtml, escapeHtml, isLinkValue } from "../src/html.js";
import { buildModule, defaultModuleId } from "../src/module.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const FIXTURE = join(ROOT, "fixtures", "world");

// --- fixture exists ---------------------------------------------------------

test("fixture world folder exists with world.json and elements", () => {
  assert.ok(existsSync(join(FIXTURE, "world.json")), "world.json present");
  assert.ok(existsSync(join(FIXTURE, "elements")), "elements/ present");
});

// --- folder reader ----------------------------------------------------------

test("folder reader counts elements and types", () => {
  const { world, types, byId } = readWorldFolder(FIXTURE);
  assert.equal(world.name, "Gullwrack Sound");

  const total = types.reduce((n, t) => n + t.elements.length, 0);
  assert.equal(total, 7, "7 elements read");
  assert.equal(types.length, 5, "5 types read");

  const typeNames = types.map((t) => t.type);
  for (const t of ["character", "location", "object", "event", "institution"]) {
    assert.ok(typeNames.includes(t), `type ${t} present`);
  }

  // types sorted by name; elements within a type sorted by name
  assert.deepEqual(typeNames, [...typeNames].sort());
  const chars = types.find((t) => t.type === "character").elements.map((e) => e.name);
  assert.deepEqual(chars, [...chars].sort((a, b) => a.localeCompare(b)));

  assert.equal(byId.size, 7, "byId indexes every element");
});

// --- id derivation ----------------------------------------------------------

test("foundry ids are deterministic, 16-char, alphanumeric", () => {
  const a = foundryId("some-uuid|page");
  const b = foundryId("some-uuid|page");
  assert.equal(a, b, "same input → same id");
  assert.equal(a.length, 16, "16 chars");
  assert.match(a, /^[A-Za-z0-9]{16}$/, "alphanumeric alphabet");

  assert.notEqual(foundryId("a"), foundryId("b"), "different inputs differ");
  assert.notEqual(journalId("w", "character"), journalId("w", "location"));
});

test("id derivation has no collisions across the fixture", () => {
  const { types, world } = readWorldFolder(FIXTURE);
  const worldId = world.id || "ow-gullwrack-sound";
  const ids = new Set();
  let n = 0;
  for (const { type, elements } of types) {
    ids.add(journalId(worldId, type));
    n++;
    for (const el of elements) {
      ids.add(pageId(el.id));
      n++;
    }
  }
  // journals (5) + pages (7) = 12 distinct ids, none colliding
  assert.equal(ids.size, n, "every derived id is unique on the fixture");
  assert.equal(n, 12);
});

// --- html link classification + page body -----------------------------------

test("isLinkValue detects uuids and uuid arrays only", () => {
  const uuid = "00000000-0000-7000-8000-000000000010";
  assert.equal(isLinkValue(uuid), true);
  assert.equal(isLinkValue([uuid, uuid]), true);
  assert.equal(isLinkValue("not a uuid"), false);
  assert.equal(isLinkValue(["a", "b"]), false);
  assert.equal(isLinkValue([]), false);
  assert.equal(isLinkValue(42), false);
});

test("escapeHtml escapes the dangerous five", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

test("page HTML: links resolve to @UUID, dangling renders loud, metadata + diacritics", () => {
  const { types, byId, world } = readWorldFolder(FIXTURE);
  const worldId = world.id;
  const resolve = (uuid) => {
    const hit = byId.get(uuid);
    if (!hit) return null;
    return { journalId: journalId(worldId, hit.type), pageId: pageId(uuid), name: hit.element.name };
  };

  const maren = types.find((t) => t.type === "character").elements.find((e) => e.name.startsWith("Maren"));
  const html = buildPageHtml(maren, resolve);

  // diacritics preserved in the heading
  assert.ok(html.includes("<h1>Maren Søback</h1>"));

  // single + multi links resolved to enricher refs
  const guildPid = pageId("00000000-0000-7000-8000-000000000025");
  assert.ok(html.includes(`JournalEntryPage.${guildPid}]{The Pilots&#39; Guild}`), "guild link resolved + name escaped");
  assert.ok(html.includes("{Gullwrack}"), "single location link resolved");
  assert.ok(html.includes("{The Tide Ledger}"), "multi object link resolved");

  // dangling uuid rendered LOUD, never dropped
  assert.ok(html.includes("(unlinked: 000000ff)"), "dangling link surfaced");

  // extension field under Import metadata
  assert.ok(html.includes("<summary>Import metadata</summary>"));
  assert.ok(html.includes("provenance-value"));

  // Connections section present
  assert.ok(html.includes('<section class="ow-connections">'));
});

// --- module shape -----------------------------------------------------------

test("module.json shape matches the brief", () => {
  const folder = readWorldFolder(FIXTURE);
  const { manifest, journals } = buildModule(folder, "ow-gullwrack-sound");

  assert.equal(manifest.id, "ow-gullwrack-sound");
  assert.equal(manifest.title, "Gullwrack Sound (OnlyWorlds)");
  assert.equal(manifest.version, "0.1.0");
  assert.deepEqual(manifest.authors, [{ name: "OnlyWorlds" }]);
  assert.deepEqual(manifest.compatibility, { minimum: "11", verified: "12" });
  assert.equal(manifest.packs.length, 1);
  assert.deepEqual(manifest.packs[0], {
    name: "lore",
    label: "Gullwrack Sound Lore",
    path: "packs/lore",
    type: "JournalEntry",
  });

  // one JournalEntry per type; pages sorted by name; every page has a text body
  assert.equal(journals.length, 5);
  for (const { doc } of journals) {
    assert.equal(typeof doc._id, "string");
    assert.match(doc._id, /^[A-Za-z0-9]{16}$/);
    for (const p of doc.pages) {
      assert.equal(p.type, "text");
      assert.equal(p.text.format, 1);
      assert.ok(p.text.content.startsWith("<h1>"));
    }
  }

  assert.equal(defaultModuleId("Île de Sikélia"), "ow-ile-de-sikelia");
});

test("empty type dir produces no Journal", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ow-empty-"));
  try {
    // an elements/ dir holding only an empty type dir (no json files)
    mkdirSync(join(tmp, "elements", "phantom"), { recursive: true });
    writeFileSync(join(tmp, "world.json"), JSON.stringify({ name: "Empty" }) + "\n");
    const { types } = readWorldFolder(tmp);
    assert.equal(types.length, 0, "no types when only an empty dir exists");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- CLI e2e subprocess -----------------------------------------------------

test("CLI e2e: fixture folder in → module dir out with expected tree", () => {
  const out = mkdtempSync(join(tmpdir(), "ow-cli-"));
  try {
    const stdout = execFileSync(
      process.execPath,
      [join(ROOT, "src", "cli.js"), FIXTURE, "--out", out, "--module-id", "ow-e2e"],
      { encoding: "utf8" }
    );
    assert.ok(stdout.includes("module: ow-e2e"));

    // module.json present and well-formed
    const manifest = JSON.parse(readFileSync(join(out, "module.json"), "utf8"));
    assert.equal(manifest.id, "ow-e2e");
    assert.equal(manifest.packs[0].type, "JournalEntry");

    // packs-source/lore holds one doc per type (5)
    const sourceDir = join(out, "packs-source", "lore");
    const files = readdirSync(sourceDir).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 5, "5 JournalEntry source docs");

    // page count across all docs equals element count (7)
    let pages = 0;
    for (const f of files) {
      const doc = JSON.parse(readFileSync(join(sourceDir, f), "utf8"));
      pages += doc.pages.length;
    }
    assert.equal(pages, 7, "7 pages total (one per element)");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

// --- pack compilation (only when the devDep is installed) -------------------

test("npm run pack compiles a LevelDB pack when foundryvtt-cli is present", async (t) => {
  let compilePack;
  try {
    ({ compilePack } = await import("@foundryvtt/foundryvtt-cli"));
  } catch {
    t.skip("@foundryvtt/foundryvtt-cli not installed — pack step is a manual step");
    return;
  }

  const out = mkdtempSync(join(tmpdir(), "ow-pack-"));
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "src", "cli.js"), FIXTURE, "--out", out, "--module-id", "ow-pack"],
      { encoding: "utf8" }
    );
    await compilePack(join(out, "packs-source", "lore"), join(out, "packs", "lore"));
    // LevelDB pack signature: a CURRENT file pointing at a MANIFEST
    assert.ok(existsSync(join(out, "packs", "lore", "CURRENT")), "LevelDB CURRENT written");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
