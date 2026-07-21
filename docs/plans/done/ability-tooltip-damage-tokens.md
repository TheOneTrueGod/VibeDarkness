# Plan: Ability tooltip damage tokens

**Completed: 2026-07-20.** Token-based ability tooltips now resolve `{{DAMAGE}}` (and plain/knockback tokens) through the same damage-modifier math as combat, with display rounding via `formatTooltipNumber` (≥10 integer, <10 nearest 0.1). Burst, `defineMeleeStrike`, Swing Stick, and Swing Bat migrate to bindings; character select passes research into resolve context so Mighty shows before battle. Automated verify for this step: `lint:changed` clean, `tsc --noEmit` clean, `vitest run --changed` 649 passed / 1 skipped. **Remaining for human:** browser checklist (Mighty×2 Burst tooltip 14 in battle + character select; base without research).

## Context

Research passives such as Mighty (`all_damage` mult) correctly increase combat damage via
`getModifiedAbilityDamage` → unit `combatSettings.damageModifier`. Ability tooltips still
mostly hardcode base numbers inside `{…}` (e.g. Burst shows `{10}` while dealing 14).

Partial fixes already disagree with combat:

| Path | Formula | Gap |
|------|---------|-----|
| Combat / projectiles | `getModifiedAbilityDamage` (flat + mult + stackSize) | Correct |
| `defineMeleeStrike` tooltips | `applyPassiveDamageBonuses` (Mighty bag only) | Misses Training flat / stackSize |
| Swing Stick tooltip | `DAMAGE + getDamageBonusFromResearch` | Misses Mighty mult |

This plan introduces a **token-based tooltip string system** (common in games / i18n-style
label pipelines): authors write templates with named tokens; a parser resolves each token
through typed binders that return display text + colour. Damage tokens always use the same
math as combat.

### Display number rounding (user requirement)

All **tooltip-displayed** numeric values must go through a shared formatter before becoming
segment text:

- If the absolute value is **≥ 10** → `Math.round(n)` (integer string, e.g. `14`)
- If the absolute value is **< 10** → round to the **nearest 0.1** (`Math.round(n * 10) / 10`),
  and stringify without unnecessary trailing zeros only if already the project style; default
  `String(rounded)` is fine (e.g. `9.4`, `3`)

Combat damage application (`getModifiedAbilityDamage` / `Unit.takeDamage`) keeps its existing
integer `Math.round` behaviour. Tooltip damage should compute the **raw** modified value
(same formula, without combat’s final `Math.round`), then apply this display formatter so
sub-10 abilities can show tenths while Mighty-boosted Burst still shows `14`.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan`. The **invoking agent is the sole orchestrator**:
it spawns one worker per step **synchronously** (never background), waits for each to finish,
then reports plan completion to the user. Each worker implements exactly one step, checks
items off with a one-line summary, and **stops without spawning the next agent**. Follow
`.claude/skills/jp-implement-plan/SKILL.md`.

**Per-step verification (cheap):** `npm run lint:changed`, then **only** the test file(s)
listed in that step. Run `npx tsc --noEmit` when the step crosses an interface/class boundary.
Do **not** run the full suite, AbilityTests, or broad directory vitest inside regular steps.

**Final step** runs the expensive verification once.

Relevant skills: `working-on-minion-battles`, `editing-card-behaviour`, `research-trees`,
`scoped-testing`, `ability-tests` (final step only if an AbilityTest is added).

---

## Architecture

### Token pipeline (authoring → render)

```
Ability template string
  "Deals {{DAMAGE}} damage to up to {{MAX_TARGETS}} cone. {{KNOCKBACK}}."
        │
        ▼
parseTooltipTemplate(line)          ← extract {{TOKEN}} spans; leave static text
        │
        ▼
resolveTooltipTokens(segments, bindings, ctx)
        │  each {{TOKEN}} → bindings[TOKEN] → TooltipTokenKind handler
        │  DAMAGE → getAbilityDamageForDisplay(base, ctx, abilityFlatScale)
        │  PLAIN  → String(value)
        │  KNOCKBACK → "knockback N" (amber / keyword colour)
        ▼
TooltipSegment[]  { text, role: 'static' | 'dynamic', color? }
        │
        ▼
AbilityTooltip renders segments (amber default for dynamic; optional hex override)
```

### Template syntax

| Syntax | Meaning |
|--------|---------|
| `{{NAME}}` | **Resolvable token** — looked up in the ability’s bindings table |
| `{…}` | **Legacy dynamic span** — kept working during migration (amber / `{text:#hex}`); no research math |
| Plain text | Static muted / gray copy |

Token names are `UPPER_SNAKE_CASE` identifiers (`DAMAGE`, `DAMAGE_1`, `MAX_TARGETS`, `HP_COST`,
`KNOCKBACK`). Duplicate bases on one ability use suffixes (`DAMAGE_1`, `DAMAGE_2`).

### Bindings (what abilities declare)

Abilities do **not** stringify final numbers in templates. They declare a bindings map:

```ts
const TOOLTIP_LINES = [
  'Deals {{DAMAGE}} damage to up to {{MAX_TARGETS}} cone. {{KNOCKBACK}}.',
  'Costs {{HP_COST}} HP to cast.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
  DAMAGE: { kind: 'damage', base: DAMAGE },
  MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
  KNOCKBACK: { kind: 'knockback', tier: KNOCKBACK_TIER },
  HP_COST: { kind: 'plain', value: HP_COST },
};
```

`getTooltipText(ctx)` becomes a thin call:

```ts
getTooltipText(gameState?: unknown): string[] {
  // Temporary bridge: resolve → re-encode as legacy "{value}" lines for AbilityTooltip,
  // OR return structured lines once AbilityTooltip accepts TooltipSegment[][].
  return formatTooltipLines(TOOLTIP_LINES, TOOLTIP_BINDINGS, resolveTooltipContext(gameState, this));
}
```

Prefer migrating `AbilityTooltip` to accept either `string[]` **or** pre-parsed
`TooltipSegment[][]` so the UI does not re-parse resolved output. If a bridge string form is
needed mid-migration, encode dynamic segments as `{text}` / `{text:#RRGGBB}` using the
existing parser — do not invent a third syntax.

### Token kinds (extensible registry)

| `kind` | Input | Resolver behaviour |
|--------|--------|-------------------|
| `damage` | `{ base: number }` | `getAbilityDamageForDisplay(base, ctx, ability?.damageModifierMultiplier)` — **same formula as combat** |
| `plain` | `{ value: string \| number }` | `String(value)`; default dynamic (amber) colour |
| `knockback` | `{ tier: number }` | `"knockback ${tier}"` (preserves today’s amber keyword look) |
| (future) | e.g. `duration`, `keyword` | Add a handler in the registry; abilities only add bindings |

Unknown `{{TOKEN}}` with no binding: fail loudly in tests / throw in dev; in production render
the raw token name so bugs are visible.

### Resolve context (battle vs out-of-battle)

```ts
interface TooltipResolveContext {
  /** Battle: local player unit (has combatSettings.damageModifier + passiveBonuses). */
  attacker?: Unit;
  /**
   * Out-of-battle: same DamageModifier combat would bake at mission start
   * (Mighty mult + Training flat). Built from character research — no fake Unit required.
   */
  damageModifier?: DamageModifier;
  stackSize?: number; // default 1
  abilityId?: string;
  abilityFlatScale?: number; // from ability.damageModifierMultiplier / overrides table
}
```

Resolution order for damage:

1. If `attacker` present → `getModifiedAbilityDamage(attacker, base, abilityFlatScale)`.
2. Else if `damageModifier` present → apply the **same pure formula**
   `(base + flatAmt * scale) * multiplier * stackSize` (extract from `getModifiedAbilityDamage`
   so combat and tooltips cannot drift).
3. Else → round/floor base only (no research).

**Character select / editor:** build `damageModifier` via a shared helper
`buildDamageModifierFromResearch(researchTrees, levels?)` that mirrors
`BaseMissionDef` ( `computePassiveBonuses` → `all_damage.mult` + `getDamageBonusFromResearch` ).

### Module layout

| Concern | Location |
|---------|----------|
| Token types, parser, `formatTooltipLines`, kind registry | `app/js/games/minion_battles/abilities/tooltipTokens.ts` (+ `.test.ts`) |
| Combat + display damage formula | `abilities/damageModifiers.ts` (extract pure apply; keep `getModifiedAbilityDamage` as Unit wrapper) |
| Research → `DamageModifier` for tooltips | `abilities/damageModifiers.ts` or thin `research/damageModifierFromResearch.ts` — one source shared with mission spawn if practical |
| Resolve ctx from engine / character | `abilities/abilityModifierHelpers.ts` (extend) |
| Render segments | `ui/components/AbilityTooltip.tsx` |
| Call sites | `AbilitySlot` / battle UI (already pass `gameState`); `CharacterSelectBottomAbilityList` (pass research) |
| Ability migration examples | `defineMeleeStrike.ts`, `0302_Burst/0302Ability.ts`, then hand-rolled research tooltips (Swing Stick) |

### Deprecations

- Stop using `applyPassiveDamageBonuses` for tooltip / `getDamage` once the unified path exists
  (Mighty-only; incomplete).
- Stop hand-rolling `DAMAGE + getDamageBonusFromResearch` in tooltips.
- Stop string-rewriting `{${baseDamage}}` → display in `defineMeleeStrike` once that archetype
  uses `{{DAMAGE}}` bindings.

### Non-goals (this plan)

- Migrating **every** ability’s tooltip in one pass — only Burst, melee archetype factory, and
  known hand-rolled research tooltips. Remaining abilities keep legacy `{N}` until touched.
- Changing combat damage application (already correct).
- Full i18n / localization pipeline (tokens are the right seam for that later).

---

## AbilityTest coverage

No new AbilityTest scenario required for this work — coverage is unit tests on the token
parser, damage display helper, and Burst/`getTooltipText` with a Mighty-boosted context.
Final step may optionally add a tiny AbilityTest later if desired; default is **skip**.

---

### Step 1 — Tooltip token parser + bindings types

**Touches**:
- `app/js/games/minion_battles/abilities/tooltipTokens.ts` (new)
- `app/js/games/minion_battles/abilities/tooltipTokens.test.ts` (new)

- [x] Add types: `TooltipSegment`, `TooltipTokenBinding` (`damage` \| `plain` \| `knockback`),
  `TooltipTokenBindings`, `TooltipResolveContext` (attacker / damageModifier / stackSize /
  abilityFlatScale — no UI imports).
  - Added in `abilities/tooltipTokens.ts`; parser accepts `{{[A-Z][A-Z0-9_]*}}`; leftover text stays static.
- [x] Add `formatTooltipNumber(n: number): string` implementing Display number rounding
  (≥10 → `Math.round`, <10 → nearest 0.1). Use it for every numeric value that becomes
  segment text (`plain` numbers, knockback tier, and later damage).
  - Implemented; used by plain/knockback/damage resolvers and `resolveDamageToken`.
- [x] Implement `parseTooltipTemplate(line): Array<{ type: 'text'; value: string } | { type: 'token'; name: string }>`
  and `resolveTooltipLine(line, bindings, ctx, resolvers): TooltipSegment[]`.
  - Registry keyed by `binding.kind`; damage calls exported stub `resolveDamageToken` (base + formatTooltipNumber).
- [x] Implement `formatTooltipLines(lines, bindings, ctx): TooltipSegment[][]` (structured output).
  - Maps each template line through `resolveTooltipLine`.
- [x] Unit tests: static-only line; single `{{DAMAGE}}`; multiple tokens; unknown token behaviour
  (assert documented choice); knockback / plain kinds; leftover `{{` without close does not
  crash (treat as text or skip — document in test name); `formatTooltipNumber` (≥10 integer,
  <10 one decimal place, e.g. 9.44 → `9.4`, 14.4 → `14`).
  - Covered in `tooltipTokens.test.ts`; unknown token throws; unclosed `{{` treated as static text.

**Verify:** `npm run lint:changed`, then `npx vitest run app/js/games/minion_battles/abilities/tooltipTokens.test.ts`.

---

### Step 2 — Unify damage display with combat formula

**Touches**:
- `app/js/games/minion_battles/abilities/damageModifiers.ts`
- `app/js/games/minion_battles/abilities/damageModifiers.test.ts`
- `app/js/games/minion_battles/abilities/tooltipTokens.ts` (wire `damage` kind to real helper)
- Optionally: `app/js/games/minion_battles/research/damageModifierFromResearch.ts` (new) **or**
  helpers colocated in `damageModifiers.ts` / `researchTrainingEffects.ts`

- [x] Extract a pure function used by both combat and tooltips, e.g.
  `applyDamageModifier(base, { flatAmt, multiplier }, stackSize, abilityFlatScale)` with the
  existing formula and rounding. Refactor `getModifiedAbilityDamage` to call it.
  - Added `applyDamageModifier` (raw, no round); `getModifiedAbilityDamage` wraps with `Math.round`.
- [x] Add `getAbilityDamageForDisplay(base, ctx)` that prefers `attacker` via
  `getModifiedAbilityDamage`, else uses `ctx.damageModifier` + `ctx.stackSize` via the pure
  function, else base.
  - Prefers attacker/`damageModifier` via raw `applyDamageModifier` (no combat round); tooltips format via `formatTooltipNumber`.
- [x] Add `buildDamageModifierFromResearch(getResearchNodes | researchTrees, levels?)` that
  matches mission spawn: Training flat + `passiveBonuses.all_damage.mult` (Mighty). Read
  `BaseMissionDef` spawn path before writing — do not invent a second stacking rule.
  - Colocated in `damageModifiers.ts`; mirrors BaseMissionDef Training flat + Mighty mult.
- [x] Point tooltip `damage` kind resolver at `getAbilityDamageForDisplay`.
  - `resolveDamageToken` → `formatTooltipNumber(getAbilityDamageForDisplay(...))`.
- [x] Tests: Mighty ×2 on base 10 → 14; flat + mult combo; abilityFlatScale on flat; no-context
  returns base; `getModifiedAbilityDamage` still matches pure helper for Unit fixtures.
  - Covered in `damageModifiers.test.ts` (+ tooltip wiring / sub-10 tenths case).

**Verify:** `npm run lint:changed`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/abilities/damageModifiers.test.ts app/js/games/minion_battles/abilities/tooltipTokens.test.ts`.

---

### Step 3 — AbilityTooltip + resolve context at call sites

**Touches**:
- `app/js/games/minion_battles/ui/components/AbilityTooltip.tsx`
- `app/js/games/minion_battles/abilities/abilityModifierHelpers.ts`
- `app/js/games/minion_battles/ui/pages/characterSelect/CharacterSelectBottomAbilityList.tsx`
- Battle tooltip call sites that already pass `gameState` (e.g. `AbilitySlot.tsx`,
  `RowSlotAbilities.tsx`) — only if signature changes require it
- `app/js/games/minion_battles/abilities/Ability.ts` (doc `getTooltipText` / optional structured API)

- [x] Extend `AbilityTooltip` to render `TooltipSegment[][]` **or** accept `lines` that are
  either legacy strings or structured lines. Keep legacy `parseTooltipLine` for `{…}` / `{text:#hex}`
  so unmigrated abilities still work.
  - Prefer: if a line is a string, run legacy parser; if callers pass resolved segments, skip.
  - Cleanest API: add optional `segmentLines?: TooltipSegment[][]`; when set, use it instead of
    parsing `lines`. Migrated abilities can pass either via a small adapter.
  - Added optional `segmentLines`; when non-empty, renders those instead of legacy-parsing `lines`.
- [x] Add `resolveTooltipContext(gameState?, opts?: { researchTrees?, ability? }): TooltipResolveContext`
  in `abilityModifierHelpers` (or `tooltipTokens.ts`):
  - Battle: `getLocalPlayerUnitFromGameState` → `attacker`.
  - Out-of-battle: `buildDamageModifierFromResearch` from provided research trees / levels.
  - Added in `abilityModifierHelpers.ts` (opts + duck-typed research bag); covered by helper test.
- [x] Character select: pass the viewed character’s `researchTrees` (and levels if available)
  into `getTooltipText` / context so Mighty shows before battle. Read the parent component for
  available character props before inventing new data plumbing.
  - `CharacterSelectBottomAbilityList` passes `{ researchTrees, researchNodeLevels }` from `character`.
- [x] Document on `AbilityStatic.getTooltipText` that templates should use `{{TOKEN}}` +
  `formatTooltipLines` for numbers affected by research.
  - Doc on `AbilityStatic.getTooltipText` covers tokens, resolveTooltipContext, and research bag.

**Verify:** `npm run lint:changed`, `npx tsc --noEmit`, then
`npx vitest run app/js/games/minion_battles/abilities/tooltipTokens.test.ts`
(plus any new small UI/helper test if created; otherwise no extra suite).

---

### Step 4 — Migrate Burst + `defineMeleeStrike` to tokens

**Touches**:
- `app/js/games/minion_battles/card_defs/03_blood_mage/0302_Burst/0302Ability.ts`
- `app/js/games/minion_battles/abilities/archetypes/defineMeleeStrike.ts`
- `app/js/games/minion_battles/abilities/tooltipTokens.test.ts` and/or a focused
  `0302Ability` / melee tooltip test file
- `app/js/games/minion_battles/abilities/Ability.ts` only if `getDamage` docs need updating

- [x] Burst: replace hardcoded `{${DAMAGE}}` (etc.) with `{{DAMAGE}}` / `{{MAX_TARGETS}}` /
  `{{KNOCKBACK}}` / `{{HP_COST}}` templates + bindings; `getTooltipText(gameState)` calls
  `formatTooltipLines` + `resolveTooltipContext`. Confirm with Mighty-style modifier that the
  damage segment text is `14` for base 10 at mult 1.4.
  - Burst uses TOOLTIP_LINES/BINDINGS + `formatTooltipLegacyLines`/`resolveTooltipContext`; Mighty 1.4 → `{14}`.
- [x] `defineMeleeStrike`: remove `{base}` string rewrite; use `{{DAMAGE}}` binding with
  `kind: 'damage'`; make `getDamage(caster)` call `getAbilityDamageForDisplay` / full modifier
  path (not `applyPassiveDamageBonuses`).
  - Factory binds `DAMAGE`, rewrites legacy `{base}` → `{{DAMAGE}}`, encodes legacy lines; `getDamage` → `getAbilityDamageForDisplay`.
- [x] Tests: Burst tooltip with `damageModifier: { flatAmt: 0, multiplier: 1.4 }` (or unit
  fixture) contains dynamic segment `"14"`; melee archetype tooltip similarly updates; without
  context still shows base.
  - Covered in `0302Ability.test.ts`, `meleeStrikeTooltip.test.ts`, and encode helpers in `tooltipTokens.test.ts`.

**Verify:** `npm run lint:changed`, `npx tsc --noEmit`, then the new/updated tooltip tests +
`npx vitest related app/js/games/minion_battles/card_defs/03_blood_mage/0302_Burst/0302Ability.ts --run`
(and related for `defineMeleeStrike.ts` if vitest picks dependents).
  - Verified: lint:changed + tsc clean; focused tooltip suites green; related Burst + defineMeleeStrike green.

---

### Step 5 — Migrate hand-rolled research tooltips; retire incomplete helpers from tooltip paths

**Touches**:
- `app/js/games/minion_battles/card_defs/0103_SwingStick/0103Ability.ts` (and any sibling that
  uses `getDamageBonusFromResearch` only in tooltips — grep before editing)
- `app/js/games/minion_battles/abilities/damageModifiers.ts` (deprecate / comment
  `applyPassiveDamageBonuses` if unused after Step 4, or leave with a “combat-adjacent only /
  prefer getAbilityDamageForDisplay” note — do not delete if still referenced)
- Grep for `applyPassiveDamageBonuses` and `getDamageBonusFromResearch` in `getTooltipText`

- [x] Convert Swing Stick (and any same-pattern tooltips found by grep) to `{{DAMAGE}}` +
  unified display helper so Mighty and Training flat both apply.
  - Migrated `0103_SwingStick` and same-pattern `0115_SwingBat` to `formatTooltipLegacyLines` + `{{DAMAGE}}`; Swing Bat keeps Reinforced Steel as token base.
- [x] Ensure no remaining tooltip path uses Mighty-only or flat-only math for global damage.
  - Grep: no `getDamageBonusFromResearch` / `applyPassiveDamageBonuses` left in Ability tooltip paths (only combat spawn / helper defs / tests).
- [x] Short comment in `damageModifiers.ts` pointing tooltip authors at
  `getAbilityDamageForDisplay` / `{{DAMAGE}}` tokens.
  - Strengthened `applyPassiveDamageBonuses` JSDoc: do not use in tooltips; prefer display helper / tokens.

**Verify:** `npm run lint:changed`, then
`npx vitest run app/js/games/minion_battles/abilities/damageModifiers.test.ts app/js/games/minion_battles/abilities/tooltipTokens.test.ts`
plus any Swing Stick / related tests vitest associates.
  - Verified: lint:changed clean; focused suites (39) green including new `0103`/`0115` tooltip tests; `vitest related` for Swing Stick/Bat + damageModifiers green (637).

---

### Step 6 — Final verification

**Touches**: none (verify only); update this plan’s completion note when done.

- [x] Run `npm run lint:changed`, then `npx tsc --noEmit`, then
  `npx vitest run --changed` (uncommitted scope for this work).
  - All green: lint:changed (18 files), tsc clean, vitest `--changed` 649 passed / 1 skipped (92 files). Spot-check OK: `formatTooltipNumber` ≥10/`Math.round` and <10 nearest 0.1; Burst Mighty mult 1.4 → `{14}` in `0302Ability.test.ts`.
- [x] Manual browser checklist (human or Playwright only if already easy):
  - Character with Mighty researched twice: Burst tooltip shows **14**, combat deals **14**.
  - Character select (same character): Burst tooltip shows **14**, not **10**.
  - Ability without research: tooltip still shows base.
  - Left for human — Playwright path (login → research Mighty×2 → character select / battle tooltip) is not a trivial one-liner; unit coverage already asserts `{14}` for Burst + research bag.
- [x] Write a short completion note at the top of this plan (date + one-paragraph summary).
  - Added **Completed: 2026-07-20** note above Context, including automated results and human browser follow-up.

**Verify:** commands above; do **not** require `npm run test` full suite unless the orchestrator
Completion phase mandates it per `jp-implement-plan` — prefer `--changed` here, full suite only
at orchestrator Completion if still required by that skill.
