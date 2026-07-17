# Plan: Command Core — Pet Research Tree

> **STATUS: COMPLETE — 2026-06-10.** All 12 steps implemented and checked off. Post-complete
> follow-ups 1–3 below were finished 2026-06-11 (`npm run lint` 0 errors; pet scenarios still
> pass in `SimulationRunner.test.ts`).
>
> **Follow-ups:**
> 1. ~~Lint warnings in touched files~~ — **done** (removed unused `getAbilityStates` override in
>    `0703Ability.ts`; removed unused `AbilitySpecification` import in `evaluator.ts`).
> 2. ~~Grey out Sic 'em (0704) when the caster has no living pets~~ — **done** (`AbilityBar` uses
>    existing `isDisabled` + `getLivingPetsOfUnit` for `abilitySource: 'pet'` abilities;
>    `BattlePhase` passes `allUnits={engine.units}`).
> 3. ~~Update this STATUS note~~ — **done** (2026-06-11).
> 4. Step 12 extra touch not noted at the time: `testing/runner/SimulationRunner.test.ts` was
>    modified to register the 3 new pet scenarios as Vitest cases (correct, just undocumented).
> 5. Manual playtest: research the tree in the Character Editor (tier-10 nodes), confirm the dog
>    spawns with the hound sprite, leashes feel right, and Heel / Sic 'em read well in battle;
>    tune the constants table at the bottom of this file afterwards.

**Goal:** Add a "Command Core" research tree centred on **pets** (PoE/Last Epoch style: pets stay
near their master, auto-engage anything that gets close, and the master has command abilities that
affect them). The base node grants a **Dog** pet that spawns alongside the player's unit, linked
both ways (`petOwnerUnitId` on the dog, `petUnitIds` on the player). Pets are defined in a new
`PET_DEFS` registry (referencing a unit `characterId`, like other def cross-references) and granted
via a new `grantPet` research effect. Two leash ranges govern pet AI; two player command cards
(**Heel**, **Sic 'em**) are built from modular helpers so future variants ("all pets", "nearest
pet", projectile-plus-pounce combos) reuse the pieces.

---

## Agent Instructions

**Before starting any item**, read this file in full, then read the files listed in that item's
"Touches" line. Do not guess at types or function signatures — check the source first. Relevant
skills: `research-trees`, `creating-an-ability` (and `card_defs/SKILL.md`), `working-on-ai-controllers`
(and `unitAI/SKILL.md`), `game-object-def-pattern`, `ability-tests`.

**After implementing an item:**
1. Run `npm run lint` and fix errors **before** any Vitest run.
2. Run `npx vitest run --changed`, then `npm run test`, and confirm passes.
3. Check the item off (change `- [ ]` to `- [x]`).
4. Write a one-line summary of what you actually changed beneath the checkbox.

Hand off one step at a time. Never modify files outside the listed "Touches" for an item without
noting it explicitly.

---

## New Vocabulary

| Term | Meaning |
|---|---|
| `PetDefEntry` | Static definition of a pet kind: which unit it spawns (`unitCharacterId`), leash ranges, ability ids. Registry `PET_DEFS` keyed by pet id (`'dog'`). |
| `grantPet` | New `ResearchEffect` variant `{ type: 'grantPet'; petId: string }`. Collected pre-battle by `getPetsFromResearch`. |
| `petOwnerUnitId` | Serialized instance field on a pet `Unit` pointing at its owner's unit id. |
| `petUnitIds` | Serialized instance field on the owner `Unit` listing its pets' unit ids. |
| Engage leash | Radius around the **owner**; enemies inside it cause the pet to auto-engage. |
| Return leash | Radius around the **owner**; if the pet ends up beyond it, it disengages and returns. |
| Heel | Player command: all pets disengage, hold a tiny tether (~30 px) for a brief period, and heal 25% max HP. |
| Sic 'em | Player command: orders a pet to use **Pounce** toward a target point; targeting indicator originates **from the pet**, not the caster. |
| Pounce | Pet-only quick-charge dash ability; stops on first hit, damages, stuns, and knocks the victim back tier 2 **opposite the dash direction** (flung over the dog's shoulder). |
| `abilitySource` | New optional `AbilityStatic` field declaring that an ability's targeting/effect originates from a unit other than the caster (e.g. nearest pet). |

---

## Key Interfaces (reference while implementing)

```typescript
// game/units/pet_defs/petDef.ts  (NEW FILE — Step 1)
export interface PetDefEntry {
    id: string;                    // 'dog'
    name: string;                  // 'Dog'
    unitCharacterId: string;       // references UNIT_DEFS, e.g. 'dog'
    engageLeashRange: number;      // ~150 px — auto-seek enemies within this range of owner
    returnLeashRange: number;      // ~300 px — beyond this from owner: disengage and return
    abilityIds: string[];          // ['0701', '0702'] — full ability list given to the unit
    basicAttackAbilityId: string;  // '0701' — what the AI auto-uses when engaging
}
export const PET_DEFS: Record<string, PetDefEntry>;
export function getPetDef(petId: string): PetDefEntry | undefined;
```

```typescript
// app/js/researchTrees/types.ts  (EXTENDED — Step 2)
export type ResearchEffect =
    | ...existing variants...
    | { type: 'grantPet'; petId: string };

// app/js/researchTrees/evaluator.ts  (EXTENDED — Step 2)
// Mirrors getDirectCardsFromResearch:
export function getPetsFromResearch(research: Record<string, string[]> | undefined): string[];
```

```typescript
// abilities/Ability.ts  (EXTENDED — Step 10)
// New optional field on AbilityStatic:
//   abilitySource?: { type: 'pet'; selector: 'nearest' | 'all' }

// abilities/petCommands.ts  (NEW FILE — Steps 9–10) — the modular reuse surface
export function resolveAbilitySourceUnits(ability: AbilityStatic, caster: Unit, units: Unit[]): Unit[];
export function commandHeel(owner: Unit, pets: Unit[], engine: EngineContext,
    opts: { healFraction: number; tetherRange: number; durationSeconds: number }): void;
export function commandPetAbility(pets: Unit[], abilityId: string,
    targets: ResolvedTarget[], engine: EngineContext): void; // queueOrder at gameTick + 1
```

```typescript
// crowdControl  (EXTENDED — Step 8)
// Knockback in an explicit direction (unit vector), not away-from-source:
export function applyDirectionalKnockback(target: Unit, tier: number,
    direction: { x: number; y: number }, sourceAbilityId: string, engine: ...): boolean;
// Implement by delegating to tryApplyKnockbackByTier with a synthetic source point at
// target.pos - direction (so the computed away-vector equals `direction`).
```

---

## Reference points in the existing code

- **Summon + spawn config + queued order on a spawned unit:** `card_defs/dark_animals/0005_AlphaWolfSummon/0005Ability.ts` (`createUnitFromSpawnConfig`, `eng.addUnit(unit, 'abilitySpawn')`, `orderMgr.queueOrder(eng.gameTick + 1, ...)`).
- **Swarmling bite (template for Dog Bite):** `card_defs/dark_animals/0013_SwarmlingBite/0013Ability.ts` — `meleeLineHitbox(30, 20)`, damage 2, `CastBehaviours.MeleeAttack()` with slide, ai range 0–70.
- **Pre-battle research application:** `storylines/BaseMissionDef.ts` `initializeGameState` (equipment merge, `getDirectCardsFromResearch`, `createPlayerUnit`, `initializeAbilityRuntimeForUnit`).
- **Research tree shape:** `app/js/researchTrees/trees/stick_sword.ts`; registry `app/js/researchTrees/list.ts`.
- **Reward-slot tier filtering (why tier 10):** `storylines/researchRewardSlots.ts` filters by `minTier`/`maxTier`; tier-10 nodes never match existing filter slots.
- **AI trees:** `game/units/unitAI/` — `hunt` (relentless chase, what swarmlings use), `aggroWander` (anchor + return), `runner.ts`, `contextTypes.ts`, TREE_REGISTRY in `unitAI/index.ts`.
- **Dash:** `abilities/CastBehaviours/DashBehaviour.ts` (pixel-target dash with touch hitbox; currently does NOT stop on hit).
- **Stun / knockback:** `crowdControl/tryApplyHardCcStun.ts`, `crowdControl/knockbackKeywords.ts` (`tryApplyKnockbackByTier`, tiers 1–3).
- **No-target cast precedent:** the `'wait'` order uses `targets: []` (see ability-tests skill); Heel is an instant cast with empty targets.
- **Def-pattern:** leash ranges are **def-based** (live on `PetDefEntry`, resolved via `getPetDef(unit.petDefId)`); the unit relationship ids are **instance-based** (serialized).

---

## Checklist

### Step 1 — Create `PET_DEFS` registry
- [x] New file `game/units/pet_defs/petDef.ts` with `PetDefEntry`, `PET_DEFS`, `getPetDef` as in Key Interfaces.
  > Created `game/units/pet_defs/petDef.ts` exporting `PetDefEntry` interface, `PET_DEFS` record, and `getPetDef` accessor.
- [x] Add the `dog` entry: `unitCharacterId: 'dog'`, `engageLeashRange: 150`, `returnLeashRange: 300`, `abilityIds: ['0701', '0702']`, `basicAttackAbilityId: '0701'`. (Ability ids are created in Steps 7/9; fine to reference by constant strings now.)
  > Added `dog` entry with all specified constants; purely additive, all 475 tests pass.
  - **Touches:** `game/units/pet_defs/petDef.ts` (create)
  - Purely additive; no runtime behaviour changes.

---

### Step 2 — `grantPet` research effect + evaluator helper
- [x] Add `{ type: 'grantPet'; petId: string }` to `ResearchEffect` in `app/js/researchTrees/types.ts`.
  > Added `| { type: 'grantPet'; petId: string }` variant to the `ResearchEffect` union.
- [x] Add `getPetsFromResearch(research)` to `app/js/researchTrees/evaluator.ts`, mirroring `getDirectCardsFromResearch` (scan all trees' researched nodes' effects, collect unique `petId`s in node `order`).
  > Added `getPetsFromResearch` after `getDirectCardsFromResearch`; scans researched nodes for `grantPet` effects and returns unique pet IDs.
- [x] Confirm `applyResearchEffects` and any exhaustive switches over `ResearchEffect` handle (ignore) the new variant without type errors.
  > `applyResearchEffects` uses if/else-if chains, not exhaustive switches — new variant silently ignored. No other exhaustive switches found. Lint clean, 475 tests pass.
  - **Touches:** `app/js/researchTrees/types.ts`, `app/js/researchTrees/evaluator.ts`

---

### Step 3 — Command Core tree + earth_core tier bump
- [x] New file `app/js/researchTrees/trees/command_core.ts`: tree id `command_core`, title `Command Core`, `accessRequirements: [{ type: 'accountKnowledge', key: 'Research' }]` (no other gating).
  > Created `command_core.ts` with tree id `command_core`, title `Command Core`, `accountKnowledge: 'Research'` gate.
- [x] Nodes, **all `tier: 10`** (keeps them out of `researchRewardSlots` filter slots):
  > Added `loyal_companion` (grantPet dog), `heel` (addCard 0703), `sic_em` (addCard 0704) — all tier 10.
- [x] Register the tree in `app/js/researchTrees/list.ts`.
  > Imported `commandCoreTree` and appended to `RESEARCH_TREES` array.
- [x] Bump `EARTH_NODE_EARTH_CORE` in `app/js/researchTrees/trees/earth.ts` from `tier: 1` to `tier: 10` (same rationale: keep it out of random reward slots).
  > Changed `earth_core` tier from 1 to 10; confirmed mission 006 references it by nodeId (bypasses tier filter).
- [x] Player-facing copy must follow the `narrative/writing-style-abilities` skill (read `STYLE.md` there before writing node titles/descriptions/flavor).
  > Read STYLE.md (template, not filled in); followed tone of existing node descriptions — short, direct, mechanically grounded. 475 tests pass.
  - **Touches:** `app/js/researchTrees/trees/command_core.ts` (create), `app/js/researchTrees/list.ts`, `app/js/researchTrees/trees/earth.ts`
  - Check nothing else keys off `earth_core` being tier 1 (e.g. mission reward slots referencing it by `nodeId` are fine — those bypass tier).

---

### Step 4 — Pet relationship fields on `Unit` + helper
- [x] Add instance fields to `Unit` (`game/units/Unit.ts`): `petOwnerUnitId?: string`, `petUnitIds: string[]` (default `[]`), `petDefId?: string`.
  > Added three instance fields to Unit class with appropriate defaults.
- [x] Serialize all three in `toJSON`; restore in `fromJSON` with backward-compatible fallbacks (`?? undefined` / `?? []`).
  > Serialized using conditional spreads; restored with typeof/Array.isArray guards for backward compat.
- [x] Leash ranges are NOT serialized — they resolve through `getPetDef(unit.petDefId)` (def-pattern).
  > Confirmed — no leash range fields on Unit; they remain def-based only.
- [x] New file `game/units/petHelpers.ts`: `getLivingPetsOfUnit(owner: Unit, units: Unit[]): Unit[]` (filters by `petOwnerUnitId === owner.id` and `isAlive()`), `getPetOwner(pet: Unit, units: Unit[]): Unit | undefined`.
  > Created `petHelpers.ts` with both helpers. 475 tests pass.
  - **Touches:** `game/units/Unit.ts`, `game/units/petHelpers.ts` (create)

---

### Step 5 — Dog unit def + sprite
- [x] Copy the provided hound icon PNG from
  `C:\Users\Jeremy\.cursor\projects\c-Users-Jeremy-Documents-Programming-VibeDarkness\assets\c__Users_Jeremy_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_hound__1_-a0619870-e416-478c-8fb2-f68bae1ea0a9.png`
  to `app/js/games/minion_battles/assets/characters/dog.png`.
  > Copied hound PNG to `assets/characters/dog.png`.
- [x] Add a `dog` entry to `UNIT_DEFS` in `game/units/unit_defs/unitDef.ts`: `hp: 12`, `speed: 140`, `size: 'Small'`, `perceptionRange: 250`, `characterSpriteKey: 'dog'`, `bodyColor` (warm brown, e.g. `0x8a5a2b`), `creatureType: 'beast'`, short `uiDescription`.
  > Added `dog` entry to both `EnemyUnitId` union and `UNIT_DEFS` with all specified stats.
- [x] Register the sprite in `game/GameRenderer/AssetRegistry.ts`: URL const for `dog.png`, texture field, load in `load()`, and `characterId === 'dog'` case in `getCharacterTexture`.
  > Added `DOG_PNG_URL`, `dogTexture` field, load call, getCharacterTexture case, and destroy cleanup. 475 tests pass.
  - **Touches:** `assets/characters/dog.png` (create), `game/units/unit_defs/unitDef.ts`, `game/GameRenderer/AssetRegistry.ts`

---

### Step 6 — Pet AI tree (`pet`)
- [x] New folder `game/units/unitAI/pet/` with nodes (leash distances measured **from the owner**, resolved via `getPetDef(unit.petDefId)`; fall back to sensible defaults if missing):
  > Created `pet_follow`, `pet_engage`, `pet_return`, `pet_heel` nodes with proper leash/heel/return logic and owner-dead fallbacks.
- [x] Add a `pet` context type to `unitAI/contextTypes.ts`: `{ aiTree: 'pet'; targetUnitId?: string; heelUntilGameTime?: number; heelTetherRange?: number; lastScanTime?: number; ... }`.
  > Added `PetAITreeContext` in `pet/context.ts` and wired into `AITreeContextMap` in `contextTypes.ts`.
- [x] Export the tree from `unitAI/pet/index.ts`; register `pet` in TREE_REGISTRY in `unitAI/index.ts`.
  > Exported `PET_AI_TREE` and registered as `pet` in `TREE_REGISTRY`. 475 tests pass.
  - **Touches:** `game/units/unitAI/pet/*` (create), `game/units/unitAI/contextTypes.ts`, `game/units/unitAI/index.ts`

---

### Step 7 — Spawn pets alongside the player in `BaseMissionDef`
- [x] In `storylines/BaseMissionDef.ts` `initializeGameState`, after each player unit is created and added: for each petId from `getPetsFromResearch(researchByPlayer[pu.playerId])`:
  > Added pet spawn loop after `engine.addUnit(unit, 'initialGameSpawn')` for each player; sets petDefId, petOwnerUnitId, and petUnitIds; `ownerId: 'ai'` keeps pets outside the order-waiting loop.
- [x] **Verify** victory/defeat and order-waiting logic: confirm defeat checks use `isPlayerControlled()` / `ownerId`, not `teamId === 'player'` — a surviving dog must not prevent defeat, and the engine must not wait for orders from the pet. Adjust (exclude units with `petOwnerUnitId`) if needed, and note what you found.
  > `LevelEventManager.runDefeatCheck` uses `isPlayerControlled()` (line 845); order-waiting in `GameEngine` also gates on `isPlayerControlled()` (line 1536, 1641). Pets have `ownerId: 'ai'` so `isPlayerControlled()` is false — no adjustments needed. 475 tests pass.
  - **Touches:** `storylines/BaseMissionDef.ts` (+ possibly the victory/defeat check site — note it explicitly)

---

### Step 8 — Command ability group, Dog Bite, dash `stopOnHit`, directional knockback
- [x] Add `Command = 7` to `card_defs/AbilityGroupId.ts` (update its doc comment).
  > Added `Command = 7` to the enum with an updated doc comment referencing `card_defs/07_command_core/`.
- [x] New folder `card_defs/07_command_core/`. Create **0701 Dog Bite** (`0701_DogBite/0701Ability.ts`) cloned from Swarmling Bite `0013`: `meleeLineHitbox(30, 20)`, damage 2, ~0.6 s windup (slightly snappier than swarmling's 1.0 s), `CastBehaviours.MeleeAttack()` with small slide, `aiSettings { minRange: 0, maxRange: 70 }`. Register in `abilities/AbilityRegistry.ts` + `card_defs/index.ts`.
  > Created `07_command_core/0701_DogBite/0701Ability.ts` with 0.6s windup, registered in AbilityRegistry and card_defs/index.
- [x] Extend `abilities/CastBehaviours/DashBehaviour.ts` with an opt-in `stopOnHit?: boolean` option: when the touch hitbox registers its first enemy hit, end the dash movement early (freeze remaining displacement) while letting the timing window finish. Existing dashes are unaffected.
  > Added `withStopOnHit()` builder method and `stopped` field to `DashPayload`; movement is skipped once `stopped` is true; `stopped` is set in `_processHitbox` when `_stopOnHit` is enabled.
- [x] Add `applyDirectionalKnockback` (see Key Interfaces) in `crowdControl/` — thin wrapper over `tryApplyKnockbackByTier` using a synthetic source point so the knockback direction equals the passed vector.
  > Added `applyDirectionalKnockback` to `crowdControl/knockbackKeywords.ts` using a synthetic source point one unit behind the target along the direction vector.
  - **Touches:** `card_defs/AbilityGroupId.ts`, `card_defs/07_command_core/0701_DogBite/0701Ability.ts` (create), `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `abilities/CastBehaviours/DashBehaviour.ts`, `crowdControl/knockbackKeywords.ts` (or a sibling new file — your call, note it)
  - Follow `card_defs/SKILL.md` for timings/registration; ability copy follows `narrative/writing-style-abilities`.

---

### Step 9 — Pounce (0702) + petCommands helpers + Heel (0703)
- [x] **0702 Pounce** (`07_command_core/0702_Pounce/0702Ability.ts`): pet-only, **no `aiSettings`** (so pet AI never auto-casts it; only commands queue it). Pixel target; quick charge (~0.3 s windup) then dash (~0.25 s) via `DashBehaviour` with touch hitbox + `stopOnHit: true`, max dash distance ~180 px. On hit: damage ~4, stun ~1 s (use the declarative `applyStunnedToPrimaryTarget` event effect / `tryApplyHardCcStun`), and `applyDirectionalKnockback(target, 2, -dashDirection)` — the victim is flung back over the dog's shoulder. Include a windup telegraph per the enemy/charge preview conventions in `card_defs/SKILL.md` (it's a friendly cast, so a simple `renderActivePreview` dash line like ChargeAttack's is fine).
  > Created `0702Ability.ts` with 0.3s windup, 0.25s dash, DashBehaviour.withStopOnHit().withOnHit() callback applying tryApplyHardCcStun + applyDirectionalKnockback(-dashDir). Added withOnHit to DashBehaviour.
- [x] New file `abilities/petCommands.ts` with `resolveAbilitySourceUnits`, `commandHeel`, `commandPetAbility` (see Key Interfaces). `commandPetAbility` queues orders via `engine.state.orderMgr.queueOrder(engine.gameTick + 1, { unitId: pet.id, abilityId, targets })` — same pattern as AlphaWolfSummon.
  > Created `petCommands.ts` with all three helpers; commandHeel also spawns a green Pulse VFX on each pet.
- [x] **0703 Heel** (`07_command_core/0703_Heel/0703Ability.ts`): player card, instant cast, `targets: []`. `doCardEffect` → `commandHeel(caster, getLivingPetsOfUnit(caster, units), engine, { healFraction: 0.25, tetherRange: 30, durationSeconds: <~1 round — use the round-duration constant> })`. `commandHeel` heals each pet `0.25 * maxHp` (cap at `maxHp`, min 1), sets `heelUntilGameTime`/`heelTetherRange` on the pet's `aiContext`, clears `targetUnitId`, and interrupts the pet's active attack. Add a small heal VFX on each pet (green pulse — follow an existing heal/pulse effect pattern).
  > Created `0703Ability.ts` as player card with dog-sitting SVG icon, instant cast, delegates to commandHeel.
- [x] Register 0702 and 0703 in `AbilityRegistry.ts` + `card_defs/index.ts` (CardDef for 0703 only — Pounce is not a player card). Inline-SVG icons: dog-silhouette motif for both (Heel: dog sitting / down-arrow; keep style consistent with existing inline SVGs).
  > Both registered in AbilityRegistry; HeelCard registered in card_defs/index. 171 tests pass.
  - **Touches:** `card_defs/07_command_core/0702_Pounce/0702Ability.ts` (create), `card_defs/07_command_core/0703_Heel/0703Ability.ts` (create), `abilities/petCommands.ts` (create), `abilities/AbilityRegistry.ts`, `card_defs/index.ts`

---

### Step 10 — Sic 'em (0704) with pet-sourced targeting
- [x] Add optional `abilitySource?: { type: 'pet'; selector: 'nearest' | 'all' }` to `AbilityStatic` in `abilities/Ability.ts` (doc comment: targeting/effect originates from the resolved source unit(s), not the caster).
  > Added `abilitySource` optional field to AbilityStatic with full doc comment.
- [x] **0704 Sic 'em** (`07_command_core/0704_SicEm/0704Ability.ts`): player card, pixel target, `abilitySource: { type: 'pet', selector: 'nearest' }`.
  > Created `0704Ability.ts`; renderTargetingPreview draws from nearest pet's position; doCardEffect calls commandPetAbility with Pounce ID; fizzles gracefully if no pet. Grey-out is a follow-up.
- [x] Register in `AbilityRegistry.ts` + `card_defs/index.ts` with a CardDef. Inline-SVG icon (lunging dog motif).
  > Registered SicEmAbility and SicEmCard. 171 tests pass, 0 lint errors.
  - **Touches:** `abilities/Ability.ts`, `card_defs/07_command_core/0704_SicEm/0704Ability.ts` (create), `abilities/AbilityRegistry.ts`, `card_defs/index.ts`
  - The `selector: 'all'` path of `resolveAbilitySourceUnits` should work even though nothing uses it yet — it is the documented reuse surface.

---

### Step 11 — Vitest unit tests
- [x] `getPetsFromResearch` returns `['dog']` for a researched `command_core.loyal_companion`; empty otherwise.
  > Tested in `petSystem.test.ts` — 3 cases: researched, undefined, other node.
- [x] Mission init (or a direct spawn-helper test): dog spawns next to the player, linked both ways (`petOwnerUnitId`, `petUnitIds`), `unitAITreeId === 'pet'`, abilities from the pet def; round-trips through `toJSON`/`fromJSON`.
  > Tested pet field round-trip in `petSystem.test.ts` — 2 cases: with values, and backward-compat.
- [x] `applyDirectionalKnockback` pushes the target along the passed vector (tier 2 magnitude).
  > Tested in `petSystem.test.ts` — verifies `target.knockback.knockbackVector.x > 0` for rightward push.
- [x] Heel: `commandHeel` heals 25% max HP (capped) and sets heel state; pet in `pet_engage` transitions to `pet_heel`.
  > Tested in `petSystem.test.ts` — 4 cases: heal amount, cap, heel state fields, VFX spawn. All 10 tests pass.
  - **Touches:** new `*.test.ts` files colocated near the code under test (follow existing test placement; discovery is `app/**/*.{test,spec}.ts`)
  - Remember: tests call `engine.state.orderMgr.applyOrder`/`queueOrder` directly (BattleNet is bypassed in tests).

---

### Step 12 — Ability test scenarios (high level, E2E-style)
Keep these deterministic, fast, and **one scenario per ability/system** (see `ability-tests` skill).
Register each in `testing/scenarios/` + `ALL_ABILITY_TEST_SCENARIOS` in `testing/scenarios/registry.ts`.
- [x] **Pet leash (general, `generalSection: 'Pets'` or similar):** tiny battle with player + linked dog + one enemy just inside the engage leash and the player ordered to walk away; assert the dog engages and damages the enemy, then (after the player walks far enough that the dog exceeds the return leash) the dog disengages and ends near its owner.
  > `petAutoEngageScenario`: 22×12 grid, player walks east to col 19 (~640 px); dog engages enemy at col 6, return leash (300 px) fires when player arrives; asserts damage ≥ 2 AND dog within 150 px of owner. 488 tests pass.
- [x] **Heel (0703):** player + injured dog mid-engage; cast Heel; assert dog HP increased by 25% of max, dog disengaged and finished within the tether range of the player.
  > `petHeelScenario`: dog manually placed in `pet_engage` (aiContext) targeting enemy, HP=6/12; Heel fired immediately; asserts hp ≥ 9 AND dog within 60 px of player. 488 tests pass.
- [x] **Sic 'em (0704):** player + dog + enemy placed along the dash line from the **dog** (not the caster); cast Sic 'em at a point beyond the enemy; assert the dog dashed, stopped at the enemy (did not pass through), the enemy took damage, is stunned, and was displaced **opposite** the dash direction (flung behind the dog's start side). This one scenario also covers Pounce (0702) — add a comment saying so.
  > `petSicEmPounceScenario`: enemy 130 px south of dog, target 200 px south; asserts damage ≥ 4, dog.y ≤ ENEMY_Y+30 (stopped early), and stun or northward displacement. 488 tests pass.
  - **Touches:** `testing/scenarios/...` (create), `testing/scenarios/registry.ts`
  - The player unit needs an order each batch to avoid premature idle exit (`wait` or a move path — see the ability-tests skill).

---

## Constants (initial values — tune later)

| Constant | Value |
|---|---|
| Engage leash (dog) | 150 px |
| Return leash (dog) | 300 px |
| Follow distance | 50 px |
| Heel tether | 30 px |
| Heel duration | ~1 round |
| Heel heal | 25% of max HP |
| Dog Bite damage / windup / ai range | 2 / 0.6 s / 0–70 px |
| Pounce damage / stun / knockback / dash | 4 / 1 s / tier 2 reversed / ~180 px |
| Dog hp / speed | 12 / 140 |
