# Equipment upgrade rewards (replace card-swap research with equipment)

> **Status 2026-10-22:** Plan agreed with user; not started.

The early World of Darkness quest rewards currently grant **research that swaps one card for another**
(e.g. `charged_rocks` swaps Throw Rock for Throw Charged Rock). Replace those swaps with **equipment**:
the chosen upgrade is a new item that is equipped automatically, the other options at that step are unlocked
so the player can swap later, and each item has its own research tree for its follow-up upgrades.

## Design (agreed with user, 2026-10-22)

### Equipment (World of Darkness weapons)

| Tier | Item (id) | `upgradesFrom` | Cards (`cardsToAdd`) |
|---|---|---|---|
| 1 | Rocks (`001`) | — | `throw_rock` |
| 1 | Stick (`002`, rename from "Stick (Big)") | — | `0103` Swing Stick |
| 1 | Shield (`003`, rename from "Pot lid") | — | `0104` Raise Shield |
| 2 | Charged Rocks (`011`) | `001` | `throw_charged_rock` |
| 2 | Knives (`012`) | `001` | `throw_knife` |
| 2 | Sword (`013`) | `002` | `0112` Swing Sword |
| 2 | Mace (`014`) | `002` | `0115` Swing Mace |
| 2 | Crystal Shield (`015`) | `003` | `0110` Crystal Embedded Shield |
| 3 | Charged Shield (`016`) | `015` | `0113` Charged Shield + `0121` |

- New `ItemDef` fields: `tier?: number`, `upgradesFrom?: string`, `campaignIds?: string[]` (tier unlocks only
  pick items for the mission's campaign, so Bunker weapons are never swept in), and an item passive for
  Charged Rocks' round-start Light Charge (see "Engine work").
- Item ids `011`–`016` are free today (verify before adding).

### Rewards

- **Tier unlock reward (mission definition):** `completionRewards.unlockItemTiers?: { slot: EquipmentSlotType; tier: number }[]`.
  Resolves to every item with that slot + tier + the mission's `campaignId`, appended to the mission result
  `itemIds` (which already unlock on the campaign via `Campaign::addMissionResult`). Configured per mission:
  - `001` Dark Awakening → weapon tier 1 (Rocks, Stick, Shield)
  - `002` Towards the Light → weapon tier 2 (Charged Rocks, Knives, Sword, Mace, Crystal Shield)
  - `004` Cave Respite → weapon tier 3 (Charged Shield)
  - `003`, `005`, `006` have no equipment choice; no reward. Later chapters do not use it (configurable).
- **Equipment upgrade choice slot:** new `ResearchRewardSlot` form `{ kind: 'equipmentUpgrade', slot?: 'weapon' }`.
  Resolves to one `equip_item` row per item whose `upgradesFrom` is currently equipped; the row's equip replaces
  the old item (`replaceItemIds`, already supported by Pre/PostMissionStoryPhase + `CharacterManager::equipItem`).
  Shield players see a single option (Crystal Shield). No fallback row.
- **Towards the Light** post-mission choice switches to two `equipmentUpgrade` slots.
- **Cave Respite** research choice: the Crystal Shield branch offers **Charged Shield as `equip_item` (016)** and
  Strengthening Light as research on the Crystal Shield tree. The other branches key off the **equipped item**
  (Charged Rocks / Knives / Sword / Mace) instead of swap research; their rows grant the moved nodes' new ids.
  Charging Punch row gates on Charged Rocks equipped.

### Research trees

- **One bound tree per item** (9 trees), each with a free virtual root. Follow-up nodes move into them:
  - Charged Rocks tree: More Power
  - Knives tree: Piercing Knives
  - Sword tree: Jagged Edge
  - Mace tree: Training Regime
  - Crystal Shield tree: Strengthening Light
  - Rocks, Stick, Shield, Charged Shield trees: root only for now. **Hide trees with no non-root nodes from
    players** (admins still see them dimmed).
- **Shared family trees** (`boundItem` generalized to accept several items, active while **any** is equipped):
  - *Thrown Weapons* (bound to Charged Rocks, Knives — **not** base Rocks): More Rock.
  - *Melee Weapons* (bound to Sword, Mace — **not** base Stick): Iron Wrists.
- **Retire swap nodes:** `charged_rocks`, `throwing_knives`, `craft_sword`, `pipe_bat`,
  `crystal_embedded_shield`, `throwing_crystal_shield`. The old `crystal_rocks` / `stick_sword` / `tech_shield`
  tree ids are kept for the base-item trees (Rocks/Stick/Shield) so stored research and virtual roots keep working;
  give them the new titles. New trees get new ids.
- **Sorting:** add research tag `'equipment'` to every equipment tree (alongside `'weapon'`) and sort tagged trees
  **after** all other trees in the Upgrades sidebar (stable within groups, still ability-match-first within each group).
- Random reward slots already only consider active trees (`treeOpenForRandomReward`), so weapon upgrades only appear
  for the equipped item; add tests proving it with the new trees.

### Cross-tree and ability references (research → equipped item)

- Training *Charging Punch* requires Charged Rocks (`011`) equipped (`characterHasEquippedItem`).
- Light *Imbued Bat* → **Imbued Mace**; requires Mace (`014`) equipped. Light core still grants `0115` directly.
- `abilities/abilityUses.ts` (charged-rocks branch) and `card_defs/0109_ThrowKnife/0109Ability.ts`
  (`throwing_knives` + More Rock check) read the new node ids / equipment.
- Earth rock-synergy cross refs on the Rocks tree: keep; re-check they still resolve.

### Engine work (build the engine, not the feature)

- **Item passives:** add an item-level passive (e.g. `ItemDef.roundStartResourceGrants: { resourceId, amount }[]`,
  or reuse the research passive shape in `researchTrees/passiveBonuses.ts` if it fits) applied pre-battle in
  `BaseMissionDef.initializeGameState`. Charged Rocks uses it for +1 Light Charge at round start, replacing
  `GameEngine.applyChargedRocksLightChargePulse` and its `CHARGED_ROCKS_NODE_ID` research lookup (the tech debt
  the research-trees skill calls out).
- `boundItem` → supports a list of item ids (keep the single-item form working or migrate all call sites);
  `researchTrees/activeResearch.ts` treats a tree as active when any bound item is equipped.

### Swing Mace

- Rename ability `0115` "Swing Bat" → **"Swing Mace"** (name, description, research text, Imbued Bat → Imbued Mace
  in `0803`), and redraw `SWING_BAT_IMAGE` as a flanged mace. Ability id stays `0115`.
- New item icons (`011`–`016` SVGs under `character_defs/items/assets/`), including a mace.

### Save migration (backend)

Numbered deploy migration `M0003EquipmentUpgradeRewards` (see `campaign-characters` skill, "Save data versions
and migrations"):

- **Characters:** stored swap research → item: `charged_rocks`→`011`, `throwing_knives`→`012`, `craft_sword`→`013`,
  `pipe_bat`→`014`, `crystal_embedded_shield`→`015`, `throwing_crystal_shield`→`016` (highest tier wins on the shield
  line). Equip it in place of the base item (character equipment **and** `activeQuestRun.questCharacter.equipment`),
  remove the swap node from `researchTrees` / `researchNodeLevels` / `researchSources`.
- Move follow-up nodes to their new tree ids (More Power → Charged Rocks tree, Piercing Knives → Knives tree,
  Jagged Edge → Sword tree, Training Regime → Mace tree, Strengthening Light → Crystal Shield tree,
  More Rock → Thrown Weapons, Iron Wrists → Melee Weapons), preserving levels and sources.
- **Campaigns:** for each completed chapter-1 mission with `unlockItemTiers`, unlock that tier's items; also unlock
  every item the migration equipped. The PHP migration needs its own item-tier table (it cannot import TS);
  keep it a small constant in the migration with a comment pointing at the TS item defs.
- Idempotent `up()`, self-test fixtures, `touchedDirs()` = characters + campaigns.

### Out of scope

- No new shield tier-2 item; no fallback row for Shield players at Towards the Light.
- Bunker campaign items, chapter 2+ rewards, campsite slot composition (still `tag: 'weapon'` random).

## Agent Instructions

This plan is executed by `/jp-implement-plan`. See `.claude/skills/jp-implement-plan/SKILL.md` for the workflow.
The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the
background), waits for it to finish, then moves on, and reports plan completion to the user. Each worker
implements **exactly one step**, checks off its items with a one-line summary each, and **stops without spawning
another agent**.

- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first.
- Tests are Vitest (`npx vitest run <file>`), never Jest. **Per step:** `npm run lint`, `npx tsc --noEmit` when the
  step crosses an interface boundary, and **only the test files the step lists or creates**. No full suite,
  directory-wide or AbilityTest runs until Step 9.
- Some existing tests reference the retired node ids; each step updates only the tests listed for it. Failures in
  unlisted tests that are caused by later steps are expected until Step 9; note them, do not chase them.
- Relevant skills: `research-trees`, `campaign-characters`, `missions`, `editing-card-behaviour`,
  `creating-an-ability`, `ability-tests`, `game-object-def-pattern`, `minion-battles-assets`, `scoped-testing`,
  `working-with-skills`, `writing-nested-agents-files`, `.claude/skills/narrative/writing-style-abilities/STYLE.md`.

## Steps

### Step 1 — Item tiers, upgrade paths and the new items

Files: `character_defs/items/types.ts`, `character_defs/items/index.ts`, `character_defs/items/hands/*.ts`,
new `character_defs/items/weapons/011_charged_rocks.ts` … `016_charged_shield.ts`, new SVGs in
`character_defs/items/assets/`, new `character_defs/items/itemUpgrades.ts` (+ `itemUpgrades.test.ts`).

- [ ] Add `tier`, `upgradesFrom`, `campaignIds` to `ItemDef`; set them on `001`–`003` (and rename `002` → "Stick", `003` → "Shield").
- [ ] Add items `011`–`016` per the design table, with descriptions and new SVG icons (mace icon for `014`); register them in `ITEMS`, `ITEM_ICON_URLS`, `ALL_PLAYER_ITEMS`.
- [ ] Add pure helpers in `itemUpgrades.ts`: `getItemUpgradesFor(itemId)` and `getItemsForTier({ campaignId, slot, tier })`, with tests.
  - Run: `npx vitest run app/js/games/minion_battles/character_defs/items/itemUpgrades.test.ts`, `npx tsc --noEmit`.

### Step 2 — Item passives (Charged Rocks Light Charge)

Files: `character_defs/items/types.ts`, `storylines/BaseMissionDef.ts`, `game/GameEngine.ts`,
`game/GameEngine.test.ts`, `abilities/abilityUses.ts`, `character_defs/items/weapons/011_charged_rocks.ts`.

- [ ] Add an item passive (round-start resource grant) to `ItemDef`, applied once in pre-battle setup from equipped items; serializable and deterministic.
- [ ] Give Charged Rocks +1 Light Charge at round start via that passive; delete `applyChargedRocksLightChargePulse` and `CHARGED_ROCKS_NODE_ID` from `GameEngine`.
- [ ] Switch `abilityUses.ts`'s charged-rocks check from research to the equipped item (or the ability id it actually needs).
  - Run: `npx vitest run app/js/games/minion_battles/game/GameEngine.test.ts`, `npx tsc --noEmit`.

### Step 3 — Multi-item bound trees and equipment sorting

Files: `researchTrees/types.ts`, `researchTrees/activeResearch.ts`, `researchTrees/activeResearch.test.ts`,
`researchTrees/treeAbilities.ts`, `ui/components/CharacterEditor/CharacterEditor.tsx`, `researchTrees/researchTags.test.ts`.

- [ ] Generalize `boundItem` so a tree can bind several item ids (active while any is equipped); update `activeResearch.ts` and every `boundItem` reader.
- [ ] Add research tag `'equipment'`; sort equipment-tagged trees after all others in the Upgrades sidebar (ability-match ordering kept within each group).
- [ ] Hide bound trees with no non-root nodes from players (admins see them dimmed).
  - Run: `npx vitest run app/js/researchTrees/activeResearch.test.ts app/js/researchTrees/researchTags.test.ts`, `npx tsc --noEmit`.

### Step 4 — Rebuild the weapon research trees

Files: `researchTrees/trees/crystal_rocks.ts`, `stick_sword.ts`, `tech_shield.ts`, new tree files for Charged Rocks,
Knives, Sword, Mace, Crystal Shield, Charged Shield, Thrown Weapons, Melee Weapons; `researchTrees/list.ts`,
`researchTrees/trees/training.ts`, `researchTrees/trees/light.ts`, `card_defs/0109_ThrowKnife/0109Ability.ts`,
`researchTrees/treeAbilities.test.ts`, `researchTrees/evaluator.merge.test.ts`, `ui/components/researchNodeGrid.test.ts`.

- [ ] Strip swap nodes from Rocks/Stick/Shield trees (keep tree ids, virtual roots and Earth cross refs; retitle to "Rocks", "Stick", "Shield").
- [ ] Add one bound tree per new item holding its moved follow-up node (More Power, Piercing Knives, Jagged Edge, Training Regime, Strengthening Light); Charged Shield tree is root-only. Use new node ids where a node moves trees, and export them as constants.
- [ ] Add Thrown Weapons (More Rock; bound to `011`, `012`) and Melee Weapons (Iron Wrists; bound to `013`, `014`) trees; drop their old `anyResearched` gates.
- [ ] Tag all equipment trees `['weapon', 'equipment']`; register in `RESEARCH_TREES`.
- [ ] Re-point Charging Punch (training) to Charged Rocks equipped, Imbued Bat (light) to Mace equipped, and `0109Ability.ts`'s knife / More Rock check to the new ids.
  - Run: the three listed test files, `npx tsc --noEmit`.

### Step 5 — Swing Mace

Files: `card_defs/0115_SwingBat/0115Ability.ts`, `card_defs/0115_SwingBat/0115Ability.test.ts`,
`card_defs/08_light_core/0803_ImbuedBat/0803Ability.ts`, research node text in the Mace and Light trees.

- [ ] Rename Swing Bat → Swing Mace (name, description, keyword text) and Imbued Bat → Imbued Mace; ability ids unchanged.
- [ ] Replace `SWING_BAT_IMAGE` with a flanged-mace SVG matching the existing ability icon style.
  - Run: `npx vitest run app/js/games/minion_battles/card_defs/0115_SwingBat/0115Ability.test.ts`.

### Step 6 — Reward building blocks: tier unlock + equipment upgrade slot

Files: `storylines/types.ts`, `storylines/storyTypes.ts`, `storylines/researchRewardSlots.ts`,
`storylines/researchRewardSlots.test.ts`, `Game.tsx` (both victory paths that read `completionRewards`),
`storylines/chapterSkip.ts`, `storylines/chapterSkip.test.ts`, `ui/components/CharacterEditor/ChapterSkipWizard.tsx`.

- [ ] Add `completionRewards.unlockItemTiers` and resolve it (via `getItemsForTier` with the mission's `campaignId`) into the mission result `itemIds` in `Game.tsx`, so the existing campaign unlock path applies; show unlocked items in the Campaign Rewards list.
- [ ] Add the `{ kind: 'equipmentUpgrade' }` reward slot: one `equip_item` row per upgrade of the equipped item; the post-mission phase's `replaceItemIds` logic swaps the old item out. Make sure post-mission `equip_item` rows render item name, icon and description.
- [ ] Chapter-skip replay applies `unlockItemTiers` and resolves `equipmentUpgrade` slots the same way.
  - Run: `npx vitest run app/js/games/minion_battles/storylines/researchRewardSlots.test.ts app/js/games/minion_battles/storylines/chapterSkip.test.ts`, `npx tsc --noEmit`.

### Step 7 — Chapter 1 missions

Files: `storylines/WorldOfDarkness/missions/001_dark_awakening.ts`, `002_towards_the_light.ts`, `004_cave_respite.ts`,
`001_dark_awakening.test.ts`, new `002_towards_the_light.test.ts`, new `004_cave_respite.test.ts`,
`storylines/questPrepLoadout.test.ts`, `character_defs/characterLoadout.test.ts`.

- [ ] `001`: add `unlockItemTiers: [{ slot: 'weapon', tier: 1 }]`; weapon choice still equips the picked item.
- [ ] `002`: replace the tier-2 research slots with two `equipmentUpgrade` slots; add `unlockItemTiers` tier 2.
- [ ] `004`: Crystal Shield branch offers Charged Shield as `equip_item` (`016`) + Strengthening Light research; other branches key off the equipped item and grant the moved node ids; Charging Punch gated on `011` equipped; add `unlockItemTiers` tier 3.
- [ ] Tests: Rocks player at Towards the Light sees Charged Rocks + Knives, Shield player sees only Crystal Shield; Cave Respite rows per equipped item; random weapon slots only offer the equipped item's trees; update loadout/quest-prep tests for the retired swap nodes.
  - Run: the listed test files.

### Step 8 — Save migration

Files: new `backend/Migrations/Versions/M0003EquipmentUpgradeRewards.php`, `backend/Migrations/MigrationRegistry.php`.

- [ ] Characters: convert swap research to the matching item (equip in place of the base item, also in the quest snapshot), remove swap nodes, move follow-up nodes to their new tree ids with levels and sources.
- [ ] Campaigns: unlock tier items for completed chapter-1 missions (`dark_awakening` → tier 1, `towards_the_light` → tier 2, `cave_respite` → tier 3) plus anything the migration equipped.
- [ ] Idempotent `up()`, `touchedDirs()`, self-test fixtures for a Rocks→Charged Rocks + More Power character, a Shield→Charged Shield character, and an untouched character.
  - Run: `php backend/scripts/migrate.php --self-test` and `npm run migrate -- --dry-run`.

### Step 9 — Docs and final verification

Files: `.claude/skills/research-trees/SKILL.md`, `.claude/skills/campaign-characters/SKILL.md` (mirror under
`.cursor/skills/` where present), `app/js/games/minion_battles/character_defs/AGENTS.md`,
`app/js/games/minion_battles/testing/scenarios/abilities/{throwRockResearch,throwKnifeScenarios,swingSwordResearch,techShieldScenarios}.ts`,
`testing/scenarios/general/{equipmentLoadout,buffs}.ts`.

- [ ] Update docs: items have tiers/upgrade paths; equipment upgrades are items, not research; multi-item bound trees; `'equipment'` tag sorting; `unlockItemTiers`; `equipmentUpgrade` slot; item passives; remove the GameEngine tech-debt note.
- [ ] Update ability scenarios that granted swap research to equip the new items instead (Throw Charged Rock, Throw Knife + Piercing, Swing Sword + Jagged Edge, Swing Mace, Crystal/Charged Shield).
- [ ] Add AbilityTests (high level, deterministic, fast):
  - Equipment loadout: each tier-2/3 item alone yields its card (Charged Rocks → Throw Charged Rock, Mace → Swing Mace, Charged Shield → both cards).
  - Charged Rocks item passive grants Light Charge at round start; Rocks does not.
  - Shared tree: More Rock applies with Knives equipped and not with base Rocks.
- [ ] Run once: the AbilityTest scenarios above + updated ones, `npx vitest run --changed`, `npx tsc --noEmit`, `npm run lint`.
- [ ] Manual browser check: new Rocks character through Dark Awakening (all three base weapons unlocked) → Towards the Light (pick Knives: Knives equipped, Charged Rocks/Sword/Mace/Crystal Shield unlocked) → Character Editor swap back to Rocks → Upgrades tab shows equipment trees last and only the equipped item's tree.
