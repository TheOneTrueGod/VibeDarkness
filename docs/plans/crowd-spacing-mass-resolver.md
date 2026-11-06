# CrowdSpacing mass resolver (switchable with legacy)

> **Completed 2026-11-05** on branch `crowd-spacing-mass-resolver` (uncommitted).
> - **Structure:** CrowdSpacing now runs through a `CrowdSpacingResolver` interface with two implementations, `legacy/` and `mass/`. `CROWD_SPACING_MODE` in `crowdSpacingMode.ts` picks between them and is set to `'mass'`.
> - **Mass model:**
>   - Mass from size tier (×3 for bosses).
>   - Bracing during ability windup, and for structures, anchors and forced movers.
>   - A per-tick push budget from the unit's own speed.
>   - Pusher detection via a snapshot of positions before units move. Resistance across teams applies only to non-pushers, and leftover push goes only back to pushers.
>   - No player radius padding in mass mode, a user decision so that pursuit can still finish.
> - **Tests:** four mass AbilityTest scenarios, with the old pack scenario pinned to legacy. The full suite passes.
> - **Still to do:** the manual browser checklist in Step 5, plus the follow-ups at the bottom.

## Goal

The current CrowdSpacing feels off:
- Wolves winding up a charge get pushed, which bends the charge.
- A unit can be pushed faster than its own move speed.
- Size barely matters, so a small unit can shove a big one.
- Players are **anchors**, so they bulldoze enemies out of a blocked hallway.
- Player summons are anchors too, by accident (`isPlayerControlled()` is `ownerId !== 'ai'`).

Add a second resolver, **mass**, alongside the existing one, **legacy**. One constant picks between them. Nothing outside `game/crowdSpacing/` may branch on which one is active.

### Mass model (what the new resolver does)

1. **Mass, not role.**
   - Each participant has a mass. By default it comes from the unit's size tier; the def field `crowdMass` overrides it.
   - Units tagged `Boss` get a multiplier.
   - Overlap is split in inverse proportion to mass for **every** pair, players included. Players are no longer anchors but keep their radius padding.
2. **Bracing.** A braced unit acts as a wall this tick: infinite mass. It still pushes others. A unit is braced when any of these hold:
   - It is tagged `Structure` or `CrowdSpacingAnchor`.
   - It is a forced mover: knockback or `controlled`, same as today.
   - It has an active ability currently in its `AbilityPhase.Windup`, unless that ability opts out.
3. **Push budget.** Per tick, CrowdSpacing may move a unit by at most `CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION × unit.speed × dt`.
4. **Team resistance.**
   - Across teams, each unit's effective mass is multiplied by `CROWD_MASS_ENEMY_RESISTANCE`.
   - Between allies, the multiplier is 1.
   - A unit owned by player X yields to X's own player unit: in that pair the summon takes the full correction.
5. **Residual to the pusher (also gives wall pushback).**
   - After the budget clamp and the terrain clamp, each unit has a scale `s` in [0, 1]: the fraction of its requested push it actually got.
   - For each stored pair, the part of B's share that didn't apply, `(1 − s_B) × shareB`, goes to A along the normal, and vice versa.
   - Units that receive a residual get one more terrain clamp. Residuals are **not** budget-capped. This is what stops players from shoving through crowds or walls.
6. **Cost.** One grid pass, same as legacy. Pairs are stored in an array, and the residual step is one more loop over that array with no extra grid queries. Per-unit records (radius, mass, braced, budget, team) are computed once per tick, not once per pair. Instrument with `tickPerformanceTracker`.

Category intent (the defaults should produce this; tune constants, not code):

| Category | Result |
|---|---|
| Structures | Braced; never moved |
| Player units | Medium mass. Slowly slip past small enemies; blocked by a line of regular enemies; can't move large enemies or bosses |
| Player summons | Their own size's mass; yield to their owner; hold a line against enemies |
| Bosses | Size mass × boss multiplier; push players aside at the boss's budget |
| Large enemies | Heavy; brush small units aside |
| Regular enemies | Roughly even with players × enemy resistance, so a line forms a wall |
| Small enemies | Pushable, but only at their own (slow) budget |

### Target structure

```
game/crowdSpacing/
  CrowdSpacingManager.ts      ← owns grid + contacts; delegates to a CrowdSpacingResolver
  CrowdSpacingResolver.ts     ← interface
  crowdSpacingMode.ts         ← CROWD_SPACING_MODE constant + createCrowdSpacingResolver() (ONLY reader of the constant)
  crowdSpacingConstants.ts    ← shared knobs (epsilon, player padding, cell size)
  shared/
    CrowdSpacingGrid.ts (+ test, moved)
    enumerateOverlaps.ts      ← grid query → overlapping pairs (unit ids ascending, normal, overlap, coincident axis)
    applyClampedDelta.ts      ← terrain clamp + position write + grid update; returns applied vector
  legacy/
    legacyRoles.ts (+ test)   ← today's crowdSpacingRoles.ts, behaviour unchanged
    LegacyResolver.ts (+ test)← today's resolveCrowdSpacingPass on shared helpers
  mass/
    massConstants.ts          ← size-tier mass table, boss multiplier, enemy resistance, budget fraction
    crowdMass.ts (+ test)     ← getCrowdMass(unit)
    crowdBracing.ts (+ test)  ← isCrowdBraced(unit)
    MassResolver.ts (+ test)
  crowdSpacingResolvers.test.ts ← shared invariants via describe.each over both resolvers
```

```ts
export interface CrowdSpacingResolver {
    readonly mode: CrowdSpacingMode;
    /** Whether the unit is in the grid this tick. */
    isParticipant(unit: Unit): boolean;
    radius(unit: Unit): number;
    resolve(args: {
        participants: readonly Unit[];
        grid: CrowdSpacingGrid;
        terrainManager: TerrainManager | null;
        dt: number;
        onContact: (a: Unit, b: Unit) => void;
    }): void;
}
```

`CrowdSpacingManager` takes an optional resolver in its constructor and defaults to `createCrowdSpacingResolver()`. It also gets `setResolver(r)`, a runtime-only hook for tests and scenarios that is never serialized.

## Agent Instructions

This plan is executed by `/jp-implement-plan`. The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each to finish, and reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. Follow `.claude/skills/jp-implement-plan/SKILL.md`.

- Branch: `crowd-spacing-mass-resolver`. **Do not commit.** The working tree has many unrelated uncommitted changes; don't touch or revert them.
- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md`. Mass, bracing and resistance are data and constants, never unit-type checks.
- **No `CROWD_SPACING_MODE` checks outside `crowdSpacingMode.ts`.** New def or ability fields are read only by the mass resolver.
- Determinism: iterate in sorted id order, accumulate deltas first and apply after, and use no `Math.random`. CrowdSpacing state stays runtime-only. If a new def or ability field is static def data, it needs no serialization.
- Tests use **Vitest** (`npx vitest run <file>`), never jest.
- Per-step verify: `npm run lint`, `npx tsc --noEmit` (every step crosses module boundaries), then only the test files the step lists.
- Relevant skills: `scoped-testing`, `game-engine`, `game-object-def-pattern`, `ability-tests`, `time-dilation` (which clock `dt` comes from; use the unit-local step if movement uses it), `performance-debugging`.

## Steps

### Step 1 — Resolver interface + legacy behind it (pure refactor)

Touches: `game/crowdSpacing/**`, `game/managers/UnitManager.ts` (only if `tick` needs `dt`), `testing/scenarios/general/crowdSpacing.ts` (import path only).

- [x] Create the `shared/` helpers (`enumerateOverlaps`, `applyClampedDelta`) and move `CrowdSpacingGrid` (+ test) into `shared/`. Move roles + resolve into `legacy/` as `legacyRoles.ts` and `LegacyResolver.ts`, built on the shared helpers. Behaviour must be byte-for-byte identical. Move the existing tests alongside and fix imports.
  - Added `shared/enumerateOverlaps.ts` (`indexCrowdSpacingParticipants`, `enumerateCrowdSpacingOverlaps` with optional pre-geometry `considerPair` filter; pair = `{a,b,nx,ny,overlap,coincident}`) and `shared/applyClampedDelta.ts` (`applyClampedCrowdSpacingDelta` → applied vector, grid untouched when zero). Files moved with plain `mv` (index untouched): `shared/CrowdSpacingGrid(.test).ts`, `legacy/legacyRoles(.test).ts`, `legacy/LegacyResolver(.test).ts` (test was `resolveCrowdSpacing.test.ts`). `resolveCrowdSpacingPass` still exported from `LegacyResolver.ts` (same math/order) and wrapped by `class LegacyResolver`. `crowdSpacingConstants.ts` stays at the folder root, so the scenario import needed no change.
- [x] Add `CrowdSpacingResolver.ts`, plus `crowdSpacingMode.ts` with `export type CrowdSpacingMode = 'legacy' | 'mass'`, `CROWD_SPACING_MODE = 'legacy'` and `createCrowdSpacingResolver(mode = CROWD_SPACING_MODE)`. Until Step 3, the `'mass'` branch may throw "not implemented".
  - `CrowdSpacingResolver.ts` exports the interface + `CrowdSpacingResolveArgs`; `crowdSpacingMode.ts` switch returns `new LegacyResolver()` and throws for `'mass'` (Step 3 replaces the throw).
- [x] Make `CrowdSpacingManager` delegate participation, radius and resolve to the resolver. Add the constructor parameter and `setResolver`. Pass `dt` into `tick` from `UnitManager`. Keep `getContacts` behaviour.
  - Manager takes `resolver = createCrowdSpacingResolver()`, adds `getResolver()` and `setResolver()` (sets `needsRebuild`), `tick(units, terrainManager, dt)`. UnitManager passes its tick `dt`, which is **world dt** (`worldPace × FIXED_DT`), not unit-local; Step 3 may want `unit.localStep` for per-unit budgets (see `time-dilation`). Manager test gained 2 delegation tests. Verify: lint + tsc clean, 5 files / 37 tests green.
- Verify: `npx vitest run app/js/games/minion_battles/game/crowdSpacing app/js/games/minion_battles/testing/scenarios/crowdSpacing.scenarios.test.ts`

### Step 2 — Mass and bracing data

Touches: `game/crowdSpacing/mass/{massConstants,crowdMass,crowdBracing}.ts` (+ tests), `game/units/unit_defs/unitDef.ts`, `abilities/Ability.ts` (or wherever ability def config lives), and the unit getter that delegates to the def (see `game-object-def-pattern`).

- [x] `massConstants.ts`:
  - Mass per `UnitSize` (`Record<UnitSize, number>`), scaling much faster than radius: about Minuscule 0.3, Diminutive 0.4, Tiny 0.5, Extra Small 0.65, Small 0.75, Medium 1, Large 2, Extra Large 3, Giant 5, Colossal 8.
  - `CROWD_MASS_BOSS_MULTIPLIER` = 3.
  - `CROWD_MASS_ENEMY_RESISTANCE` = 3.
  - `CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION` = 0.6.
  - A fallback mass for units without a size: derive it from radius against `UNIT_SIZE_MAP` by picking the nearest tier.
  - Added `mass/massConstants.ts`: `CROWD_MASS_BY_SIZE` (values as listed), `CROWD_MASS_BOSS_MULTIPLIER`/`CROWD_MASS_ENEMY_RESISTANCE` = 3, `CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION` = 0.6, `nearestUnitSizeForRadius(r)` + `crowdMassForRadius(r)` (ties → smaller tier).
- [x] Optional `crowdMass?: number` on the unit def, exposed by a unit getter that delegates to the def. `getCrowdMass(unit)` resolves to the def override if set, else the size-tier mass, then multiplies by the boss multiplier when the unit is tagged `Boss`. Unit test.
  - `UnitDefEntry.crowdMass?` + `getUnitCrowdMassOverride(id)` / `getUnitDefSize(id)` in `unitDef.ts`; `Unit.crowdMassOverride` getter. `mass/crowdMass.ts`: `getCrowdSizeTier(unit)` = def `size` when `unit.radius` equals its tier radius, else nearest tier to the actual radius (covers portrait/per-spawn radius overrides and defs without size); `getCrowdMass(unit)` = override ?? tier mass, × boss multiplier. `crowdMass.test.ts` (8 tests).
- [x] Ability def flag `crowdBraceDuringWindup?: boolean` (default `true`). `isCrowdBraced(unit)` is true when the unit is tagged `Structure` or `CrowdSpacingAnchor`, or is a forced mover (`knockback != null || controlled`), or has an active ability whose current phase is `AbilityPhase.Windup` and whose flag isn't `false`. Use the existing phase helpers in `abilities/abilityTimings.ts` (e.g. `getCoveringAbilityPhaseAtElapsed` + `getCastElapsed`) rather than re-deriving timings. Unit test, including a ChargeAttack-style wolf in windup.
  - `AbilityStatic.crowdBraceDuringWindup?` in `abilities/Ability.ts`. `mass/crowdBracing.ts`: `isCrowdBraced(unit, engine: { gameTime })` and `isInBracingWindup(unit, engine)` (uses `resolveAbilityTimingEntries` + `getCastElapsed` + `getCoveringAbilityPhaseAtElapsed`; reuses legacy `isCrowdSpacingForcedMover`). **Note for Step 3:** bracing needs `gameTime` (cast elapsed falls back to world time for units without a started local clock), but `CrowdSpacingResolveArgs` has no time field — add `gameTime` to the resolve args (manager/UnitManager pass `engine.gameTime`). `crowdBracing.test.ts` (7 tests, incl. Alpha Wolf Charge `0007` braced in windup, not in lunge/cooldown, local-clock read, opt-out). Verify: lint + tsc clean, 2 files / 15 tests green.
- Verify: the new `mass/*.test.ts` files.

### Step 3 — MassResolver

Touches: `game/crowdSpacing/mass/MassResolver.ts` (+ test), `crowdSpacingMode.ts`, `crowdSpacingResolvers.test.ts` (new).

- [x] Participation: same exempt rules as legacy (dead, untargetable, airborne, `abilityOwnsMovementThisTick`, `CrowdSpacingExempt`). Radius: same as legacy, including player padding (reuse the helper; move it to `shared/` if needed). Build per-unit records once per `resolve`.
  - New `shared/crowdSpacingParticipation.ts` (`getCrowdSpacingRadius`, `isCrowdSpacingForcedMover`, `isCrowdSpacingExempt`); `legacyRoles.ts` uses + re-exports them (behaviour unchanged), `crowdBracing.ts` imports from shared. `MassResolver` builds one `MassRecord` per unit (radius, mass, braced, budget, ownPlayer, delta, scale, residual). `gameTime` added to `CrowdSpacingResolveArgs`; `CrowdSpacingManager.tick(units, terrain, dt, gameTime)`, UnitManager passes `engine.gameTime`.
- [x] Pair pass: use `enumerateOverlaps`, call `onContact`, and skip pairs where both units are braced.
  - Effective mass = mass × enemy resistance when the two units are on different teams. A braced unit's mass is infinite.
  - Owner yield: when one unit's `ownerId` equals the other's `ownerId` and the other is that player's own unit, the summon takes the full correction.
  - Split by inverse mass, store the pair entry in an array, and accumulate raw deltas.
  - `splitOverlap`: braced → partner takes all; owner yield via `isOwnPlayerCharacter` (`characterId === PLAYER_CHARACTER_ID && isPlayerControlled()`, the existing convention); else inverse mass with `crowdTeamMassMultiplier` (`!areAllies` → `CROWD_MASS_ENEMY_RESISTANCE`). Braced–braced pairs filtered in `considerPair` (no contact, matching legacy anchor–anchor). **Open question:** resistance multiplies *both* masses, so it cancels out of the normalized split — it currently has no effect (see report / Step 3 note below).
- [x] Clamp then sweep:
  - Clamp each unit's delta to its budget, `fraction × speed × dt`, then to terrain via `applyClampedDelta`. Record `s = |applied| / |requested|`.
  - Run the residual sweep over the stored pairs, moving any part a unit couldn't take onto its partner, as long as the partner isn't braced.
  - Apply the residuals with one terrain clamp each and no budget cap.
  - Budget = `getCrowdPushBudget(unit, dt)` = `fraction × unit.speed × (unit.localClockActive ? unit.localStep : dt)` (frozen units get 0 → they act as walls, their share goes to the partner). Behaviour note: when *both* units in a pair are budget-capped, each receives the other's leftover, so the pair still fully separates (budget only binds when the partner has headroom). A pusher whose own share is capped loses its leftover into a wall-pinned partner, so wall pushback converges over a few ticks rather than in one.
- [x] Wrap the resolve in `tickPerformanceTracker` the same way other engine subsystems are timed.
  - Added `PERF_CROWD_SPACING_MASS_RESOLVE` (`massResolve`, nested under `units.crowdSpacing`) plus verbose-level `pairs` / `clamp` / `residual` keys in `tickPerformanceTracker.ts`.
- [x] Factory: `'mass'` returns `new MassResolver()`.
  - `crowdSpacingMode.ts` switch; `CROWD_SPACING_MODE` still `'legacy'` (Step 4 flips it).
- [x] `MassResolver.test.ts`, pure unit-level with hand-placed units:
  - Done after the option (b) decision: 14 tests, incl. "enemy line resists a walking player more than an ally line" (60-tick walk, enemy progress < 0.6 × ally progress). The `resolveOnce` helper now takes `moved` (snapshot = pos − moved).
  - Written earlier (10 tests, green): heavy vs light, braced (Structure / CrowdSpacingAnchor / knockback), budget cap with residual to pusher, local-step budget, player vs wall-pinned enemy, players split evenly (not anchors), summon yields to owner (not to another player), braced–braced contacts, shuffled-order determinism. **Missing: "enemy line resists a player more than an ally line"** — blocked on the resistance question; item left unchecked until it is answered.
  - A heavy unit moves less than a light one.
  - A braced unit never moves.
  - Displacement per tick is ≤ budget.
  - A player walking into an enemy pinned against a wall is pushed back.
  - An enemy line resists a player more than an ally line does.
  - A summon yields to its owner.
  - Results are deterministic under shuffled input order.
- [x] `crowdSpacingResolvers.test.ts`: `describe.each` over both resolvers with shared invariants:
  - Structures never move.
  - Exempt units are ignored.
  - An overlapping soft pack spreads over N ticks.
  - Contacts are recorded for overlapping pairs.
  - Added; runs through `CrowdSpacingManager` with each resolver (8 tests, green). Verify: lint + tsc clean; `game/crowdSpacing` 8 files / 69 tests green; `crowdSpacing.scenarios.test.ts` green.
- **Step 3 open question (team resistance):** as written, `CROWD_MASS_ENEMY_RESISTANCE` multiplies both effective masses of a cross-team pair, which cancels in `mB/(mA+mB)`, so enemies and allies split identically. In this model a pusher's throughput is set by the pushee's budget (overlap grows until the pushee's share hits its budget), so resistance must act on the budget (or on something non-normalized) to matter. A naive "cross-team budget ÷ R" also caps the pusher's own pushback and lets it walk through. Needs a decision before the remaining test can be written; the code path is isolated in `crowdTeamMassMultiplier` / `splitOverlap`.
- Verify: those two test files plus `game/crowdSpacing/CrowdSpacingManager.test.ts`.

- **Decision (user, option b): pusher detection.**
  - **Pre-movement snapshot.** At the start of each unit-movement tick, before any unit moves, `CrowdSpacingManager` records every unit's position. Add a manager method such as `beginTick(units)` and call it from `UnitManager` before the movement loop. The snapshot is runtime-only: rebuilt every tick and never serialized.
  - **Who is pushing.** For each overlapping pair, a unit is a *pusher* when the dot product of its own displacement this tick (position now − snapshot) with the normal toward its partner exceeds `CROWD_MASS_PUSHER_EPSILON` (new constant, small, in world px). Both, one or neither unit can be a pusher.
  - **Team resistance.** In a cross-team pair, each **non-pusher** has its push budget divided by `CROWD_MASS_ENEMY_RESISTANCE`. Remove the mass multiplier (`crowdTeamMassMultiplier`) so mass stays size-only. Allies get no change.
  - **Where leftover push goes.** A unit's leftover push goes **only to partners that are pushers**, and only if they aren't braced. If neither unit is a pusher, it goes to whichever partner has spare budget; otherwise it's dropped. Dropped overlap carries over to the next tick, as legacy already allows. This fixes the leak where two budget-capped units fully separated.
  - **Expected results:**
    - A player walking into an enemy line is stopped.
    - An enemy pressing into a standing player moves them slowly, at the player's budget ÷ resistance.
    - Nobody is pushed faster than their own budget, except a pusher taking pushback.
- [x] Implement the decision above in `MassResolver.ts`, `CrowdSpacingManager.ts`, `UnitManager.ts` and `mass/massConstants.ts`. Then finish `MassResolver.test.ts`:
  - The enemy-line-vs-ally-line case.
  - Two budget-capped non-pushers don't separate faster than their budgets.
  - A pusher into a unit pinned against a wall gets the pushback.
  - Determinism is unchanged.
  - When done, check the item above as well.
  - `CrowdSpacingManager.beginTick(units)` snapshots active units' positions; `tick` passes it as the new optional `tickStartPositions` on `CrowdSpacingResolveArgs` (legacy ignores it) and clears it afterwards, so a tick without `beginTick` sees nobody as moved. `UnitManager.gameTick` calls `beginTick` right after `planUnitSteps`, before the passive/ability/movement phases. `CROWD_MASS_PUSHER_EPSILON = 0.05` px. `MassResolver`: `crowdTeamMassMultiplier` removed (mass size-only); per pair `pusherA/B` from snapshot displacement · normal; a unit that is a non-pusher in **any** cross-team pair gets budget ÷ resistance (per-unit, since budget is per-unit); `residualFor` gives leftover uncapped to a pusher partner, to the partner's remaining `spare` budget when neither pushes, else drops it. Tests added: two capped non-pushers, enemy line vs ally line, enemy pressing a standing player (≤ player budget ÷ R, pusher takes the rest), non-pusher next to a wall-pinned unit gets no uncapped pushback; wall-pushback, budget-residual and determinism tests now mark the pusher via `moved`; manager test for the snapshot lifetime. `crowdSpacingResolvers.test.ts` "structures never move" loop 10 → 60 ticks (softs now spread only at budget, no leak). Verify: lint + tsc clean; `game/crowdSpacing` 8 files + `crowdSpacing.scenarios.test.ts`, 75 tests green.

### Step 4 — AbilityTest scenarios + enable mass mode

Touches: `testing/scenarios/general/crowdSpacing.ts`, a new `testing/scenarios/general/crowdSpacingMass.ts`, `testing/scenarios/registry.ts`, `testing/scenarios/crowdSpacing.scenarios.test.ts`, `crowdSpacingMode.ts`.

- [x] The existing `crowd_spacing_pack_and_anchors` scenario asserts that players hold, which is legacy behaviour. Pin it to legacy with `engine.crowdSpacingManager.setResolver(new LegacyResolver())` in its setup and label it as such.
  - `buildEngine` calls `setResolver(new LegacyResolver())`; title now "CrowdSpacing (legacy): …" and the file header says it is legacy-only.
- [x] Add mass scenarios, deterministic and short, asserting high-level behaviour rather than exact numbers. Each one calls `setResolver(new MassResolver())` so it passes no matter what the constant says:
  - `crowd_mass_hallway_blockade`: a player orders a move down a 1-cell corridor filled with regular enemies and fails to get past them in time T.
  - `crowd_mass_windup_brace`: a wolf in charge windup isn't displaced by a player walking into it.
  - `crowd_mass_size`: a small unit walking into a Large/boss doesn't move it meaningfully; the Large one moves the small one.
  - `crowd_mass_push_speed_cap`: a fast unit pushing a slow one never moves it faster than the slow one's budget.
  - Register them and add them to `crowdSpacing.scenarios.test.ts`.
  - New `testing/scenarios/general/crowdSpacingMass.ts` (exports `CROWD_MASS_SCENARIOS`, all `generalSection: 'Movement'`, each pins `MassResolver`). Hallway: player MOVE_ONLY down a rock-walled row past 4 slimes; after 4 s still behind every slime and short of the last slime's start cell. Windup brace: `dark_wolf` given `0007` (queued tick 1, aimed away), player walks into it; at t∈[0.8,0.95] s wolf drift ≤ 0.01 px and player in contact. Size: one-team lanes via `setWalkGoal` — swarmling into a `Boss`-tagged `alpha_wolf`, boar into a swarmling; boss displacement < 0.25 × swarmling's, swarmling ≥ 20 px. Push cap: dog walks into a swarmling; per-tick swarmling step ≤ `fraction × speed × 1/60` and reaches ≥ 90 % of it (dog later slides round it, so total distance isn't asserted). Registered via `...CROWD_MASS_SCENARIOS` after the legacy one in `registry.ts`; the test file runs them with `it.each`. Probe: under `LegacyResolver` hallway, windup brace and push cap fail (size passes in both), so the scenarios discriminate.
- [x] Set `CROWD_SPACING_MODE = 'mass'`.
  - Flipped in `crowdSpacingMode.ts`. Verify: lint + tsc clean; `crowdSpacing.scenarios.test.ts` 5/5 green; `game/crowdSpacing` 8 files / 74 tests still green with mass as default. Full suite not run (Step 5).
- Verify: `npx vitest run app/js/games/minion_battles/testing/scenarios/crowdSpacing.scenarios.test.ts`

### Step 5 — Final verification

- [x] `npm run lint`, `npx tsc --noEmit`, then `npm run test`. Mass mode is now live, so check for failures in other scenarios that relied on players or summons being anchors (knockback, pets, pathfinding, Gaoler's Hook and so on).
  - A failure that reflects intended mass behaviour: pin that test to `LegacyResolver` only if the test is about something else; otherwise update the expectation.
  - A real regression: fix it in the mass resolver or its constants, never with a special case.
  - List each failure and its decision here.
  - **Run (mass live):** lint + tsc clean; `npm run test` 3 files / 14 tests failed of 4166.
  - `game/time/unitTempo.test.ts` (7) + `buffs/hitPause.test.ts` (6): `engine.crowdSpacingManager.beginTick is not a function` — their hand-rolled engine stubs had only `tick`; Step 3 added `beginTick` to `UnitManager.gameTick`. Mode-independent but caused by this plan → **fixed**: stubs now `{ beginTick: () => {}, tick: () => {} }`. Both files 21/21 green.
  - `testing/scenarios/movementShowcase.scenarios.test.ts` › `move_player_pursue_moving_unit` (1): **mass-caused** (passes 7/7 with `CROWD_SPACING_MODE = 'legacy'`). Ends `dist=42.0 (stop 37.0) playerMovement=yes`: pursuit stops at `unit.radius + target.radius + MIN_FOLLOW_RADIUS` (`unitMovementTick.ts:244`, also `unitAI/utils.ts:233`), i.e. 37, but the player's CrowdSpacing radius has +10 padding, so mass holds player and swarmling 42 apart. In legacy the anchor player could overlap the target; in mass it gets pushed back, so **the pursuit never completes** (also in the live game: a player "move to unit" order against a resisting enemy presses into it forever). **Not fixed, open question below.** Prototype (reverted): also stopping pursuit when `crowdSpacingManager.getContacts(unit.id)` includes the target ends the movement, but the scenario still fails its `dist ≤ stop + 2` check (42 vs 39), so the expectation would have to change too.
  - **Open question (Step 5):** the fix is outside the plan's allowed places (mass resolver / constants). Options: (a) engine fix in movement: pursuit with no explicit `stopRange` also stops on CrowdSpacing contact with the target (mode-agnostic, via `getContacts`), and the scenario asserts contact / crowd-radius distance instead of display radius; (b) the mass resolver drops player radius padding (`radius()` = `unit.radius`), which contradicts "keep their radius padding" in the Goal; (c) pin the scenario to `LegacyResolver` (hides the live bug, so not recommended). Item left unchecked until decided.
  - **Decision (user): option (b).** `MassResolver.radius()` now returns `unit.radius` (no player padding); two `MassResolver.test.ts` expectations updated to match. Re-run: lint + tsc clean, `npm run test` 504 files / 4164 passed, 2 skipped, 0 failed.
- [x] Manual browser checklist for the user (don't run it):
  - Wolves charging through a crowd keep their aim.
  - A player blocked in a hallway can't shove through.
  - Bosses hold their ground.
  - Summons step aside for their owner.
  - Small swarms slow the player but don't wall them in.
  - A player "move to unit" order on an enemy completes, with no endless pressing.
  - Checklist recorded here for the user; not run.

## Follow-ups (not in this plan)

- A "hemmed in" slow or keyword driven by summed enemy mass in contact (expose `getCrowdPressure` on the resolver; legacy returns 0).
- A second pass, run only for units clamped this tick, if one-tick squish shows in dense jams.
- Delete the losing resolver and the constant once a winner is picked.
