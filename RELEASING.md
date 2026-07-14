# Releasing a converted module (GitHub Releases flow)

Foundry never hosts your files — it only follows a pointer (`module.json`) to
wherever you host the ZIP. The idiomatic, approval-free distribution path is a
**GitHub Release** whose assets are the manifest + a packaged `module.zip`, with
the manifest advertised via the `releases/latest/download/module.json` URL so
Foundry can auto-update. This doc is the exact flow for a single converted world.

## 0. Prerequisites

- The GitHub repo that will host the release. By default the emitted manifest
  points at `https://github.com/OnlyWorlds/world-to-foundry` (placeholder).
  Point it at the real repo with `--repo-url` at build time (see below).
- `@foundryvtt/foundryvtt-cli` installed (`npm install` pulls it as a devDep) —
  needed to compile the LevelDB pack.

## 1. Build the module source

Pick the version for this release (it templates the `download` URL). If omitted,
it falls back to this converter's own `package.json` version.

```
node src/cli.js <world-folder> \
  --out ./ow-<slug> \
  --version 1.0.0 \
  --repo-url https://github.com/<you>/<repo>
```

This writes `ow-<slug>/module.json` + `ow-<slug>/packs-source/lore/*.json`.

The emitted `module.json` already contains, for this version:

- `version: "1.0.0"`
- `manifest: ".../releases/latest/download/module.json"` — stable, always-latest;
  this is the URL users paste and the one the package registry follows for updates.
- `download: ".../releases/download/v1.0.0/module.zip"` — **version-pinned**, so a
  version bump is detectable and old versions stay installable.
- `url`, `readme`, `license`, `authors` — discovery/listing fields.

> **compatibility is deliberately left as `{minimum: "11", verified: "12"}`.**
> That floor is an unverified guess. Do NOT bump it here — set the real value
> only after a licensed Foundry load confirms it, then edit `module.json` (and
> `src/module.js`) once.

## 2. Compile the LevelDB pack

```
npm run pack -- --module ./ow-<slug>
```

Produces `ow-<slug>/packs/lore/` (LevelDB), the distributable pack form.

## 3. Build the release ZIP

```
npm run build:zip -- --module ./ow-<slug>
```

Produces `ow-<slug>/module.zip` with the **internal layout Foundry expects**:
`module.json` at the ZIP **root**, alongside the `packs/` directory — NOT nested
under a top-level folder. The zip is deterministic (fixed timestamps), so
re-running on identical inputs yields a byte-identical archive.

```
module.zip
├── module.json
└── packs/
    └── lore/        (compiled LevelDB)
```

## 4. Create the GitHub Release

1. Tag the release `v1.0.0` (tag must match the `version` in `module.json`).
2. Attach **two** assets to the release:
   - `module.json`   (the bare manifest — this is what the manifest URL serves)
   - `module.zip`    (the packaged module from step 3)
3. Publish.

Because the manifest's `manifest` field points at
`.../releases/latest/download/module.json`, GitHub resolves that to the newest
release automatically. The manifest's `download` field points at
`.../releases/download/v1.0.0/module.zip` — the pinned asset for this version.

## 5. Install / distribute

Users install with **Setup → Add-on Modules → Install Module → Manifest URL**,
pasting:

```
https://github.com/<you>/<repo>/releases/latest/download/module.json
```

No registry submission or Foundry-license approval is needed for this path —
listing on `foundryvtt.com/packages` is a separate, discoverability-only step
(requires a Foundry license to submit). See
`weave/foundry/intel/ecosystem-distribution.md` for the registry route.

## Cutting a new version

Bump `--version` (e.g. `1.1.0`), repeat steps 1–4 with the new tag. Foundry
detects the newer `version` in the always-latest manifest and offers the update;
the pinned `download` URL for the new tag serves the new ZIP.
