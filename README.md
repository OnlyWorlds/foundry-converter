# foundry-converter

Converts an OnlyWorlds world folder into the source of a Foundry VTT module: a journal compendium with one page per element and every link as a clickable `@UUID` reference. Pack the source to install it in Foundry.

It runs one way, out of OnlyWorlds. Every element becomes a journal page; Foundry Actors and Items (character sheets, gear) are not made, since those depend on the game system.

## Install

```
git clone https://github.com/OnlyWorlds/foundry-converter
cd foundry-converter
npm install
```

Needs Node.js 18 or later. The converter itself has no dependencies; `npm install` fetches Foundry's official [foundryvtt-cli](https://github.com/foundryvtt/foundryvtt-cli), used only to pack the compendium.

The input is an OnlyWorlds world folder (`world.json` plus `elements/<type>/*.json`): an [Atlas](https://atlas.onlyworlds.com) world, the Obsidian plugin's **Export as OnlyWorlds folder**, or the output of [azgaar-converter](https://github.com/OnlyWorlds/azgaar-converter).

## Use

For a world named My World:

```
node src/cli.js ./my-world                        # writes ./ow-my-world/ (module.json + packs-source/)
npm run pack -- --module ./ow-my-world            # compiles packs-source/lore into packs/lore
```

Then, in Foundry:

1. Copy `ow-my-world/` into your Foundry user data folder, under `Data/modules/`.
2. Launch a world, open **Settings → Manage Modules**, enable **My World (OnlyWorlds)** and reload.
3. Open the **My World Lore** compendium: one journal per element type, one page per element.

The module declares Foundry 11 as its minimum and is verified on Foundry 14.

| Option | Default |
|---|---|
| `--out <dir>` | `./<module-id>/` |
| `--module-id <id>` | `ow-<world name as a slug>` |
| `--version <ver>` | this converter's version |
| `--repo-url <url>` | `https://github.com/OnlyWorlds/foundry-converter` |
| `--author <name>` | OnlyWorlds |
| `--license <spec>` | MIT |

## What it makes

| OnlyWorlds | Foundry VTT |
|---|---|
| world folder | a module (`module.json`) with one compendium pack, `lore` |
| element type (Character, Location, …) | one JournalEntry, such as "Characters" |
| element | one JournalEntryPage: the description, the text and number fields, a Connections section with its links |
| link field | `@UUID[Compendium.<module>.lore.JournalEntry.….JournalEntryPage.…]{Name}`, clickable in Foundry |
| extension field (`x_`, `atlas_`, `shadow_`) | an "Import metadata" block on the page |

A link to an element that is not in the folder shows as `(unlinked: <id tail>)`. Element types the converter doesn't know still get their own journal, and unknown fields are kept.

Foundry ids are derived from the OnlyWorlds ids, so converting the same world again gives the same ids, and links and re-imports stay stable.

## Not converted

- Maps, pins, zones and markers (the folder's `spatial/` directory).
- Images: an element's `image_url` appears as a text field, not as a picture.
- Formatting inside descriptions: Markdown and in-text links show as plain text.

## Host the module

To let others install your converted world from a manifest URL, host it as a GitHub Release. Build with `--version` and `--repo-url` pointing at your own repository, pack it, then:

```
npm run build:zip -- --module ./ow-my-world      # module.zip, with module.json at its root
```

Attach `module.json` and `module.zip` to a release tagged `v<version>`. Users install with **Setup → Add-on Modules → Install Module**, pasting `https://github.com/<you>/<repo>/releases/latest/download/module.json`. [RELEASING.md](RELEASING.md) has the steps.

## Development

```
npm run fixtures   # regenerate the synthetic test world
npm test           # run npm install first: the pack test needs foundryvtt-cli
```

## Links

- [Docs](https://onlyworlds.github.io) · [The OnlyWorlds schema](https://github.com/OnlyWorlds/OnlyWorlds)
- [Discord](https://discord.gg/twCjqvVBwb) · [Issues](https://github.com/OnlyWorlds/foundry-converter/issues)

## Licence

MIT. See [LICENSE](LICENSE). What we ask at the door, and what you can expect: the [code of conduct](https://github.com/OnlyWorlds/OnlyWorlds/blob/main/CODE_OF_CONDUCT.md).
