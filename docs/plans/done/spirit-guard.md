# Spirit Guard — Implementation Plan

**Completed 2026-11-23:** shipped the exile system (`UnitManager.exiledUnits`, `engine.exileUnit` / `returnExiledUnit`, `unit_exiled` / `unit_returned`, serialized); `ShieldBuff` `refillFloor` / `expiresAtGameTime` / `linkedExiledUnitId`, a Command theme and the `createGuardShield` preset with the spirit-mote glow; the Guard card (`0712`) with its return listener; Order: Move removed; Loyal Companion grants Guard. Tests ran once at the end (Sonnet workers): 137/140 unit tests on the first run, 3 test-setup mistakes fixed, then 140/140; sim 201/201, including the two new `pet_guard_*` scenarios. The orchestrator then stopped Guard from picking its own target as the guarding spirit (when the ally is a spirit or clone); `0712Ability.test.ts` 7/7 after that. Follow-ups: the manual browser checklist; numbers (10 s, 300 px, 1 use per round) are first-pass values.

Goal: replace **Order: Move** (`0709`) and its **Guard** mode (`0712`) with one new card, **Guard**. Guard needs an unoccupied spirit and targets an ally or the caster. The spirit leaves the map (it is **exiled**, not deleted), and the target gets a **guard shield** that never drops below **2** per guarding spirit: a hit uses it up, then it refills to 2 at once, so every hit is reduced by 2 (a 5-damage hit deals 3). Two spirits guarding one unit give a floor of 4. Shield from other sources stacks on top and is never reset down. While shielded, the unit glows with the spirit's motes. When the shield ends, the spirit reappears at the shielded unit's position, emerging from it.

## Architecture

Three engine pieces, then the card as their first user. Each one is a property or system other content can reuse.

### 1. Exile: units temporarily out of play (`game/managers/UnitManager.ts`, new `game/units/exile.ts`)

- `UnitManager` gets an **`exiledUnits`** list beside `units`: `ExiledUnitRecord { unit: Unit; reason: string; exiledAtGameTime: number; returnAtGameTime: number | null; anchorUnitId: string | null }`. An exiled unit is **not** in `units`, so ticks, AI, collision, rendering, targeting and pet lookups (`getPetsOfUnit` scans `units`) all skip it with no special cases.
- One entry point each, on the engine: **`exileUnit(unit, opts)`** (cancels its casts, clears movement, moves it to `exiledUnits`, emits `unit_exiled`) and **`returnExiledUnit(unitId, at)`** (puts it back in `units` at `at`, emits `unit_returned` for VFX). `getExiledUnit(id)` and `getExiledUnits()` for lookups. `getUnit(id)` keeps returning only units in play.
- **Returns are data-driven.** The engine checks exiled records each tick. A record with `returnAtGameTime` reached returns at its `anchorUnitId`'s position (or where it left, if the anchor is gone). A record whose anchor dies returns at once, at the anchor's last position. Guard sets `returnAtGameTime: null` and returns the spirit itself when its shield ends (see 2), so the timer is only a fallback for other users.
- Serialized: `exiledUnits` round-trips through `UnitManager.toJSON` / `restoreFromJSON` (as an optional extra key on the snapshot, so old snapshots load). Deterministic order.
- A pet's owner keeps it in `petState.unitIds`. An exiled pet is never "free", because it is not in `units`.
- **Clones** (Displacement Strike) may guard. An exiled unit with an `ephemeralDespawnAtGameTime` that has passed returns and then expires as usual (`returnAtGameTime = min(own timer, despawn time)` when exiling).

### 2. Guard shield: a refilling, timed, linked shield (`buffs/ShieldBuff.ts`, `game/units/unitShield.ts`)

Extend `ShieldBuff` with data, not a new damage path:

- **`refillFloor`** (default 0): after `applyDamageToShields` takes from this shield, its `remainingHp` is set back to `max(remainingHp, refillFloor)` immediately, still inside the same hit (the loop has already moved past it, so a hit is reduced once per shield). Several guard shields each refill their own 2, so the floors add up. Other shields keep their own HP, so extra shield is never reset down.
- **`expiresAtGameTime`** (optional): the shield also expires at that time. Today shields expire only at 0 HP; a refilling shield never reaches 0, so it needs this.
- **`linkedExiledUnitId`** (optional): in `onBeforeExpire`, return that exiled unit at the holder's position. If the holder dies first, the exile's `anchorUnitId` rule (1) returns it. Either path returns the unit exactly once (`returnExiledUnit` on a unit that isn't exiled does nothing).
- Theme **`'command'`** for the shell colour (Command palette), plus a **`particleAura`** set to the spirit's `BUFF_PARTICLE_AURA_PRESETS.spiritMotes()`, so the holder glows like the spirit. Both are only set by the guard preset.
- A named preset, **`createGuardShield({ floor, seconds, guardianUnitId, source })`**, builds it.
- Serialized: the new fields round-trip (`ShieldBuff` serialization + `buffRegistry`).
- The shield bar (`getTotalShieldHp`) already sums every shield, so the HUD shows the floor with no extra work.

### 3. Guard card (`card_defs/07_command_core/0712_Guard/`, reusing id `0712`)

- A command card on the Sic 'em pattern (not a zero-frame special): `abilitySource: { type: 'pet', selector: 'nearest', requireFree: true }`. One select target: a **unit**, `filter` allies including the caster, within **300 px** of the caster. With no free spirit it fizzles. Short cast (0.1 s) and 0.4 s cooldown on the owner; **1 use, `roundCharge` recovery**.
- On cast: Command cue from owner to spirit, the spirit plays a vanish (pulse at its position) and is **exiled** (`reason: 'guard'`, `anchorUnitId: target`). The target gets `createGuardShield({ floor: 2, seconds: GUARD_SECONDS, guardianUnitId: spirit.id })`.
- On return: the spirit appears at the target with an emerge pulse and fade-in, and **guards its owner** again (`commandPetGuard`), as Guard used to do.
- Tooltip per STYLE.md, e.g. `Your spirit shields an ally for {10}s` plus a **Guard Shield** glossary reminder: `Shield that refills to {2} after every hit`. Flavour line.

### Removals

- Delete **Order: Move** (`0709`): its card, registration, `card_defs/index.ts` entry, the `move`/`guard` ability modes, and `commandPetOrderMove` with its tests if nothing else uses it. Keep `commandPetGuard` (used on return) and the pet AI's anchor logic (other commands use it).
- Replace the old zero-frame Guard (`0712`) with the new card.
- **Loyal Companion** grants `0712` instead of `0709`; its description stops naming Order: Move.

## Numbers (first pass — tune in playtest)

| Constant | Value |
|---|---|
| Shield floor per spirit | 2 |
| Guard duration | 10 s (one round) |
| Target range from caster | 300 px |
| Uses / recovery | 1 use, `roundCharge` 1 |

## Key existing code index (under `app/js/games/minion_battles/` unless noted)

| Concern | Location |
|---|---|
| Units list, serialization | `game/managers/UnitManager.ts` (`units`, `toJSON`, `restoreFromJSON`), `game/GameEngine.ts`, `game/GameState.ts`, `game/EngineContext.ts`, `game/EventBus.ts` |
| Shields | `buffs/ShieldBuff.ts`, `game/units/unitShield.ts`, `game/units/unitDamage.ts`, `buffs/buffRegistry.ts`, `buffs/ShieldBuff.test.ts`, `game/units/unitShield.test.ts` |
| Buff hooks / auras | `buffs/Buff.ts` (`onBeforeExpire`, `particleAura`), `game/effects/buffParticleAura.ts`, spirit preset `BUFF_PARTICLE_AURA_PRESETS.spiritMotes` (used by the dog in `game/units/unit_defs/unitDef.ts`) |
| Old cards | `card_defs/07_command_core/0709_OrderMove/`, `0712_Guard/`, `abilities/AbilityRegistry.ts`, `card_defs/index.ts` |
| Pet commands | `abilities/petCommands.ts` (`commandPetGuard`, `commandPetOrderMove`, `playCommandCues`), `abilities/abilitySourceUnits.ts` |
| Command card pattern | `card_defs/07_command_core/0704_SicEm/0704Ability.ts`, `0715_DisplacementStrike/0715Ability.ts` |
| Fade / pulse VFX | `unit_fade_in` event (Phantom Decoy, `card_defs/dark_animals/0019_PhantomDecoy/`), Command pulse in `0716_DisplacementStrikePet/` |
| Tree | `app/js/researchTrees/trees/command_core.ts` (Loyal Companion) |
| Glossary | `abilities/keywords/keywordRegistry.ts` |
| Tests touching the old cards | `abilities/abilityTooltipLines.test.ts`, `game/specialAction.test.ts`, `game/units/spiritAnimal.test.ts` |
| Pet AbilityTests | `testing/scenarios/general/pets.ts`, `testing/scenarios/registry.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`; its workflow is not restated here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously**, waits for it to finish, then moves to the next step, and finally reports plan completion to the user. Workers run on **Sonnet 5.5** (user request). Each worker implements **exactly one step**, checks off its items with a one-line summary under each, and **stops without spawning the next agent**.

Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first: exile and the refilling shield are engine pieces; Guard is their first user.

Project skills relevant to this plan (workers invoke the ones matching their step):
- `working-on-minion-battles` — always.
- `game-engine` + `game-object-def-pattern` — Steps 1–2 (manager state, serialization, buff fields).
- `creating-an-ability` + `editing-card-behaviour` — Step 3.
- `research-trees` — Step 3 (Loyal Companion).
- `writing-style-abilities` (`.claude/skills/narrative/writing-style-abilities/STYLE.md`) — Step 3 copy.
- `ability-tests` — Step 4.

**Verification cadence (user request): tests run once, at the end.** Steps 1–3 write their test files but **do not run Vitest**; each runs only `npm run lint:changed` and `npx tsc --noEmit`. Each step's `Verify:` line lists the files Step 4 runs. Step 4 runs them all once, then `npm run test:sim` once, and fixes failures. No `npm run test:all`.

---

### Step 1 — Exile system

Files: `game/managers/UnitManager.ts`, new `game/units/exile.ts` (+ `exile.test.ts`), `game/GameEngine.ts`, `game/EngineContext.ts`, `game/EventBus.ts`, `abilities/AbilityEngineContext.ts` (if abilities need the entry points), `game/managers/AGENTS.md` or the nearest AGENTS.md.

- [x] `ExiledUnitRecord` + `exiledUnits` on `UnitManager`, with `exileUnit` / `returnExiledUnit` / `getExiledUnit` / `getExiledUnits` exposed on the engine and `EngineContext`. Exiling cancels the unit's casts (no refund) and clears movement; returning places it at the point, clears movement and AI targets, and emits `unit_returned`. `unit_exiled` / `unit_returned` added to `EventBus` types.
    - Done: `game/units/exile.ts` (record, `exileUnitFrom`, `returnExiledUnitTo`), `UnitManager.exileUnit/returnExiledUnit/getExiledUnit/getExiledUnits`, mirrored on `GameEngine` and `EngineContext`; `unit_exiled` / `unit_returned` in `EventBus`.
- [x] Per-tick return check in the engine's fixed update (one place): timer reached, or anchor dead/missing → return at the anchor's last position (or the exile point). Store the anchor's last known position on the record each tick so a dead anchor still has one.
    - Done: `tickExiledUnits` runs in `GameEngine.tickLevelEventsAndUnits` right after `unitManager.gameTick`; record keeps `anchorLastX/Y` refreshed each tick.
- [x] Serialization: `exiledUnits` round-trips with the snapshot (unit JSON + record fields), optional on load.
    - Done: optional `exiledUnits` key on `SerializedGameState` (omitted when empty), written by `engineSerialization.ts`, restored via `UnitManager.restoreFromJSON(..., exiledData)`; no version bump needed.
- [x] `exile.test.ts`: an exiled unit leaves `units` and is not found by `getUnit` or `getLivingPetsOfUnit`; return puts it back at the point; the timer returns it; an anchor's death returns it at the anchor's position; `returnExiledUnit` on a non-exiled id does nothing; `toJSON` → `fromJSON` keeps the record.
    - Written (not run): `game/units/exile.test.ts` covers leave/getUnit/pets, return at point, non-exiled no-op, timer, anchor death, JSON round trip (and key omitted when empty).
- [x] Short doc in the relevant AGENTS.md (UnitManager / engine): what exile is and its entry points.
    - Done: "Exile" section appended to `game/AGENTS.md`.
- Notes for later steps:
    - Call `engine.exileUnit(spirit, { reason: 'guard', anchorUnitId: target.id, returnAtGameTime: null })` (returns false if the unit is not in play or is dead). From a buff: `engine.returnExiledUnit(unitId, { x, y })` (no-op if already returned, returns boolean). `AbilityEngineContext` was NOT extended: abilities/buffs that need these must use `EngineContext` (or intersect `Pick<EngineContext, 'exileUnit' | 'returnExiledUnit'>`).
    - Events: `unit_exiled { unitId, reason, x, y, anchorUnitId }`, `unit_returned { unitId, reason, x, y, anchorUnitId }` (x/y = where it came back; `reason` echoes the exile reason, so Step 3's listener filters `reason === 'guard'`).
    - Return without `at` uses the anchor's last position, else the exile point. An anchor that is dead (`!isAlive()`) or missing returns the unit at once on the next tick check.
    - `returnAtGameTime` is NOT auto-clamped to a clone's `ephemeralDespawnAtGameTime`: the caller (Guard) must pass `min(...)` itself.
    - Returned unit: movement/tacticalPlan/pendingInterrupts cleared, `pathInvalidated = true`, pushed to the end of `units`.
- Verify (Step 4 runs): `game/units/exile.test.ts`, `game/units/unitToJSON` / Unit golden tests if they exist (`Unit.test.ts`), `game/GameEngine*.test.ts` that cover snapshots (find with grep).

### Step 2 — Guard shield (refilling, timed, linked)

Files: `buffs/ShieldBuff.ts` (+ `ShieldBuff.test.ts`), `game/units/unitShield.ts` (+ `unitShield.test.ts`), `buffs/buffRegistry.ts`, new `buffs/guardShield.ts` (preset), shield shell visuals (find where `theme` picks colours, e.g. `buffs/buffVisuals.ts`), `abilities/keywords/keywordRegistry.ts`.

- [x] `ShieldBuff` gets optional `refillFloor`, `expiresAtGameTime`, `linkedExiledUnitId`, theme `'command'`, and an optional `particleAura`; all serialized. `isExpired` is true at 0 HP **or** past `expiresAtGameTime`.
    - Done: `ShieldBuff` takes a 6th `options` arg (`refillFloor`, `expiresAtGameTime`, `linkedExiledUnitId`, `particleAura`), theme `'command'`, all serialized (omitted when default); `isExpired` also true past `expiresAtGameTime`.
- [x] `applyDamageToShields`: after taking from a shield with `refillFloor > 0`, set its `remainingHp` to `max(remainingHp, refillFloor)` straight away. Document that the floor applies per shield, so floors stack and other shields are untouched.
    - Done: refill inside the loop in `unitShield.ts` with a comment on per-shield floors.
- [x] `onBeforeExpire`: if `linkedExiledUnitId` is set, call the engine's `returnExiledUnit` at the holder's position (needs the engine on `BuffExpireContext`; add it if missing).
    - Done: `BuffExpireContext.engine?: EngineContext` added and passed from `tickUnitUpkeep`; `ShieldBuff.onBeforeExpire` calls `engine.returnExiledUnit(id, holder x/y)`.
- [x] Preset `createGuardShield({ floor, seconds, guardianUnitId, source })` in `buffs/guardShield.ts`: drain 0, theme `'command'`, spirit motes aura, `refillFloor: floor`, `expiresAtGameTime: now + seconds`, linked to the guardian. Shell colours for `'command'` from the Command theme (`themes/`).
    - Done: `buffs/guardShield.ts`; 'command' shell drawn in `buffVisuals.ts` (lime/pine, hardcoded hexes from `COMMAND_THEME`).
- [x] Glossary term **Guard Shield** (`matches: ['guard shield']`): `Shield that refills to {2} after every hit`.
    - Done: registered in `keywordRegistry.ts` (`Shield that refills to {2} after every hit.`).
- [x] Tests (written, not run): a 5-damage hit on a floor-2 guard shield deals 3 and leaves the shield at 2; two guard shields reduce a 5-damage hit to 1 and both stay at 2; a guard shield plus a 6-HP plain shield, hit for 3, leaves the guard at 2 and the plain shield untouched or reduced, never refilled; the shield expires at its time; round-trip serialization keeps the new fields.
    - Written (not run): guard cases in `unitShield.test.ts` and `ShieldBuff.test.ts` (expiry, onBeforeExpire link, round trip), Guard Shield glossary test in `keywordRegistry.test.ts`.
- Notes for later steps:
    - `createGuardShield({ floor, seconds, guardianUnitId, gameTime, source? })`: `gameTime` (= `engine.gameTime`) is REQUIRED (not in the original signature) since expiry is absolute. Floor 2 gives the shield 2 HP at creation. Pass `source: { unitId, abilityId }` only if block rules should fire (Guard probably should not; omit).
    - Add with `target.addBuff(shield, engine.gameTime, engine.roundNumber, engine.eventBus)`.
    - The shield returns the spirit via `engine.returnExiledUnit(id, holder pos)` on expiry, which emits `unit_returned` with the exile's `reason` ('guard'); the return-side emerge/`commandPetGuard` listener (Step 3) must live outside the buff. A dead holder's shield is never expired by the tick, so the exile's `anchorUnitId` rule handles that case.
    - Clone despawn: cap `seconds`/`returnAtGameTime` yourself; the shield timer alone would return a spirit after its clone despawn time only if the exile record is still there (exile `returnAtGameTime` handles that).
- Verify (Step 4 runs): `buffs/ShieldBuff.test.ts`, `game/units/unitShield.test.ts`, `abilities/keywords/keywordRegistry.test.ts`.

### Step 3 — Guard card; remove Order: Move

Files: `card_defs/07_command_core/0712_Guard/0712Ability.ts` (+ `0712Ability.test.ts`), delete `card_defs/07_command_core/0709_OrderMove/`, `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `abilities/petCommands.ts`, `app/js/researchTrees/trees/command_core.ts`, the tests that import `0709` / old Guard (`abilities/abilityTooltipLines.test.ts`, `game/specialAction.test.ts`, `game/units/spiritAnimal.test.ts`), any skill/AGENTS docs naming Order: Move.

- [x] Rewrite `0712` as the Guard command card described in Architecture 3 (targets: ally unit or the caster, 300 px; nearest free spirit to the target; 1 use, `roundCharge`). On cast: command cue, vanish pulse, `exileUnit(spirit, { reason: 'guard', anchorUnitId: target.id, returnAtGameTime: null or the clone's despawn time })`, `target.addBuff(createGuardShield(...))`. Fizzle with no free spirit or no valid target. Targeting preview from the caster to the target, with the fizzle X when no spirit is free (reuse a `previewHelpers` helper).
    - Done: Rewrote `0712Ability.ts` (+ `guardConstants.ts`): targeted command card (ally/self select, 300 px `unitRangeHitbox`, nearest free spirit, 1 use `roundCharge`); on cast exiles the spirit (`reason 'guard'`, anchor = target, `returnAtGameTime` = clone despawn or null), command cue + vanish pulse, adds `createGuardShield` (seconds clamped to clone despawn). Preview: range ring, spirit-to-ally line, fizzle X. `GuardCard` added to `card_defs/index.ts`.
- [x] Return handling: on `unit_returned` with `reason: 'guard'`, play the emerge pulse + `unit_fade_in` at the spirit and call `commandPetGuard` so it guards its owner. Put this in one listener (engine event wiring or the card module's registration), not in the buff.
    - Done: `guardReturn.ts` `registerGuardReturnListener` (called from `engineEventWiring.ts`): on `unit_returned` with `reason 'guard'` plays an emerge pulse + `unit_fade_in` and `commandPetGuard` (no cue).
- [x] Card copy per STYLE.md: `Your spirit shields an ally for {10}s`, keyword line `{Guard Shield}`, flavour text. Command-palette art.
    - Done: Tooltip `Your spirit shields an ally for {10}s` + `{Guard Shield}`; flavour text; Command-palette image. Removed the trailing full stop from the Guard Shield glossary description (and its test).
- [x] Delete Order: Move (`0709`): files, registration, `card_defs/index.ts`, its ability modes and `commandPetOrderMove` (with its tests) if nothing else uses it. Grep the repo for `0709`, `ORDER_MOVE`, `OrderMove`, `Order: Move` and fix every hit (code, tests, docs, scenarios).
    - Done: Deleted `0709_OrderMove/`, its registry/index entries, `commandPetOrderMove` + `OrderMoveEngineCtx` (petCommands). Reworded leftover `Order: Move` comments/docs; no `0709`/`ORDER_MOVE` hits remain in `app/`. The pet AI anchor logic is untouched.
- [x] Loyal Companion grants `0712` instead of `0709`; description per STYLE.md names `{Guard}` and `{Sic 'Em}` instead of Order: Move.
    - Done: `command_core.ts`: Loyal Companion adds `0712` (not `0709`), description `Grants {Guard} and {Sic 'Em}.`; `characterLoadout.test.ts` now expects `0712`.
- [x] Update the tests that used the old cards; `0712Ability.test.ts` (written, not run): casting Guard on an ally exiles the free spirit and shields the ally; with no free spirit nothing happens; when the shield expires the spirit is back in `units` at the ally's position; Guard cast on self works.
    - Done: Updated `abilityTooltipLines.test.ts` (Guard in the requireFree list, `Order: Attack` is the no-line case), `specialAction.test.ts` (Order: Move test removed, `ORDER_ATTACK_ABILITY_ID` used), `spiritAnimal.test.ts` (anchor set directly on the AI ctx), `abilitySourceUnits.test.ts` comment; wrote `0712Ability.test.ts` (real tiny-battle engine; not run).
- Notes for later steps:
    - Guard casts are driven in tests by calling the card's `Instant` behaviour `onTick` on a real tiny-battle engine. For AbilityTests, cast through an order on `GUARD_ABILITY_ID` (`0712`) with a `{ type: 'unit', unitId }` target; the card needs the `0712` card on the player's bar and a free pet (spirit_clone works).
    - `0712` now needs the card on the bar: Loyal Companion grants it. Constants are in `0712_Guard/guardConstants.ts` (`GUARD_SHIELD_FLOOR` 2, `GUARD_SECONDS` 10, `GUARD_RANGE` 300).
- Verify (Step 4 runs): `0712Ability.test.ts`, `abilities/abilityTooltipLines.test.ts`, `game/specialAction.test.ts`, `game/units/spiritAnimal.test.ts`, `app/js/researchTrees/commandCoreResearch.test.ts`, `abilities/abilitySourceUnits.test.ts`, `character_defs/characterLoadout.test.ts`, `abilities/keywords/keywordRegistry.test.ts` (glossary text edit).

### Step 4 — AbilityTests + final verification

Files: `testing/scenarios/general/pets.ts`, `testing/scenarios/registry.ts`.

- [x] Scenario `pet_guard_shield_reduces_hits`: player + spirit + an enemy that hits the player repeatedly. Cast Guard on self. Pass when the spirit leaves the map, each hit while guarded deals 2 less, and when the shield ends the spirit is back beside the player.
    - Done: in `testing/scenarios/general/pets.ts` (hits scheduled from `assertPass`, owner given 200 HP); passes headless.
- [x] Scenario `pet_guard_two_spirits_stack`: use Displacement Strike clones (or a second spirit) so two spirits guard one ally. Pass when a hit is reduced by 4, and both spirits reappear at the ally when the shields end.
    - Done: two dogs, Guard runs given 2 uses, second cast at tick 40; registered in `registry.ts`; passes headless.
- [x] Run `npm run lint:changed`, then **one** Vitest run of every file named in Steps 1–4's Verify lines and notes, then `npm run test:sim` once. Fix failures in the files of the step that owns them; re-run only what failed.
    - Done: lint and tsc clean; 14 unit files 140/140 pass (3 test-only fixes: exile record time, spiritAnimal aiState, Guard ally not a pet); `test:sim` 201/201 pass.
- [ ] Manual browser checklist (for a person): the guarded unit glows with spirit motes and shows the shield; the spirit's vanish and re-emergence read clearly; Loyal Companion's tooltip and the Guard card look right in the Upgrades tab (Storybook: `/campaign/ideas/storybook/research-cards?node=loyal&pin=1`).
