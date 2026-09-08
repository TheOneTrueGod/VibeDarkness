---
name: minion-battles-assets
description: Where Minion Battles stores images, music, and other media, and how to import them. Use when adding or moving art, portraits, story backgrounds, music, audio, sound effects, SVGs, or asking where assets live.
---

# Minion Battles Assets

There is no Vite `public/` folder. Media is imported so the bundler hashes URLs.

## Shared vs owned

- **Shared / reused** — files under `app/js/games/minion_battles/assets/`, split by kind (`characters/`, `projectiles/`, `effects/`, `story/`). Put looping music in `music/` and short sound effects in `sfx/` (create the folder when the first file lands).
- **Owned by one definition** — keep the file next to that def: portraits under `character_defs/portraits/`, item icons under `character_defs/items/assets/`, card art in the card's `card_defs/` folder.

Do not dump new files at the `assets/` root; add or reuse a kind folder.

## How to import

Use a static `import` or `new URL(..., import.meta.url)`. For a named catalog of URLs, follow `assets/story/index.ts`. Battle sprites are registered in `game/GameRenderer/AssetRegistry.ts`.

Prefer compressed audio (`.ogg` or `.mp3`) over uncompressed `.wav`.
