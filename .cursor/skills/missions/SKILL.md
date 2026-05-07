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

## Post-mission choice options (dynamic rewards)

- **Ownership:** The **mission definition** (`MissionBattleConfig` / class extending `BaseMissionDef`) owns runtime post-mission choice rows when rewards depend on loadout or research.
- **Mechanics:** Implement optional `getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams)` on that mission class (see `types.ts`). The post-mission story phrase can use an **empty `options` array** as a placeholder; the client merges in the computed rows from the mission def (see `PostMissionStoryPhase.tsx`).
- **Colocation:** Keep the helper logic in the **same mission file** unless it becomes large enough to split—then add a helper module under that campaign’s `missions/` folder (e.g. `WorldOfDarkness/missions/`) rather than a shared “choices hub” file.

## Main weapon (narrative / meta)

Missions and quest copy can reference a character’s **main weapon** (rock / stick / shield lineage, with future transforms) for flavor and gated choices. That concept is defined in the **campaign-characters** skill. Do not assume the main weapon maps 1:1 to battle loadout unless a mission explicitly implements that.

## Campaign resources and research costs

- Mission rewards and story choices should treat campaign `resources` as the base earned pool.
- When a mission/story grants research directly, do not mutate base campaign resources just for that grant.
- Effective resources used by research UI/checks are computed from:
  - `effective = base campaign resources - researched node costs`.
- Effective values can be negative; UI should render negative resource counts clearly (red styling).
- In mission result UIs, display research gained separately from raw resource deltas.
