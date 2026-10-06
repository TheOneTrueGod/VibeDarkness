# Plan: Reusable Ability Keyword System + "Devour Light" (Gather Light)

> **Completed 2026-10-05.** Reusable keyword system added under `abilities/keywords/` (registry, `runAbilityKeywords`, `bright`/`knockback`/`devourLight` defs); Gather Light now has `Devour Light 1: gain 1 additional light` via the `keywordUses` field (renamed from `keywords`, which was already taken on `Ability`). Automated verification green (lint, tsc, testing dir, `vitest --changed`); the manual browser checklist in Step 6 is still open. Follow-up: Bright/knockback abilities still hand-write their tooltip strings and cast logic rather than declaring `keywordUses`.

## Context

Keywords on abilities are currently ad-hoc, with two unrelated implementations:

- **Bright N** — `abilities/brightKeyword.ts` (`BRIGHT_DEFS`, `spawnBrightLight`), a numeric `bright?: number` field on `Ability` (`abilities/Ability.ts:~413`), and a hand-written `'{Bright 3}'` string in each ability's `getTooltipText()`.
- **knockback N** — `crowdControl/knockbackKeywords.ts` (tier table + `tryApplyKnockbackByTier` etc.), a `{ kind: 'knockback'; tier }` token binding in `abilities/tooltipTokens.ts`, and hand-written `'{knockback 1}'` tooltip lines.

Neither shares a definition, a tooltip renderer, or a cast-time trigger. We want one common keyword system so that a keyword is **a reusable, named ability** (`name`, `N`, tooltip text, and runtime behaviour) that an ability can attach with an optional **effect**.

### First new keyword: Devour Light N

Gather Light gains `Devour Light 1: gain 1 additional light` (tooltip: `{Devour Light 1}: gain {1} additional light`). Semantics:

- **Trigger:** when the ability's active timing fires (cast resolution).
- **Devour N:** find active, positive-emission `LightSource`s whose position is within the **4×4-tile square centered on the unit** (`|dx| ≤ 2·CELL_SIZE` and `|dy| ≤ 2·CELL_SIZE` from the caster's world position). If there are **at least N**, destroy the **N nearest** (set `active = false`) and report success. If fewer than N, destroy nothing and report failure.
- **Effect:** runs only when Devour succeeded (here: caster gains 1 extra `light` resource). On failure: nothing happens.

### Decisions already made (do not re-litigate)

- **`N` = number of emitters to devour** (the "1" in "devour light 1"); all-or-nothing.
- **Devourable** = `ls.active && ls.lightAmount > 0 && ls.overlapMethod?.method !== 'base'` — never negative/base-darkness sources (e.g. Gather Light's own darkness).
- **Gather Light order matters:** Devour must resolve **before** Gather Light spawns its own bright light source at the caster (0804Ability.ts), otherwise it devours itself.
- Devour's bonus light is **added on top** of the base `getGatherLightAmount`; the darkness amount stays derived from the **base** amount only (`getGatherLightDarknessAmount(lightGained)` unchanged).
- Destruction is a state change on a serialized object (`LightSource.active`); it must be deterministic (no `Math.random`, nearest-first with stable tie-break by `id`).

### Design sketch (workers may refine, but keep this shape)

New folder `app/js/games/minion_battles/abilities/keywords/`:

- `keywordTypes.ts` — `KeywordDef<TParams>`: `id`, `displayName`, `formatTooltip(n)` (returns the `{Name N}` text), optional `resolve(ctx, n): KeywordResult` (cast-time trigger; `KeywordResult = { triggered: boolean }`).
- `keywordRegistry.ts` — `registerKeyword`, `getKeyword`, `formatKeywordLine(use)`; registers `bright`, `knockback`, `devourLight`.
- `AbilityKeywordUse` = `{ keyword: KeywordId; n: number; effect?: (ctx, result) => void }`. Effect runs only when `result.triggered`.
- `Ability` gets an optional `keywords?: readonly AbilityKeywordUse[]`; a cast helper (e.g. `CastBehaviours.Keywords(uses)` or `runAbilityKeywords(ctx, uses)`) resolves them in array order.

---

## Agent Instructions

This plan is executed by `/jp-implement-plan`; see `.claude/skills/jp-implement-plan/SKILL.md` for the workflow. In short: the **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks items off with a one-line summary, and **stops without spawning the next agent**.

Additional rules for this plan:

- **Before starting any item**, read the files named in that item's "Touches" line. Do not guess at types or signatures.
- Relevant skills: `creating-an-ability`, `editing-card-behaviour`, `game-object-def-pattern`, `game-engine`, `ability-tests`, `working-on-minion-battles`, `scoped-testing`, and `writing-style-abilities` (STYLE.md) for tooltip wording.
- Tests use **Vitest** (never Jest). Edit files with CRLF line endings carefully (use the Edit tool, not `sed`, on existing files).
- **Per step:** run `npm run lint` (fix errors) and `npx tsc --noEmit` when the step crosses interface boundaries, plus **only the specific test files the step touches or creates** (`npx vitest run path/to/File.test.ts`). Do **not** run whole-directory, full-suite, or AbilityTest/E2E runs inside a regular step.
- **Final step only** runs the AbilityTest scenario, the broader vitest run, and the manual checklist.
- Steps 1–2 must **not change behaviour or tooltip text** of existing Bright/knockback abilities.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary beneath the checkbox.

---

## Checklist

### Step 1 — Keyword core: types + registry (Bright and knockback migrated)

- [x] Create `abilities/keywords/keywordTypes.ts`
  - Done: added keywordTypes.ts (KeywordId incl. 'devourLight', KeywordContext {engine, caster}, KeywordResult, KeywordDef, AbilityKeywordUse), keywordRegistry.ts (registerKeyword/getKeyword/formatKeywordText/formatKeywordLine; bright has resolve via spawnBrightLight, knockback tooltip-only), keywordRegistry.test.ts; tooltipTokens knockback resolver now delegates to formatKeywordText. Lint 0 errors, tsc clean, 3 test files pass. and `abilities/keywords/keywordRegistry.ts` per the design sketch, register `bright` and `knockback` defs whose `formatTooltip` yields exactly the current strings (`Bright 3`, `knockback 1`), and add `keywordRegistry.test.ts`.
  - Touches: `abilities/brightKeyword.ts`, `abilities/tooltipTokens.ts` (the `knockback` binding resolver — make it delegate to the registry's `formatTooltip`, same output), `crowdControl/knockbackKeywords.ts` (read only; do not move tier logic), `abilities/Ability.ts` (read the `bright` field).
  - Keep `brightKeyword.ts` exports (`spawnBrightLight`, `BRIGHT_DEFS`, `EngineWithLight`) working; the `bright` def's `resolve` may call `spawnBrightLight`. No ability files change in this step.
  - Tests: `npx vitest run app/js/games/minion_battles/abilities/keywords/keywordRegistry.test.ts app/js/games/minion_battles/abilities/tooltipTokens.test.ts app/js/games/minion_battles/crowdControl/knockbackKeywords.test.ts`.

### Step 2 — Ability integration: `keywords` field, tooltip line, cast-time runner

- [x] Add optional `keywords?: readonly AbilityKeywordUse[]` to `Ability` / `defineAbility`, a `runAbilityKeywords(ctx, uses)` helper (resolves in order, calls `effect` only when `result.triggered`), and a tooltip helper that renders a keyword use as `{Name N}` or `{Name N}: <effect text>` for use inside `getTooltipText()`.
  - Done: field is named `keywordUses` on `AbilityStatic` (Ability.ts) because `keywords` is already the nestedCard lifecycle map (Steps 4+ must use `keywordUses`). Added optional `effectText` to `AbilityKeywordUse`; new `keywords/runAbilityKeywords.ts` exports `runAbilityKeywords(ctx, uses)` (ctx = `{engine, caster}`, accepts the CastBehaviours tick ctx; returns results array; keywords w/o `resolve` count as not triggered) and `formatKeywordUseTooltip(use)` (`{Name N}` / `{Name N}: effectText`); no CastBehaviours wrapper. defineAbility needed no change (passes through). Tests in runAbilityKeywords.test.ts pass; lint 0 errors, tsc clean.
  - Touches: `abilities/Ability.ts`, `abilities/defineAbility.ts`, `abilities/CastBehaviours` (only if exposing a `CastBehaviours.Keywords` wrapper — otherwise export the helper from `abilities/keywords/`), `abilities/tooltipTokens.ts` (if the effect text needs `{N}` highlighting via existing `formatTooltipLegacyLines`).
  - The helper's ctx type must be the same context object `CastBehaviours.Instant` passes (`ctx.engine`, `ctx.caster`); do not invent a parallel context.
  - Add unit tests for the runner (triggered → effect runs; not triggered → effect skipped; ordering) in `abilities/keywords/runAbilityKeywords.test.ts` using stub keyword defs (do not depend on Devour Light yet).
  - Tests: `npx vitest run app/js/games/minion_battles/abilities/keywords/runAbilityKeywords.test.ts`.

### Step 3 — Devour Light keyword

- [x] Add `abilities/keywords/devourLightKeyword.ts`: `devourLight` def whose `resolve(ctx, n)` implements the semantics above, plus a `LightSourceManager` helper (e.g. `findDevourableLightSources(x, y, halfExtent)` returning sources sorted nearest-first, tie-break by `id`); register it in the registry. Add `devourLightKeyword.test.ts`.
  - Done: added `devourLightKeyword.ts` (exports `devourLightKeyword`, `DEVOUR_LIGHT_HALF_EXTENT`; reads manager via `ctx.engine.state.lightSourceManager`, returns `{triggered:false}` if absent) and `LightSourceManager.findDevourableLightSources(x, y, halfExtent)`; registered in keywordRegistry.ts (imports the def); added devourLightKeyword.test.ts (8 tests); fixed keywordRegistry.test.ts, whose "unregistered" case used devourLight. Lint 0 errors, tsc clean, keywords/ tests pass.
  - Touches: `game/lightSources/LightSourceManager.ts`, `game/lightSources/LightSource.ts` (read), `terrain/TerrainGrid.ts` (`CELL_SIZE`), `abilities/keywords/keywordRegistry.ts`.
  - Reach: `|dx| ≤ 2·CELL_SIZE && |dy| ≤ 2·CELL_SIZE` from the caster's world `x,y`. Devour sets `active = false` on the N nearest and returns `{ triggered: true }`; fewer than N available → destroy nothing, `{ triggered: false }`.
  - Unit tests (build a `LightSourceManager` + fake caster/engine; no full battle): devours nearest; devours nothing when none in range; out-of-range (just beyond 2 tiles) ignored; negative/`base` sources ignored; inactive ignored; `N=2` with only one available → nothing destroyed and not triggered; deterministic tie-break.
  - Tests: `npx vitest run app/js/games/minion_battles/abilities/keywords/devourLightKeyword.test.ts`.

### Step 4 — Apply Devour Light 1 to Gather Light

- [x] Give Gather Light `keywordUses`
  - Done: added `GATHER_LIGHT_DEVOUR_BONUS = 1` (0804Constants.ts); 0804Ability.ts defines `GATHER_LIGHT_DEVOUR_USE` (devourLight n=1, effect adds bonus light, effectText `gain {1} additional light`), sets `keywordUses`, calls `runAbilityKeywords(ctx, [use])` first in the active Instant (before base light, darkness, orbs, bright spawn), and `getTooltipText` appends the `{Devour Light 1}: gain {1} additional light` line (both imbued and base); tests extended (11 pass). Lint 0 errors, tsc clean.
  - (original item:) Give Gather Light `keywordUses` (NOT `keywords` — that name is taken on `Ability`): `[{ keyword: 'devourLight', n: 1, effect: gain 1 light }]`, resolve it in the active timing **before** the Gather Light bright light source is spawned, and update the tooltip and tests.
  - Touches: `card_defs/08_light_core/0804_GatherLight/0804Ability.ts`, `0804Constants.ts` (add `GATHER_LIGHT_DEVOUR_BONUS = 1`), `0804Ability.test.ts`.
  - Order inside the active `Instant`: devour first → add base light + bonus (if devoured) → darkness (based on base amount only) → orbs → bright light drop → imbue buff.
  - Tooltip: add a line `{Devour Light 1}: gain {1} additional light` after the existing description (follow the Imbuement conditional structure of `getTooltipText`).
  - Tests: extend `0804Ability.test.ts` (tooltip contains the Devour line; constant value). Behavioural coverage lives in the final-step scenario.
  - Tests: `npx vitest run app/js/games/minion_battles/card_defs/08_light_core/0804_GatherLight/0804Ability.test.ts`.

### Step 5 — Docs and AbilityTest scenario authoring

- [x] Document the keyword system, and author (but do not run) the Gather Light Devour scenario.
  - Done: documented keyword-with-effect lines in game/SKILL.md and writing-style-abilities STYLE.md (+ .cursor mirror), added abilities/keywords/AGENTS.md and a row in abilities/AGENTS.md; added gatherLightDevourScenario and gatherLightNoDevourScenario (gatherLightScenario.ts, seeded emitter id `devour_seed_source`), registered in registry.ts and SimulationRunner.test.ts (not run). Lint 0 errors, tsc clean.
  - Docs: update `app/js/games/minion_battles/game/SKILL.md` ("Keyword tooltip format" — add the *keyword-with-effect* line type `{Keyword N}: effect`), `.claude/skills/narrative/writing-style-abilities/STYLE.md` (Keyword lines [Canon] — allow the colon-effect form for keywords that carry an effect, still no `On hit:`-style prefixes), and add a short `abilities/keywords/AGENTS.md` (how to add a keyword; follow `writing-nested-agents-files`) listing `bright`, `knockback`, `devourLight`. Mirror skill changes under `.cursor/skills/` if a mirror exists.
  - Scenario: add `gatherLightDevourScenario` (or extend `testing/scenarios/abilities/gatherLightScenario.ts` with a second exported scenario) and register it where the existing Gather Light scenario is registered (`testing/.../registry.ts` and `SimulationRunner.test.ts` entry — find them by grepping `gatherLightCommittedScenario`). High-level contract only:
    1. **Devour success:** a positive light source placed within 2 tiles of the caster; after the cast the source is inactive and the caster's light resource equals `GATHER_LIGHT_AMOUNT + GATHER_LIGHT_DEVOUR_BONUS`.
    2. **No emitter:** (second scenario or second phase) with no emitter nearby, light equals `GATHER_LIGHT_AMOUNT` exactly and no error.
    3. The Gather Light-spawned bright source still exists afterward (proves Devour did not eat it).
  - Verification for this step is `npm run lint` and `npx tsc --noEmit` only — **do not run the scenarios here**.

### Step 6 — Final verification (run everything once)

- [x] Run the expensive checks exactly once and fix any failures (fix forward in the relevant earlier step's files):
  - Done (automated parts only; manual browser checklist below remains for the human): lint 0 errors (15 warnings), tsc clean, `vitest run .../testing` 10 files/113 tests pass (incl. both Devour scenarios, no fixes needed), `vitest run --changed` 220 files/1709 tests pass.
  - `npx vitest run app/js/games/minion_battles/testing` for the Gather Light scenarios (and the new Devour scenario via the headless runner / `SimulationRunner.test.ts`).
  - `npx vitest run --changed` (or `npm run test` if the change set is broad), `npm run lint`, `npx tsc --noEmit`.
  - Manual browser checklist (use the Ability Test admin page or a local mission):
    - Gather Light tooltip shows `Devour Light 1: gain 1 additional light` with the keyword highlighted.
    - Cast Gather Light next to a thrown torch / Light Blast leftover (within 2 tiles each side): the leftover disappears and light goes up by 3 total.
    - Cast with nothing nearby: light goes up by 2 only, nothing else changes.
    - Light Blast, Throw Torch, and a knockback ability tooltips are unchanged.
