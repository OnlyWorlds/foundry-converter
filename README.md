# foundry-converter

Convert an **OnlyWorlds** world into an installable **Foundry VTT** module: a JournalEntry compendium where every element becomes a journal page and every cross-link becomes a clickable `@UUID` reference.

> **New to OnlyWorlds?** It is an open standard for worldbuilding data: 22 typed element categories (Character, Location, Institution, Event, …) with defined fields and relationships, stored as plain files you own. One structure, readable by any tool. See [onlyworlds.com](https://www.onlyworlds.com), the [docs](https://onlyworlds.github.io), and the [schema](https://github.com/OnlyWorlds/OnlyWorlds). This tool is a one-way bridge OUT of OnlyWorlds and into Foundry.
>
> **For AI assistants**: the input is an OnlyWorlds world folder (one JSON file per element, `id` = identity). Types and fields are defined in the [schema repo](https://github.com/OnlyWorlds/OnlyWorlds) and the [LLM guide](https://onlyworlds.github.io/assets/ow_llm_guide.txt). This converter is read-only over that folder and emits a Foundry module tree; it contains no network code.

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
node src/cli.js <world-folder> [--out <module-dir>] [--module-id <id>] \
                               [--version <ver>] [--repo-url <url>] \
                               [--author <name>] [--license <spec>]
```

- Default module id = `ow-<slugified world name>` (e.g. `ow-sikelia`).
- Default out dir = `./<module-id>/`.
- Default version = this converter's own `package.json` version (never hard-coded).
- Default repo URL = `https://github.com/OnlyWorlds/foundry-converter` (placeholder);
  it templates the manifest's `url`, `manifest`, `download`, and `readme` fields
  for the GitHub-Releases install path. Pass `--repo-url` to point at your repo.

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
2. Copy that directory into your Foundry **`Data/modules/`** folder (User Data path → `Data/modules/ow-sikelia/`). Alternatively, install it via **Setup → Add-on Modules → Install Module → Manifest URL** if you host `module.json` (see below).
3. Launch a world, open **Settings → Manage Modules**, enable **"<World> (OnlyWorlds)"**, and reload.
4. The compendium **"<World> Lore"** appears under **Compendium Packs**. Open it to browse one journal per element type; click `@UUID` links to jump between connected elements.

## Distribute (GitHub Releases)

The emitted `module.json` carries the distribution/discovery fields Foundry's
manifest-URL install path needs — `url`, `manifest`, `download`, `authors`,
`license`, `readme` — with URLs following the GitHub-Releases pattern
(`manifest` = always-latest pointer for auto-update; `download` = version-pinned
release asset). Build the release ZIP with:

```
npm run build:zip -- --module ./ow-sikelia   # module.json at zip root + packs/
```

Then attach `module.json` + `module.zip` to a GitHub Release and let users
install via `.../releases/latest/download/module.json`. **See [RELEASING.md](RELEASING.md)
for the exact, step-by-step flow.** No Foundry-registry submission is required
for this path.

## Status

- **Render-proven.** A full licensed end-to-end run on Foundry **v14.364** (2026-07-14): the converted module installed, all journal pages rendered, and `@UUID` cross-links resolved and navigated in-app. Three format fixes found during that run are folded in.
- **JournalEntry-only by design.** OnlyWorlds elements map to journal pages, which are game-system-agnostic. Foundry `Actor` / `Item` documents are per-game-system (dnd5e, pf2e, …) and out of scope: mapping a Character to a dnd5e Actor sheet is a separate, system-specific effort.
- **Pack compilation is real**: `@foundryvtt/foundryvtt-cli`'s `compilePack` produces a LevelDB pack from the module tree. The tests exercise it when the devDep is installed and skip it otherwise.
- **Foundry document schema**: pages use `type: "text"`, `text.format: 1` (HTML), `title.show: false`; JournalEntry/page `ownership.default` and `sort` set to conservative defaults; a `flags["ow-foundry"]` namespace carries the source UUID + type.

## Dev

```
npm run fixtures   # synthetic OW world folder (original SFW content)
npm test           # node --test — reader, id stability, page HTML, module shape, CLI e2e, pack
```
