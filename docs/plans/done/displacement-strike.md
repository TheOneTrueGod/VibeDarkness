# Displacement Strike — Implementation Plan

**Completed 2026-11-22:** Displacement Strike shipped: card 0715, pet ability 0716, a tier 11 Command Core node, the `spirit_clone` pet with a translucent look and a fade-out, the `finishCast` expiry policy, the shared `spawnPetForOwner`, `PetAbilitySource.requiresAbilityId` and `pack` (plus `packCountFlat`), the Pack keyword, and the Ideas → Glossary sub-tab. Step 7 also fixed a shared engine bug: a cast behaviour could start twice on back-to-back ticks because of tick-clock rounding (`unitAbilityTick.ts`). Tests ran once at the end: 239/239 unit tests, then sim 196/197; after the fix the failing sim file passed 196/196. Follow-ups: the manual browser checklist (Step 7) still needs a person; Pack does not yet cover commands that pick their spirit through `resolveCasterPetAnchor` (Spirit Storm); tune clone leashes and numbers in playtest.

Goal: add **Displacement Strike**, a Command Core ability with a **tier 11** research node. The player aims at an enemy or a point near their spirit; the spirit splits, and **3 clones** of it appear round the target and dash through it, then hunt enemies on their own for **6 seconds**. Clones are ordinary pets of the owner, so **Sic 'em, Spirit Storm, Fling Thorns, Bramble Patch, Order: Move / Attack and Guard** can command them. A clone whose 6 seconds run out mid-cast **finishes that cast** before it fades.

Also ships the hookup (and glossary entry) for a future keyword that makes a command **repeat on N other nearby pets**, plus a new **Glossary** sub-tab in the Ideas tab.

## Plan-level decisions (locked with the user)

- **Trigger: aimed command card.** Player card `0715` *Displacement Strike* (no windup on the owner, like Sic 'em) picks a target (enemy unit or point) within range of the spirit (`anchorUnit: 'casterPet'`). The nearest **free** spirit (`abilitySource: { type: 'pet', selector: 'nearest', requireFree: true }`) casts pet ability `0716` at it via `commandPetAbility`.
- **Pet ability `0716` (pet-only, no aiSettings, `commandCharge` recovery):** short windup on the spirit with the Displacer's `CasterSplitFlicker`, then `SpawnUnits` places 3 clones round the target (`pickCloneSpawnPositions`), each clone opens with a Dog Bite (`0701`, now a dash-through strike) on the target, and the spirit itself dashes through the target (`DashStrike`). With no enemy at a point target, the clones still appear there and start hunting.
- **Clone behaviour: hunt freely.** New pet def `spirit_clone` with `autoEngage: true`, **no `reactions`** (no Spirit Strike on owner weapon hits), same abilities as the source spirit (base + research-granted, e.g. Fling Thorns / Bramble Patch) and the source spirit's `abilityModifiers`.
- **Orders: nearest, unchanged.** Clones are pets (`petState.ownerUnitId = owner`), so the existing "nearest free spirit" rule may pick a clone. No command changes beyond excluding expiring / dead clones.
- **Lifetime: 6 s, finish-the-cast.** Reuse `Unit.ephemeralDespawnAtGameTime`; add an **expiry policy** (data, not clone-specific code) so a unit past its time with a cast still running **lingers** until that cast ends (cooldown phase included only if the user later asks; v1 = until the cast leaves its last non-cooldown interval, see Step 2). A lingering unit starts no new casts and is never picked by commands. Long future casts (e.g. ability cancels chaining) are accepted.
- **Recast replaces:** a new Displacement Strike fades the owner's previous clones first (`replacePrevious`), so clones never stack past 3.
- **Clones are illusions:** tagged `UnitTag.Clone`, ethereal like the spirit, never revived by Guard/heel, fade out instead of a death effect, and don't count for objectives (`isCloneUnit` already handles "eliminate all enemies").
- **Future "Pack" keyword hookup (name provisional — rename freely):** `PetAbilitySource.pack?: { count: number; radiusPx: number }` plus a research `AbilityModifier.packCountFlat`. `resolveAbilitySourceUnits` returns the picked pet **plus up to `count` other free pets within `radiusPx` of it**, nearest first. Default 0 = no behaviour change. Commands that pick their pet through `resolveCasterPetAnchor` (Spirit Storm's linked area) are **not** covered in v1; noted in code.
- **Glossary:** register `pack` as a tooltip-only keyword with `describe(n)` (so tooltips that later say `{Pack 2}` get a reminder card), and add an Ideas **Glossary** sub-tab (between *Ideas* and *Storybook*) that lists every registered glossary term and described keyword from `abilities/keywords/keywordRegistry.ts`.

## Numbers (first pass — tune in playtest)

| Constant | Value |
|---|---|
| Clone count | 3 |
| Clone lifetime | 6 s |
| Command range from the spirit | 150 px |
| Spirit split windup (`0716`) | 0.3 s |
| Card uses / recovery (`0715`) | 1 use, `roundCharge` 1 (Spirit Storm's pattern) |
| Node cost | `{ attunement: 11, vigor: 10, metal: 3 }` |
| Node position | `{ x: 370, y: 160 }` (empty slot above Sic 'Em; check in the Upgrades tab) |

## Key existing code index

| Concern | Location (under `app/js/games/minion_battles/` unless noted) |
|---|---|
| Unit expiry | `game/units/Unit.ts` (`ephemeralDespawnAtGameTime`), `game/units/unitMovementTick.ts` (`tickUnitEphemeralExpiry`), `unitToJSON.ts` / `unitFromJSON.ts` |
| Clone spawning (Displacer) | `card_defs/dark_animals/0019_PhantomDecoy/0019Ability.ts`, `game/displacer/clonePlacement.ts`, `abilities/CastBehaviours/SpawnUnitsBehaviour.ts`, `abilities/CastBehaviours/CasterSplitFlickerBehaviour.ts`, `game/units/unitTag.ts` (`UnitTag.Clone`, `isCloneUnit`) |
| Pet spawn at mission start | `storylines/BaseMissionDef.ts` (~L552–595: abilities, `aiHookup: { kind: 'pet' }`, `inheritOwnerAbilityModifiers`, bite `damageFlat`) |
| Pet defs / helpers / state | `game/units/pet_defs/petDef.ts`, `game/units/petHelpers.ts`, `game/units/components/petComponent.ts`, `game/units/unitAI/pet/` |
| Pet commands | `abilities/petCommands.ts` (`commandPetAbility`, `commandHeel`), `abilities/abilitySourceUnits.ts`, `abilities/targeting.ts` (`resolveCasterPetAnchor`), `game/units/castPriority.ts` (`isUnitBusy`) |
| Command card pattern | `card_defs/07_command_core/0704_SicEm/0704Ability.ts`, `0714_FlingThornCommand/0714Ability.ts` |
| Strikes | `abilities/CastBehaviours/DashStrikeBehaviour.ts`, `card_defs/07_command_core/0701_DogBite/0701Ability.ts` |
| Registration | `abilities/AbilityRegistry.ts`, `card_defs/index.ts` (see `card_defs/SKILL.md`) |
| Research tree | `app/js/researchTrees/trees/command_core.ts`, `app/js/researchTrees/types.ts` (`AbilityModifier`) |
| Keywords / glossary | `abilities/keywords/keywordTypes.ts`, `keywordRegistry.ts`, `abilities/keywords/AGENTS.md` |
| Ideas tab | `app/js/components/minionBattlesHomePage/Ideas/IdeasPanel.tsx`, `useIdeasRoute.ts`, `app/js/components/ability-tests/campaignTabPaths.ts` (`IDEAS_VIEW_IDS`) |
| Pet AbilityTests | `testing/scenarios/general/pets.ts`, `testing/scenarios/registry.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`; its workflow is not restated here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first: the expiry policy, pet spawning and pack resolution are engine pieces; Displacement Strike is their first user.

Project skills relevant to this plan (workers invoke the ones matching their step):
- `working-on-minion-battles` — always.
- `game-object-def-pattern` + `game-engine` — Steps 1–2 (serialized unit fields, pet def properties, tick order).
- `creating-an-ability` + `editing-card-behaviour` — Steps 3–4 (ability + card defs, registration).
- `working-on-ai-controllers` — Step 2–3 (pet AI: autoEngage, no new casts while lingering).
- `research-trees` — Step 5.
- `writing-style-abilities` (`.claude/skills/narrative/writing-style-abilities/STYLE.md`) — Steps 4–6 (tooltip, node and keyword copy).
- `editing-and-creating-components` + `campaign-home-tabs` — Step 6 (Ideas Glossary sub-tab).
- `ability-tests` — Step 7.
- `scoped-testing` — per-step Vitest scope.

**Verification cadence (user override, 2026-11-22): run tests once, at the end.** Steps 1–6 write their test files but **do not run Vitest**; per step run only `npm run lint:changed` and, when the step crosses an interface boundary, `npx tsc --noEmit`. The "Verify:" lines in Steps 1–6 list the files Step 7 runs. Step 7 runs every listed unit test once, then `npm run test:sim` once, and fixes failures. No `npm run test:all`.

---

### Step 1 — Reusable pet spawning + clone pet def

Files: new `game/units/petSpawn.ts` (+ `petSpawn.test.ts`), `storylines/BaseMissionDef.ts`, `game/units/pet_defs/petDef.ts`, `game/units/unit_defs/unitDef.ts` (only if a clone look entry is needed).

- [x] Extract the mission-start pet spawn (BaseMissionDef ~L552–595) into `spawnPetForOwner(engine, owner, { petDefId, at, abilityIds, maxHp, abilityModifiers?, spawnSource })` in `game/units/petSpawn.ts`: spawns with `aiHookup: { kind: 'pet' }`, sets pet state, inherits owner modifiers, applies extra modifiers, initializes ability runtime, returns the unit. BaseMissionDef calls it with no behaviour change.
  - Done: `spawnPetForOwner` also takes `unitTags?`, `ephemeralDespawnAtGameTime?` and `inheritOwnerModifiers?` (default true). **Step 3: pass `inheritOwnerModifiers: false` when `abilityModifiers` is the source spirit's full copy**, or the owner's research is counted twice. Extras merge via `mergeAbilityModifierInto`; teamId = owner's. Note the owner's `petState.unitIds` gets every clone pushed (never pruned) — Step 2/3 may want to prune on clone death.
- [x] Add pet def `spirit_clone` in `petDef.ts`: same `unitCharacterId` as the dog, `autoEngage: true`, no `reactions`, `basicAttackAbilityId: '0701'`, generous `engageLeashRange` / `returnLeashRange` (clones hunt; tune in Step 7). Abilities are passed at spawn (copied from the source spirit), so the def's `abilityIds` is just the dog's base list.
  - Done with one deviation: `unitCharacterId: 'spirit_clone'` (a new unit def copying the dog's stats/look) so the clone look is a def property rather than touching the real dog; leashes 400 / 700, `anchorRadius` 50.
- [x] Clone look: clones render as the spirit with `UnitTag.Clone`. If nothing makes Clone-tagged units visibly illusory, add a def/tag-driven alpha (or spectral tint) in the unit renderer — a property, not a clone special case. Skip if the Displacer's clone look already applies by tag.
  - Done: nothing did (Displacer clones are meant to look identical to the boss), so added `UnitDefEntry.displayAlpha` + `getUnitDisplayAlpha` (multiplied into `UnitRenderer` alpha) and unit def `spirit_clone` (dog look, `displayAlpha: 0.55`, `appearFadeInMs: 200`, def `tags: [UnitTag.Clone]`, hidden bestiary). Clones are therefore Clone-tagged by def even without spawn tags.
- [x] `petSpawn.test.ts`: spawning a `spirit_clone` for an owner yields a living pet of that owner (`getLivingPetsOfUnit`), with the given abilities, the source's `damageFlat` on `0701`, and `autoEngage` from its def.
  - Done: 3 tests (living Clone-tagged pet with abilities/modifiers/hp/team and def `autoEngage`/no reactions; owner-modifier inheritance on vs off; unknown def → undefined). Verified: lint:changed, tsc green. (Vitest for petSpawn, 0701Ability, petHelpers, unitDefRegistry, spiritAnimal, petSystem had already run green before the no-Vitest override arrived; Step 7 still runs them.)
- Verify: `npm run lint:changed`, `npx tsc --noEmit`, `petSpawn.test.ts`, `0701Ability.test.ts`, `game/units/petHelpers.test.ts`.

### Step 2 — Expiry policy: finish the current cast, then fade

Files: `game/units/Unit.ts`, `game/units/unitTypes.ts`, `game/units/index.ts`, `game/units/spawning/spawnDefinition.ts` + `spawnUnit.ts`, `game/units/unitMovementTick.ts`, `unitToJSON.ts`, `unitFromJSON.ts`, `abilities/abilitySourceUnits.ts`, `abilities/targeting.ts`, `abilities/petCommands.ts`, pet AI under `game/units/unitAI/pet/`, new `game/units/ephemeralExpiry.test.ts`.

- [x] Add `ephemeralExpiryPolicy: 'immediate' | 'finishCast'` (default `'immediate'`, serialized only when not default) next to `ephemeralDespawnAtGameTime`, settable through spawn config / `SpawnDefinition`.
  - Done: type `EphemeralExpiryPolicy` in `unitTypes.ts`; `Unit.ephemeralExpiryPolicy`, `UnitConfig`, `createEnemyUnit` config, `SpawnDefinition` → `spawnUnit`, and `SpawnPetOptions.ephemeralExpiryPolicy` (**Step 3: pass it to `spawnPetForOwner`**); toJSON omits `'immediate'`, fromJSON defaults to it.
- [x] In `tickUnitEphemeralExpiry`: with `'finishCast'`, a unit past its time that still has an active ability in a non-cooldown interval does not die; it is **lingering** (derive `isUnitLingering(unit, gameTime)` — no extra stored state). It dies on the first tick its cast is over. Death from expiry emits a fade (`unit_fade_out` or the existing ephemeral path), not a death effect — check what Displacer clones use and reuse it.
  - Done: new `game/units/ephemeralExpiry.ts` (`isUnitPastEphemeralTime`, `isUnitLingering` = alive past its time, `shouldEphemeralUnitExpire`) + `castPriority.ts` `isCastInAction` / `unitHasCastInAction` (elapsed < end of last non-cooldown interval, via the existing ability lookup). Expiry now also requires `isAlive()` (no double `unit_died`). Fade: Displacer clones use def-driven `onDeathVisualEffects`, so added a `remnant` `VisualEffectDef` (shared `spawnDeathRemnant`, now also used by `applyDeathSequence`) plus `DeathRemnantEffectData.startAlpha` / `corruptionTint`; `spirit_clone` def fades out (0.35 s, alpha 0.55, untinted) on any death.
- [x] Lingering units are never picked: exclude them in `getLivingPetsOfUnit` consumers used for commands (`resolveAbilitySourceUnits`, `resolveCasterPetAnchor`) and make the pet AI start no new casts while lingering. `commandHeel` must not revive Clone-tagged / expired pets.
  - Done: `petHelpers.getCommandablePetsOfUnit(owner, units, gameTime?)` used by `resolveAbilitySourceUnits` and `resolveCasterPetAnchor`; UnitManager's AI phase skips lingering units (engine-wide, not pet-only); `commandPetAbility` skips lingering pets **unless `followUpOf` is set**, so Pounce → Spirit Flurry still chains on a clone whose time ran out (Step 7's finish-cast scenario relies on this). `commandHeel` skips lingering pets and never revives `isPetRevivable() === false` pets (Clone-tagged or with an ephemeral lifetime). Step 1 note on `petState.unitIds`: handled here — `releaseDeadPetFromOwner` runs on `unit_died` (engineEventWiring) and drops non-revivable dead pets from the owner's list (the list is otherwise only serialized; the real spirit stays listed when it dies).
- [x] `ephemeralExpiry.test.ts`: (a) `'immediate'` unit dies at its time mid-cast (old behaviour); (b) `'finishCast'` unit past its time mid-cast stays alive until the cast ends, then dies; (c) idle `'finishCast'` unit dies on time; (d) a lingering pet is not returned by `resolveAbilitySourceUnits`; (e) the policy round-trips `toJSON` / `fromJSON`.
  - Done: 6 tests — (a)–(e) as listed, plus a dead clone is not revived by `commandHeel` and leaves the owner's `unitIds`. Timings read from Dog Bite's intervals (expiry set halfway through its action). Not run (verification override); lint:changed and tsc green.
- Verify: `npm run lint:changed`, `npx tsc --noEmit`, `ephemeralExpiry.test.ts`, `game/specialAction.test.ts`, `game/units/castHold.test.ts`. Step 2 also touched shared code, so Step 7 should add `game/deathSequences/applyDeathSequence.test.ts`, `game/units/Unit.test.ts` (golden snapshot; default policy is omitted so it should be unchanged), `game/units/petSystem.test.ts` and `game/units/castPriority*.test.ts` if present.

### Step 3 — Pet ability 0716: Displacement Strike (spirit side)

Files: new `card_defs/07_command_core/0716_DisplacementStrikePet/0716Ability.ts` (+ test), `abilities/AbilityRegistry.ts`, `game/units/pet_defs/petDef.ts` (only if the dog's base list must include it — normally research grants it).

- [x] Timings: `split` windup 0.3 s (`CasterSplitFlicker`), `strike` active window with `SpawnUnits` + the spirit's own `DashStrike` through the target, short cooldown. `doNotRefund` on the strike. No `aiSettings`; recovery `commandCharge` (like Pounce).
  - Done in `card_defs/07_command_core/0716_DisplacementStrikePet/0716Ability.ts` (registered in `AbilityRegistry.ts`): split 0–0.3 s, strike 0.3–0.42 s (`SPIRIT_STRIKE_DASH_SECONDS`), cooldown 0.1 s; the spirit's `DashStrike` deals `SPIRIT_STRIKE_DAMAGE` (3) with `withAreaTargeting(SPIRIT_FLURRY_AREA_RADIUS)` so a point target hits the nearest enemy or the empty spot. `targets: [{ type: 'unit' }]` like Spirit Flurry (pixel targets pass through fine).
- [x] `SpawnUnits` config: template from `spawnPetForOwner` inputs (owner = the spirit's owner, `petDefId: 'spirit_clone'`, abilities and `abilityModifiers` copied from the casting spirit), `unitTags: [UnitTag.Clone]`, `ephemeralDespawnAtGameTime = now + 6`, `ephemeralExpiryPolicy: 'finishCast'`; positions from `pickCloneSpawnPositions` round the target (unit or point); `replacePrevious` = the owner's living Clone-tagged pets; `onSpawned` adds the Command-theme pulse. If `SpawnUnits` cannot carry a pet hookup, add that to its template (engine block), not a one-off.
  - Done. Engine blocks: `SpawnUnitsConfig.spawnOne(ctx, at, index)` (custom per-point spawner, `template` now optional) and optional `AbilityEngineContext.spawnUnit`; `replacePrevious` now also sets the replaced units' policy to `'immediate'` so a mid-cast `'finishCast'` clone does not linger past a recast. Clones copy the spirit's abilities **minus 0716** (clones never split; a clone casting it would replace itself) and its full modifiers with `inheritOwnerModifiers: false`; hp = spirit's maxHp. Ring: radius 80, min 36 from target, spacing 32 (exported constants). **Step 4 note:** the card's "nearest free pet" may pick a clone, which lacks 0716 — have the card's source selector prefer/require a pet that has the ability (e.g. an `abilitySource` filter), or accept a fizzle.
- [x] `onBatchSpawned`: each clone with a living enemy target gets `commandPetAbility([clone], '0701', [target])` so it opens by dashing through it. Clones otherwise start in their hunt AI.
  - Done: one `commandPetAbility(clones, '0701', [unit target])` call when the target is a living enemy of the caster (no priority stamp).
- [x] Export constants (`DISPLACEMENT_STRIKE_CLONE_COUNT = 3`, `DISPLACEMENT_STRIKE_CLONE_SECONDS = 6`, ids) for the card, tree and tests.
  - Done: also `DISPLACEMENT_STRIKE_PET_ABILITY_ID` ('0716'), `DISPLACEMENT_STRIKE_CARD_ID` ('0715'), `DISPLACEMENT_STRIKE_CLONE_PET_DEF_ID`, `DISPLACEMENT_STRIKE_CLONE_OPENER_ID`, `DISPLACEMENT_STRIKE_DAMAGE`, `DISPLACEMENT_STRIKE_SPLIT_SECONDS`, ring constants.
- [x] `0716Ability.test.ts` (tiny-battle engine, like `0702_Pounce/pounceWhiffFlurry.test.ts`): casting at a dummy spawns 3 Clone-tagged pets of the owner near it, the dummy takes the spirit's strike plus 3 clone bites, a recast leaves exactly 3 clones, and after 6 s idle clones are gone.
  - Done: 3 tests (spawn + spirit strike damage + a `damage_taken` from each clone; recast replaces with 3 new ids; all clones gone at 6.5 s with the real spirit the only living pet). The spirit is spawned with `spawnPetForOwner('dog', … + 0716)` 180 px from the owner so its guard AI leaves the dummy alone. Not run (verification override); lint:changed and tsc green. If the clone-hit assertion is flaky in Step 7, check whether the clone AI's own bite on the spawn tick rejects the queued opener (still a hit either way).
- Verify: `npm run lint:changed`, `npx tsc --noEmit`, `0716Ability.test.ts`.

### Step 4 — Player card 0715: Displacement Strike

Files: new `card_defs/07_command_core/0715_DisplacementStrike/0715Ability.ts` (+ test), `abilities/AbilityRegistry.ts`, `card_defs/index.ts`.

**Orchestrator decision (2026-11-22), for Step 3's open note:** clones lack `0716`, so "nearest free pet" could pick a clone. Added a reusable `PetAbilitySource.requiresAbilityId?: string` (`abilities/Ability.ts`): only pets that own that ability are candidates. Honoured by `resolveAbilitySourceUnits` and by the casterPet anchor (`CasterPetAnchorOptions.requiresAbilityId`, passed through `petAnchorOptionsOf(ability)` into `resolveSelectAnchorPoint` from `clampSelectTarget` and `PreviewRenderer`'s anchored-select line). The 0715 card sets it to `0716`.

- [x] Command card on the Sic 'em / Fling Thorns pattern: `abilitySource` nearest free pet, one `select` target (`filter: 'any'`, `allowMiss: true`, `anchorUnit: 'casterPet'`, `maxRangeFromAnchor: 150`), Instant behaviour calls `commandPetAbility(sourcePets, '0716', targets, eng, { preGrantCharge: commandCharge 1, priority: CAST_PRIORITY.Major, owner })`. Fizzles with no free spirit. 1 use, `roundCharge` recovery.
  - Done in `0715Ability.ts` (registered in `AbilityRegistry.ts` + `card_defs/index.ts`), source `DISPLACEMENT_STRIKE_PET_SOURCE` with `requiresAbilityId: '0716'` (decision above); exports `DISPLACEMENT_STRIKE_RANGE` (150). Found while wiring: an anchored select **always** commits a pixel target (`clampSelectTarget`), so 0716's clone opener (unit targets only) never fired from the card. Fixed engine-side: `DashStrike`'s private nearest-enemy pick became `targetHelpers.findNearestEnemyInArea`, and 0716's `livingEnemyTarget` / `targetCenter` use it for a point target (`SPIRIT_FLURRY_AREA_RADIUS`), so clones gather round and open on the same enemy the spirit strikes.
- [x] Card art in the Command palette (teal disc, lime line art, white accent — see `themes/AGENTS.md`); targeting preview from the spirit (a `previewHelpers` helper, never drawn from the player).
  - Done: SVG of a white spirit diamond with three lime clone rings dashing in. New preset `createPetAnchoredAreaPreview` (`previewHelpers.ts`): resolves the same free pet as the cast (anchor + `requiresAbilityId`), draws a lime ring (clone radius) round the clamped point, snapped with a crosshair onto the enemy the spirit would strike; fizzle X with no pet. The renderer's anchored select draws the line from the spirit.
- [x] Tooltip per STYLE.md, e.g. "Your spirit splits into {3} clones round the target. They dash through it, then hunt enemies for {6}s."
  - Done: one line, "Your spirit splits into {3} clones that strike the target, then hunt for {6}s" (numbers from the 0716 constants).
- [x] `0715Ability.test.ts`: playing the card with a free spirit queues `0716` on it at the target; with no free spirit nothing is queued.
  - Done: 4 tests (anchored select + source config; queues 0716 on the free spirit with Major priority; fizzles when the spirit is busy or absent; a nearer free clone without 0716 is skipped for the real spirit, in `resolveAbilitySourceUnits`, the card's order, the anchor and `clampSelectTarget`). Not run (verification override); lint:changed and tsc green. Step 7 should also run `abilitySourceUnits.test.ts`, `0713Ability.test.ts` and any `DashStrike` tests (`0701Ability.test.ts`, `0711Ability.test.ts`) since `resolveSelectAnchorPoint` / DashStrike were touched.
- Verify: `npm run lint:changed`, `npx tsc --noEmit`, `0715Ability.test.ts`, `abilities/abilityTooltipLines.test.ts`.

### Step 5 — Research node (tier 11)

Files: `app/js/researchTrees/trees/command_core.ts`, a research test that already covers command-core grants (or a new `command_core.displacementStrike.test.ts`).

- [x] Add `COMMAND_CORE_NODE_DISPLACEMENT_STRIKE = 'displacement_strike'`: title *Displacement Strike*, tier 11, prereq + requirement Loyal Companion, cost and position from the Numbers table, effects `grantPetAbility { petId: 'dog', abilityId: '0716' }` and `addCard '0715'`. Description and flavour text per STYLE.md.
  - Done in `command_core.ts` (order 22, `COMMAND_DISPLACEMENT_STRIKE_COST`, position 370,160): "Order your spirit to {Displacement Strike}: {3} clones strike the target, then hunt for {6}s." / flavour "One shadow, then four. Only one of them is real." Ids and numbers come from new light `0716_DisplacementStrikePet/0716Constants.ts` (repo's `NNNNConstants` pattern; `0716Ability.ts` re-exports them) so the tree does not import the ability module.
- [x] Test: researching the node grants card `0715` to the owner and `0716` to the dog (mirror how Mimic Thorn's grants are tested; find with grep).
  - Done: new case in `app/js/researchTrees/commandCoreResearch.test.ts` (tier 11, prereq Loyal Companion, `getDirectCardsFromResearch` contains 0715 only when researched, `getPetAbilitiesFromResearch` dog = ['0716']). Not run (verification override); lint:changed and tsc green. **Step 7: run `commandCoreResearch.test.ts`** (also `commandCoreTier12.test.ts` and `characterLoadout.test.ts` in case they snapshot the tree's nodes).
- Verify: `npm run lint:changed`, the new/edited research test.

### Step 6 — "Pack" hookup + Glossary sub-tab

Files: `abilities/Ability.ts` (`PetAbilitySource`), `abilities/abilitySourceUnits.ts` (+ test), `app/js/researchTrees/types.ts` (`AbilityModifier.packCountFlat`), `abilities/keywords/keywordTypes.ts`, new `abilities/keywords/packKeyword.ts`, `keywordRegistry.ts` (+ test), `abilities/keywords/AGENTS.md`, `app/js/components/ability-tests/campaignTabPaths.ts`, `Ideas/IdeasPanel.tsx`, new `Ideas/GlossaryView.tsx`.

- [x] `PetAbilitySource.pack?: { count: number; radiusPx: number }`; `resolveAbilitySourceUnits` returns the picked pet plus up to `count` (+ caster's `abilityModifiers[abilityId].packCountFlat`) other free, non-lingering pets within `radiusPx` of it, nearest first. Doc comment: commands that use `resolveCasterPetAnchor` (Spirit Storm) are not covered yet. No existing card sets it.
  - Done: `pack` on `PetAbilitySource` (`Ability.ts`); `resolveAbilitySourceUnits` now takes `{ id?, abilitySource? }` and appends `resolvePackExtras` (same candidate list as the pick, so commandable / non-lingering, `requiresAbilityId`, `requireFree` all apply; `'nearest'` only). `AbilityModifier.packCountFlat` added with additive merge (`abilityModifierMerge.ts`), per-rank scaling (`evaluator.ts`) and reader `getPackCount` (`abilityModifierScales.ts`).
- [x] Unit test in `abilitySourceUnits` test file: `pack: { count: 1, radiusPx: 80 }` with three pets returns the nearest plus its nearest free neighbour inside the radius; one outside the radius or busy is skipped; no `pack` returns one pet as before.
  - Done: 4 tests in `abilities/abilitySourceUnits.test.ts` (`with pack`): nearest + nearest neighbour; busy neighbour and out-of-radius skipped; `packCountFlat` adds an extra and no `pack` returns one; extras honour `requiresAbilityId`. Not run (verification override).
- [x] Keyword `pack` (tooltip-only, `describe(n)`: e.g. "Up to {n} other spirits near the commanded one repeat this command."), registered and listed in `keywords/AGENTS.md`.
  - Done: `keywords/packKeyword.ts` (type imports only), `'pack'` in `KeywordId`, registered; describe "Up to {n} other spirits near the commanded one repeat this command." Tests in `keywordRegistry.test.ts` (Pack card + `listGlossaryEntries`). AGENTS.md lists it.
- [x] Ideas **Glossary** sub-tab: add `'glossary'` to `IDEAS_VIEW_IDS` and to `TABS` between *Ideas* and *Storybook*; `GlossaryView` lists every glossary term (`registerGlossaryTerm`) and every keyword with `describe` (export a read-only `listGlossaryEntries()` from `keywordRegistry.ts`), each as title + rendered reminder text, using existing Ideas styling. Subtitle: "Add terms in abilities/keywords/".
  - Done: `IDEAS_VIEW_IDS` = plans, ideas, glossary, storybook; `ITEM_IDS.glossary = []` so `/campaign/ideas/glossary` stays put (no item redirect); new `Ideas/GlossaryView.tsx` grids every entry with `KeywordCard` (now exported from `AbilityTooltip.tsx`), keywords at N = 1, sorted by title. `listGlossaryEntries()` in `keywordRegistry.ts`. `campaignTabPaths.test.ts` gained glossary path/parse cases; `campaign-home-tabs` SKILL.md and `components/AGENTS.md` list the new sub-tab. lint:changed and tsc green. **Step 7: also run `components/ability-tests/campaignTabPaths.test.ts`.**
- Verify: `npm run lint:changed`, `npx tsc --noEmit`, the `abilitySourceUnits` test, `keywordRegistry.test.ts`, `Ideas/ideasData.test.ts`.

### Step 7 — AbilityTests + final verification

Files: `testing/scenarios/general/pets.ts`, `testing/scenarios/registry.ts`.

- [x] Scenario `pet_displacement_strike_clones_hunt`: owner + spirit + 3 dummies spread out. Play Displacement Strike at one dummy. Pass when 3 clones appeared, the target took clone hits, at least one **other** dummy took clone bites (hunting), and by 7 s no clones remain while the real spirit is alive.
  - Done in `testing/scenarios/general/pets.ts` (+ `registry.ts`): fragile target (5 hp: spirit strike 3 + two 1-dmg clone bites) so clones must hunt two sturdy dummies; cap 7.5 s. Shared `CloneTracker` / `buildDisplacementBattle` helpers. Its first run caught an **engine bug**: `+= dt` drift made 0716's `strike` interval "enter" on two ticks running (prevElapsed a ULP below the last tick's nextElapsed), so the one-shot `SpawnUnits` fired twice (6 clones, first batch replaced). Fixed in `game/units/unitAbilityTick.ts` `startCastBehaviourEntry`: an entry whose key is already in `setupFiredBehaviourKeys` now returns early (was: only `onSetup` suppressed; the one-shot tick / sustained registration still re-ran). 0716's unit test missed it because it casts at gameTime 0.
- [x] Scenario `pet_displacement_clone_finishes_cast`: after the clones appear, play Sic 'em so the nearest free pet is a clone and time it so its Pounce → Spirit Flurry is still running at the 6 s mark. Pass when that clone is alive past 6 s, its flurry completes (all strikes land), and it is gone right after. Confirms clones are orderable and the finish-cast policy.
  - Done: Sic 'em queued at tick 324 (5.4 s) at the sturdy target; asserts a clone (not the spirit) pounced, ≥4 flurry hits with the last after its despawn time, died after despawn time and ≤ 0.5 s after its last strike.
- [x] Run `npm run test:sim` once; fix failures in the step that owns them.
  - First run: 196/197 (clones_hunt failed, engine double-spawn above). After the fix, re-ran `SimulationRunner.test.ts`: 196/196 passed (exposedDurationExtension file passed in the first run).
- [x] Run the plan's unit tests together once: `petSpawn.test.ts`, `ephemeralExpiry.test.ts`, `0715Ability.test.ts`, `0716Ability.test.ts`, the research test, the `abilitySourceUnits` test, `keywordRegistry.test.ts`, plus `0701Ability.test.ts`, `0713Ability.test.ts`, `0714Ability.test.ts`, `game/specialAction.test.ts`, `game/units/unitAI/pet/pet_engage.test.ts`.
  - One invocation of 26 files (these plus every earlier Verify/notes addition: petHelpers, castHold, applyDeathSequence, Unit, petSystem, castPriority, abilityTooltipLines, commandCoreTier12, characterLoadout, ideasData, campaignTabPaths, 0711, unitDefRegistry, spiritAnimal): 26 files / 239 tests passed. After the engine fix, also ran the cast-tick suites (abilityTimings, interactiveTargeting, actorClock, unitAbilityLifecycle.interrupt, abilityMode, 0716, castBehaviourStateSerialization): 7 files / 268 tests passed. lint:changed and tsc green.
- [ ] Manual browser checklist (Vite dev server, `vite-dev` in `.claude/launch.json`):
  - Upgrades tab (Command Core): the tier 11 node sits in a clean slot, tooltip reads well.
  - Ideas → Glossary sub-tab sits between Ideas and Storybook and lists Pack plus the existing terms (e.g. Bleed, Rend).
  - In a battle with the node researched: the card's preview draws from the spirit; the split, clone pulses, opening dashes and fade-out read clearly; clones look illusory.
