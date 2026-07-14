# world-to-foundry

Convert an **OnlyWorlds** world FOLDER into an installable **Foundry VTT** module — a JournalEntry compendium where every element becomes a journal page and every cross-link becomes a clickable `@UUID` reference.

| OnlyWorlds | Foundry VTT |
|---|---|
| world folder | a module (`module.json` + one compendium pack `lore`) |
| element TYPE (Character, Location, …) | one `JournalEntry` (e.g. "Characters") |
| element | one `JournalEntryPage` (name, description, typed fields, connections) |
| link field (UUID / UUID array) | `@UUID[JournalEntry.…JournalEntryPage.…]{name}` enricher — resolves in-app |
| extension field (`x_`, `atlas_`, `shadow_`) | preserved in an "Import metadata" details block |

Unresolvable links are rendered **loudly** as `(unlinked: <uuid-tail>)` — never dropped silently. The converter is zero-runtime-dependency and forward-compatible: unknown element types still become their own Journal, unknown fields are kept.

## Use

```
node src/cli.js <world-folder> [--out <module-dir>] [--module-id <id>]
```

- Default module id = `ow-<slugified world name>` (e.g. `ow-sikelia`).
- Default out dir = `./<module-id>/`.

This emits the module **source**: `module.json` + `packs-source/lore/*.json` (one file per JournalEntry). Then compile the source into the distributable LevelDB compendium pack:

```
npm install --save-dev @foundryvtt/foundryvtt-cli   # one time
npm run pack -- --module ./ow-sikelia               # packs-source/lore → packs/lore
```

`npm run pack` uses the official [foundryvtt-cli](https://github.com/foundryvtt/foundryvtt-cli) (a **devDependency only** — the converter itself needs nothing). Without it you still have the full module source; you just can't compile the LevelDB pack.

## Determinism

Foundry document ids are 16-char alphanumeric strings **derived from the OnlyWorlds UUIDs** (`sha256(uuid + salt)` mapped into Foundry's id alphabet, truncated to 16). Re-running on the same world yields byte-identical ids, so cross-page links stay valid and re-imports are diff-friendly rather than duplicating.

## Install in Foundry

1. Build and pack the module (above) — you get a directory like `ow-sikelia/` containing `module.json` and `packs/lore/`.
2. Copy that directory into your Foundry **`Data/modules/`** folder (User Data path → `Data/modules/ow-sikelia/`). Alternatively, zip the directory and install it via **Setup → Add-on Modules → Install Module → Manifest URL** if you host `module.json`.
3. Launch a world, open **Settings → Manage Modules**, enable **"<World> (OnlyWorlds)"**, and reload.
4. The compendium **"<World> Lore"** appears under **Compendium Packs**. Open it to browse one journal per element type; click `@UUID` links to jump between connected elements.

## Status — honest flags

- **Prototype (v0.1.0).** Structurally verified only.
- **JournalEntry-only by design.** OnlyWorlds elements map to journal pages, which are game-system-agnostic. Foundry `Actor` / `Item` documents are per-game-system (dnd5e, pf2e, …) and out of scope — mapping a Character to a dnd5e Actor sheet is a separate, system-specific effort.
- **Never loaded in a live Foundry instance** (no Foundry license held here). The module tree, `module.json`, and LevelDB pack are built to the public Foundry v11–v12 document schemas and compiled with the official `foundryvtt-cli`, but the in-app render (page HTML, `@UUID` link resolution, compendium listing) **needs a licensed tester to confirm**. Treat the first real load as a test.
- **Pack compilation is real**: `@foundryvtt/foundryvtt-cli`'s `compilePack` produced a LevelDB `packs/lore` from the fixture module during development (2026-07-14). The tests exercise it when the devDep is installed and skip it otherwise.
- **Foundry document schema assumptions** (flag for the licensed tester): pages use `type: "text"`, `text.format: 1` (HTML), `title.show: false`; JournalEntry/page `ownership.default` and `sort` set to conservative defaults; a `flags["ow-foundry"]` namespace carries the source UUID + type. These are the fields most likely to need adjustment if a Foundry version rejects the document.

## Dev

```
npm run fixtures   # synthetic OW world folder (original SFW content)
npm test           # node --test — reader, id stability, page HTML, module shape, CLI e2e, pack
```
