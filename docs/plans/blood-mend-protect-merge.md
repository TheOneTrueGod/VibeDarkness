# Merge Protect into Blood Mend

Protect (0303) is removed and its role folds into Blood Mend (0301). The merged Blood Mend:

- Targets an ally, including the caster (as Blood Mend does now). Keeps Blood Mend's name, id and
  cast stats: 1.0s windup, 1 use per round, 5 HP cost that can never drop the caster below 1 HP.
- Grants the target a **30 HP blood shield** (`ShieldBuff`, blood theme, so it shows Protect's
  shadowy shimmer on the buffed unit). It decays at Protect's current rate (30 HP over 7 s, i.e.
  `30 / 7` per second, regardless of bonus shield).
- **Rend 4** around the target, and **+4 shield per enemy the Rend hits**.
- **Decay heals**: as the shield decays, the target heals for half the decayed amount (lose 2 → heal 1),
  through `applyHeal` so the standard injury applies. Shield lost to enemy damage never heals.
- **No** direct burst heal any more.
- Uses Blood Mend's windup and cast VFX, but subdued: no blood-mist circle may extend more than
  about 20 px beyond the caster's / target's body (unit radius + 20 px), at any point in its animation.
- Brief, punchy tooltip, Slay the Spire style, e.g.:
  `Grant an ally a {30} blood shield.` / `{Rend 4}: +{4} shield per enemy hit.` /
  `As it fades, heal half the lost shield.` (plus the usual short HP-cost line if the other Blood
  Mage cards keep theirs). The Rend keyword card already explains Rend itself.

The tier-3 **Blood Ward** research node (which only granted Protect) is removed.

Decisions confirmed with the user: remove Blood Ward; keep Blood Mend's stats; keep the name.

## Systematizing Rend follow-ups (engine)

Rend is an engine keyword (`abilities/keywords/rendKeyword.ts` + `rendRuntime.ts`). Instead of
Blood Mend counting hits by hand, make "do X for each enemy a Rend hit" a reusable building block on
top of the existing **keyword use** system (`AbilityKeywordUse`: `effect` runs only when the keyword
triggers; `effectText` renders `{Rend 4}: <effectText>` via `formatKeywordUseTooltip`):

- `applyRend` returns the units it damaged.
- `KeywordContext` gains an optional `center` (where an area keyword such as Rend resolves; defaults
  to the caster). `KeywordResult` gains an optional `count` (units affected).
- Rend gets a `resolve`: Rend N at `ctx.center`, `{ triggered: hits > 0, count: hits }`.
- **Import-cycle constraint:** `rendKeyword.ts` must stay free of runtime imports (the keyword
  registry is loaded by tooltip UI; a runtime import there previously crashed the app with
  "Cannot access 'REND_RADIUS' before initialization"). So add `registerKeywordResolver(id, resolve)`
  to `keywordRegistry.ts` and call it from `rendRuntime.ts`, which already holds the runtime code.
- Abilities then declare follow-ups as data: `keywordUses: [{ keyword: 'rend', n: 4, effectText:
  '+{4} shield per enemy hit', effect: (ctx, result) => ... }]` and call `runAbilityKeywords` with
  `center` at their cast moment. A small shared helper for "per hit" effects (e.g.
  `perRendHit(amount, apply)`) keeps ability code a list of behaviours.

## Agent Instructions

Executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`): the invoking
agent is the sole orchestrator; it runs one worker per step synchronously, waits for each, then
reports completion. Each worker implements exactly one step, checks its items off with a one-line
summary, and stops without spawning the next agent. For this run the user asked for **one Sonnet
agent** to implement Steps 1-5 in order (checking items off, never spawning agents); the
orchestrator reviews and runs Step 6.

Read first: `CLAUDE.md` (Vitest, not Jest), "Build the engine, not the feature" in
`app/js/games/minion_battles/AGENTS.md`, `abilities/keywords/AGENTS.md`,
`card_defs/03_blood_mage/AGENTS.md`, `.claude/skills/creating-an-ability/SKILL.md`,
`.claude/skills/ability-tests/SKILL.md`, `.claude/skills/research-trees/SKILL.md`.
Tooltip copy: `.claude/skills/narrative/writing-style-abilities/STYLE.md` (keyword lines).

Per step: only the test files the step touches/creates, plus `npx tsc --noEmit` when an interface
changes. No broad runs until Step 6. Do not commit.

## Steps

### Step 1: Rend follow-ups as keyword uses

Files: `abilities/keywords/keywordTypes.ts`, `keywordRegistry.ts`, `rendRuntime.ts`,
`rendKeyword.test.ts` (or a new `rendRuntime.test.ts`).

- [x] `applyRend` returns the damaged units (keep its current behaviour otherwise).
  - `applyRend` now returns the damaged units (via `damageEnemiesInCircle`, which now returns the units it targeted).
- [x] `KeywordContext.center?` and `KeywordResult.count?` with JSDoc; `registerKeywordResolver(id, resolve)`
  - Added `center?`/`count?`, `KeywordResolve`, `registerKeywordResolver`; `rendRuntime.ts` registers Rend's resolver (also exports `perRendHit`); `rendKeyword.ts` has only type imports.
  in the registry; `rendRuntime.ts` registers Rend's resolver (`count` = hits, triggered when > 0).
  `rendKeyword.ts` stays runtime-import-free (comment why).
- [x] Tests: Rend via `runAbilityKeywords` at a given centre damages only bleeding enemies in range,
  - New `rendRuntime.test.ts`: centre, count, effect scaling, no-hit skip, caster default.
  reports `count`, runs the use's `effect` with that count, and skips it when nothing was hit.

### Step 2: Shield decay heal

Files: `buffs/ShieldBuff.ts`, `buffs/ShieldBuff.test.ts`.

- [x] Optional `decayHealFraction` on `ShieldBuff` (default 0, serialized in `toJSON` / `fromJSON`).
  - `ShieldBuff` takes a 4th `decayHealFraction` arg, heals drained*fraction via `applyHeal`, serialized.
  In `onGameTick`, after draining, heal the unit by `drained * decayHealFraction` with `applyHeal`
  (default injury). Damage absorbed in `applyDamageToShields` must not heal.
- [x] Tests: decay of 2 heals 1 (and applies injury); absorbing damage heals nothing; JSON round-trip.
  - Added decay-heal, clamp, absorb-no-heal, default and JSON tests to `ShieldBuff.test.ts`.

### Step 3: Merged Blood Mend

Files: `card_defs/03_blood_mage/0301_BloodMend/0301Ability.ts`, its test, `abilities/bloodMageAllySplash.ts`,
`abilities/bloodMageVfx.ts` (sizes), `card_defs/03_blood_mage/AGENTS.md`.

- [x] Constants: `BLOOD_MEND_SHIELD_HP = 30`, `BLOOD_MEND_SHIELD_DRAIN_PER_SECOND = 30 / 7`,
  - Added the five constants in `0301Ability.ts`.
  `BLOOD_MEND_REND = 4`, `BLOOD_MEND_SHIELD_PER_REND_HIT = 4`, `BLOOD_MEND_DECAY_HEAL_FRACTION = 0.5`.
- [x] Active frame: pay HP (floor at 1), Rend 4 at the target through `runAbilityKeywords` with a keyword
  - Active frame pays HP, grants the shield (with decay heal), then runs a Rend keyword use (`rendShieldUse`) that adds 4 per hit; heal and `dealBloodMageRend`/`BLOOD_MAGE_REND` removed.
  use whose effect adds +4 per hit, then grant `ShieldBuff(30 + 4 * hits, 30 / 7, 'blood')` with the
  decay heal fraction. No `applyHeal` burst. Remove the now-unused `dealBloodMageRend` /
  `BLOOD_MAGE_REND` if nothing else uses them.
- [x] Subdue VFX: windup burst, travel mist and impact flash sized so the drawn circles never extend
  - Added `subduedBurstRadius`/`subduedImpactRadius` (20 px reach budget / 1.3, 1.4 growth factors) in `bloodMageVfx.ts`; preview circle unchanged.
  past unit radius + 20 px (check each effect def's growth: the impact flash draws up to
  `effectRadius * 1.4`; the burst's blobs reach about `effectRadius * 1.3`). Keep the targeting
  preview circle at Rend's radius (it shows Rend's area, not an effect).
- [x] Tooltip as in the summary above (brief).
  - Four lines: shield, `{Rend 4}: +{4} shield per enemy hit`, fade-heal line, HP-cost line.
- [x] Tests: shield = 30 with no bleeding enemies; 30 + 4·k with k bleeding enemies in range (and they
  - Rewrote `0301Ability.test.ts` (shield sizes, Rend, decay heal, no absorb heal, floor, tooltip, VFX reach sweep).
  take 4); no direct heal; decay heals half and applies injury; damage to the shield heals nothing;
  HP cost floor still holds; tooltip contains `{Rend 4}`.

### Step 4: Remove Protect and Blood Ward

Files: delete `card_defs/03_blood_mage/0303_Protect/`; `abilities/AbilityRegistry.ts`,
`card_defs/index.ts`, `researchTrees/trees/blood_mage.ts`, `testing/scenarios/registry.ts`
(tree `abilityIds`, `inferScenarioAbilityId`), delete `testing/scenarios/abilities/protectScenario.ts`,
`game/interactiveTargeting.test.ts`, `card_defs/03_blood_mage/AGENTS.md`, `abilities/bloodMageVfx.ts`
(drop the `shield` variant if unused).

- [x] Remove the card, ability, node (`BLOOD_MAGE_NODE_PROTECT` + its cost constants) and every reference.
  - Deleted 0303 folder and Protect scenario; removed registry/index/tree/node/cost references; AGENTS.md updated (`shield` VFX variant kept: Blood Pact uses it).
- [x] Confirm stored research containing `blood_mage_protect` is tolerated (evaluator ignores unknown node
  - Evaluator ignores unknown ids; added a test in `evaluator.merge.test.ts`.
  ids); add a test if no existing test covers it.
- [x] Re-point any test that used Protect as a generic ally-select example at Blood Mend.
  - `interactiveTargeting.test.ts` Scenario L now uses Blood Mend (wait budget raised to 120 ticks for the 1.0s windup).

### Step 5: AbilityTest scenario

Files: `testing/scenarios/abilities/bloodMendScenario.ts`, `testing/runner/SimulationRunner.test.ts`.

- [x] Rewrite the Blood Mend scenario: ally plus two bleeding enemies near it and one non-bleeding;
  - Rewrote `bloodMendScenario.ts` and added it to `SimulationRunner.test.ts`.
  after the cast the ally has a 38 HP blood shield, the bleeding enemies took 4, the other none; a
  little later the shield has decayed and the ally's HP rose by half the decay.

### Step 6: Final verification (orchestrator)

- [x] `npm run lint:changed`, `npx tsc --noEmit`. (Both clean.)
- [x] Vitest once (274 files pass): `card_defs`, `abilities`, `buffs`, `game`, `testing`, `researchTrees`, `ui`.
- [x] Review (also loaded the app in a browser in both import orders - tooltip first and normal - with no errors and Rend's resolver registered): Rend follow-ups are a reusable keyword-use mechanism; no runtime imports in `rendKeyword.ts`;
  VFX sizes respect the 20 px limit; tooltip is brief.
- [ ] Manual (dev server): cast Blood Mend near bleeding enemies; shimmer on the ally, small effects,
  shield ticks down while the ally slowly heals.
