# User feedback triage — 2026-10-21

Light investigation only (code located, nothing changed). Each item has a size, the files
involved, and notes for the agent that picks it up. Follow `CLAUDE.md` (engine-first design,
scoped Vitest runs, `npx tsc --noEmit` after interface changes).

Clarifications from the user (2026-10-21) are folded into items 2, 3, 5, 8 and 15.

## Status

### Done (uncommitted, in the working tree)

Implemented 2026-10-21, then reviewed by reading the diff. Scoped Vitest runs pass and
`npx tsc --noEmit` is clean. The full suite has not been run, and nothing has been checked in
the browser.

| # | Item | What changed |
|---|------|--------------|
| 1 | Throw Charged Rock required for Charging Punch | `training.ts` node requires `charged_rocks`; Cave Respite hides the Charging Punch choice without it |
| 3 | Blood Shard as a starting Blood Mage ability | Core node grants `0304`; Shard node and its costs deleted; Blood Splinters now requires the core node (moved to the old Shard position, tier kept at 13 for the cost-curve test) |
| 4 | Auto End always on, removed from UI | `AUTO_END_TURN = true`; localStorage override removed; checkbox removed. Setter kept, in memory only, for tests |
| 6 | "Bright" keyword tooltip | `describe` added to the Bright keyword; glossary tests updated |
| 7 | Blue hit flash on shield absorb | `UnitRenderer` flashes blue when a shield buff absorbed the whole hit; partial absorbs stay red |
| 9 | Hide Reset Research for non-admins | `CharacterEditor.tsx` gates both reset paths on `isAdmin` |
| 12 | "Eat the Berries" recovers 10 exhaustion | New reusable `recover_exhaustion` choice action (`storyTypes.ts`, handled in `PostMissionStoryPhase.tsx`). `heal_wounds` couldn't be used: it only affects a live match |
| 13 | Swarmling Source nest twice per round | `SWARM_NEST_SPAWN_INTERVAL_SEC = ROUND_DURATION / 2` |
| 14 | Page text highlightable | `app.css` disables selection on `body`, re-enables it for inputs, textareas and contenteditable; `select-text` added to Chat and DebugConsole |
| 15 | Monster mission −100 exhaustion | `recover_exhaustion_auto` phrase (100) added to the Monster post-mission story. It applies per character, clamped at 0, the same way Campsite does it |

#### Item 10, spinner while waiting on the server (uncommitted)

Built after the batch above, to the approved mockup: the same plaque and side lines, the round
pill on the left, a centred spinner with no text, and an empty slot sized for Pass on the right.
- "Waiting" means `InteractiveTargetingSession.isCommitInFlight`: it's set when the commit
  starts and cleared in a `finally`. It's sampled on the 50 ms ITS poll (`itsCommitInFlight` in
  `useInteractiveTargetingProgress.ts`).
- The state is derived by `computeAwaitingServerAfterSubmit` in `turnIndicatorState.ts`, which is
  tested, and passed to `TurnIndicator` as `awaitingServerAfterSubmit`.
- A submit failure (`orderSubmitFailed`) hides the spinner straight away, so the controls come
  back beside the error banner.

Known gaps:
- If BattleNet accepts the order but holds it back (client ahead of host), the commit finishes
  and the spinner goes. The plaque then shows what it shows today, plus the "Queued N" chip.
- On a rollback commit, the spinner also replaces the frame stepper during the rewind crossfade.
- A network call that never settles keeps the spinner up until the HTTP timeout.
- Not checked in the browser.

Follow-ups noticed during review:
- `AUTO_END_TURN` now defaults to `true` everywhere, including tests. Only the interaction tests
  were run, so `npm run ci` / the full suite is the backstop for any test that assumed `false`.
- Chapter skip ignores both exhaustion-recovery actions, the same as it ignores `heal_wounds`.
- No dedicated test covers the Cave Respite Charging Punch filter.
- Lobby logs and other copyable areas weren't checked for item 14; add `select-text` where
  copying is wanted.

### Not done

| # | Item | Size | State |
|---|------|------|-------|
| 2 | Alpha wolf not using Charge / basic attack | Medium | Ready to hand off; needs a failing test first |
| 5 | Slimes attack twice per round, once per half | Medium | Ready to hand off; needs a new reusable AI setting |
| 8 | South Gate Swarm wolves spawn in light | — | Deferred by user (likely an undeployed build) |
| 11 | Skip "Prepare Carefully" for campfires / events | Medium | Needs one answer: every `skipBattle` mission, or only random-story / quest ones? |

---

## 1. Make "Throw Charged Rock" a requirement of Charging Punch — Easy

- Charging Punch is the `charging_punch` node in `app/js/researchTrees/trees/training.ts:114`
  (replaces Punch 0120 → 0119). Its hit grants a Light Charge to `throw_charged_rock`, which is
  pointless without that ability.
- Throw Charged Rock comes from the `charged_rocks` node in `crystal_rocks` tree
  (`app/js/researchTrees/trees/crystal_rocks.ts`).
- Add `{ type: 'anyResearched', treeId: CRYSTAL_ROCKS_TREE_ID, nodeIds: ['charged_rocks'] }` to
  the node's `requirements` (the requirement type exists in `researchTrees/types.ts:12`).
- **Also** the Cave Respite story choice grants Charging Punch directly and bypasses tree
  requirements: `getCaveRespitePunchChoiceRows()` in
  `storylines/WorldOfDarkness/missions/004_cave_respite.ts:54`. It takes no params today; pass
  `params.playerResearchTrees` through (as `getCaveRespiteResearchChoiceRows` does) and drop the
  Charging Punch row when `charged_rocks` isn't researched.
- Tests: `004_cave_respite` tests if present, plus a training tree requirement check.

## 2. Alpha wolf isn't using its charge attack or its basic attack — Medium

**User's intended kit:** Charge (one charge), Triple Charge (three charges, only while
enraged), Summon Wolves, and a Basic Attack: a melee bite like the swarmling's. The report is
about Charge and the Basic Attack not being used.

- Spawn def `ENEMY_ALPHA_WOLF` (`constants/enemyConstants.ts:63`): abilities
  `['0005' Summon, '0007' Charge, '0011' Triple Charge, '0012' Scratch]`. That matches the kit.
  **`0012` Alpha Wolf Scratch is the basic attack**: it is built with `BasicAttackBuilder`, the
  same builder as the swarmling's `0013` Swarmling Bite. `0004` Alpha Wolf Claw is an older
  ability that isn't in the kit; leave it out.
- AI tree: `game/units/unitAI/alphaWolfBoss/alphaWolfBoss_attack.ts` → `applyAIMovementToUnit`
  then `tryQueueAbilityOrder` (`unitAI/utils.ts`; `pickBestAbility` filters by range,
  `maxUsesPerRound` and priority).
- Likely causes, most likely first:
  - **Basic attack range mismatch.** `0012` has `aiMaxRange: 70`, and its comment assumes a
    default unit radius of 20. The spawn def's `aiSettings.maxRange: 100` is what the movement
    uses, so the wolf probably stops ~100px away, out of range for a 70px attack. The alpha wolf
    is also larger (`radius: 26`, size Extra Large). Fix in the engine if possible: derive the
    basic attack's AI range from the caster's radius instead of a hard-coded 70, rather than
    tuning this one unit.
  - `0012` has `aiPriority: -10`. It's the lowest priority by design (the "fallback" attack), so it
    only fires when nothing else is eligible; check that Summon (priority 20, 1 per round) isn't
    blocking it.
  - **Charge (`0007`):** `maxUses: 2`, recovers only via `staminaCharge` (1 use per charge),
    `aiMaxRange: 100`, `forbiddenTags: [Enraged]`. It's intentionally unavailable below 50% hp
    (Triple Charge `0011` takes over). Check whether it runs out of uses and never recovers
    (alpha wolf has `stamina: 2`), or never lands in range because of the movement.
  - Mission 005 has `playerControl` for the boss (`controlGroupId: 'boss'`). If someone has
    taken control, the AI doesn't act. Rule this out first.
  - Recent commits refactored ability infra (Rend follow-ups, lunges): possible regression.
- Per CLAUDE.md: **write a failing test first**. Tiny battle: alpha wolf plus a player at
  ~60-90px, not enraged; assert `0007` and `0012` are both cast within N rounds. A second case,
  enraged: assert `0011` is cast and `0007` isn't. No alpha-wolf AI test exists today.

## 3. Blood Shard as a second starting ability for Blood Mage Core — Easy

**User decision:** remove the Blood Shard research node; anything that required it now
requires the Blood Mage core node.

- Blood Mage tree `app/js/researchTrees/trees/blood_mage.ts`:
  - Core node (`BLOOD_MAGE_NODE_CORE`, effects ~line 66) adds card `0301`. Add
    `{ type: 'addCard', cardId: '0304' }` beside it.
  - Delete the `BLOOD_MAGE_NODE_SHARD` node (~line 94) and its cost constants
    (`BLOOD_SHARD_*_COST`) if nothing else uses them. Keep or delete the exported
    `BLOOD_MAGE_NODE_SHARD` id depending on whether other code still needs it.
  - **Blood Splinters** (`BLOOD_MAGE_NODE_SPLINTERS`, ~line 163) is the only dependent: change
    `prereqNodeIds` and its `anyResearched` requirement from `BLOOD_MAGE_NODE_SHARD` to
    `BLOOD_MAGE_NODE_CORE`. Consider moving its `position`/`tier` into the gap the removed node
    leaves.
- Card grants are **derived** from researched nodes (`researchTrees/evaluator.ts:509`), so
  characters who already own the core get Blood Shard automatically. No migration needed.
- Characters who already researched the old node keep `'blood_mage_shard'` in their saved
  research. Check that unknown node ids are ignored safely (evaluator, Upgrades tab, reset
  research). No refund unless the user asks for one.
- Tests to update: `card_defs/03_blood_mage/0304_BloodShard/0304Ability.test.ts:185-200` asserts
  the Shard node and Splinters' prereq. Also update the item description in
  `character_defs/items/core/022_core_blood_mage.ts` if it should mention Blood Shard, and the
  Blood Mage `AGENTS.md` if it describes Blood Shard as research.

## 4. Make "Auto End" always enabled and remove it from the UI — Easy

- Default: `AUTO_END_TURN = false` in `game/gameConstants.ts:18`.
- Runtime override + localStorage key `minionBattles.autoEndTurn` in
  `game/autoEndTurnSetting.ts` — stored `false` from earlier sessions would keep it off, so
  ignore/clear the stored value (simplest: `getAutoEndTurn()` returns `true`, or delete the
  setting and inline `true`).
- UI: `AutoEndCheckbox` in `ui/components/ITSTimelineControls.tsx:117` (rendered at ~421);
  remove it. With auto end on, the Done button (`showDone = !autoEndTurn`) disappears.
- Consumers that branch on it: `PlayerInteractionManager.ts`, `useInteractiveTargetingProgress.ts`,
  `BattleAbilityBar.tsx`, `InteractiveTargetingSession.ts`, `isITSPreviewComplete.ts`. Leaving the
  getter in place is lowest risk; full dead-code removal is optional.
- Tests that toggle `setAutoEndTurn(false)` will need checking.

## 5. Slimes ("ghosts") wait too long between attacks — Medium

**User clarification:** "ghosts" are the **slime** enemy (the basic ranged enemy; there is no
`ranged_basic` id in code). Goal: two attacks per round, one sometime in the first half and one
sometime in the second half.

- Spawn def `SLIME` in `game/units/dark_animals/slimeRanged.ts:8`: `abilities: ['0001']` (Slime
  Shot), `aiSettings { minRange: 0, maxRange: 140 }`, AI tree `hunt`.
- Unit def `slime` (`game/units/unit_defs/unitDef.ts:212`): `stamina: 1`.
- Slime Shot (`card_defs/0001_SlimeShot/0001Ability.ts`): 1.0s prefire + 3.0s cooldown (4s
  total, `ROUND_DURATION` is 10s), `aiSettings { minRange: 0, maxRange: MAX_DISTANCE }`.
- Precedent for two attacks per round: the swarmling carries **two copies** of its bite
  (`ENEMY_SWARMLING.abilities: ['0013','0013']`) and has `stamina: 2`; the bite comment says
  this lets it "nip twice before cycling back to the start of its deck". The slime's single card
  and `stamina: 1` likely limit it to one shot per round. Check how enemy decks and stamina gate
  AI casts before changing numbers.
- Spacing (first half / second half) needs **engine work**: `AISettings.roundWindow { start, end }`
  (`abilities/Ability.ts:141`) only allows one window per ability, and `maxUsesPerRound` caps the
  total. Add a reusable AISettings property: for example `useWindows: [{start:0,end:0.5},
  {start:0.5,end:1}]`, meaning the Nth use this round must fall in window N. Check it in
  `pickBestAbility` (`unitAI/utils.ts`, beside the `maxUsesPerRound` check at ~line 275, which
  already uses `context.getAbilityUsesThisRound`). Optionally add a random offset inside each
  window so slimes don't all fire in sync (use the engine's seeded RNG to keep multiplayer in
  sync).
- Note the Displacer Spirit's bolt (`0017`) is pinned to the slime's AI settings by
  `0017Ability.test.ts:24-28`. Decide whether it should share the new cadence or be split off.
- Tests: an AI test where a slime with a player in range casts exactly twice in a round, once at
  t < 5s and once at t ≥ 5s.

## 6. "Bright" has no keyword display on tooltips — Easy

- Glossary entries come from `keywordGlossaryEntries()` in
  `abilities/keywords/keywordRegistry.ts:48`, which skips keywords without `describe`.
- The `bright` registration (`keywordRegistry.ts:70`) has no `describe`. Add one using
  `BRIGHT_DEFS` / `BRIGHT_ROUND_END_DECAY` from `abilities/brightKeyword.ts` (brightness N+1,
  radius 2, loses 1 brightness each round end). See `rendKeyword` for the pattern and
  `.claude/skills/narrative/writing-style-abilities/STYLE.md` for wording.
- `rendKeyword.test.ts:16` currently asserts `keywordGlossaryEntries(['Bright 3','10'])` is
  `[]` — update it.

## 7. Blue overlay flash when the hit lands on a shield — Easy

- Per-unit hit flash: `UnitRenderer.onDamageTaken` → `startHitFlash` in
  `game/GameRenderer/renderers/UnitRenderer.ts:86` / `:529`, hard-coded `0xff0000` at `:562`.
- `DamageTakenEvent` (`game/EventBus.ts:83`) already carries shield-buff absorption (field after
  `armourRemoved`) and `hpDamage`. Pass a colour into `startHitFlash`: blue when the shield
  absorbed the hit (e.g. shield absorbed > 0 and `hpDamage` is 0 — confirm with user whether a
  partial absorb is blue or red).
- Ambiguity: "shield" could also mean Tech Shield *blocking* (a different path, may not emit
  `damage_taken`). Confirm with user; buff shields are the straightforward case.

## 8. South Gate Swarm wolves spawn in the light — Deferred

**User decision:** ignore for now. The feedback likely came from a build without the
uncommitted `inDarkness: true` spawn changes. Don't hand this off. Revisit only if it shows up
again after deploying. Notes kept below for reference.

- Mission: `storylines/WorldOfDarkness/missions/006c_south_gate_swarm.ts`.
- **Uncommitted work already adds** continuous wolf/slime spawns via `nestReinforcementEntry()`
  with `spawnBehaviour: 'network_nearest_owned_leaf'` and `inDarkness: true`. Find out whether
  the feedback session ran with this change or before it.
- Engine darkness check: `isValidSpawnCell` in `game/units/spawning/spawnUnit.ts:68` uses
  `ctx.getLightAt` (the *animated visual* light grid) and `DarknessLevel.FULL_DARKNESS`. The
  network-leaf path honours it (`spawnUnit.ts:375-446`). Possible causes: light that arrives after
  spawn (player walks up with torch), visual-vs-target grid lag, or the opening pack
  (`out.push({...ENEMY_DARK_WOLF, position})` at ~line 131) which is placed at fixed positions with
  no darkness check, or the swarm nest's own spawns.
- Next step: failing test — run the mission's level events with a lit nest area and assert no
  wolf spawns on a lit cell. Then fix in the engine, not the mission.

## 9. Don't show Reset Research for non-admins — Easy

- `ui/components/CharacterEditor/CharacterEditor.tsx`:
  - line ~1330 passes bare `canResetResearch` (always true) to the single-tree panel → change to
    `canResetResearch={isAdmin}`.
  - line ~1356 `ResearchedNodesGrid` gets `onResetPurchasedResearch` unconditionally (admin reset
    is already gated) → gate it on `isAdmin`.
  - line ~1219 already uses `isAdmin && !adminUseGridView`.
- Check `ResearchTreePanel.tsx` / `ResearchedNodesGrid` render nothing when the callback is
  undefined.

## 10. Loading spinner while waiting for the server after ending a turn — Medium

- ITS controls render from `BattlePhase.tsx:453` whenever `interactiveTargetingState !== 'inactive'`
  (`ui/components/ITSTimelineControls.tsx`). There is no "submitted, awaiting server" UI state.
- Existing signals: `orderPipeline { queued, sending }` (shown as "Queued N" chip in
  `TurnIndicator.tsx:341`), BattleNet awaiting-ack / recovering paths
  (`game/battlenet/BattleNet.ts`, `useBattleNetSyncState.ts`).
- Work: define a clear "turn committed, waiting on server" state (after ITS commit until the
  engine resumes) and swap ITS controls for a spinner (reuse the spinner style from
  `SyncStatusCard.tsx` / `BattleLoadingScreen.tsx`). Read the `game-sync-data-flow` skill first —
  orders can be deferred/dropped, so the spinner must clear on failure (`orderSubmitFailed`).

## 11. Skip "Prepare Carefully" for campfires and events — Medium

- Story-only missions (`skipBattle = true`, e.g. `found_berries.ts`, `campsite.ts`,
  `surface_metal_deposit.ts`, `004_cave_respite.ts`) still go through character select; the
  overview view is titled "Prepare Carefully" (`characterSelect/CharacterSelectHeader.tsx:24`).
- Advance logic: `characterSelect/useCharacterSelectPhase.ts:113` — host advances to
  `post_mission_story` once everyone has selected + readied.
- Character selection still matters (story choices grant research to the selected character),
  so skipping means auto-selecting each player's current character and auto-readying, with a
  fallback to the grid when a player has none. Multiplayer/host flow makes this medium.
- Ask: does "events" mean every `skipBattle` mission, or only random-story/quest ones?

## 12. "Eat the Berries" recovers 10 exhaustion — Easy

- `storylines/WorldOfDarkness/questMissions/found_berries.ts:46`: the eat option's action is
  `{ type: 'grant_resources' }` (nothing).
- A `heal_wounds` action already reduces exhaustion 1:1 (`locationCards.ts:81`,
  `applyHealWoundsToExhaustion` in `storylines/matchExhaustion.ts`). Use
  `{ type: 'heal_wounds', amount: 10 }` (add a constant in `questMissionConstants.ts`) and update
  `loreDescription`. Check `chapterSkip.ts:271` comment ("heal_wounds only affect a live match")
  to make sure it applies in a story-only mission.

## 13. Swarmling Source nest spawns twice per round — Easy

- `storylines/WorldOfDarkness/questMissions/swarmling_nest.ts:89`:
  `SWARM_NEST_SPAWN_INTERVAL_SEC = 3`, with `ROUND_DURATION = 10` (`game/gameConstants.ts:12`).
  Change to `ROUND_DURATION / 2`. (`spawnCount` is 2 per trigger — confirm "produces twice" means
  two triggers, not two swarmlings.)
- South Gate Swarm has its own separate constant (`ROUND_DURATION * 0.75`) — leave it.

## 14. You can highlight text on the page — Easy

- Global CSS: `app/js/app.css` (Tailwind entry). Body class is in `index.html:8`.
- Add `user-select: none` on `body` (or `select-none` class) and re-enable with `select-text`
  for `input`, `textarea`, `[contenteditable]`, and anywhere copying is useful (chat, debug
  console, lobby logs). Low risk; quick manual check in the browser.

## 15. Monster mission reduces exhaustion by 100 — Easy

**User clarification:** "100 stamina back" means **reduce exhaustion by 100** at the end of the
mission.

- `storylines/WorldOfDarkness/missions/005_monster.ts:154`: `completionRewards` is
  `{ knowledgeKeys: ['AlphaWolfDefeated'], resourceDelta: { crystals: 6 } }`. There's no stamina
  campaign resource; `CampaignResources` (`app/js/types.ts:76`) includes `exhaustion`.
- Simplest: add `exhaustion: -100` to `resourceDelta`, with a named constant beside
  `MONSTER_CRYSTAL_REWARD`. Before doing that, check:
  - Exhaustion is tracked **per character** (`playerExhaustionByPlayer`, `BaseMissionDef.ts:172`).
    Make sure a mission `resourceDelta` reaches each player's character and not just a shared
    pool. Match-end exhaustion is merged into the delta by `storylines/matchExhaustion.ts`.
  - The order of operations: the -100 should apply after the fight's own match-end exhaustion
    is added, and the result must clamp at 0 (no negative exhaustion).
  - If `resourceDelta` can't do either of those cleanly, reuse the `heal_wounds` path
    (`applyHealWoundsToExhaustion` in `matchExhaustion.ts`) as a completion reward. Build it as a
    general reward type so other missions can use it, not a Monster-only special case.
- Tests: mission completion with a character at e.g. 30 exhaustion ends at 0; one at 150 ends
  at 50.
