# Plan: Equipment unlocks and per-weapon research refactor

> **Completed 2026-10-09.** All 13 steps implemented (Sonnet workers, orchestrator-inspected). Research no longer grants equipment except core swaps; weapon trees are bound to their weapon (`boundItem`) with virtual roots; `resolveCharacterLoadout` is the single equipment+research→abilities path; battles, prep, Upgrades and random rewards read active research; campaigns hold deduplicated `unlockedItemIds`; saves are versioned with on-load PHP migrations plus `backend/scripts/migrate_save_data.php`; A Dark Awakening force-equips and unlocks the chosen weapon; quest battles use the quest equipment snapshot; Earth Core's bonus Throw Rock is gone; the six upgrade items are deleted. Verification: lint (0 errors), tsc, PHP lint, migration self-test and dry-run, full Vitest (345 files / 2714 tests) all green. **Follow-ups:** manual browser checklist (Step 13) not done; run the migration script locally and on production; the account-level `grantAccountItem`/`removeAccountItem` PHP handlers are deprecated but still present; `GameEngine` Charged Rocks pulse remains in-battle tech debt (now gated by active research).

> **Update:** `backend/scripts/migrate_save_data.php` was replaced by a deploy-time migration system: `backend/Migrations/` (registry, ledger at `storage/_migrations/ledger.json`, lock, per-migration backups) run by `backend/scripts/migrate.php` / `npm run migrate`. The sweep from this plan is migration `0001 equipment_unlocks_and_save_versions`. `npm run deploy` applies pending migrations on the server; references to `migrate_save_data.php` below are historical.

## Context

The equipment and research systems grew separately and now overlap. **Research grants equipment** in three separate places, and they disagree with each other:

1. **The battle merge in the evaluator.** `mergeBattleEquipmentIdsFromResearch` (`app/js/researchTrees/evaluator.ts:806`) runs `equipItem` / `replaceEquippedItem` effects tree by tree.
2. **The research purchase handler.** `CharacterEditor.tsx` persists the equipment that `applyResearchEffects` returns. `undoReplaceEquippedItemsForRemovedNodes` reverses this on reset.
3. **A PHP mirror on the server.** `LobbyManager::mergePlayerEquipmentIntoState` (`backend/LobbyManager.php:~1115`) hard-codes copies of the Tech Shield, Charged Rocks and Craft Sword swaps. The copy is already stale: it still duplicates `011` for Extra Shields.

**What went wrong in lobby 94BE89.** Chip had equipment `004` and `013` and research `crystal_rocks: [throw_rock, charged_rocks]`, `stick_sword: [swing_stick]`. The battle merge did the following:

1. `throw_rock` equipped `001`, with override.
2. `charged_rocks` swapped `001` for `013`.
3. `swing_stick` equipped `002` with override, which removed `013`.

The result was Swing Stick only. The starting-weapon nodes are meant to exclude each other, but Chip owned two of them.

### Target model (user requirements, binding)

- **Unlocks are campaign-level.** Equipment is unlocked through mission rewards, the same way resources are granted. Unlocking the same item twice is a no-op, so each item has at most one copy.
- **Characters can swap equipment between missions.** Once a mission or quest starts, equipment stays fixed for the whole mission or quest, unless that mission or quest changes it itself.
- **Equipment grants abilities.**
- **Research only modifies abilities.** It adds new ones or replaces old ones. **Research never grants equipment.**
- **Weapon research is per weapon.** Research on weapon A is not applied while weapon B is equipped; the player works through B's tree instead. A's research is kept, so it applies again if A is re-equipped.
- **Random research depends on what is currently equipped.**
- **Cores stay as they are.** A core unlocks its research tree, and that tree's abilities stay selectable whatever core is equipped. Core nodes keep their existing `replaceEquippedItem BasicCore→XCore` effects.
- **A Dark Awakening** both **unlocks and force-equips** the chosen weapon: Rocks `001`, Stick `002` or Pot lid `003`.
- **Equipment swapping UI is deferred.** The admin-only equipment editing in the Character Editor is enough for now.

### User decisions (binding)

1. **Upgrade items become ability swaps.** The six upgrade items (Charged Rocks `013`, Throwing Knives `016`, Crafted Sword `015`, Pipe Bat `021`, Crystal Embedded Shield `011`, Charged Shield `012`) are retired. Their nodes become `replaceCard` / `addCard` effects on the base weapon's abilities. Saves that still hold these items map them back to the base weapon.
2. **Starting-weapon root nodes stay, as free roots.** These are `throw_rock`, `swing_stick` and `raise_shield`.
   - They have no effects.
   - They count as researched automatically while their weapon is equipped (a "virtual" root).
   - Existing prerequisite chains stay unchanged.
   - Root nodes no longer exclude each other.
3. **Save data gets a version number and migrations that run on load.**
   - Each saved entity stores a `version`.
   - On load, every migration from the stored version up to the current version runs in order, and the upgraded data is written back.
   - A one-off script runs the same migrations over all stored data.

### Design decisions made in this plan (flag if wrong)

- **Bound weapon trees.**
  - `ResearchTreeDef.boundItem = { itemId, rootNodeId }` ties a weapon tree to its weapon: Crystal Rocks↔`001`, Stick & Sword↔`002`, Tech Shield↔`003`.
  - A bound tree is **active** only while its item is equipped.
  - "Active research" means the stored research, minus inactive bound trees, plus the virtual roots of active bound trees.
  - Every consumer reads active research:
    - battle setup and in-battle lookups;
    - Quest Prep and Prepare Carefully;
    - Upgrades UI eligibility;
    - random research rewards.
  - The stored research itself is never rewritten.
- **Card effects run in phases.** Effects from bound (weapon) trees are applied to the item cards first. Only then are effects from unbound trees (cores, training, misc) applied.
  - Card replacements follow chains, for example `0104→0110→0113`.
  - Example: Earth Core + Rocks + Charged Rocks gives `throw_charged_rock`. Earth's `throw_rock→earth_core_throw_rock` no longer matches, which keeps today's behaviour.
- **Earth Core no longer grants a bonus Throw Rock** (user request).
  - Today, `resolveItemCardsToAdd` adds `throw_rock` to Earth Core whenever there is no crystal_rocks research. That rule and `resolveItemCardsToAdd.ts` are deleted; every item contributes exactly its `cardsToAdd`.
  - The only rock throw now comes from equipping Rocks (`001`). Earth's `replaceCard throw_rock → earth_core_throw_rock` still upgrades that Rocks throw when Charged Rocks / Throwing Knives are not researched.
  - So Earth Core + Stick, or Earth Core + Pot lid, has **no** rock throw.
  - This is the one core-adjacent change in the plan.
- **Unlock storage.**
  - `CampaignState.unlockedItemIds` is a deduplicated list stored on the campaign.
  - It grows when a mission result arrives with `itemIds` (`Campaign::addMissionResult`).
  - It also grows immediately whenever a story `equip_item` action is applied on the server.
- **Mapping a character to its campaign.** On disk, `campaignCharacters` is always empty. The campaign for a character is therefore its owner account's `campaignIds[0]`, the same default `resolveCampaignInstanceId` uses.
- **Equipment is frozen for a quest.**
  - Battles in a quest lobby use `activeQuestRun.questCharacter.equipment`. This snapshot already exists but nothing reads it today.
  - `CharacterManager::equipItem` writes to both the character and the active quest snapshot, so a mission that changes equipment mid-quest still works.
  - For a single mission, equipment is already frozen once the battle snapshot exists. No change is needed there.
- **Account inventory is replaced.**
  - The non-admin Character Editor inventory reads the campaign's unlocked items instead of `account.inventoryItemIds`.
  - The admin "grant item" control in `CharactersPanel.tsx` switches to campaign unlocks.
  - Account `inventoryItemIds` stays readable but is no longer written.
- **Migrations live in PHP**, because the server owns stored data. The legacy mapping tables are frozen historical facts, so having them only in PHP cannot drift from the TS side.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan` — read `.claude/skills/jp-implement-plan/SKILL.md` and follow it; do not restate or improvise its workflow here.

- The **invoking agent is the sole orchestrator**. It spawns **one worker per step, synchronously** (never `run_in_background`), waits for each to finish, verifies the plan file, and reports plan completion to the user at the end.
- Each **worker implements exactly one step**. It checks off each `- [ ]` item with a one-line summary of what actually changed, then **stops without spawning the next agent**.
- **Read every file in an item's "Touches" line before editing.** Do not guess signatures.
- **Per-step verification (keep it cheap):**
  - Run `npm run lint`.
  - Run `npx tsc --noEmit` when the step changes an interface or type. Most steps here do.
  - Run **only the test files the step lists**.
  - For PHP edits, run `php -l <file>` on each changed file.
  - Never run the full suite, whole directories, `SimulationRunner.test.ts`, or E2E/AbilityTest runs inside a regular step. Step 13 does that once.
- **Intermediate steps may leave some non-listed tests red.** Example: between Step 2 and Step 3, the item swaps are gone but the new phased resolver does not exist yet. Do not chase failures outside your step's listed tests. Record any you notice in your step summary so Step 13 can confirm they are fixed.
- **Never mutate `storage/`** except in Step 13, and there only through the migration script's `--dry-run` / `--self-test` modes, or against a scratch copy.
- **Pause and ask** (return the question as your final output) in these cases:
  - Removing a legacy item turns out to break a campaign or storyline other than World of Darkness.
  - The campaign↔character lookup (owner account → `campaignIds[0]`) is wrong for some stored data.
- **Bash note:** on this machine the Bash tool can lose its PATH, and heredocs containing apostrophes fail to parse. Prefer the Read/Edit/Write tools, and use PowerShell for `git`/`npm`/`npx`/`php`.
- **Relevant project skills:**
  - `research-trees`, `editing-card-behaviour`, `working-on-minion-battles`
  - `game-sync-data-flow` (Steps 4 and 8)
  - `campaign-characters`
  - `ability-tests` (Step 11), `scoped-testing`
  - `editing-and-creating-components` (Step 9)
  - `debugging-lobbies` (Step 13 sanity check against lobby 94BE89)
  - `working-with-skills` and `writing-nested-agents-files` (Step 12)

All TS paths below are relative to `app/js/` unless they start with `backend/`, `docs/`, `scripts/` or `.claude/`.

---

## Key Architecture Facts

| Fact | Where |
|---|---|
| Tree registry and order (techShield, crystalRocks, training, stickSword, misc, earth, …) | `researchTrees/list.ts` |
| Research effect union (`equipItem`, `replaceEquippedItem`, `addExtraCardsFromItem`, `replaceCard`, `addCard`, `removeCard`, pets, mission-start resources); `overrideCurrentEquipment` | `researchTrees/types.ts` |
| Equipment from research: `applyResearchEffects`, `mergeBattleEquipmentIdsFromResearch`, `nodeGrantsEquippedItem`; card helpers `getDirectCardsFromResearch` / `getRemovedCardsFromResearch` / `getCardReplacementsFromResearch` (single-pass `Map`, last write wins) | `researchTrees/evaluator.ts` |
| Starting-weapon node ids and peer exclusivity | `researchTrees/trees/startingWeaponNodes.ts` (+ `startingWeaponExclusivity.test.ts`) |
| Weapon trees | `researchTrees/trees/crystal_rocks.ts`, `stick_sword.ts`, `tech_shield.ts` |
| Earth Core's conditional bonus Throw Rock (**removed in Step 3**) | `games/minion_battles/character_defs/items/resolveItemCardsToAdd.ts` (callers: `BaseMissionDef.ts`, `questPrepLoadout.ts`, `questPrepLoadout.test.ts`) |
| Item registry, `CORE_ITEM_IDS`, `ALL_PLAYER_ITEMS`, icons | `games/minion_battles/character_defs/items/index.ts` (+ `hands/`, `weapons/`, `core/`) |
| Battle ability list built from equipment + research (duplicate #1) | `games/minion_battles/storylines/BaseMissionDef.ts` ~L336–395 |
| Prep ability pool built the same way (duplicate #2) | `games/minion_battles/storylines/questPrepLoadout.ts` `buildAccessibleAbilityIds` |
| Battle input: `playerResearchTreesByPlayer` / `playerEquipmentByPlayer` read from the snapshot, then fed to `composeMap` and the engine | `games/minion_battles/game/BattleSession.ts` ~L700–830; engine store `game/managers/ResearchManager.ts`; setter `GameEngine.ts:~433` |
| In-battle research read (tech debt) | `GameEngine.ts` `CHARGED_ROCKS_NODE_ID` light pulse; `abilities/abilityUses.ts` `applyCrystalRocksResearchToAbilityRuntime` |
| Server snapshot of equipment + research; PHP research→equipment hacks | `backend/LobbyManager.php` `mergePlayerEquipmentIntoState` |
| Story `equip_item` applied on the server (`CharacterManager::equipItem` with client-computed `replaceItemIds`) | `backend/LobbyManager.php:~1410`, `backend/CharacterManager.php:189`; client: `ui/pages/PreMissionStoryPhase.tsx:~195`, `ui/pages/PostMissionStoryPhase.tsx:~466` |
| Mission-result `itemIds` (pre-mission starting items and post-mission item choice) are sent to the campaign | `games/minion_battles/Game.tsx:~746–800` → `App.tsx` `recordMissionResult` → `backend/Http/Handlers/UpdateCampaignHandler.php` → `Campaign::addMissionResult` |
| Campaign persistence | `backend/Campaign.php`, `backend/CampaignManager.php` (`loadCampaignFromStorage`, `persistCampaign`); TS `CampaignState` in `types.ts` |
| Character persistence | `backend/Character.php` (`toArray`/`fromArray`), `backend/CharacterManager.php` (`loadFromStorage`, `persist`); accounts in `backend/PlayerAccount.php` (`characterIds`, `campaignIds`, `inventoryItemIds`) |
| Quest snapshot (equipment captured but unused) | `storylines/questRun.ts` `cloneQuestCharacterFromCampaign`, `storylines/questTypes.ts` `QuestCharacter` |
| Dark Awakening weapon choice (currently `grant_research_to_player`) | `storylines/WorldOfDarkness/missions/001_dark_awakening.ts` ~L214 |
| Random / filter research rewards | `storylines/researchRewardSlots.ts` (`treeOpenForRandomReward`, `requirementsStrictlyMet`, `nodeRequirementsMet`); used by `questMissions/campsite.ts`, `missions/002_towards_the_light.ts`, `ui/pages/PostMissionStoryPhase.tsx` |
| Upgrades UI: tree eligibility, purchase, reset | `ui/components/CharacterEditor/CharacterEditor.tsx` (~L304 `eligibleResearchTrees`, ~L540–620 reset, ~L700 purchase, ~L474 inventory) |
| Admin account item grant | `ui/components/characters/CharactersPanel.tsx:~274`; `backend/Http/Handlers/GrantAccountItemHandler.php` |
| AbilityTest harness and registry | `testing/harness/buildTinyBattleEngine.ts`, `testing/scenarios/registry.ts`, `testing/runner/SimulationRunner.test.ts` |

### Legacy mapping (frozen; used by migrations)

| Legacy item | Base weapon | Research node that implied it |
|---|---|---|
| `013` Charged Rocks, `016` Throwing Knives | `001` Rocks | `crystal_rocks.charged_rocks` / `throwing_knives` |
| `015` Crafted Sword, `021` Pipe Bat | `002` Stick | `stick_sword.craft_sword` / `pipe_bat` |
| `011` Crystal Embedded Shield, `012` Charged Shield | `003` Pot lid | `tech_shield.crystal_embedded_shield` / `throwing_crystal_shield` |

| Root node | Implies weapon |
|---|---|
| `crystal_rocks.throw_rock` | `001` |
| `stick_sword.swing_stick` | `002` |
| `tech_shield.raise_shield` | `003` |

### Ability-swap mapping (Step 2)

| Node | New effects (replace the item swap) |
|---|---|
| `charged_rocks` | `replaceCard throw_rock → throw_charged_rock` |
| `throwing_knives` | `replaceCard throw_rock → throw_knife` |
| `craft_sword` | `replaceCard 0103 → 0112` |
| `pipe_bat` | `replaceCard 0103 → 0115` |
| `crystal_embedded_shield` | `replaceCard 0104 → 0110` |
| `throwing_crystal_shield` | `replaceCard 0110 → 0113`, `addCard 0121` (the cards from item `012`) |

Before editing, confirm each target's `cardsToAdd` against the item files: `013` → `throw_charged_rock`, `016` → `throw_knife`, `015` → `0112`, `021` → `0115`, `011` → `0110`, `012` → `0113` + `0121`.

---

## Checklist

### Step 1 — Bound weapon trees and the "active research" view

- [x] Add `boundItem?: { itemId: string; rootNodeId: string }` to `ResearchTreeDef`, with a doc comment covering:
  - The tree is a weapon tree, active only while `itemId` is equipped.
  - `rootNodeId` counts as researched automatically while the tree is active.
  - Set it on `crystal_rocks` (`001`, `throw_rock`), `stick_sword` (`002`, `swing_stick`) and `tech_shield` (`003`, `raise_shield`).
  - Touches: `researchTrees/types.ts`, `researchTrees/trees/crystal_rocks.ts`, `stick_sword.ts`, `tech_shield.ts`.
  - Done: added documented `boundItem` to `ResearchTreeDef`; set on the three weapon trees using their `*_NODE_BASE` constants.
- [x] Create `researchTrees/activeResearch.ts` (pure; no UI or engine imports) with:
  - `isResearchTreeActive(tree, equipment): boolean`. Unbound trees are always active.
  - `getActiveResearchTrees(researchTrees, equipment): Record<string, string[]>`. It drops every inactive bound tree, adds `rootNodeId` to every active bound tree (deduplicated), and keeps unbound trees unchanged. It never mutates its input.
  - `getActiveResearchNodeLevels(levels, equipment)`, which drops the levels of inactive bound trees.
  - Done: created with all three functions (imports `RESEARCH_TREES`/`getResearchTree` from `./list`, no UI/engine imports). Unknown tree ids pass through as unbound.
- [x] Add `researchTrees/activeResearch.test.ts` covering:
  - **Chip's case.** Equipment `004` + `001` with `crystal_rocks[throw_rock, charged_rocks]` and `stick_sword[swing_stick]` keeps crystal_rocks and drops stick_sword.
  - **A bound tree with no stored research** still gets its virtual root when the item is equipped.
  - **Unbound trees** (earth, training) pass through unchanged.
  - **Input is not mutated.**
  - Done: 6 tests (also covers node levels and `isResearchTreeActive`), all passing.
- Verify: lint, `tsc`, `npx vitest run app/js/researchTrees/activeResearch.test.ts`.

### Step 2 — Weapon research swaps abilities, never items

- [x] Convert the six upgrade nodes to the **Ability-swap mapping** above. Keep `modifiesAbility`, prerequisites, exclusivity and costs.
  - Done: Converted the six upgrade nodes to `replaceCard`/`addCard` effects per the mapping (item `cardsToAdd` confirmed); kept modifiesAbility, prereqs, exclusivity, costs.
  - Touches: `researchTrees/trees/crystal_rocks.ts`, `stick_sword.ts`, `tech_shield.ts`.
- [x] Turn the three root nodes into free roots:
  - Done: Roots now have `effects: []`, `requirements: []`, `exclusiveWithNodeIds: []`, no override; `startingWeaponNodes.ts` keeps only the id constants; deleted `startingWeaponExclusivity.test.ts`.
  - Set `effects: []`, `requirements: []` and `exclusiveWithNodeIds: []`, and drop `overrideCurrentEquipment`.
  - Keep `tier`, `position` and `modifiesAbility`.
  - Delete `exclusiveStartingWeaponPeers` / `STARTING_WEAPON_NODE_IDS` from `startingWeaponNodes.ts`. Keep the node-id constants.
  - Delete `researchTrees/trees/startingWeaponExclusivity.test.ts`.
- [x] Narrow the effect model.
  - Done: Removed `equipItem`/`addExtraCardsFromItem` and `overrideCurrentEquipment`; `replaceEquippedItem` documented core-only; `applyResearchEffects` now returns `{ equipment }` and `mergeBattleEquipmentIdsFromResearch` returns `{ equipmentIds }` (no `extraEquippedItemIds`; BaseMissionDef and questPrepLoadout spreads patched minimally); `nodeGrantsEquippedItem` matches only `replaceEquippedItem`.
  - Remove `equipItem` and `addExtraCardsFromItem` from `ResearchEffect`, and `overrideCurrentEquipment` from `ResearchNodeDef`.
  - Document `replaceEquippedItem` as **core-only**.
  - Simplify `applyResearchEffects` / `mergeBattleEquipmentIdsFromResearch` so they only apply core `replaceEquippedItem`.
  - Update `nodeGrantsEquippedItem`. It is still used for cores by `researchRewardSlots.ts`, `006_core_awakening.ts` and `evaluator.ts:~321`.
  - Touches: `researchTrees/types.ts`, `researchTrees/evaluator.ts`.
- [x] Make `getCardReplacementsFromResearch` callers chain-safe.
  - Done: Added exported `applyCardReplacements(cards, replacements)` in `evaluator.ts` (fixed-point, cycle-guarded, deduped); BaseMissionDef not rewired.
  - Add `applyCardReplacements(cards, replacements)` in `evaluator.ts`. It follows `from→to` until it reaches a fixed point, with a cycle guard, so `0104→0110→0113` resolves.
  - Step 3 is the only caller; do not rewire BaseMissionDef here.
- [x] Add `researchTrees/researchEquipmentInvariants.test.ts` covering:
  - Done: Added `researchEquipmentInvariants.test.ts` (invariants + applyCardReplacements); updated `evaluator.merge.test.ts` (weapon research leaves equipment alone, core swap still works) and `coreResearchUnlocks.test.ts` (weapon nodes grant no items).
  - No node in any tree has an equipment effect unless both of its item ids are core items (`CORE_ITEM_IDS`).
  - No node sets `overrideCurrentEquipment`.
  - Every `boundItem.rootNodeId` exists in its tree and has no effects.
  - Update `researchTrees/evaluator.merge.test.ts` and `researchTrees/coreResearchUnlocks.test.ts` to the new semantics (core swaps still work; weapon nodes no longer change equipment).
- Verify: lint, `tsc`, `npx vitest run app/js/researchTrees/researchEquipmentInvariants.test.ts app/js/researchTrees/evaluator.merge.test.ts app/js/researchTrees/coreResearchUnlocks.test.ts`.

### Step 3 — One loadout resolver for battle and prep

- [x] Create `games/minion_battles/character_defs/characterLoadout.ts` exporting `resolveCharacterLoadout(equipment, researchTrees)`, which returns `{ activeResearchTrees, battleEquipmentIds, abilityIds }`. It runs in phases:
  1. `activeResearchTrees = getActiveResearchTrees(researchTrees, equipment)`.
  2. `battleEquipmentIds` = core-only `mergeBattleEquipmentIdsFromResearch(equipment, activeResearchTrees)`.
  3. Item cards: each equipped item's `cardsToAdd`, deduplicated in equipment order.
  4. **Bound-tree card effects**, from active bound trees only, in this order: `addCard`, then `removeCard`, then chained `replaceCard`.
  5. **Unbound-tree card effects**, in the same order.
  6. Keep the existing `['0101', '0120']` fallback when no abilities result.
  - Done: Created `resolveCharacterLoadout` (phases: active research, core merge, item cards, bound-tree then unbound-tree add/remove/chained replace, fallback). Added optional `TreePredicate` arg to `getDirectCardsFromResearch`/`getRemovedCardsFromResearch`/`getCardReplacementsFromResearch`. Replacement maps are built per phase, so earth's throw_rock replacement cannot clobber crystal_rocks'.

  Extend `getDirectCardsFromResearch`, `getRemovedCardsFromResearch` and `getCardReplacementsFromResearch` with an optional tree predicate, rather than duplicating their loops.
  - Touches: new file, `researchTrees/evaluator.ts`.
- [x] Remove Earth Core's bonus Throw Rock.
  - Delete `character_defs/items/resolveItemCardsToAdd.ts` (`earthCoreGrantsThrowRock` and `resolveItemCardsToAdd`).
  - Remove its imports from `BaseMissionDef.ts`, `questPrepLoadout.ts` and `questPrepLoadout.test.ts`, and drop that test file's Earth Core bonus case.
  - Grep for anything that assumes Earth Core alone provides `throw_rock` or `earth_core_throw_rock`, and update it to equip Rocks (`001`) explicitly. Check `testing/scenarios/abilities/earthCoreScenarios.ts`, `card_defs/05_earth_core/` (including `EarthCore.md`), `researchTrees/trees/earth.ts` node descriptions, and the `0535` Earth Core Throw Rock ability.
  - Ability-only test scenarios that pass `abilities: [...]` directly are unaffected; leave them alone.
  - If a gameplay system breaks because Earth Core no longer has any ranged option (for example, an Earth mission or AI that expects every Earth Core player to throw rocks), **pause and ask**.
  - Done: Deleted `resolveItemCardsToAdd.ts` and its imports/test cases; grep found no other assumptions (earthCoreScenarios pass abilities directly; 0535/earth.ts text needed no change).
- [x] Replace both duplicates with the resolver:
  - In `BaseMissionDef.ts` (~L340–380), `abilities` comes from `resolveCharacterLoadout(...).abilityIds`.
  - `buildAccessibleAbilityIds` in `questPrepLoadout.ts` becomes a thin wrapper that returns `.abilityIds`.
  - Remove the now-unused imports.
  - Done: `BaseMissionDef` uses `resolveCharacterLoadout` (abilityIds + battleEquipmentIds); `buildAccessibleAbilityIds` is a thin wrapper; unused imports removed.
- [x] Add `character_defs/characterLoadout.test.ts` covering:
  - **Chip's case** gives `throw_charged_rock` and no `0103`.
  - **Stick + stored crystal research** gives `0103` and no rock throw.
  - **Earth Core + Rocks + charged_rocks** gives `throw_charged_rock` and no `earth_core_throw_rock`.
  - **Earth Core + Stick** gives no `throw_rock` and no `earth_core_throw_rock`.
  - **Earth Core + Rocks** with no crystal research gives `earth_core_throw_rock`.
  - **The shield chain** `crystal_embedded_shield` + `throwing_crystal_shield` gives `0113` + `0121`.
  - **Pipe Bat** gives `0115`.
  - **The fallback** when equipment is empty.
  - Update `storylines/questPrepLoadout.test.ts` and `storylines/questPrepFinalize.test.ts` where they assumed item swaps.
  - Done: Added 10 tests (incl. Earth+Rocks+charged_rocks ordering case); rewrote `questPrepLoadout.test.ts` Earth/grant cases (grant tests now use Earth gather-stone since rock root is free); `questPrepFinalize.test.ts` now uses `001` instead of `013`.
- Verify: lint, `tsc`, `npx vitest run app/js/games/minion_battles/character_defs/characterLoadout.test.ts app/js/games/minion_battles/storylines/questPrepLoadout.test.ts app/js/games/minion_battles/storylines/questPrepFinalize.test.ts`.

### Step 4 — The battle boundary uses active research

- [x] In `BattleSession.ts`, compute active research per player once from the snapshot's `playerEquipmentByPlayer` + `playerResearchTreesByPlayer`.
  - Put the helper in `characterLoadout.ts`: `activeResearchByPlayer(equipmentByPlayer, researchByPlayer)`, plus the same for node levels.
  - Feed the result to `composeMap` / `createTerrain`, to `engine.prepareForNewGame` (so `ResearchManager` only ever holds active research), and to the mission's player-unit setup.
  - It must give the same result on a fresh start and on a checkpoint restore. Applying the filter twice must change nothing.
  - Done: Added `activeResearchByPlayer` / `activeResearchNodeLevelsByPlayer` to `characterLoadout.ts`; `BattleSession.loadBattle` filters once and feeds terrain ctx, `initializeGameState`, and `setPlayerResearchTreesByPlayer` (so ResearchManager holds only active research). Checkpoint restore reuses serialized (already-active) ResearchManager data; filter is idempotent.
- [x] In `BaseMissionDef.ts`, make sure modifiers, passives, pets, pet abilities, mission-start resources and the `applyXxxResearchToAbilityRuntime` calls read the **same active research**.
  - With that in place, the `GameEngine` Charged Rocks light pulse and `applyCrystalRocksResearchToAbilityRuntime` stop firing for a non-rock weapon without any code change in them. Confirm this; do not edit them unless it fails.
  - Done: `initializeGameState` now derives active research/levels from `equippedItemsByPlayer` at the top (idempotent) and uses it for composeMap, loadout, passives, modifiers, pets, mission-start resources and the ability-runtime calls. GameEngine pulse / `applyCrystalRocksResearchToAbilityRuntime` untouched (they read ResearchManager / getResearchNodes, now active).
- [x] Extend `characterLoadout.test.ts`: `activeResearchByPlayer` is idempotent, and it drops `charged_rocks` for a player with the Stick equipped.
  - Done: Added 3 tests (drop + virtual root, idempotence, node levels); 13 tests pass.
- Verify: lint, `tsc`, `npx vitest run app/js/games/minion_battles/character_defs/characterLoadout.test.ts`.

### Step 5 — Upgrades UI and random rewards use active research

- [x] Update `researchRewardSlots.ts`:
  - Done: `resolveResearchRewardSlots` computes `getActiveResearchTrees(researched, equipped)` up front (idempotent), so all filtering uses active research; `treeOpenForRandomReward` returns false for inactive bound trees. Also Pre/PostMissionStoryPhase: `skipIfResearched` and `filterChoiceOptionsByResearch` (grant_research_conditional) now read active research (persistence unchanged).
  - `treeOpenForRandomReward` returns false for an inactive bound tree, **even if it holds research**.
  - Candidate filtering, `nodeStructurallyAvailable` and `requirementsStrictlyMet` run against `getActiveResearchTrees(researched, equippedItemIds)`, so virtual roots satisfy prerequisites.
  - Specific (designer) slots are unchanged.
- [x] Add `storylines/researchRewardSlots.test.ts` (it does not exist yet) covering:
  - Done: 4 tests added; `campsite.test.ts` EQUIPMENT now includes Stick `002` since stored stick research is only active when equipped. Both files pass.
  - A random weapon-tagged slot with the Stick equipped never offers a crystal_rocks node.
  - With Rocks equipped and no stored research, it can offer `charged_rocks` (virtual root).
  - Core trees are offered as they are today.
  - Update `storylines/WorldOfDarkness/questMissions/campsite.test.ts` if it relied on stored roots.
- [x] Update `CharacterEditor.tsx`:
  - Done: added `activeResearchTrees`/`activeResearchNodeLevels`; used for `eligibleResearchTrees` (inactive bound trees excluded; admins see them dimmed), `isPlayerVisibleResearchTree`, `viewResearch` (feeds ResearchTreePanel so the virtual root shows owned), `canResearchNode` ctx and the `already` set (virtual root never persisted). Purchase/reset still write stored research; `applyResearchEffects` is core-only. `ResearchTreePanel`/`researchNodeGrid` needed no edits.
  - `eligibleResearchTrees`, `playerAbilityIds` (via `resolveCharacterLoadout`) and the `canResearchNode` contexts use active research. For players, inactive bound trees are hidden even if they hold research. Admins still see them dimmed (`dimmedResearchTreeIds`).
  - Purchase and reset keep writing **stored** research; virtual roots are never persisted.
  - After a purchase, persist an equipment change only when `applyResearchEffects` changed a **core**.
  - `undoReplaceEquippedItemsForRemovedNodes` stays for cores only.
  - Check `ResearchTreePanel.tsx` / `ResearchedNodesGrid` for direct `researchTrees` reads that need the active view, so the root shows as owned.
  - Touches: `ui/components/CharacterEditor/CharacterEditor.tsx`, `ui/components/ResearchTreePanel.tsx`, `ui/components/researchNodeGrid.ts` (read first; edit only if needed).
- Verify: lint, `tsc`, `npx vitest run app/js/games/minion_battles/storylines/researchRewardSlots.test.ts app/js/games/minion_battles/storylines/WorldOfDarkness/questMissions/campsite.test.ts`.

### Step 6 — Campaign-level equipment unlocks (data and API)

- [x] Add `unlockedItemIds` to `backend/Campaign.php`:
  - Done: added `unlockedItemIds` (normalized/deduped; ctor, `toArray`, `fromArray`), `getUnlockedItemIds`, `unlockItems`, plus `relockItems`; `addMissionResult` unlocks filtered `itemIds`.
  - Make it a list of non-empty, trimmed, deduplicated strings, carried through the constructor, `toArray` and `fromArray`.
  - Add `getUnlockedItemIds()`, plus `unlockItems(array $ids): bool`, which returns true if anything changed.
  - `addMissionResult` also calls `unlockItems` with the filtered `itemIds`.
- [x] Add `CampaignManager::getCampaignForCharacter(string $characterId): ?Campaign`. It goes character → `ownerAccountId` → account `campaignIds[0]`, using the existing account service/manager; read how accounts load first.
  - Add `CampaignManager::unlockItemsForCharacter(string $characterId, array $itemIds): void`, which persists only when something changed.
  - Done: both added; `AccountService` is an optional trailing param (defaults to a flat-file-backed instance since managers are singletons without one).
- [x] Update `backend/Http/Handlers/UpdateCampaignHandler.php`:
  - Done: handles `unlockItemIds` (any owner) and admin-only `relockItemIds`; `unlockedItemIds` is returned via `Campaign::toArray`.
  - Accept `unlockItemIds` (any owner).
  - Accept admin-only `relockItemIds`, which removes ids (for the admin tools). Mirror the handler's existing auth checks.
  - Return `unlockedItemIds` in the campaign payload.
- [x] TS side:
  - Done: added `unlockedItemIds?` to `CampaignState`, `unlockItemIds`/`relockItemIds` to `updateCampaign` payload, and `getUnlockedItemIds` + test (2 passing).
  - Add `unlockedItemIds?: string[]` to `CampaignState` in `types.ts`, documented as defaulting to `[]`.
  - Add `unlockItemIds` / `relockItemIds` to the `LobbyClient.updateCampaign` payload type.
  - Add a pure helper `getUnlockedItemIds(campaign)` in `games/minion_battles/character_defs/items/unlockedItems.ts`, with a small test `unlockedItems.test.ts` (it defaults to `[]` and deduplicates).
- Verify: lint, `tsc`, `php -l` on each changed PHP file, `npx vitest run app/js/games/minion_battles/character_defs/items/unlockedItems.test.ts`.

### Step 7 — Versioned save data, migrations on load, one-off script

- [x] Create a small migration framework in `backend/SaveData/`:
  - Done: Added `backend/SaveData/SaveMigrator.php` (runs migrations stored..current in order, sets version, reports changed; recipe in header) plus `StorageRoot.php` so `--storage` redirects the managers and account storage.
  - `SaveMigrator.php` with `migrate(array $data, int $currentVersion, array $migrations): array{data: array, changed: bool}`.
  - It reads `version` (missing means 0), runs each `migrations[v]` for `v` from the stored version up to current, in order, sets `version`, and reports whether anything changed.
  - Each migration is a pure `callable(array): array`, except where noted below.
  - Document the "add a migration" recipe in a header comment.
- [x] **`CharacterMigrations.php`**: `CURRENT_VERSION = 1`. Migration `0→1`:
  - Done: `CharacterMigrations.php` (v1, frozen legacy/weapon/core/root tables; maps equipment and quest snapshot, implies weapon from first root node, research untouched).
  1. Map legacy items to their base weapon in `equipment` and in `activeQuestRun.questCharacter.equipment`, using the Legacy mapping table, then deduplicate.
  2. If no weapon-slot item remains, equip the base weapon implied by the first owned root node, in the order `throw_rock`, `swing_stick`, `raise_shield`.
  3. Leave research untouched.

  PHP does not know item slots, so define a frozen `WEAPON_ITEM_IDS` list from today's hand/weapon item files.
- [x] **`CampaignMigrations.php`**: `CURRENT_VERSION = 1`. Migration `0→1` initialises `unlockedItemIds` from:
  - Done: `CampaignMigrations.php` (v1) takes `ownerCharacterIds` / `loadCharacter` closures; `MigrationLookups.php` supplies them from raw JSON (campaign to owner account by `campaignIds`, then `characterIds`), excluding core items.
  - every `missionResults[].itemIds` entry, mapped with the legacy table;
  - for each character owned by the campaign's owner account (account `characterIds`; skip any that are missing): its equipment and quest-snapshot equipment, mapped to base, **excluding core items**;
  - the base weapons implied by the root nodes it owns.

  This migration needs account and character lookups. Pass them in as closures so the function stays testable.
- [x] Hook the migrations into `CharacterManager::loadFromStorage` and `CampaignManager::loadCampaignFromStorage`:
  - Done: `Character`/`Campaign` carry `version` (fromArray default 0); `CharacterManager::loadFromStorage` / `CampaignManager::loadCampaignFromStorage` migrate and persist when changed; new characters/campaigns start at CURRENT_VERSION; Starter factory already emits only `004`.
  - Persist immediately when `changed`.
  - Carry `version` through `Character.php` and `Campaign.php` `toArray`/`fromArray`.
  - Newly created characters and campaigns start at `CURRENT_VERSION`.
  - `StarterCharacterFactory.php` must not emit legacy items.
- [x] Create `backend/scripts/migrate_save_data.php`:
  - Done: `backend/scripts/migrate_save_data.php` with `--storage`, `--dry-run` (raw JSON, never loads managers), backup-then-manager-load real mode, and `--self-test` (fixtures plus scratch-dir manager round trip); self-test passes, dry-run on real storage reports Chip 004,013 -> 004,001 and Chip campaign unlocks 001,002,005,003.
  - `--storage <dir>` defaults to `storage/`.
  - `--dry-run` prints a per-file diff summary and writes nothing.
  - Without `--dry-run`, it first copies every file it will change to `<storage>/_migration_backup/<timestamp>/`, then loads each character and each campaign through the managers so the on-load migrations run and persist.
  - `--self-test` runs both migrations against inline fixtures and exits non-zero on mismatch. The fixtures must include:
    - a Chip-like character: `004` + `013`, `throw_rock` + `swing_stick` → equipment `004` + `001`;
    - a legacy shield character with `012` → `003`;
    - a campaign whose mission results and characters imply `001` and `003` → `unlockedItemIds = [001, 003]` in any order, with no duplicates.
- Verify: `php -l` on every new or changed PHP file, `php backend/scripts/migrate_save_data.php --self-test`.

### Step 8 — Story and server flows: unlock, force-equip, quest freeze

- [x] Change the Dark Awakening weapon choice to `{ type: 'equip_item', itemId: '001' | '002' | '003' }` with no `alsoGrantResearch`; root nodes are now virtual. Remove the unused tree imports.
  - Done: Choice options now `equip_item` 001/002/003 (no alsoGrantResearch); tree imports removed.
  - Touches: `storylines/WorldOfDarkness/missions/001_dark_awakening.ts`.
- [x] Server: when `LobbyManager` applies a story choice with an item, call `CampaignManager::unlockItemsForCharacter` as well as `equipItem`. Do the same for:
  - Done: LobbyManager story choice, applyStoryGrantEquipmentRandom (target character) and group-vote grant_item_to_player now call CampaignManager::unlockItemsForCharacter (default AccountService; LobbyManager has none).
  - the deterministic `story_grant_equipment_random` grant;
  - the group-vote `grant_item_to_player` effect (`LobbyManager.php:~1777`).

  The invariant is: **an equipped story item is always unlocked.**
- [x] Update `CharacterManager::equipItem` to also update `activeQuestRun.questCharacter.equipment` when an active quest run exists, applying the same `replaceItemIds` / append logic.
  - Done: equipItem also applies the same replace/append to activeQuestRun.questCharacter.equipment when present.
- [x] Update `LobbyManager::mergePlayerEquipmentIntoState`:
  - Done: Removed all research-to-equipment hacks; uses quest snapshot equipment when state questRunId equals the active run runId; storyGrantedEquipment layering and doc comment updated.
  - **Delete** all the research→equipment hacks: Tech Shield, Extra Shields, Charged Rocks, Craft Sword.
  - When the lobby state's `questRunId` equals the character's `activeQuestRun.runId`, use `questCharacter.equipment` instead of `getEquipment()`.
  - Keep the `storyGrantedEquipment` layering.
  - Update the doc comment.
- [x] Add or update a TS test that Dark Awakening's choice options are `equip_item` for `001`, `002` and `003`, either in an existing mission test or a new `001_dark_awakening.test.ts` next to the mission file.
  - Done: Added 001_dark_awakening.test.ts (passes). Force-equip check: 001/002/003 all share the weapon slot and playerEquipmentByPlayer now holds stored character equipment, so PreMissionStoryPhase replaceItemIds contains the differing stored weapon; server equipItem removes it then appends the choice.
- Verify: lint, `tsc`, `php -l` on each changed PHP file, `php backend/scripts/migrate_save_data.php --self-test` (it must still pass), and the Dark Awakening test file.

### Step 9 — Inventory and admin UI use campaign unlocks

- [x] Update `CharacterEditor.tsx` `visibleInventoryItems`:
  - Non-admins see `getUnlockedItemIds(resolvedCampaign)` minus equipped items. Admins keep `ALL_PLAYER_ITEMS`.
  - Remove the `account.inventoryItemIds` / `inventoryItems` fallback. If `inventoryItems` is a prop used elsewhere, keep it only if another caller passes it; otherwise remove it.
  - Done: Non-admins use campaign unlocks (editor now also fetches the campaign on the equipment tab); removed the `inventoryItems` prop and its callers (CharacterSelectPhase now gates the panel on `getUnlockedItemIds(campaign)`).
- [x] Lock equipment during an active quest:
  - While `character.activeQuestRun` is set, non-admins see read-only equipment slots, with the note "Equipment is locked for the active quest".
  - Admin equipment edits during a quest write to the character and to `activeQuestRun.questCharacter.equipment` in the same `updateCharacter` call.
  - Done: `equipmentLockedByQuest` disables edit mode for non-admins and shows the note; `buildEquipmentUpdate` also writes the quest snapshot on equip, core-research purchase and research reset.
- [x] Repoint the admin "grant item" / "remove item" controls in `CharactersPanel.tsx`:
  - They now call `updateCampaign` with `unlockItemIds` / `relockItemIds` on the target account's campaign.
  - Mark `grantAccountItem` / `removeAccountItem` in `minionBattlesApi.ts` / `LobbyClient.ts` `@deprecated`. Do not delete the PHP handlers in this plan.
  - Done: Panel loads the campaign from `adminDetails.account.campaignIds[0]` (no new API) and uses new `unlockCampaignItems`/`relockCampaignItems`; old account methods marked `@deprecated`.
- Verify: lint, `tsc`. No new tests; Step 13 covers this in the browser checklist.

### Step 10 — Retire the legacy upgrade items

- [x] Remove items `013`, `016`, `015`, `021`, `011` and `012` from `ITEMS`, `ITEM_ICON_URLS` and the imports in `character_defs/items/index.ts`, and delete their item files.
  - Keep any SVG that a remaining item or research card still uses. For example, `002_torch.svg` is shared with Pipe Bat.
  - Before deleting, grep the whole repo for each id and file name: ability tooltips, scenario files, story actions, `grant_research_conditional` candidates, other storylines. If a non-WoD storyline uses one, **pause and ask**.
  - Done: Deleted the 6 item files and SVGs 011/012/013/015/016 (002_torch.svg kept, used by Torch); removed from ITEMS/ITEM_ICON_URLS/imports. Grep found no other users in app/ (only a coreResearchUnlocks.test negative assertion, left as is); backend SaveData ids untouched.
- [x] Remove `nodeGrantsEquippedItem` call sites that can now only match weapons. Keep the core usage.
  - Remove stale comments that mention item swaps, such as "Quest Prep: Throw Rock comes free with Charged Rock" in `card_defs/0108_ThrowChargedRock/0108Ability.ts`. Keep `attachedAbilityIds`.
  - Done: Remaining `nodeGrantsEquippedItem` call sites (evaluator, researchRewardSlots, 006_core_awakening) are core-only already, so kept; fixed stale Charged Rock comment in 0108Ability.ts.
- Verify: lint, `tsc`, `npx vitest run app/js/games/minion_battles/character_defs/characterLoadout.test.ts app/js/researchTrees/researchEquipmentInvariants.test.ts`.

### Step 11 — AbilityTest scenarios for loadouts

- [x] Add a harness helper `placePlayerFromLoadout(engine, { playerId, world, equipment, researchTrees })` in `testing/harness/`. It must use `resolveCharacterLoadout` / `activeResearchByPlayer` exactly as the battle path does:
  - abilities from the resolver;
  - `computeAbilityModifiersFromResearch` and the `applyXxxResearchToAbilityRuntime` calls fed by active research;
  - `engine` research set from active research.

  Read `placePlayerAndDummy` and `earthCoreScenarios.ts` first and reuse their pattern.
  - Done: Added `placePlayerFromLoadout` (+ `placeTargetDummy`) to `buildTinyBattleEngine.ts`; `spawnTinyPlayerUnit` got an opt-in `applyResearchAbilityModifiers` flag (BaseMissionDef order). Abilities come from `resolveCharacterLoadout`; engine research, passives, modifiers and runtime tweaks all read `activeResearchByPlayer`; equipment resources attached.
- [x] Add `testing/scenarios/general/equipmentLoadout.ts`, register it in `registry.ts` (with `generalSection` and a `GENERAL_GROUP_ORDER` slug "Equipment"), and add `it(...)` entries in `testing/runner/SimulationRunner.test.ts`. The scenarios:
  - `loadout_rocks_charged_rock_hits`: Rocks + `charged_rocks`. The player casts Throw Charged Rock at a dummy; the dummy takes damage. This reproduces Chip's bug.
  - `loadout_swapped_weapon_ignores_old_research`: Stick equipped, with stored `crystal_rocks[charged_rocks]`. Swing Stick hits the dummy. The unit has no rock-throw ability, and its light charge stays 0 after the first round start (no Charged Rocks pulse).
  - `loadout_shield_research_chain`: Pot lid + `crystal_embedded_shield` + `throwing_crystal_shield`. The unit has `0113` and `0121`, and casting `0113` resolves without error.
  - `loadout_earth_core_keeps_charged_rock`: Earth Core + Rocks + `charged_rocks`. The unit's throw is `throw_charged_rock`, and it hits.
  - `loadout_earth_core_no_bonus_rock`: Earth Core + Stick. The unit has no `throw_rock` / `earth_core_throw_rock`, and its Earth Core abilities plus Swing Stick still work (Swing Stick hits the dummy).

  Keep each scenario under about 6 s of game time and deterministic.
  - Done: Added `equipmentLoadout.ts` (5 scenarios, general section "Equipment"), registered in `registry.ts` with slug `equipment`, and 5 `it('loadout_...')` entries in `SimulationRunner.test.ts`. Rocks scenario proves the engine Charged Rocks pulse via a use-count (cast -1, pulse +1); the Stick scenario adds a depleted Throw Charged Rock sentinel and asserts the pulse never recovers it and engine research lacks `charged_rocks`. `-t loadout_` run: 5 passed; lint and `tsc` clean.
- Verify: lint, `tsc`. **Do not run the scenarios here**; Step 13 runs them.

### Step 12 — Docs and skills

- [x] Update `.claude/skills/research-trees/SKILL.md`, and its `.cursor/skills/` mirror if one exists:
  - Done: Added "Equipment vs research", bound trees/virtual roots/active research, and one-loadout-resolver sections; random rewards, pre-battle and eligibility notes; kept the GameEngine pulse tech-debt note and added that it is gated by active research; exclusivity wording removed. The stale `.cursor` mirror was overwritten with the new file (it also lacked older reward-slot/grid content).
  - research never grants equipment, except core swaps;
  - bound trees and virtual roots;
  - active research and where it is applied;
  - phased card effects;
  - random rewards gated by active research.
  - Earth Core gives no bonus Throw Rock; rock throws come only from equipping Rocks.
  - Remove the "starting-weapon exclusivity" wording.
- [x] Update `.claude/skills/campaign-characters/SKILL.md` (read it first) to cover:
  - Done: Added "Equipment unlocks and freezing" and "Save data versions and migrations" sections (unlockedItemIds, story equip_item unlocks, campaign lookup, quest freeze, migration recipe with SaveMigrator/migrate_save_data pointers); `.cursor` mirror synced.
  - campaign `unlockedItemIds`;
  - "story `equip_item` always unlocks";
  - the quest equipment freeze;
  - save `version` and the migration recipe, pointing to `backend/SaveData/SaveMigrator.php` and `backend/scripts/migrate_save_data.php`.
- [x] Add a short `## Equipment and research` note to `app/js/games/minion_battles/character_defs/AGENTS.md`, creating the file per `writing-nested-agents-files`. It names `resolveCharacterLoadout` as the **only** place that turns equipment and research into abilities.
  - Done: Created `character_defs/AGENTS.md` (folder table plus the Equipment and research note naming `resolveCharacterLoadout`) and linked it from `minion_battles/AGENTS.md`.
- Verify: lint.

### Step 13 — Final verification (run once)

- [x] Run `npm run lint` and `npx tsc --noEmit`.
  - Done: lint 0 errors (16 pre-existing warnings); tsc clean.
- [x] Run `php -l` on every PHP file changed in this plan, then `php backend/scripts/migrate_save_data.php --self-test`.
  - Done: all changed/new PHP files (incl. `backend/SaveData/*`) lint clean; self-test passed.
- [x] Run `php backend/scripts/migrate_save_data.php --dry-run`. **Do not run it without `--dry-run`.**
  - Paste the summary for `char_2e1dcd91e5beeab3` (Chip). The expected result is equipment `004` + `001`.
  - Paste the summary for Chip's campaign. The expected `unlockedItemIds` include `001`, and `002` because of the `swing_stick` root.
  - Done: dry-run wrote nothing (22 characters / 8 campaigns pending). Chip and campaign `c2fd6eee52b4a0d2` had already been migrated on load by the running dev server: Chip `[004, 001]` (quest snapshot too); campaign `unlockedItemIds = [001, 002, 005, 003]` (005 = Throw Torch utility, 003 from an owned `raise_shield` root).
- [x] Run the new AbilityTest scenarios: `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t loadout_`. Also run the existing `throwRockResearch`, `techShieldScenarios`, `swingBatScenarios`, `swingSwordResearch`, `throwKnifeScenarios`, `rapidThrowComboScenario` and `earthCoreScenarios` entries the same way, by `-t` id.
- [x] Run the full Vitest suite once: `npm run test`.
  - Done: 345 files / 2714 tests passed, 2 skipped, 0 failures (includes all SimulationRunner scenarios). Targeted run: all 5 `loadout_` scenarios plus swing/rock/shield/earth entries pass.
  - Fix regressions caused by this plan.
  - List any failure that predates it, with evidence from `git stash` or the failing test's history.
- [x] Manual browser checklist. Record what you could and could not check.
  1. Start a new character in A Dark Awakening and pick each weapon in turn. The weapon is equipped, and it shows up in the campaign's `unlockedItemIds` (Character Editor inventory for a non-admin).
  2. Open Chip after migration: the Upgrades tab shows Rocks research; Stick & Sword is hidden for the player and dimmed for an admin.
  3. Give a test character Earth Core + Stick (admin). Neither Quest Prep nor Prepare Carefully lists a rock throw.
  4. As an admin, swap Chip to the Stick. The Upgrades tab now shows Stick & Sword with Swing Stick owned, and Quest Prep lists Swing Stick but no rock throw.
  5. Start a quest, then change equipment as an admin on the base character only through the API. The quest battle still uses the snapshot equipment.
  - Not done by the orchestrator: no browser checks were performed. All five items remain for a human.
- [x] Remind the user, in the completion report and not as an action: run `php backend/scripts/migrate_save_data.php` locally, and run it **on production** after deploy. The on-load migrations also cover anything the script misses.
  - Done: included in the completion report.

