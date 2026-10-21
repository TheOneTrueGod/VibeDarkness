# Per-strike lunges (Bloody Claws first)

Today a **windup lunge** (`AbilityStatic.lunge`, `abilities/WindupLunge.ts`) physically steps the
caster toward its target once per cast, during the windup. Bloody Claws (0306) uses it for its first
swipe. This plan adds a **step lunge**: the same physical step, but attached to an individual select
step, so each strike of a multi-strike ability can close distance toward its own target. Bloody
Claws is the first user (swipe left, swipe right, X strike); Double Punch and future combos can opt in.

Not to be confused with the drawn **slide** (`MeleeAttack.withSlide`), which only offsets where the
caster is drawn and never moves it.

## Design

- **Data lives on the select step:** `SelectTargetDef.lunge?: { distance: number; duration: number }`.
  `distance` is the max step (px, before terrain/research modifiers via `caster.getLungeDistance`);
  `duration` is how long into the step's interval the step takes (it should end at or before the
  strike's impact). Putting it on the select step means runtime, preview and lock-on all read one place.
- **Same rules as the windup lunge:** at the step's interval entry, snapshot start position and
  target (the step's `stepAim`, else its pixel, else its locked unit), and step only as far as needed
  (`distance to target - hitbox reach`, capped at `distance`). Interpolate over `duration`. Use the
  same movement helpers and `claimAbilityMovement()` / `invalidateMovementPath()` as the windup lunge
  (see "Self-displacement owns walking" in `abilities/AGENTS.md`), terrain-aware.
- **One lunge resolver for targeting and preview:** generalise `selectUsesWindupLunge` into
  `getSelectStepLungeDistance(ability, caster, selectDef, engine): number | null`, which returns the
  ability's windup lunge for its first select step, `selectDef.lunge.distance` for a step with its
  own lunge, else null. Lock-on candidates, companion lock-ons, the select preview and the invalid
  preview all use it, so each strike's preview is drawn from where that strike will really start.
- **Determinism:** the snapshot is serialized in the cast's payload (like `WindupLungePayload`), so
  committed runs, previews and reconnects agree.

## Decisions (user chose the proposed defaults)

1. Distances: proposed 20px for the windup lunge (strike 1, as now) and 15px for strikes 2 and 3.
2. Strikes 2 and 3 step toward their clicked aim (proposed), or follow a locked unit as it moves?
3. Keep the drawn slide on top of the physical step (proposed: keep a smaller 6px slide for feel),
   or drop it?
4. Should strike 1 move from the windup lunge to a step lunge for uniformity (proposed: yes, and
   keep `AbilityStatic.lunge` for single-strike abilities)?

## Agent Instructions

Executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`): the invoking
agent is the sole orchestrator; it runs one worker per step **synchronously**, waits for each to
finish, then reports completion to the user. Each worker implements exactly one step, checks its
items off with a one-line summary, and stops without spawning the next agent.

Relevant skills: **creating-an-ability** (+ `card_defs/SKILL.md`), **working-with-hitboxes**,
**ability-tests**, **scoped-testing**, **time-dilation** (use cast elapsed/local time, never
`engine.gameTime - startTime`). Read "Build the engine, not the feature" in
`app/js/games/minion_battles/AGENTS.md` and "Self-displacement owns walking" in `abilities/AGENTS.md`.

Per step: run only the test files the step touches or creates, plus `npx tsc --noEmit` when an
interface changes. No broad runs until the final step.

## Steps

### Step 1: Step-lunge data and runtime

Files: `abilities/timingTargetDef.ts`, `abilities/WindupLunge.ts`, `game/units/unitAbilityTick.ts`,
new `abilities/stepLunge.test.ts`.

- [x] Add `lunge?: { distance: number; duration: number }` to `SelectTargetDef` with JSDoc (physical
  step toward this step's own target; distinct from `MeleeAttack.withSlide`).
- [x] Extract the shared maths from `setupWindupLungePayload` / `advanceWindupLunge` (target choice,
  "only as far as needed", interpolation) into helpers both lunges use; behaviour of the windup lunge
  must not change.
- [x] In `unitAbilityTick`, on entry to an interval whose select step has `lunge`, snapshot a
  per-interval payload (keyed by interval id, serialized with the cast); advance it over
  `duration` using cast elapsed time. Interrupts/knockback stop it like the windup lunge.
- [x] `stepLunge.test.ts`: a step lunges toward its own target by the needed distance, stops short
  when already in reach, and never exceeds `distance`; the windup lunge's existing tests still pass.

### Step 2: Targeting and preview use the step's lunge

Files: `abilities/targeting.ts`, `game/GameRenderer/renderers/PreviewRenderer.ts`,
`game/GameRenderer/renderers/selectCompanionPreview.test.ts` (or a new co-located test).

- [x] Replace `selectUsesWindupLunge` with `getSelectStepLungeDistance` (see Design) and use it in
  lock-on candidates, companion lock-ons, `renderSelectTargetDef` and `renderInvalidSelectTargetDef`.
- [x] Test: a later select step with `lunge` previews its hitbox from the virtual post-lunge position;
  a later step without one previews from the caster.

### Step 3: Bloody Claws uses step lunges

Files: `card_defs/03_blood_mage/0306_BloodyClaws/0306Ability.ts`, its test, `card_defs/03_blood_mage/AGENTS.md`.

- [x] Apply the decisions above: per-strike `lunge` on the three select steps (or windup lunge +
  steps 2-3), slide distance per decision 3, `aiSettings.maxRange` covers the largest lunge.
- [x] Tests: each strike steps toward its own aim (later strikes aimed elsewhere move the caster
  that way), no step when already in reach, the X strike steps once (not per claw).

### Step 4: AbilityTest scenario

Files: `testing/scenarios/abilities/bloodyClawsScenarios.ts`, `testing/scenarios/registry.ts`,
`testing/runner/SimulationRunner.test.ts`.

- [x] Scenario `bloody_claws_step_lunges_e2e`: enemies placed just beyond the claws' reach in three
  directions within the turn limit; orders built with `resolveItsSelectTargetForClick` +
  `buildFinalizedSequentialTargetingOrder` (as the existing Bloody Claws scenarios do). Every strike
  must connect only because of its lunge.

### Step 5: Final verification (orchestrator)

- [x] `npm run lint:changed` and `npx tsc --noEmit` clean.
- [x] Vitest once for `card_defs`, `abilities`, `game`, `testing` (includes all scenarios).
- [ ] Manual: in a dev-server battle, each Bloody Claws strike visibly steps toward its target, the
  preview for strikes 2 and 3 is drawn from the post-lunge position, and Punch / Swing Bat lunges
  are unchanged.

## Implementation notes

- The step lunge is a cast behaviour (`abilities/stepLunge.ts`) that `getEffectiveCastBehaviours`
  prepends to any interval whose select step has `lunge`, so the select def is the single source.
- `defineAbility` extends `getRange` by the largest step lunge (as it does for a windup lunge);
  without that, ground picks past the hitbox reach were range-clamped and never stepped.
- Bloody Claws: 20px / 15px / 15px step lunges over 0.08s, drawn slide reduced to 6px/2px, ability-level
  windup lunge removed. The windup-lunge target fix (first step's `stepAim`) stays for other abilities.
- In live play later strikes are picked when their windows open (after earlier steps); the step-lunge
  scenario picks each strike from that post-step position for the same reason.
