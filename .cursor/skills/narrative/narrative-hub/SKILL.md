---
name: narrative-hub
description: >-
  Router for VibeDarkness narrative and lore. Use when writing or editing story,
  tone, enemies, ability flavor text, characters, worlds, or canon; follow
  stability tiers and open the companion docs listed below before changing
  player-facing copy.
---

# Narrative hub

## Idea stability (section header suffix)

Mark **every major section** in lore and style docs with one suffix on the heading:

| Suffix | Meaning | When editing |
|--------|---------|--------------|
| `[Canon]` | Shipped or locked; authoritative. | Minimal changes; preserve intent. If something conflicts, stop and ask—do not retcon silently. |
| `[Draft]` | Usable but may still move. | Keep text coherent; you may refine. Flag new assertions that would bind future work. |
| `[Open]` | Hook only; not explored. | Options and questions, not fixed facts. Do not deep-couple code or other Canon without promoting to Draft with the user. |

**Example:** `## The old treaty [Draft]`

Promotion is intentional: **Open → Draft** when you need to build on it; **Draft → Canon** when shipped or explicitly locked. Demoting **Canon** is rare and only with explicit user approval.

## Where to read next

Use the **Read** tool on these paths from the repo root (not optional for the task at hand):

| Task | Read first |
|------|------------|
| Any lore that could contradict setting or history | `.cursor/skills/narrative/lore-primer/LORE.md` |
| Enemy names, factions, bestiary tone | `.cursor/skills/narrative/writing-style-enemies/STYLE.md` |
| Ability names, descriptions, UI hints, battle wording | `.cursor/skills/narrative/writing-style-abilities/STYLE.md` |
| Recurring character voice and bios | `.cursor/skills/narrative/writing-style-characters/STYLE.md` |
| Places, worlds, environmental tone | `.cursor/skills/narrative/writing-style-worlds/STYLE.md` |

Each folder also has a short `SKILL.md` with a focused `description` for when that slice alone is enough.

## Skills in this group

- `lore-primer` — overarching primer (`LORE.md`)
- `writing-style-enemies`, `writing-style-abilities`, `writing-style-characters`, `writing-style-worlds` — tone and patterns (`STYLE.md` in each)

Do **not** paste long entity catalogs into these files; themes and patterns only. Game data remains the source of truth.
