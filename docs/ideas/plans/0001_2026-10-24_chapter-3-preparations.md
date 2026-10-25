# Chapter 3 Preparations

Architecture pass before Chapter 3 (castle story questline, new weapons and their abilities, core crossover abilities, new enemies, a new boss, super moves, new terrain types and grid-style battle maps). Items are grouped by priority. Each item has a complexity estimate:

- **Low**: a few changes to a few files.
- **Medium**: overhauls a small subsystem.
- **Large**: touches many parts of the code and likely needs a data migration.

Baseline when this was written: `npx tsc --noEmit` is clean. The backend already has a deploy-time migration runner (`backend/scripts/migrate.php`, `backend/Migrations/Versions/`), so the Large items below have somewhere to put their migrations.

---

## P0: Must do

The cleanups already asked for, plus what the investigation found about each.

### [x] P0.1 Remove the erroneous enemies (Husk Artillery, Huskling, Thornling)

**Complexity:** Medium

**Done:** Husk Artillery, Huskling, Thornling and the thornling nests are deleted. That covers their unit defs, spawn templates (including `ALLY_THORNLING` / `ALLY_THORNLING_NEST`), abilities `0009` and `0015`, `0002` (whose last users were the Huskling and Thornling), `unitThornlingState`, `thornlingNestTick`, the nest wiring in the spawn and mission code, `swordwoman.svg` and the Bestiary rows. `ephemeralDespawnAtGameTime` stays because Displacer clones and Phantom Decoy use it, and the Shield of Light test now uses `dog` as its beast. The `wod_ch3` stub is gone and `009_thornling_rise` is deleted. New `CampaignChapterDef.adminOnly` is filtered in one place, `getCampaignChapters(storyline, { isAdmin })` in `unlock.ts`, which also drives `getHighestUnlockedChapterIndex`, `getUnlockedMissionIds` and `getAllMissionIdsInOrder`. Admin-only chapters are removed before indexing, so player chapter indexes are unchanged. Admins see Chapter 0 first and always unlocked, and the map still opens on the player's current chapter. Chapter 0 (`wod_ch0`, "Unused Missions") holds `thornbinder_arena`, `crystal_corruption` and `the_circle`, laid out by `chapter3Map.ts` (now the Chapter 0 layout). Chapter skip refuses admin-only chapters, no storyline edge reaches them, and Mission Select shows them to admins only.

- **Legacy Chapter 3 stub.** `WorldOfDarkness.ts` still declares a `wod_ch3` chapter listing `thornbinder_arena`, `crystal_corruption`, `the_circle` and `thornling_rise` (it is set to unlock after one of its own missions). `009_thornling_rise` exists only to show off the Thornling, so delete it and its tests. Remove the stub chapter so the real Chapter 3 starts from a clean slate.
- **Decided: move the other legacy missions to an admin-only Chapter 0.** `006b_thornbinder_arena`, `004b_crystal_corruption` and `010_circle_arena` go into a new chapter (numeral `0`, titled something like "Unused Missions"). It becomes the standing holding ground for missions that aren't in the campaign.
  - Engine work: chapters have no visibility flag today (missions only have `disabled`). Add `adminOnly` to `CampaignChapterDef` (`storylines/types.ts`) and filter it in one place, `getCampaignChapters(storyline, { isAdmin })` in `storylines/unlock.ts`, so the Mission Map chapter tabs (`MissionMapTab.tsx`), `getHighestUnlockedChapterIndex` and the unlocked-mission sets all agree.
  - Watch the index rules: `isChapterUnlocked` treats index 0 as always unlocked, and the highest-unlocked logic is index-based. Either filter admin-only chapters out before indexing, or switch those helpers to "first non-admin chapter" semantics. Add tests for both admin and non-admin views.
  - Missions in Chapter 0 must not count towards campaign progression or rewards for non-admins, and `chapterSkip.ts` should never offer to skip it.
- Code to delete: unit defs and the `EnemyUnitId` entries for `husk_artillery`, `huskling`, `thornling` and `thornling_nest` (`unitDef.ts`); spawn templates `ENEMY_HUSK_ARTILLERY`, `ENEMY_THORNLING`, `ENEMY_THORNLING_NEST` and `ALLY_THORNLING` (`constants/enemyConstants.ts`, `LevelEventManager` `BASE_SPAWN_DEFS`); abilities `0009_HuskSeedBarrage` and `0015_ThornlingBite` (and their `AbilityRegistry` / `card_defs/index.ts` entries); `unitThornlingState.ts`; `lanternite/thornlingNestTick.ts` and its `GameEngine` call; thornling `nestMissionConfigs` entries; the `husk_artillery` entry in `lightHate.ts`; the Bestiary rows; and the HuskSeedBarrage Hard TODO in `docs/TODO.md`.
- Husk-specific engine leftovers: the unit-expiry field on `Unit` ("husks, etc.") may only be used by husklings. Check for other users before removing it.
- Tests that borrow these enemies as stand-ins need a new subject: `0805ShieldOfLight` uses `thornling` as its "beast", and `interactiveTargeting` / `previewCanonEquivalence` / pathfinding scenarios reference them.
- Keep the Command Core **Bramble Patch** (`0706`): it only shares thorn helpers (`placeJitteredGroundThorns`) and comments.
- Unit JSON loses the thornling fields. No migration, as agreed.

### [x] P0.2 Remove the `enemy_melee` placeholder

**Complexity:** Low

**Done:** removed from `unitDef.ts`, `enemyConstants.ts`, `LevelEventManager`, `AssetRegistry` and the Bestiary. Huskling borrowed its sprite key, so it now has its own `huskling` key (still swordwoman art). Tests and scenarios that used it as a stand-in now use `dog`. Ability `0002` stays until Huskling goes in P0.1.

- `unitDef.ts` (union and def), `ENEMY_MELEE` in `enemyConstants.ts`, `LevelEventManager` spawn map, the `AssetRegistry` swordwoman branch, and the Bestiary row.
- Ability `0002_EnemyMeleeAttack` is shared with Huskling, so it goes in the same pass as P0.1 unless another unit adopts it.
- Delete `swordwoman.svg` only if nothing else still uses it.

### [x] P0.3 Slime cleanup and Bestiary entry

**Complexity:** Low

**Done:** `slimeRanged.ts` renamed to `slime.ts`, new `uiDescription`, stale docs updated, and a Slime entry added to the Bestiary.

- The runtime id is already `slime` everywhere in code. What's left is naming: rename `game/units/dark_animals/slimeRanged.ts` to `slime.ts`, change the unit's `uiDescription` and any copy that reads as "ranged basic", and update stale `enemy_ranged` / ranged-basic mentions in `PLANS/*.md` and the skills.
- Add a Bestiary entry: `slime`, ability `0001` (Slime Shot), faction Dark Creatures, icon `assets/characters/slime.svg`.

### [x] P0.4 Bestiary icons for Displacer Spirit and Displacer Clone

**Complexity:** Low

**Done:** the Spirit's icon was added to the Bestiary, and the Clone picks it up through its `characterSpriteKey`.

- `assets/characters/dark_animals/displacer_spirit.svg` already exists and the battle renderer uses it, but the Bestiary keeps its own `SPRITE_ICONS` map, and that map leaves it out. Add the Spirit there, and let the Clone resolve through its `characterSpriteKey`, or give it a tinted variant.
- The root cause is that unit art is registered in two places. P1.1 removes that duplication so this can't happen again.

### [x] P0.5 Rename the "food" campaign resource

**Complexity:** Large (stored campaign data, about 110 references, backend arithmetic, narrative copy)

**Done (with P0.6 and P1.6):** `food` is now `vigor` (label "Vigor", lucide `BicepsFlexed`, green `#22C55E`), so Ham means Hunger only. The rename covers research cost constants (`*_VIGOR_COST`, `minCoreResearchVigor`), mission and quest rewards (`*_VIGOR_REWARD`, `*_COMPLETION_VIGOR`, `FOUND_BERRIES_KEEP_VIGOR`), story `grant_resources` actions and tests. The Hunger tooltip now reads "Eat well to heal your wounds after a fight." Story prose about literal food ("Find some food", berries, sharing meat) stays, and so do all persisted mission, quest and option ids.

Campaign food is spent on research nodes across every tree. Hunger is per-character and drains into health after a fight, but it shares food's look: both use the Ham icon, the Hunger tooltip says "Use food to heal your wounds", and the conversion animation flies food icons. Whichever name you pick, the new resource needs its own icon so that Ham means Hunger only.

Work involved:

- Do P1.6 (campaign resource registry) first. The rename then becomes a key change plus a migration instead of a hunt through every call site.
- Backend: `Campaign.php` (`RESOURCE_KEYS` and the per-key arithmetic in four methods), `CampaignManager.php`, `GrantCampaignResourceHandler.php`. Add a migration that rewrites `resources.food` and every `missionResults[].resourceDelta.food` in stored campaigns.
- Frontend: `campaignResources.ts`, `ResourcePill.tsx` (label, colour, icon), `partyStoryGrants.ts`, `storyChoiceOptions.ts`, `researchCostPolicy.ts`, every research tree's `*_FOOD_COST` constants, quest and mission `completionRewards`, and `chapterSkip.ts`. Update the Hunger copy and art too (`hungerHealth.ts` tooltip, the food icons in `HungerToHealthConversion.tsx`) so Hunger stops saying "food".
- Narrative sources need new flavour: `quest_find_some_food`, `found_berries` ("Found Berries" location card) and the chapter 1 food rewards.

**Decided:** Vigor (key `vigor`).

### [x] P0.6 Rename "crystals" to "attunement"

**Complexity:** Large (do it in the same migration as P0.5)

**Done (with P0.5):** `crystals` is now `attunement` (label "Attunement", lucide `Sparkles`, violet `#8B5CF6`), and the knowledge key `Crystals` is now `KNOWLEDGE_RESOURCE_ATTUNEMENT` (`ResourceAttunement`, "Resource: Attunement"). Attunement is deliberately not knowledge-gated yet, because no player has that knowledge and gating would hide it from everyone. Grant it from a mission first. Dark crystals, the Crystal Shield, crystal caves and the `crystal_corruption` id are untouched.

Migration: `M0005ResourceRename` plus save version 5 for campaigns and characters, with the rename logic in `backend/SaveData/ResourceRenames.php`. It renames campaign `resources`, every `resourceDelta` (mission results, nested victory rewards, quest results, active quest runs), character knowledge, and account knowledge (swept by M0005, plus a lazy rename in `PlayerAccount::fromArray`). It was checked against a copy of local storage: 32 characters, 8 campaigns and 1 account changed, a re-run is a no-op, and no old keys remain. Saves also migrate lazily on load. Local `storage/` has not been migrated; run `npm run migrate` when ready (deploy runs it automatically).

- Same plumbing as P0.5: backend `RESOURCE_KEYS`, stored `resources.crystals` and `resourceDelta.crystals`, `ResourcePill`, research costs, `darkness_upgrades.ts` copy, quest rewards.
- The account knowledge key `'Crystals'` is stored on accounts, so the migration also renames that key (to `ResourceAttunement`, see P0.8). Today `'Crystals'` and `'Forging'` are in the knowledge registry but nothing checks them. P0.7 gives Attunement's knowledge a real job.

### [x] P0.7 "Knowledge of Resource: Population" gates the population resource

**Complexity:** Low (Medium if done together with P1.6)

**Done:** added `KNOWLEDGE_RESOURCE_POPULATION` (`ResourcePopulation`, listed as "Resource: Population") to `accountKnowledge.ts`. `campaignResources.ts` now has a `CAMPAIGN_RESOURCE_KNOWLEDGE` table mapping a resource to the knowledge it needs, plus `isCampaignResourceVisible` and `visibleCampaignResources`. The Upgrades resource rows (`UpgradesResourcePills` in `ResearchTreePanel.tsx`) filter by the viewed player's knowledge, so an admin viewing a player sees that player's view. Admin tools (the resource-grant dropdown and "Current" totals in `CharacterEditor`) still list every resource. Gain and cost lists don't filter, because nothing grants or costs population today, and a reward that does grant it should be shown. When P0.6 lands, gating Attunement is one line in the table. The backend accepts any knowledge key, so it needed no change.

- Add `KNOWLEDGE_RESOURCE_POPULATION` to `accountKnowledge.ts` and hide population from `ResourcePill` lists (`RESOURCE_ORDER` consumers: `CharacterEditor`, `MissionSelectPanel`, reward pills) unless the account knows it.
- Generalize it: give each campaign resource an optional `knowledgeKey` in the P1.6 resource table, and have one helper (`visibleCampaignResources(knowledge)`) do the filtering. Attunement then uses the same mechanism, so a Chapter 3 resource only needs one line of data.

### [x] P0.8 Knowledge metadata: type, icon, tier

**Complexity:** Medium

**Done:** `AccountKnowledgeDef` now has `type` (`resource` / `equipment` / `systems` / `other`), `tier` and a one-line `description`, plus `KNOWLEDGE_TYPE_DEFS` (labels), `KNOWLEDGE_TYPES` and `accountKnowledgeDef`. Research and Attunement are tier 1, everything else tier 2. The icons (`Gem`, `Swords`, `Cog`, `Sparkles`) live in the new `components/KnowledgePill.tsx`, which shows the type icon plus the label and has a hover tooltip with type, tier and description. `CharactersPanel` uses it, and its admin grant select has multi-select type filter chips. Bare `'Research'` strings are now `KNOWLEDGE_RESEARCH`, and `KNOWLEDGE_FORGING` / `KNOWLEDGE_ALPHA_WOLF_DEFEATED` were added. `AlphaWolfDefeated` was granted by mission 005 but was unregistered. The new `accountKnowledgeUsage.test.ts` checks that every knowledge key used by research trees, missions, quests and equipment slots is registered.

- Extend `AccountKnowledgeDef` with `type: 'resource' | 'equipment' | 'systems' | 'other'`, `tier: number` and a one-line `description` (what the knowledge unlocks).
- Add a `KNOWLEDGE_TYPE_DEFS` table mapping each type to a label and a lucide icon (for example `Gem` for resource, `Swords` for equipment, `Cog` for systems, `Sparkles` for other).
- Extract a `KnowledgePill` component (it's currently inline in `CharactersPanel.tsx`) that shows the type icon, with a tooltip giving the type, tier and description. Add it to the `components-for-the-ui` skill.
- Admin grant tool: add type filter chips (and optionally a tier filter) above the grant `<select>`.
- Tiers: Research and Crystals/Attunement are tier 1, everything else is tier 2.
- Replace bare string keys with constants: `'Research'` is repeated across `training.ts`, `weapons.ts`, `command_core.ts`, and missions 002 and 003.
- Add a registry test asserting that every knowledge key used anywhere is registered: research `accessRequirements`, mission and quest `completionRewards.knowledgeKeys`, and equipment-slot requirements. Today an unregistered key just shows up as its raw id.

---

## P1: Good to do before Chapter 3 content

Each of these removes friction that the planned Chapter 3 content would otherwise hit several times over.

### [x] P1.1 One source of truth per enemy (unit def drives Bestiary, art and spawns)

**Complexity:** Medium. **Helps:** new enemies, new boss

**Done:** `UnitDefEntry` now has `displayName`, `sprite`, `bestiary` (`abilityIds`, optional `hidden`), `lightHate` and `baseSpawn`. Unit art is imported once, in `unit_defs/unitSprites.ts` (`UNIT_SPRITE_URLS`). `AssetRegistry` preloads a texture per sprite key into a map (the if-chain is gone). The Bestiary, timeline icons, `getBaseSpawnDefs()` and Light Hate all read from the defs, and the Bestiary faction comes from `creatureType`. The `enemyConstants` exports missions use are unchanged (the defs reference them). `unitDefRegistry.test.ts` fails if an enemy lacks a sprite, name or Bestiary entry. The `EnemyUnitId` union is still edited by hand.

Adding one enemy currently means editing about seven places: the `EnemyUnitId` union and `UNIT_DEFS` (`unitDef.ts`), the spawn template in `enemyConstants.ts`, `LevelEventManager.BASE_SPAWN_DEFS`, an `AssetRegistry` texture field and an `if (characterId === …)` branch, `BestiaryPanel`'s `SPRITE_ICONS` and `BESTIARY_ENTRIES` (which repeat the name, abilities and a faction that duplicates `creatureType`), and `lightHate.ts`.

- Move `displayName`, `sprite` (asset URL), `bestiary` (ability ids, hidden flag), `lightHate` and the base spawn template onto `UnitDefEntry`.
- Have `AssetRegistry` load textures from the defs (a map, not an if-chain) and have the Bestiary list its entries from `UNIT_DEFS`.
- Add a test that every enemy def has a sprite and a Bestiary entry (or an explicit `bestiary: { hidden: true }`). This turns P0.4-style gaps into test failures.

### [x] P1.2 Move enemy-specific state and ticks off `Unit` and `GameEngine`

**Complexity:** Medium. **Helps:** new enemies, boss phases, "mounted enemies that dismount", summoners

**Done:** unit components (`game/units/components/`). Defs declare `components: [componentSpec(...)]`; lanternite, swarm and pet state live in `unit.components` behind typed accessors, and `GameEngine` calls `runUnitComponentTick` / `runUnitComponentRoundMilestone` / `runUnitComponentDeath` instead of naming nest types (lanternite death handling moved from `onDeathBehaviors` to a component `onDeath`). The lanternite and swarm nests share a spawner core (`spawnerCore.ts`: `SpawnerSpec`, `tickSpawner`, `spawnSpawnerChildren` for on-death or boss-wave spawns, `poolSharedConstruction`). Serialized unit keys are unchanged, so no checkpoint upgrade step was needed. Scout and swarmling construction completion stayed per nest.

- `Unit` carries `petState`, `lanterniteState`, `thornlingState` and `swarmState`, and `unitToJSON` interleaves them in a fixed order (`lanterniteStateToJSONBeforeThornling`, …). `GameEngine` imports `processLanterniteNests`, `processThornlingNests` and `processSwarmNests`, plus the lanternite pulse milestones.
- Introduce unit components declared on the def. Each component owns `create`, `toJSON`/`fromJSON`, `tick` and round-milestone hooks, and the engine loops over components instead of naming enemy types.
- Merge the three nest ticks (`lanternite/*NestTick.ts`, about 850 lines) into one configurable Spawner/Nest component. The same component covers on-death spawns (dismounting riders, splitting enemies) and boss add waves.
- Do this after P0.1 so there's one fewer nest type to port. Changing the shape of in-flight checkpoints is acceptable; see P2.2 for versioning.

### P1.3 Boss framework (phases as data)

**Complexity:** Medium. **Helps:** new boss

- Bosses today are `UnitTag.Boss` (CC armour) plus `enrageDef` plus a bespoke AI tree (`alphaWolfBoss/`, `displacerBoss/`) plus an optional `deathSequence`.
- Add declarative phases on the def: HP or time thresholds, then swap the ability loadout or AI node, an optional transition (story pause / Time Stop, invulnerability window), spawn waves (via P1.2's spawner) and world modifier changes.
- Re-express the alpha wolf's and displacer's enrage as phases to prove the design, then build the Chapter 3 boss on it.
- Consider a reusable boss HUD (name and health bar, CC status already exists in `HudEffectLayer`).

### P1.4 Super move groundwork

**Complexity:** Medium. **Helps:** super moves, "strong attack that requires interruption"

- `SuperBar` exists but is enemy-only, ability-driven, with no passive gain and a hard max of 3.
- Before building player supers, settle with a short brainstorm: what charges the meter (damage dealt or taken, objectives, campaign resource spend), how "commitment of time" works (multi-round channels, vulnerability, interrupt rules shared with the enemy "strong attack" idea), and how battlefield-wide effects are expressed (`worldModifiers/` is the natural home).
- Engine pieces to expect: a player-facing super resource and UI slot, a channel CastBehaviour that spans rounds and can be interrupted, and a Time Stop or HUD banner presentation preset.

> [!DECISION] How do players earn and pay for super moves?
> This shapes the resource, the UI and the balance hooks, so it needs settling (ideally in a short `/brainstorming` session) before engine work starts.
>
> - **In-battle meter**: charged by damage dealt or taken and by objectives, like the enemy `SuperBar`. Self-contained, and easy to tune per mission.
> - **Campaign resource spend**: each use costs a campaign resource. That ties supers to the campaign economy, but players may hoard them.
> - **Both**: a campaign-level unlock or charge count plus an in-battle meter. The most flexible option, and the most UI.

### P1.5 Settle the research-variant ability pattern before new weapons copy it

**Complexity:** Medium (the pattern), Large (migrating all 24 remaining `doCardEffect` abilities)

- 24 abilities still use `doCardEffect` and 18 use `castBehaviours`. The Hard TODOs for ThrowRock, ThrowChargedRock and ThrowKnife are all blocked on the same missing piece: a research-aware projectile CastBehaviour pattern (different timings per research node).
- New Chapter 3 weapons will have research variants and will copy whatever pattern exists. Design that pattern and migrate those three throw abilities as reference implementations. The rest of the migration TODOs can stay opportunistic.

### [x] P1.6 Campaign resource registry (frontend and backend)

**Complexity:** Medium. **Prerequisite for P0.5, P0.6 and P0.7**

**Done (prerequisite for P0.5 and P0.6):** frontend `CAMPAIGN_RESOURCE_DEFS` in `campaignResources.ts` (key, label, colour, `missionBonus`, optional `knowledgeKey` / `signed`). `CampaignResourceKey` derives from it, and so do `CAMPAIGN_RESOURCE_KEYS`, `MISSION_BONUS_RESOURCE_KEYS`, `ZERO_CAMPAIGN_RESOURCES` and the knowledge gating. Icons stay in `ResourcePill.tsx`. Backend: public `Campaign::RESOURCE_KEYS` plus `SIGNED_RESOURCE_KEYS` for hunger, with every per-key block now a loop, `Campaign::zeroResources()`, and grant validation against the constant.

- Resource keys are hard-coded per key in `ZERO_CAMPAIGN_RESOURCES`, `sumLatestMissionResourceDeltas`, `campaignResourcesEqual` (`campaignResources.ts`), `ResourcePill` (`RESOURCE_ORDER` and the label table), `partyStoryGrants.ResourceDelta`, `storyChoiceOptions`, `researchCostPolicy`, and `Campaign.php` (spelled out key by key in four methods and its PHPDoc shapes).
- Replace these with a `CAMPAIGN_RESOURCE_DEFS` table (key, label, icon, colour, `knowledgeKey`, `isPenalty` for hunger) and loop over it, and loop over `RESOURCE_KEYS` in PHP. After that, renaming or adding a resource is data plus a migration.

### P1.7 Terrain and map visuals ready for new terrain types and grid maps

**Complexity:** Large. **Helps:** new terrain types, DnD-style grid maps

- Gameplay terrain is already data-driven: `TerrainType` plus `TERRAIN_PROPERTIES` (passability, speed, projectile rules, render strategy). The gaps:
  - `TerrainGrid.get()` returns Rock for out-of-bounds cells (an existing Medium TODO). Fix it before adding terrain types that abilities react to.
  - `TerrainRenderer.LAYER_ORDER` is a hard-coded list. Move the draw order into `TERRAIN_PROPERTIES`.
  - Only two render strategies exist (marching-squares, hard-edge), baked into one sprite.
- For grid maps, separate gameplay terrain from the map's look. A `MapSegment` (or mission) picks a map skin: the current procedural renderer, or a tiled/painted-image skin with a grid overlay. Battle logic keeps reading `TerrainGrid`.
- Expect terrain-editor palette work and a resync of segment JSON for new types. A short spike on the grid-map look is worth doing before committing to an approach.

> [!DECISION] Which approach for DnD-style grid maps?
> - **Map skin per segment**: a painted or tiled image per `MapSegment`, with a grid overlay. Gameplay terrain stays authored separately. This gives the best art and is the most authoring work per map.
> - **Tileset render strategy**: a new `renderStrategy` that draws each `TerrainType` from a tileset. Every existing map gets the new look for free, but it's less bespoke.
>
> Recommendation: spike the tileset strategy first, since it upgrades every existing map, then add per-segment skins for set pieces like the castle.

### [x] P1.8 Storyline and mission registry hygiene

**Complexity:** Low

**Done:** `MISSION_MAP` is now built automatically, using an eager `import.meta.glob` over `storylines/*/missions` and `*/questMissions`. Every exported `BaseMissionDef` instance is registered by its `missionId`, and a duplicate id throws. The result was checked to match the old hand-written map exactly (28 missions). `missionRegistry.test.ts` checks that every storyline start, edge, chapter, unlock and fixed quest-slot mission id resolves. The replay tool's mission dropdown now lists missions in file order. The `wod_ch3` stub removal stays with P0.1.

- `storylines/index.ts` hand-imports every mission into `MISSION_MAP` (and so does the quest-mission list). Chapter 3's questline will add many more. Register each storyline's own missions (`WorldOfDarkness/missions/index.ts`) or auto-discover them with `import.meta.glob`, with a test that every chapter and quest mission id resolves.
- Remove the legacy `wod_ch3` stub as part of P0.1 so the new chapter isn't built around stale ids.

### [x] P1.9 Item registry auto-discovery

**Complexity:** Low. **Helps:** new weapons

**Done:** `items/index.ts` now builds `ITEMS`, `ALL_PLAYER_ITEMS` and `ITEM_ICON_URLS` from an eager glob over `items/*/NNN_*.ts` and `items/assets/*`, keyed by `ItemDef.icon`. The core, pistol, SMG and shotgun imports stay, because `CORE_ITEM_IDS` and the default equipment name them. `ALL_PLAYER_ITEMS` is now ordered by item id, so Rocks and Torch swap places in admin lists. `itemRegistry.test.ts` checks there is one item per file, the ids are unique, and every icon resolves.

- `character_defs/items/index.ts` hand-imports each item and, separately, each icon (two imports per item, plus a lookup table). Use `import.meta.glob` for `items/**/NNN_*.ts` and `items/assets/*.svg` keyed by `ItemDef.icon`, with a test that every item's icon resolves.

---

## P2: Nice to do

### P2.1 Break up the largest files

**Complexity:** Large overall (do it opportunistically, one file at a time)

- `BattleNet.ts` (3,209 lines), `GameEngine.ts` (2,603), `BattleSession.ts` (1,691), `CharacterEditor.tsx` (1,675), `App.tsx` (1,633), `MissionMapTab.tsx` (1,593), `Game.tsx` (1,305).
- The one that matters most for Chapter 3 is `GameEngine`, because new systems get attached to its tick. Extract the tick phases when doing P1.2 rather than as a separate project.

### [x] P2.2 Checkpoint versioning and removing `CardManager`

**Complexity:** Medium

**Done:** `SerializedGameState.serializationVersion` (currently 1) has ordered raw-JSON upgrade steps in `game/serializedGameStateUpgrade.ts`, run first in `GameEngine.fromJSON`, so every load path is covered. A newer-than-build checkpoint throws `UnsupportedCheckpointVersionError`. `CardManager` was dead and is deleted; step 0 to 1 drops legacy `cards`. `toJSON` still writes an empty `cards: {}` for one release, so browsers on the previous build don't crash during a deploy (their `fromJSON` called `Object.entries(data.cards)`). The runtime fingerprint is an event hash, so the version can't cause false desyncs. The how-to is in the game-engine skill.

- `SerializedGameState` has no version field, so every serialization change (P1.2, P1.3) risks breaking battles that are mid-flight during a deploy. Add a version and a small upgrade step on `fromJSON`. That also unblocks the Hard TODO to drop `CardManager` and `cards` from checkpoints.

### P2.3 Time-system TODOs that boss and super presentation will want

**Complexity:** Medium

- Hit-stop is a no-op (`MeleeAttack` calls `requestHitPause(3)`), and death-sequence `storyPause` should become a Time Stop (both in `docs/TODO.md`). Boss phase transitions and super moves want both effects, so do them alongside P1.3 and P1.4.

### P2.4 Replace hard-coded `characterId` checks with tags or def flags

**Complexity:** Low

- For example `003_light_empowered` (`'boar'`), `005_monster` and `alphaWolfBoss_attack` (`'alpha_wolf'`), and `UnitRenderer` (`'lanternite_nest'`). Use `UnitTag` or a def flag so reskinned or new enemies get the same behaviour.

### [x] P2.5 Card definition folder convention

**Complexity:** Low

**Done:** `card_defs/SKILL.md` now documents one `NN_slug/` group folder per weapon line, core or enemy family (with `AbilityGroupId`). It also covers: crossovers live in the core that unlocks them, enemy abilities in `NN_enemy_<family>/`, super moves at index 90+ in their owner's folder (revisit after P1.4), and next-free-id rules. Legacy flat folders stay. The skill was trimmed under 200 lines, and the full earlier guidance is kept in `card_defs/ABILITY_GUIDE.md`. Layout inconsistencies found: `Healer` (04) is unused, group 00 is split between flat folders and `dark_animals/`, and `special/ChannelDarkness` is empty.

- `card_defs/` mixes flat `00xx`/`01xx`/`02xx` folders with grouped ones (`03_blood_mage`, `05_earth_core`, `dark_animals`, …). Pick the convention for Chapter 3 weapons (one group folder per weapon or core, with an id range) and document it in `card_defs/SKILL.md` before the new abilities land.

### [x] P2.6 Plan and doc hygiene

**Complexity:** Low

**Done:** 29 finished plans moved to `docs/plans/done/` with `git mv`, including two from the legacy `minion_battles/PLANS/` folder. Ten of them still have only manual browser checks unticked. The legacy folder is folded in and removed, and `docs/plans/` now holds 16 unfinished plans (most have only a manual browser check left). Path references in skills, AGENTS.md files, docs and code comments were updated. The shipped migration `M0001` still cites an old plan path; it was left on purpose, because editing a shipped migration changes its checksum.

- Plans now live in three places: `docs/plans/` (43 active files plus `done/`), `app/js/games/minion_battles/PLANS/`, and `docs/ideas/plans/`. Move finished `docs/plans` files into `done/`, fold `PLANS/` into `docs/plans/`, and keep `docs/ideas/plans/` for high-level roadmaps like this one.

### P2.7 Lazy-load missions and items

**Complexity:** Large (missions: splits every mission def and makes battle start async). Items: not worth doing.

Investigated, not implemented. P1.8 and P1.9 made both registries auto-discovered with eager `import.meta.glob`, so going lazy is mostly a matter of switching to non-eager globs. The hard part is everything that reads the registries synchronously.

- **What's loaded today:** everything in the game sits in one `minion_battles` chunk (2.06 MB minified in the last `dist/` build), loaded at startup because `App.tsx` imports the game statically. Missions are about 6.6k lines (`storylines/*/missions`, `*/questMissions`) plus about 0.9k lines of `MapSegments`, roughly 15% of the game's non-test source. Items are about 270 lines plus 9.5 KB of SVG icons.
- **Who reads them synchronously:** `MISSION_MAP` has 63 references in 24 files (`App.tsx`, `Game.tsx`, `BattleSession`, `battleBootstrap`, `MissionSelectPanel`, the mission map, quest resolution, replay). Item lookups (`getItemDef`, `ITEMS`, `ITEM_ICON_URLS`) have 73 references in 23 files, all render-time UI.
- **Missions, the shape that would work:** split each mission into eager **metadata** (id, name, campaign, map position, type, rewards, disabled, everything the campaign UI and quest resolution need) and a lazy **battle module** (terrain, spawns, AI, story scripts and objectives). Load the battle module with `await` in the battle start path, and before checkpoint resume and replay.
  - Pros: the campaign home screen downloads less, and new Chapter 3 missions don't grow the startup bundle.
  - Cons: every mission def needs splitting (28 today, more in Chapter 3); battle start, resume and replay become async; every multiplayer client must finish loading before the first tick (a new loading state and failure mode on a flaky connection); and tests that read `MISSION_MAP` synchronously need rewriting.
- **Items:** the payoff is a few KB, and every lookup is synchronous render code. Keep them eager.
- **Recommendation:** don't do per-mission lazy loading yet.
  - Measure first, with a bundle report (for example `rollup-plugin-visualizer` on `vite build`).
  - If startup size matters, the bigger and cheaper win is likely route-level splitting: load the battle engine, renderer and PixiJS only when entering a lobby or battle, via `React.lazy` around the battle phase.
  - Separate quick fix: the `pixi` rule in `vite.config.ts` `manualChunks` never fires, because the `node_modules` check runs first, so PixiJS ends up in `vendor`. Swap the order if PixiJS should get its own chunk.

---

## Suggested order

- **First:** P1.6 (resource registry), then P0.1 to P0.4 (enemy cleanup), then P0.5 to P0.7 in one migration, then P0.8.
- **Before new enemies and the boss:** P1.1, P1.2, P1.3, P1.8.
- **Before new weapons and supers:** P1.5, P1.9, P1.4 (brainstorm first).
- **Before new terrain and maps:** P1.7 (spike first).
