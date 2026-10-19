# Blood Shard upgrade: Blood Splinters

A tier-13 Blood Mage research upgrade for Blood Shard (0304). When researched, every Blood Shard
cast also bursts a shard out of **each bleeding enemy within Blood Shard's range of the caster**:

- The shard **hits the enemy it emerges from** for **4** damage and **consumes up to 4 bleed stacks**
  from it (any bleeding enemy qualifies; fewer than 4 stacks are all consumed).
- It then **flies toward the cursor** (the Blood Shard target point, clamped to Blood Shard's range
  from the host) and deals **4** damage to the **first other enemy** it hits, like a normal shard.
  It never re-hits its host.
- It fires on the same release frame as the main shard.
- **Previews** show it: while aiming (and in ghost-plan previews) each eligible host gets a ring and
  a line from the host toward the cursor, using the exact same host selection as the runtime.

Decisions confirmed with the user: flight hits the first enemy; any bleed qualifies (consume up to
4); "nearby" = within `BLOOD_SHARD_RANGE` of the caster; node is tier 13 and requires Blood Shard.
Working name for the node is "Blood Splinters" (rename freely; ids below use `splinters`).

Build the engine, not the feature (see `app/js/games/minion_battles/AGENTS.md`): bleed consumption
and "launch a projectile out of each of these units" are reusable building blocks, not Blood Shard
special cases.

## Agent Instructions

This plan is written for `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`):
the invoking agent is the sole orchestrator; it runs one worker per step **synchronously**, waits
for it, and reports completion. Each worker implements exactly one step, checks its items off with a
one-line summary each, and stops without spawning another agent.

For this run the user asked for **one Sonnet agent** to implement Steps 1-5 in order (checking items
off as it goes, never spawning agents), and for the orchestrator to review and run Step 6 itself.

Relevant project skills: **creating-an-ability** (+ `card_defs/SKILL.md`), **working-with-hitboxes**,
**research-trees**, **ability-tests**, **scoped-testing**, **game-object-def-pattern**.
Tests use Vitest (`npx vitest run <file>`), never Jest. The working tree has uncommitted Blood Mage
work (Bloody Claws, Rend, Blood Pact); build on it and do not revert or reformat unrelated files.

Per-step verification: `npx vitest run` on only the test files that step touches or creates, plus
`npx tsc --noEmit` when the step changes an interface or class boundary. No broad runs per step.

## Steps

### Step 1: Bleed consumption helpers

Files: `app/js/games/minion_battles/buffs/bleedRuntime.ts`, `buffs/bleedRuntime.test.ts`,
`abilities/keywords/rendKeyword.ts`.

- [x] Add `consumeBleedStacks(unit: Unit, max: number): number` to `bleedRuntime.ts`. *Done: added to bleedRuntime.ts.*
  - Removes up to `max` stacks from the unit's `BleedBuff` and returns how many were removed (0 when
    not bleeding). A buff left at 0 stacks expires through the normal sweep (`BleedBuff.isExpired`).
- [x] Add `isBleeding(unit: Unit): boolean` to `bleedRuntime.ts` (true only when a `BleedBuff` with *Done: added to bleedRuntime.ts; rendKeyword.ts now imports it.*
  `stacks > 0` is present).
  - Move the existing `isBleeding` out of `rendKeyword.ts`: Rend imports it from `bleedRuntime.ts`.
- [x] Tests in `bleedRuntime.test.ts`: consumes exactly 4 of 6, consumes all 2 of 2 (returns 2, *Done: 3 tests added; bleedRuntime + rendKeyword tests pass.*
  `isBleeding` false afterwards), returns 0 for a non-bleeding unit.
  - Run `bleedRuntime.test.ts` and `abilities/keywords/rendKeyword.test.ts`.

### Step 2: Projectile launch "emerge from units"

Files: `abilities/CastBehaviours/ProjectileLaunchBehaviour.ts`, new
`abilities/CastBehaviours/ProjectileLaunchEmerge.test.ts`.

- [x] Add a builder option `withEmergeFrom(select, onEmerge?)` to `ProjectileLaunchBehaviour`. *Done: implemented with shared private createProjectile; also bumps hitPolicy.damagingHits by 1 so the pre-marked host does not consume the flight's hit.*
  - `select: (ctx: CastBehaviourSetupContext) => Unit[]` picks host units; the behaviour launches one
    projectile per host instead of one from the caster. Hosts are used in the order returned.
  - Origin = host position. Direction = host → launch target (same `resolveLaunchTarget` as today),
    flight distance clamped to `maxRange` from the host (and to the target unless `withTravelFullRange`).
  - Before `engine.addProjectile`, add the host's id to `projectile.hitUnitIds` so the flight never hits
    its own host (the set is already serialized).
  - `onEmerge?: (ctx, host) => void` runs for each host before its projectile launches (for host
    effects such as damage). If host and target coincide (zero distance), still run `onEmerge` but
    launch nothing.
  - Not supported together with `withHold`, `withOrigin` or `withDirection`; document that in the
    JSDoc. Existing behaviour when `withEmergeFrom` is unused must not change.
- [x] `ProjectileLaunchEmerge.test.ts`: two hosts → two projectiles, each starting at its host, *Done: 4 tests; CastBehaviours tests and tsc clean.*
  heading toward the target, with its host pre-marked in `hitUnitIds`; `onEmerge` called once per
  host; zero hosts → no projectile.
  - Run the new test file and `npx tsc --noEmit`.

### Step 3: Blood Splinters runtime and research node

Files: `card_defs/03_blood_mage/0304_BloodShard/0304Ability.ts`,
`card_defs/03_blood_mage/0304_BloodShard/0304Ability.test.ts`, `app/js/researchTrees/trees/blood_mage.ts`,
`card_defs/03_blood_mage/AGENTS.md`.

- [x] Research node in `blood_mage.ts`: `BLOOD_MAGE_NODE_SPLINTERS = 'blood_mage_shard_splinters'`, *Done: node, id and cost constants added (14/9/3).*
  title "Blood Splinters", tier 13, prereq + `anyResearched` requirement on `BLOOD_MAGE_NODE_SHARD`,
  position `{ x: 420, y: 570 }`, short description/flavor in the tree's voice, no `addCard` effect.
  - Cost with named constants: crystals 14, food 9, metal 3 (26 total; satisfies
    `researchCosts.test.ts`: tier-13 total, crystal/food floors, crystal+food lean over metal).
- [x] Constants in `0304Ability.ts`: `BLOOD_SPLINTER_HOST_DAMAGE = 4`, `BLOOD_SPLINTER_FLIGHT_DAMAGE = 4`, *Done: three BLOOD_SPLINTER_* constants exported.*
  `BLOOD_SPLINTER_BLEED_CONSUMED = 4`.
- [x] Exported pure helper `findBloodSplinterHosts(caster, units): Unit[]`: alive enemies of the caster *Done: implemented; shared by runtime and preview.*
  (`areEnemies`) that `isBleeding`, whose centre is within `BLOOD_SHARD_RANGE + unit.radius` of the
  caster; sorted by distance, then id (deterministic). Runtime and preview both use it.
- [x] Splinter launch behaviour: `CastBehaviours.ProjectileLaunch()` with the Blood Shard speed, *Done: splinterLaunch built with withEmergeFrom; onEmerge does tryDamageOrBlock, consumeBleedStacks, impact flash.*
  range, sprite and `withBaseDamage(BLOOD_SPLINTER_FLIGHT_DAMAGE)`, plus
  `withEmergeFrom(ctx => findBloodSplinterHosts(ctx.caster, ctx.engine units), onEmerge)`.
  - `onEmerge`: deal `BLOOD_SPLINTER_HOST_DAMAGE` to the host through the normal attack path
    (`tryDamageOrBlock`, attackType `'ranged'`, source = caster, abilityId = Blood Shard), then
    `consumeBleedStacks(host, BLOOD_SPLINTER_BLEED_CONSUMED)`, then a `spawnBloodMistImpactFlash`
    at the host (`variant: 'shard'`).
- [x] Add `getAbilityTimings(caster, gameState)` to Blood Shard: same `buildThrowBaseTimings` call, *Done: buildBloodShardTimings(withSplinters); static abilityTimings stays unresearched.*
  plus the splinter behaviour appended to `releaseBehaviours` when
  `hasResearchNode(engine, caster, BLOOD_MAGE_TREE_ID, BLOOD_MAGE_NODE_SPLINTERS)`. Keep the static
  `abilityTimings` as the unresearched version (Throw Knife's `getAbilityTimings` is the pattern).
- [x] Tooltip: when researched (resolve research like Throw Knife's tooltip does), add one line, e.g. *Done: extra line added using tokens when the node is researched.*
  `Each bleeding enemy in range bursts a shard: {4} damage to it, consumes up to {4} bleeding stacks, then flies at the target for {4} damage.`
- [x] Add a row/note to `card_defs/03_blood_mage/AGENTS.md` for the upgrade. *Done: appended to the 0304 row.*
- [x] Tests in `0304Ability.test.ts` (engine mock with `getPlayerResearchNodes` returning the node): *Done: node, runtime (6 stacks, 2 stacks, out of range, unresearched) tests; 0304 + researchCosts pass, tsc clean.*
  - researched: a bleeding enemy (6 stacks) in range takes 4, ends with 2 stacks; a non-bleeding
    enemy between it and the cursor takes 4 from the splinter's flight; the host is not hit twice.
  - an enemy with 2 stacks takes 4 and stops bleeding; a bleeding enemy out of range is untouched.
  - unresearched: no splinters, behaviour identical to before.
  - node is tier 13, requires the Blood Shard node.
  - Run `0304Ability.test.ts` and `app/js/researchTrees/researchCosts.test.ts`, then `npx tsc --noEmit`.

### Step 4: Previews

Files: `card_defs/03_blood_mage/0304_BloodShard/0304Ability.ts`, `0304Ability.test.ts`.

- [x] Exported pure helper `getBloodSplinterPreviewSegments(caster, aim, units)` returning, for each *Done: implemented via clampToMaxRange from the host.*
  host from `findBloodSplinterHosts`, `{ host, from, to }` where `to` is the aim clamped to
  `BLOOD_SHARD_RANGE` from the host (same maths as the runtime flight).
- [x] In `renderTargetingPreviewSelectedTargets(gr, caster, currentTargets, mouseWorld, units, gameState)`: *Done: ring + thin line per host when researched.*
  after the existing caster line, when the upgrade is researched (`gameState` is the engine), draw for
  each segment a blood-red ring around the host and a thinner line from host toward the cursor
  (`drawClampedLine` with the host as origin works). This path already runs for live aiming and for
  ghost-plan previews in `PreviewRenderer`.
- [x] Test the helper: hosts/segments match `findBloodSplinterHosts`, segment end is clamped to range. *Done: hosts/segments tests added to 0304Ability.test.ts; passing.*
  - Run `0304Ability.test.ts`.

### Step 5: AbilityTest scenario

Files: new `testing/scenarios/abilities/bloodShardScenarios.ts`, `testing/scenarios/registry.ts`,
`testing/runner/SimulationRunner.test.ts`.

- [x] One committed-run scenario `blood_shard_splinters_e2e` (pattern: `burstScenario.ts` and *Done: bloodShardScenarios.ts; asserts host/stack deltas vs a pre-release sample (first bleed tick lands before release) and dummy hp.*
  `throwRockResearch.ts` for research via `playerResearchTreesByPlayer`): Blood Mage caster with the
  splinter node researched, one bleeding enemy (6 stacks) to the side of the throw line, one
  non-bleeding dummy at the target point. Cast Blood Shard at the dummy.
  - Assert at a check time after release + flight: the bleeding host took the host damage and has
    2 stacks; the dummy took Blood Shard damage plus the splinter's flight damage.
- [x] Register the scenario in `registry.ts` and add an `it(...)` for it in `SimulationRunner.test.ts`. *Done: registered in registry.ts (plus 0304 id mapping) and it() added; -t "splinters" passes.*
  - Run only that new `it` (`npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "splinters"`).

### Step 6: Final verification (orchestrator)

- [x] `npm run lint:changed` and `npx tsc --noEmit` are clean. (Both clean.)
- [x] Vitest for the touched areas once (84 files pass, incl. all SimulationRunner scenarios; plus card_defs + game/projectiles, 43 files): `card_defs/03_blood_mage`, `abilities`, `buffs`,
  `researchTrees`, and `SimulationRunner.test.ts` (includes the new scenario).
- [x] Review the diff against this plan (fixed: host tie-break used `localeCompare`, now a plain id compare for cross-client determinism): reusable building blocks, no behaviour change to existing
  projectile launches, preview and runtime share host selection.
- [ ] Manual check if a browser run is practical: with the node researched, aiming Blood Shard near
  bleeding enemies shows host rings and host-to-cursor lines; casting bursts shards from them.
