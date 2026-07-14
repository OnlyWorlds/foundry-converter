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
import { buildModule, defaultModuleId, packageVersion, DEFAULT_REPO_URL } from "../src/module.js";

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
  // version defaults to the converter's own package.json version (R2)
  assert.equal(manifest.version, packageVersion());
  assert.deepEqual(manifest.authors, [{ name: "OnlyWorlds" }]);
  // R4: compatibility left untouched until a licensed tester confirms the floor
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

// --- distribution/discovery manifest fields (R1) ----------------------------

test("manifest carries distribution fields with GitHub-Releases URL pattern (R1)", () => {
  const folder = readWorldFolder(FIXTURE);
  const { manifest } = buildModule(folder, "ow-gullwrack-sound");

  // every distribution/discovery field is present
  for (const key of ["url", "manifest", "download", "authors", "license", "readme"]) {
    assert.ok(key in manifest, `manifest has ${key}`);
  }

  // defaults derive from the placeholder repo URL
  assert.equal(manifest.url, DEFAULT_REPO_URL);
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.readme, `${DEFAULT_REPO_URL}/blob/main/README.md`);

  // manifest = "latest" pointer (auto-update); download = version-pinned asset
  assert.equal(manifest.manifest, `${DEFAULT_REPO_URL}/releases/latest/download/module.json`);
  assert.equal(
    manifest.download,
    `${DEFAULT_REPO_URL}/releases/download/v${packageVersion()}/module.zip`
  );

  // media is optional and must NOT be invented (no fake screenshot URLs)
  assert.ok(!("media" in manifest), "no invented media/screenshot URLs");
});

test("manifest distribution fields honor CLI/opts overrides (R1)", () => {
  const folder = readWorldFolder(FIXTURE);
  const { manifest } = buildModule(folder, "ow-x", {
    repoUrl: "https://github.com/acme/my-world/", // trailing slash normalized
    author: "Acme",
    license: "CC-BY-4.0",
    version: "2.3.4",
  });

  assert.deepEqual(manifest.authors, [{ name: "Acme" }]);
  assert.equal(manifest.license, "CC-BY-4.0");
  assert.equal(manifest.url, "https://github.com/acme/my-world");
  assert.equal(manifest.readme, "https://github.com/acme/my-world/blob/main/README.md");
  assert.equal(manifest.manifest, "https://github.com/acme/my-world/releases/latest/download/module.json");
});

// --- version templating (R2) ------------------------------------------------

test("version comes from --version opt and templates the download URL (R2)", () => {
  const folder = readWorldFolder(FIXTURE);
  const { manifest } = buildModule(folder, "ow-ver", { version: "1.5.0" });

  assert.equal(manifest.version, "1.5.0", "explicit version wins");
  // download URL pins the SAME version so auto-update detects the bump
  assert.equal(
    manifest.download,
    `${DEFAULT_REPO_URL}/releases/download/v1.5.0/module.zip`
  );
  // manifest URL stays version-independent (always-latest)
  assert.equal(manifest.manifest, `${DEFAULT_REPO_URL}/releases/latest/download/module.json`);
});

test("version falls back to the converter's package.json, never hard-coded 0.1.0 by string (R2)", () => {
  const folder = readWorldFolder(FIXTURE);
  const { manifest } = buildModule(folder, "ow-fallback");
  assert.equal(manifest.version, packageVersion());
  // packageVersion reads the real file — assert it's a semver-shaped string
  assert.match(manifest.version, /^\d+\.\d+\.\d+/);
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

test("npm run pack compiles a LevelDB pack (foundryvtt-cli devDep is load-bearing)", async () => {
  // R5: foundryvtt-cli is a declared devDependency, so a proper `npm install`
  // MUST provide it. Do NOT skip when it's absent — a silent skip lets CI pass
  // green while never proving the LevelDB pack actually compiles. Fail LOUD
  // instead, so a missing/uninstalled devDep is a hard, visible failure.
  let compilePack;
  try {
    ({ compilePack } = await import("@foundryvtt/foundryvtt-cli"));
  } catch (err) {
    assert.fail(
      "@foundryvtt/foundryvtt-cli is not importable — the pack-compile test cannot " +
        "verify LevelDB output. It is a declared devDependency; run `npm install` " +
        "(with dev deps) before `npm test`. Original error: " + err.message
    );
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

// --- release zip layout + determinism (R3) ----------------------------------

test("build:zip produces module.json at zip root + packs/, deterministically (R3)", async () => {
  const { zipBuffer } = await import("../scripts/zip.js");

  const entries = [
    { name: "module.json", data: Buffer.from('{"id":"ow-x"}') },
    { name: "packs/lore/CURRENT", data: Buffer.from("MANIFEST-000001\n") },
  ];
  const a = zipBuffer(entries);
  const b = zipBuffer(entries);

  // deterministic: identical inputs → byte-identical archive
  assert.ok(a.equals(b), "same inputs yield byte-identical zip");

  // valid ZIP signatures: local file header + end-of-central-directory
  assert.equal(a.readUInt32LE(0), 0x04034b50, "local file header magic");
  assert.equal(a.readUInt32LE(a.length - 22), 0x06054b50, "EOCD magic");

  // module.json is the FIRST entry (zip root), packs/ nested — layout Foundry wants
  const nameLen = a.readUInt16LE(26);
  const firstName = a.slice(30, 30 + nameLen).toString("utf8");
  assert.equal(firstName, "module.json", "module.json at zip root, first entry");
});
