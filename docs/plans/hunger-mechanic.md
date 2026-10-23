# Hunger mechanic (replaces Exhaustion / Endurance)

> **Status 2026-10-22:** Steps 1-4 done; Step 5 automated checks done (tsc, lint, full vitest 3280 passed, hunger tier scenario). Tooltip copy revised per user. Remaining: manual browser check of loss/recovery pills and in-battle starving view. Note: `vitest --changed` hits a pre-existing Rollup PARSE_ERROR unrelated to this plan.

Replace the two-stat **Exhaustion / Endurance** mechanic with a single **Hunger** stat.

## Design (agreed with user, 2026-10-22)

- **One stat: Hunger.** A character has `hunger` out of `maxHunger` (default 100, raised by research).
  "Exhaustion" (amount lost) and "Endurance" (cap / amount remaining) both become Hunger. Full = well fed.
- **Persisted key is `hunger`, signed naturally:** a `resourceDelta.hunger` of `-12` means 12 Hunger lost,
  `+20` means 20 recovered. Old saves store `exhaustion` (positive = lost); the migration writes
  `hunger = -exhaustion`.
  - Current hunger = `clamp(maxHunger + Σ hunger deltas, 0, maxHunger)` using the same latest-per-mission
    and quest rules the exhaustion sum uses today (today quests only count *gains* of exhaustion → now
    only count *losses* of hunger, i.e. negative quest deltas).
- **Penalty — tiers, applied by actually lowering `maxHp` at fight start** (no reserved bar slice):
  | Hunger fraction (`hunger / maxHunger`) | Starting max health |
  |---|---|
  | `>= 15%` | unchanged |
  | `< 15%` and `> 0` | −25% |
  | `<= 0` | −50% |
  Implement as a data table (`HUNGER_PENALTY_TIERS`, ordered list of `{ maxFraction, inclusive, maxHpPenalty, label }`
  or equivalent) plus one pure lookup — engine, not feature. New `maxHp = max(1, round(base * (1 − penalty)))`,
  and `hp = maxHp`. The unit records the applied penalty in a serialized `hungerPenalty` field
  (0 / 0.25 / 0.5) so UI can explain it. **Delete `hpExhaustion` entirely** (Unit, JSON, heal pool, renderers).
- **Match-end hunger loss** keeps today's formula (1 per wound point + 0.5 per HP below wounded max, rounded up),
  just without the reserve term: missing HP = `maxHp − hpInjury − hp` (maxHp is already lowered).
  Recorded as a negative `hunger` delta, clamped so hunger never drops below 0 (old "endurance cap").
  `healWounds` rewards reduce the loss 1:1 as today.
- **Research stat:** `PassiveStatKey.Endurance` → `PassiveStatKey.MaxHunger` (value `'maxHunger'`), label "Max Hunger".
- **Story actions:** `recover_exhaustion` → `recover_hunger`, `recover_exhaustion_auto` → `recover_hunger_auto`
  (amount stays positive = Hunger restored). Constants `*_EXHAUSTION_RECOVERY` → `*_HUNGER_RECOVERY`.
- **Visuals:**
  - Colour: orange `HUNGER_ORANGE = '#f97316'` (Tailwind orange-500) replaces the exhaustion reds and the gray
    health-bar reserve colour.
  - Icon: lucide-react `Ham` (available in the installed lucide-react 1.8.0) replaces the heart icons.
  - **Recovering hunger** (positive delta / gain): solid orange background, **black** icon + text.
  - **Losing hunger** (negative delta / loss): **black** background, orange icon + text + orange border.
  - The character-sheet Hunger bar (old `CharacterEnduranceBar`): orange Ham + orange fill on black, with a
    subtle tick at the 15% threshold; tooltip states the tier rules.
- **Copy** (tooltips / descriptions; follow `.claude/skills/narrative/writing-style-abilities/STYLE.md` tone):
  - Hunger (revised by user 2026-10-22, newline-separated): "Hunger: How well fed this character is." / "Use food to heal your wounds after a fight." / "<15: Lose 25% max health" / "0: Lose 50% max health"
  - Loss pill: "Hunger lost this mission, based on the damage you took."
  - Recovery pill: "Hunger recovered."
  - Max Hunger stat: "Max Hunger: The most Hunger this character can store."
  - In-battle (UnitResourcePanel / hover flyout): "Hungry: −25% max health" / "Starving: −50% max health".
- **Out of scope / do not touch:** ability-use "exhausted" concepts (`abilityExhausted`, `selfExhausted`), eslint
  `exhaustive-deps`, `_exhaustive` never-checks, battlenet "exhausted retries". Only the health mechanic is renamed.

## Agent Instructions

This plan is executed by `/jp-implement-plan` — see `.claude/skills/jp-implement-plan/SKILL.md` for the workflow.
The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the
background), waits for it to finish, then moves on, and reports plan completion to the user. Each worker
implements **exactly one step**, checks off its items with a one-line summary each, and **stops without spawning
another agent**.

- The working tree has **unrelated uncommitted changes** (`InteractiveTargetingSession.ts`, `TurnIndicator.tsx`,
  `BattlePhase.tsx`, `turnIndicatorState*.ts`, `useInteractiveTargetingProgress.ts`, `docs/user-feedback-triage-2026-10-21.md`).
  Never revert, stash, or reformat them. Edit only the exhaustion-related lines in those files.
- Use `git mv` when renaming files so history follows.
- Tests are Vitest (`npx vitest run <file>`), never Jest. Per step run only the tests listed in that step.
- Relevant skills: `game-object-def-pattern`, `game-engine`, `editing-and-creating-components`,
  `components-for-the-ui`, `campaign-characters`, `research-trees`, `missions`, `scoped-testing`,
  `writing-nested-agents-files`, `working-with-skills`, `.claude/skills/narrative/writing-style-abilities/STYLE.md`.

## Steps

### Step 1 — Backend: rename persisted key and migrate saves

Files: `backend/Campaign.php`, `backend/CampaignManager.php`, `backend/Character.php`, `backend/LobbyManager.php`,
`backend/Http/Handlers/GrantCampaignResourceHandler.php`, `backend/SaveData/CharacterMigrations.php`,
`backend/SaveData/CampaignMigrations.php`, `backend/Migrations/Versions/M0002ExhaustionToHunger.php` (new),
`backend/Migrations/MigrationRegistry.php`.

- [x] Rename the `exhaustion` resource key to `hunger` everywhere in PHP (RESOURCE_KEYS, phpdoc shapes, sums, defaults, grant handler whitelist). Note sign flip: campaign `resources.hunger` is now the signed sum of hunger deltas (normally ≤ 0); keep the existing clamping semantics equivalent (old `max(0, exhaustion)` becomes `min(0, hunger)`).
  - Renamed `exhaustion` to `hunger` in Campaign.php (RESOURCE_KEYS, phpdoc, sums; stored clamp `max(0,..)` -> `min(0,..)`), CampaignManager, and the GrantCampaignResourceHandler whitelist.
- [x] `Character::getExhaustion()` → `Character::getHungerDelta()`: signed net hunger change (latest-per-mission sum + only negative quest deltas), mirroring the new TS `getCharacterHungerDelta`. `LobbyManager` state key `playerExhaustionByPlayer` → `playerHungerDeltaByPlayer`.
  - `Character::getExhaustion()` -> `getHungerDelta()` (latest-per-mission sum + only negative quest deltas); `LobbyManager` now emits `playerHungerDeltaByPlayer`.
- [x] Add save-version 2 to `CharacterMigrations` and `CampaignMigrations` (`v1ToV2`): in every `missionResults[*][*].resourceDelta` and `questResults[*][*].resourceDelta`, and campaign `resources` / campaign mission results, replace `exhaustion: n` with `hunger: -n` (drop the key when 0). Bump `CURRENT_VERSION` to 2.
  - CharacterMigrations and CampaignMigrations bumped to v2 with `v1ToV2` (exhaustion n -> hunger -n, zero dropped; campaign `resources` too), shared helpers live in CharacterMigrations.
- [x] Add `M0002ExhaustionToHunger` deploy-time migration (pattern: `M0001…`) that sweeps characters and campaigns through the lazy migrators; register it in `MigrationRegistry`.
  - Added `M0002ExhaustionToHunger` (sweeps via managers) and registered it in MigrationRegistry.
- [x] Verify: `php -l` on every touched PHP file; if PHP tests exist for SaveData migrations, add a v1→v2 case and run them. Write a scratch PHP snippet (in the scratchpad, not the repo) migrating a sample character JSON and confirm the output.
  - `php -l` clean on all touched files; added v1->v2 cases to `backend/scripts/migrate.php` self-test (and bumped its version expectations to 2); `php backend/scripts/migrate.php --self-test` passes.

### Step 2 — Engine + domain: Hunger stat, tiered maxHp penalty, story actions

Files: `app/js/types.ts`, `app/js/campaignResources.ts`(+test), `app/js/researchTrees/{types,evaluator}.ts`,
`app/js/researchTrees/trees/darkness_upgrades.ts`, research tests that mention exhaustion/endurance,
`character_defs/characterEndurance.ts` → `characterHunger.ts`(+test), `character_defs/exhaustionHealth.ts` → `hungerHealth.ts`(+test),
`storylines/matchExhaustion.ts` → `matchHunger.ts`(+test), `storylines/exhaustionCombat.test.ts` → `hungerCombat.test.ts`,
`character_defs/characterMissionResult.ts`(+test), `character_defs/CampaignCharacter.ts`, `storylines/storyTypes.ts`,
`storylines/BaseMissionDef.ts`, WorldOfDarkness `campsite`, `found_berries`, `questMissionConstants`, `004_cave_respite`,
`005_monster` (+their tests, `chapter1Map.test.ts`, `locationCards.questFlow.test.ts`), the code applying story recovery actions
(`PostMissionStoryPhase.tsx` and wherever `recover_exhaustion*` is handled), `game/units/{Unit,unitToJSON,unitFromJSON,unitHeal}.ts`(+tests),
`game/BattleSession.ts`, `state.ts`, `api/types.ts`, `Game.tsx`, `ui/pages/battlePhase/useBattleSessionLifecycle.ts`, `ui/pages/BattlePhase.tsx`.
All paths under `app/js/games/minion_battles/` unless rooted.

- [x] `CampaignResourceKey` `'exhaustion'` → `'hunger'` (signed, see Design); update `campaignResources.ts` sums/equality and `darkness_upgrades.ts` exclusion; `PassiveStatKey.Endurance` → `PassiveStatKey.MaxHunger = 'maxHunger'` and any research node using it.
  - `CampaignResourceKey`/`CampaignResources` now use signed `hunger`; `campaignResources.ts` sums/equality, `darkness_upgrades.ts` exclusion, evaluator default and tests updated; `PassiveStatKey.Endurance` -> `MaxHunger = 'maxHunger'` (no tree node used it; StatBonusesTab label "Max Hunger").
- [x] `characterHunger.ts`: `DEFAULT_CHARACTER_MAX_HUNGER`, `getCharacterMaxHunger`, `getCharacterHungerDelta`, `getCharacterHunger` (clamped current), `getHungerFraction`, `clampCharacterMatchHungerLoss` (never below 0). Remove the endurance/exhaustion names.
  - `git mv` to `characterHunger.ts` (+test): `DEFAULT_CHARACTER_MAX_HUNGER`, `getCharacterMaxHunger`, `getCharacterHungerDelta` (latest-per-mission + only negative quest deltas, matches PHP), `hungerFromDelta`, `getCharacterHunger`, `getHungerFraction`, `clampCharacterMatchHungerLoss` (takes a positive loss).
- [x] `hungerHealth.ts`: `HUNGER_PENALTY_TIERS` table + `getHungerPenalty(hunger, maxHunger)` + `applyFightStartHunger(unit, hunger, maxHunger)` that lowers `maxHp`/`hp` and sets `unit.hungerPenalty`. Unit tests cover 100%, exactly 15% (no penalty), 14.9%, 1, 0, and maxHunger research bonus.
  - `git mv` to `hungerHealth.ts` (+test): `HUNGER_PENALTY_TIERS`, `getHungerPenaltyTier`/`getHungerPenalty`, `describeHungerPenalty`, `applyFightStartHunger` (lowers maxHp/hp, sets `hungerPenalty`), `HUNGER_LOW_THRESHOLD_FRACTION`, `HUNGER_BAR_TOOLTIP`; tests cover 100%, 15%, 14.9%, 1, 0, researched max.
- [x] `matchHunger.ts`: `computeMatchHungerLoss` (no reserve term), `withHungerDelta` (writes a negative delta), `applyOrderedHungerChanges` (signed changes, clamp [0, max]), `applyHealWoundsToHungerLoss`, `HUNGER_RESOURCE_KEY`. `characterMissionResult.ts`: `hungerChanges` extra + `applyHungerCapToExtras`.
  - `git mv` to `matchHunger.ts` (+test): `computeMatchHungerLoss` (positive loss, no reserve), `withHungerDelta(delta, signedHungerDelta)` (callers pass `-loss`), `applyOrderedHungerChanges`, `applyHealWoundsToHungerLoss`, `HUNGER_RESOURCE_KEY`; `characterMissionResult.ts` has `hungerChanges` + `applyHungerCapToExtras` (+test).
- [x] Unit: remove `hpExhaustion` (field, `getEffectiveMaxHp`, JSON, heal pool, `MatchHungerUnit`); add serialized `hungerPenalty: number = 0`. Wire `BaseMissionDef` / `BattleSession` / `state.ts` / `api/types.ts` to `playerHungerDeltaByPlayer` and `applyFightStartHunger`.
  - `hpExhaustion` removed from Unit/JSON/heal pool/`getEffectiveMaxHp`; added serialized `hungerPenalty`; `BaseMissionDef` takes `playerHungerDeltaByPlayer` and calls `applyFightStartHunger` (hunger = `hungerFromDelta(maxHunger, delta)`); `BattleSession`, `state.ts`, `api/types.ts` renamed; `Unit`/`unitHeal` tests and `hungerCombat.test.ts` updated.
- [x] Story: `recover_hunger` / `recover_hunger_auto` types + phrase text, rename recovery constants, update missions/quests and the handlers; `Game.tsx` match-end flow renamed (`matchHungerLossRef`, etc.).
  - `recover_hunger`/`recover_hunger_auto` types, constants (`CAMPSITE_/MONSTER_/FOUND_BERRIES_EAT_HUNGER_RECOVERY`), copy and tests renamed; `PostMissionStoryPhase` now pushes positive (signed) `hungerChanges`; `Game.tsx` uses `matchHungerLossRef` and passes `-loss` to `withHungerDelta`.
- [x] Keep UI compiling with **mechanical** renames only (imports, `hpExhaustion` removal → drop that bar segment); visual redesign is Step 3.
  - Mechanical only: exhaustion slice removed from `HealthSegmentBar`/`BattleTimeline`/`TimelineHoverFlyout`/`unitDef`/`UnitRenderer`; `UnitResourcePanel` shows a plain Hungry/Starving line via `describeHungerPenalty`; `CharacterEditor`/`ResearchTreePanel` use current Hunger over max; `ResourcePill` key is `hunger` (visuals untouched). Step 3 notes: `campaignResourceGains` still only lists `n > 0`, so loss pills need the sign-driven rework; `CharacterEnduranceBar` rename, `enduranceSection` prop and `appearance="endurance"` remain for Step 3.
- [x] Verify: `npx tsc --noEmit`, `npm run lint`, and only the renamed/edited test files listed above (`npx vitest run <files>`). `grep -rniE "exhaustion|endurance" app/js` should only hit UI files left for Step 3 and the out-of-scope ability terms.
  - `npx tsc --noEmit` clean; `npm run lint` clean apart from the known ONE_PIXEL_TARGET warning; 86 test files / 632 tests green across the renamed/edited files, research, storylines and units. Remaining `grep -i exhaustion|endurance` in app/js: only Step 3 UI files (ResourcePill, CharacterEnduranceBar(+test), CharactersTabLayerOne, CharacterEditor `enduranceSection`, ResearchTreePanel `appearance="endurance"`), the AGENTS.md (Step 4), ability terms, and the lore title "Endurance Edge" in 004_cave_respite.

### Step 3 — UI: orange Ham visuals, gain/loss styling, tooltips

Files: `app/js/components/ResourcePill.tsx`, `ui/components/CharacterEditor/CharacterEnduranceBar.tsx` → `CharacterHungerBar.tsx`(+test),
`ui/components/CharacterEditor/{CharacterEditor,StatBonusesTab}.tsx`, `ui/components/ResearchTreePanel.tsx`, `ui/components/researchNodeGrid.test.ts`,
`ui/components/resources/{HealthSegmentBar,UnitResourcePanel}.tsx`, `ui/components/{BattleTimeline,TimelineHoverFlyout}.tsx`,
`game/units/unit_defs/unitDef.ts`, `game/GameRenderer/renderers/UnitRenderer.ts`,
`app/js/components/CampaignHomeScreen/CharactersTab/CharactersTabLayerOne.tsx`, `ui/pages/PostMissionStoryPhase.tsx`.

- [x] `ResourcePill`: `hunger` meta with `Ham` icon and `HUNGER_ORANGE`; sign-driven appearance — positive (recovered): orange background, black icon + text; negative (lost): black background, orange border/icon/text. Replace the `'endurance'` appearance with a `'hunger'` current-value appearance (black bg, orange). New tooltip constants per Design.
  - `ResourcePill` now uses `Ham` + `HUNGER_ORANGE`; `hungerPillStyle(count, current)` is sign-driven (gain: orange bg/black; loss: black bg/orange); `appearance="hunger"` replaces `'endurance'`; new `HUNGER_LOSS_/HUNGER_RECOVERY_/MAX_HUNGER_TOOLTIP`; `campaignResourceGains` now also lists negative hunger (+ tests).
- [x] `CharacterHungerBar`: orange Ham + orange fill on black, digits as today, 15% threshold tick, tooltip with tier rules, `aria-label="Hunger X of Y"`. Use it in `CharacterEditor` / `CharactersTabLayerOne`.
  - `git mv` to `CharacterHungerBar(.test)` (props `hunger`/`maxHunger`, orange Ham/fill, 15% tick, `HUNGER_BAR_TOOLTIP`, `aria-label="Hunger X of Y"`); `CharacterEditor` and `CharactersTabLayerOne` use `hungerSection`.
- [x] Remove the exhaustion slice from `HealthSegmentBar`, `BattleTimeline`, `TimelineHoverFlyout`, `unitDef.ts` health bar and `UnitRenderer`. `UnitResourcePanel` / hover flyout show "Hungry: −25% max health" / "Starving: −50% max health" when `unit.hungerPenalty > 0`, styled orange.
  - Slices were already removed in Step 2; `UnitResourcePanel` Hungry/Starving line is now orange (hover flyout has no per-unit penalty text to add, so only the resource panel shows it).
- [x] `StatBonusesTab` / `ResearchTreePanel`: "Max Hunger" label + description; post-mission story phase shows hunger gains/losses with the new pill styling.
  - `ResearchTreePanel` uses `appearance="hunger"`; `StatBonusesTab` Max Hunger row has the `MAX_HUNGER_TOOLTIP`; post-mission story/VictoryModal pills pick up loss/recovery styling via `ResourcePill` + `campaignResourceGains`.
- [x] Verify: `npx tsc --noEmit`, `npm run lint`, `npx vitest run` on `CharacterHungerBar.test.ts` and `researchNodeGrid.test.ts`. `grep -rniE "exhaustion|endurance" app/js` returns only out-of-scope ability/eslint terms.
  - `tsc` clean, lint only the known warning, `CharacterHungerBar`/`researchNodeGrid`/`ResourcePill` tests green; grep only hits ability/eslint terms plus the lore title 'Endurance Edge' in 004_cave_respite (a proper name, left as is).

### Step 4 — Docs and skills

Files: `app/js/components/CampaignHomeScreen/CharactersTab/AGENTS.md`, `storylines/WorldOfDarkness/quests/AGENTS.md`,
`.claude/skills/components-for-the-ui/SKILL.md` + `.cursor/` mirror, `.claude/skills/working-on-minion-battles/SKILL.md` + mirror,
`.claude/skills/working-with-skills/SKILL.md` + mirror, narrative `LORE.md` / `STYLE.md` (+ mirrors) where they describe the mechanic.

- [x] Update every agent-facing doc/skill that describes Exhaustion/Endurance to describe Hunger (single stat, tiers, orange Ham, gain/loss styling, `hunger` signed key, migration v2). Keep `.claude` and `.cursor` copies identical. Leave historical plans under `docs/plans/` and `docs/user-feedback-triage-*.md` untouched.
  - Updated both `components-for-the-ui` SKILL.md copies (CharactersTabLayerOne text, `CharacterEnduranceBar` row -> `CharacterHungerBar`), CharactersTab/AGENTS.md, and quests/AGENTS.md (Hunger wording, `applyHealWoundsToHungerLoss`/`matchHunger.ts`); no other skill/LORE/STYLE doc described the mechanic, so none needed edits.
- [x] Verify: `grep -rniE "exhaustion|endurance" .claude .cursor app --include=*.md` only shows unrelated uses.
  - grep over `.claude/skills`, `.cursor/skills` and `app` markdown is now empty (remaining hits are only in `.claude/worktrees/**` copies and historical `docs/`, deliberately untouched).

### Step 5 — Final verification

- [x] `npx tsc --noEmit` and `npm run lint` clean.
  - `tsc` clean; lint only the known ONE_PIXEL_TARGET warning.
- [x] `npx vitest run --changed` (broad run over everything this plan touched) passes; fix or report any failure.
  - `vitest run --changed`/`related` crashes with a Rollup PARSE_ERROR while tracing imports (non-JS file in the graph, not from this plan), so ran the full `npx vitest run` instead: 394 files / 3280 tests passed.
- [x] AbilityTest/headless coverage (see `ability-tests` skill): add one high-level general scenario under `testing/scenarios/` — a player unit spawned with low Hunger (< 15%) and one with 0 Hunger start with 75% / 50% max HP, and a unit at ≥ 15% starts at full max HP; run that scenario via the headless runner.
  - Added `testing/scenarios/general/hunger.ts` (`hunger_fight_start_max_hp_tiers`: 15% full, 14% -> 75%, 0 -> 50%), registered it plus a `Hunger` general group in `registry.ts`, and `hunger.scenarios.test.ts` runs it headlessly (passes).
- [ ] Manual browser checklist (dev server via `preview_start`): character sheet Hunger bar is orange with Ham icon and 15% tick; a mission-result loss pill is black with orange Ham/text and a recovery pill (campsite / berries) is solid orange with black Ham/text; in battle a starving character's health bar shows a smaller max HP with no gray/orange reserve slice and the resource panel shows the Hungry/Starving line.
  - Partial (orchestrator, 2026-10-22): character-sheet Hunger bar verified in browser (orange, Ham icon, "Hunger 100 of 100", revised tooltip). Loss/recovery pills and in-battle Starving view still need a human check (test account has no hunger loss yet).
