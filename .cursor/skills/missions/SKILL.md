---
name: missions
description: Create and edit campaign missions in Minion Battles. Use when adding missions, mission structure, objectives, or storyline flow.
---

# Missions

## When to use this skill

Use this skill when:
- Creating or editing campaign missions in `app/js/games/minion_battles/storylines/**/missions/*.ts`
- Configuring mission objectives, spawns, terrain, or story segments
- Adding storyline edges and mission flow

## Mission startup flow

- Mission selection happens on the campaign/lobby side before entering Minion Battles.
- In-game Minion Battles state must include `selectedMissionId`.
- Minion Battles starts at `character_select` (there is no in-game mission voting screen).

## Mission filename convention

**The first three characters of a campaign mission's filename should be the mission number** (zero-padded). Examples:

- `001_dark_awakening.ts` — Mission 1
- `002_towards_the_light.ts` — Mission 2
- `003_light_empowered.ts` — Mission 3

This convention helps order missions and identify their sequence in a campaign.

## Map segments

For reusable terrain, use **map segments** from the storylines folder. See the **map-segments** skill (in `storylines/`) for how map segments work, how to create them, and how to compose missions from segments.

## Key types and locations

- Mission base: `app/js/games/minion_battles/storylines/BaseMissionDef.ts`
- Types: `app/js/games/minion_battles/storylines/types.ts`
- Story types: `app/js/games/minion_battles/storylines/storyTypes.ts`
- Mission registration: `app/js/games/minion_battles/storylines/index.ts` (MISSION_MAP)
- Storyline flow: `app/js/games/minion_battles/storylines/WorldOfDarkness/WorldOfDarkness.ts` (edges)
