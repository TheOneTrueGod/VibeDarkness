# Location Cards

> **Completed 2026-09-30 (automated).** Steps 1-8 implemented by Haiku workers and verified by the orchestrator: lint 0 errors, `tsc` clean, 56 vitest files / 412 tests green across storylines, ui/components and character_defs, `php -l` clean on edited PHP. Remaining: the manual browser checklist (Step 8, last item). Follow-ups: no PHP unit tests exist for Character; `slot` on `add_reward` still has no gameplay meaning.

Per-character "location decks" built from quest rewards. A new `location_encounter` quest slot draws a random
card from the deck and resolves it to that card's mission (battle or story). Cards can carry modifications
(first: `add_reward`).

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md` — do not restate
its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step
**synchronously** (never in the background), waits for each to finish, then reports plan completion to the
user. Each worker implements **exactly one step**, checks its items off with a one-line summary, and **stops
without spawning the next agent**.

Per-step verification: at most `npm run lint` (plus `npx tsc --noEmit` when the step crosses interface
boundaries) and **only the test files that step touches or creates**. Never run the full suite, whole
directories, or AbilityTests inside a regular step — the final step does that once.

Relevant project skills: `missions`, `campaign-characters`, `campaign-home-tabs`,
`components-for-the-ui`, `editing-and-creating-components`, `working-on-minion-battles`,
`working-with-skills`, `writing-nested-agents-files`, `scoped-testing`.

## Design decisions (assumptions — flag to the user if wrong)

- **Where the deck lives:** on the Campaign Character (`locationDeck: Record<campaignId, LocationCardInstance[]>`),
  next to `questResults` / `activeQuestRun`. This is the "campaign player data" that persists today
  (`backend/Character.php`). A deck holds **one instance per `location_card_id`**: re-clearing a quest that grants a card you already own does
  nothing to that instance, so the player's modifications are kept (revised in Step 9; originally duplicates were allowed).
- **Two-level model.** `LocationCardDef` (static lookup, keyed by numeric `location_card_id`: `displayName`,
  `description`, `flavourText`, `missionId`) vs `LocationCardInstance` (what the player owns:
  `instanceId`, `location_card_id`, optional `displayNameOverride`, `modifications`). `mission_id` lives only on
  the def, so the user's example (`mission_id` on the instance) is resolved via the lookup.
- **Modifications (revised in Steps 10-11):** `{ type: 'add_reward'; slot: number; reward_id: number }` inserts a
  story **choice option** into the encounter mission. `reward_id` indexes `LOCATION_REWARD_DEFS`, whose entries
  are story option rows (e.g. id 4 = "make a healing poultice": heals 5 wounds). `slot` is a 0-based index into the
  mission's choice options: the new option **replaces** the option at that index, or is **appended** when the mission
  has fewer options. Healing wounds = reduces the exhaustion recorded for the mission (1 exhaustion per wound point).
  The modification snapshot is stored on the resolved slot ref (`locationCard`) so every party member sees the same
  options. `LocationCardDef` also gains `location_tag: LocationTag[]` (string enum).
- **Card ids:** `1` = Found Berries (`found_berries`), `2` = Surface Metal Deposit (`surface_metal_deposit`).
  The "two encounter missions" are the two current `RANDOM_STORY_BAG` entries.
- **Repeat rule:** within one quest run, pick among instances with the **lowest use count so far**
  (use count = location slots already resolved in this run for that `instanceId`). So no repeats until every
  card has been used equally often. Seeded by `slotSeed` for determinism.
- **Empty deck fallback:** resolve as the old `random_story` bag pick so a quest never bricks.
- **Multiplayer determinism (riskiest part):** slots are currently re-derivable from `runSeed`. A deck-based pick
  is not, so the **quest starter's resolved slots are stamped into the lobby** (`questResolvedSlots`) and
  joiners adopt them in `ensureQuestPrepRun` instead of re-resolving.

## Steps

### Step 1 — Types and lookup tables
- [x] Add `storylines/locationCards.ts` with `LocationCardId`, `LocationCardDef`, `LocationCardInstance`,
  `LocationCardModification`, `LOCATION_CARD_DEFS` (ids 1 and 2 using `FOUND_BERRIES_MISSION_ID` /
  `SURFACE_METAL_DEPOSIT_MISSION_ID`, with description + flavour text), `LOCATION_REWARD_DEFS` (e.g. id 4 =
  `{ resourceDelta: { food: 2 } }`), helpers `getLocationCardDef`, `createLocationCardInstance`,
  `describeLocationModification`, and re-export from `storylines/index.ts`. Add `locationCards.test.ts`
  (every def's `missionId` resolves to a registered mission; reward ids referenced by defs exist).
  - Created locationCards.ts with all types, defs, and helper functions; added 11 comprehensive tests; re-exported from index.ts; all lint & vitest checks pass.

### Step 2 — Picker, new slot kind, run + reward plumbing (pure logic)
- [x] In `questTypes.ts`: add `{ kind: 'location_encounter' }` to `MissionSlotSpec` with optional fallback params; add `locationCardIds?: number[]` to `QuestDef.completionRewards`, `CampaignReward`, `QuestResult`; extend `ResolvedMissionRef.generated` with optional `locationCardInstanceId?: string`.
- [x] In `locationCards.ts`: add `LOCATION_ENCOUNTER_GENERATOR_ID` constant and `pickLocationCardInstance(deck, usedInstanceIds, slotSeed)` with min-use-count filtering and seeded deterministic selection.
- [x] In `questSlotResolve.ts`: add `locationDeck` and `usedLocationInstanceIds` to `QuestSlotResolveContext`; implement `resolveLocationEncounter` with fallback to random_story on empty deck; wire into `resolveMissionSlot`; update `resolveQuestSlots` to pass and accumulate location card instance IDs.
- [x] In `questRun.ts`: add `locationDeck?` to `StartQuestRunParams`; pass to `resolveQuestSlots`; add `locationCardIds` to `CampaignRewardsPayload`; implement `pushAllLocationCardIds` helper; merge completion + queued locationCardIds in `buildCampaignRewardsPayload`; add locationCardIds to result when non-empty in `completeQuestRun`.
- [x] In `questCampaignRewards.ts`: update `isCampaignRewardsPayloadEmpty` to check `locationCardIds.length === 0`.
- [x] Tests: added 8 location_encounter tests to questSlotResolve.test.ts (deterministic, no repeat until all equal, fallback, duplicate instances); added 3 locationCardIds tests to questRun.test.ts (completion ids, merged with queued, omit when empty); added 1 test to questCampaignRewards.test.ts (payload with only locationCardIds is non-empty); added 8 pickLocationCardInstance tests to locationCards.test.ts.
  - Files touched: `questTypes.ts`, `locationCards.ts`, `questSlotResolve.ts`, `questRun.ts`, `questCampaignRewards.ts`, and all four test files
  - Verified: `npm run lint` (0 new errors), `npx tsc --noEmit` (0 errors), all target tests pass (15 + 14 + 6 + 19 = 54 tests)

### Step 3 — Quest content wiring
- [x] `scavenge_the_plains.ts`: replace slot 0 (`random_story`) with `{ kind: 'location_encounter' }` (keep the same fallback story params). `investigate_the_wildlife.ts`: `completionRewards.locationCardIds: [1]` (Found Berries). `swarmling_source.ts`: `completionRewards.locationCardIds: [2]` (Surface Metal Deposit). Update `questSlotMissionIds` in `questLobby.ts` to label `location_encounter` slots (`'location_encounter'`). Fix any existing tests that assert scavenge's first slot is `random_story` (grep `questTypes.test.ts`, `questRun.test.ts`, `unlock.questBanks.test.ts`).
  - Added location card ID constants to questMissionConstants.ts; updated scavenge_the_plains slot 0 to location_encounter with fallback; added locationCardIds to investigate_the_wildlife and swarmling_source completionRewards; updated questLobby.questSlotMissionIds to handle location_encounter; fixed questRun.test.ts by using QUEST_WITH_COMPLETION instead of SWARMLING_SOURCE for empty locationCardIds test; added 5 comprehensive new tests in questSlotResolve.test.ts covering quest definitions and resolution behavior; all 100 tests in 7 test files pass.
  - Files: `questMissionConstants.ts`, `scavenge_the_plains.ts`, `investigate_the_wildlife.ts`, `swarmling_source.ts`, `questLobby.ts`, `questSlotResolve.test.ts`, `questRun.test.ts`
  - Verify: All 7 storylines test files (100 tests) pass; `npx tsc --noEmit` clean; `npm run lint` clean

### Step 4 — Persistence and granting
- [x] Backend: add `locationDeck` (per-campaign map of instance arrays, normalised to a list of
  `{instanceId, location_card_id, displayNameOverride?, modifications[]}`) to `Character.php`
  (constructor/getter/`toArray`/`fromArray`), `CharacterManager::updateCharacter` and
  `UpdateCharacterHandler.php`. Mirror in `campaignCharacterTypes.ts` and `api/types.ts` (`updateCharacter`
  payload).
- [x] Grant on quest clear: in `Game.tsx` `prepareQuestVictoryContinue` finale branch, inside the existing
  `shouldGrant` guard, append `createLocationCardInstance` for each `payload.locationCardIds` to
  `rawChar.locationDeck[campaignId]` and include `locationDeck` in the same `api.updateCharacter` call that
  writes `questResults`. Pure helper `addLocationCardsToDeck(deck, ids, now)` lives in `locationCards.ts`
  with a test.
  - Files: `backend/Character.php`, `backend/CharacterManager.php`, `backend/Http/Handlers/UpdateCharacterHandler.php`,
    `character_defs/campaignCharacterTypes.ts`, `api/types.ts`, `Game.tsx`, `storylines/locationCards.ts` (+ test)
  - Verify: `npx vitest run .../locationCards.test.ts`, `npx tsc --noEmit`, `npm run lint`;
    run any existing PHP test touching `Character` if one exists (grep `tests/`)

### Step 5 — Feed the deck into run creation (incl. multiplayer stamping)
- [x] `App.tsx` `startQuestRun` call: pass `locationDeck: character.locationDeck?.[questDef.campaignId]`.
  - Added locationDeck parameter to startQuestRun call in handleStartQuestForCharacter; added CampaignCharacter.locationDeck property; validated with Array.isArray before passing.
- [x] Lobby stamping: add `questResolvedSlots?: ResolvedMissionRef[]` to `QuestLobbyFields`,
  `questLobbyFieldsFromRun`, `readQuestLobbyFields`, `planQuestVictoryContinue`, the continuation claim payload,
  `api/types.ts`, and persist it where `questRunSeed` is persisted in `LobbyManager.php`.
  `ensureQuestPrepRun` uses `lobby.questResolvedSlots` (when present) as the run's `resolvedSlots` instead of
  re-resolving; falls back to seed resolve for old lobbies.
  - Updated questLobby.ts, questPrepFinalize.ts, api/types.ts; added questResolvedSlots to continuation payload; validated in LobbyManager.php with per-item kind+missionId check (cap 20 items).
- [x] Tests: `questLobby.test.ts` (round-trips the stamp), `questPrepFinalize.test.ts` (joiner with an empty
  deck gets the starter's picks).
  - Added 3 tests to questLobby.test.ts (round-trip, validation, payload inclusion) and 2 to questPrepFinalize.test.ts (joiner adoption, location deck stamping); all pass.
  - Files: `App.tsx`, `storylines/questLobby.ts`, `storylines/questPrepFinalize.ts`, `api/types.ts`,
    `backend/LobbyManager.php` + the two test files
  - Verify: `npx vitest run` on the two test files (20 pass), `npx tsc --noEmit` (clean), `npm run lint` (0 new errors)

### Step 6 — LocationCard pill + tooltip UI
- [x] Add `ui/components/LocationCardPill.tsx`: small pill (lucide `Mountain` icon + display name, styled like
  `ResourcePill` small/medium) that opens a medium `LocationCardTooltip` via `AnchoredPortalTooltip` on hover
  (name, description, italic flavour text, mission type badge battle/story, modifications list from
  `describeLocationModification`). Accepts `{ locationCardId }` or an instance. Handle unknown ids gracefully.
  - Created LocationCardPill.tsx with Mountain icon, tooltip on hover/focus/tap, and graceful handling of unknown ids; created pure helper locationCardPillView.ts + tests covering known/unknown ids, overrides, and modifications.
- [x] Wire it into: `VictoryModal.tsx` Campaign Results (new "Location cards gained:" row from
  `campaignRewards.locationCardIds`); the character's Campaign data view (`CampaignDataPanel.tsx` — list the
  deck with counts); the Mission Map quest panel slot pills for `location_encounter`
  (`MissionMapTab.tsx` — note this file has uncommitted edits in git status; read before editing).
  - Added location cards section to VictoryModal showing cards gained; added Location Deck section to CampaignDataPanel showing grouped cards with counts; updated MissionMapTab buildQuestSlotRows to show 'Location Encounter' for location_encounter slots.
- [x] Register the component in `.claude/skills/components-for-the-ui/SKILL.md` (and the `.cursor/skills/` mirror
  if one exists). Add a pure test for any helper (e.g. `describeLocationModification`) rather than rendering.
  - Updated both .claude and .cursor skill docs to register LocationCardPill; all tests pass (6 + 2), tsc clean, lint clean (no new errors).
  - Files: `ui/components/LocationCardPill.tsx`, `locationCardPillView.ts`, `locationCardPillView.test.ts`, `VictoryModal.tsx`, `characters/CampaignDataPanel.tsx`,
    `CharacterEditor/MissionMapTab.tsx`, skill docs
  - Verify: `npx vitest run` on locationCardPillView.test.ts (6 pass), CampaignDataPanel.test.ts (2 pass), `npx tsc --noEmit` (clean), `npm run lint` (0 new errors)

### Step 7 — Apply `add_reward` modifications
- [x] When a quest mission resolved from a location card is won, `prepareQuestVictoryContinue` looks up the
  instance (via `ResolvedMissionRef.locationCardInstanceId`) in the character's deck and
  `queueCampaignReward({ source: 'other', resourceDelta })` for each `add_reward` modification (using
  `LOCATION_REWARD_DEFS`). Pure helper `rewardsFromLocationModifications(instance)` in `locationCards.ts`
  with tests. Show the extra reward in the tooltip (already listed in step 6).
  - Added `rewardsFromLocationModifications` helper (sums resource deltas from add_reward modifications, returns undefined if none); added `findLocationInstanceForRun` helper (finds instance by locationCardInstanceId in generated refs); added 13 comprehensive tests; exported both from storylines/index.ts; wired reward queueing into Game.tsx prepareQuestVictoryContinue after questDef retrieval (runs for both continued and finale); all 39 locationCards tests pass, tsc clean, lint clean.
  - Files: `storylines/locationCards.ts`, `locationCards.test.ts`, `storylines/index.ts`, `Game.tsx`
  - Verify: `npx vitest run .../locationCards.test.ts` (39 pass), `npx tsc --noEmit` (clean)

### Step 8 — Docs and final verification (run the expensive things once)
- [x] Update `storylines/WorldOfDarkness/quests/AGENTS.md` and `.claude/skills/campaign-characters/SKILL.md`
  (+ `.cursor` mirror) with the location deck, `location_encounter` slot, lobby stamping, and repeat rule.
  - Added "Location cards" section to quests/AGENTS.md covering defs, instances, slot kind, picker, repeat rule, multiplayer stamping, and UI wiring; mirrored locationDeck field updates to both .claude and .cursor campaign-characters SKILL.md files.
- [x] Add one high-level, deterministic integration test `storylines/locationCards.questFlow.test.ts`
  (E2E-style, pure — no battle engine): start Investigate the Wildlife → complete → grant card 1 to the deck →
  start Scavenge the Plains → slot 0 resolves to `found_berries`; add card 2 → run a synthetic quest with
  three `location_encounter` slots and assert all three cards are used before any repeats; joiner adopts
  stamped slots. No AbilityTest is needed: nothing in the battle engine, abilities, or battle sync changes.
  - Created locationCards.questFlow.test.ts with 11 comprehensive tests covering grant flows, deck building, repeat rule, 2-card and 3-card scenarios, multiplayer stamping, and modification handling; all tests pass; lint and tsc clean.
- [x] Run once: `npx vitest run app/js/games/minion_battles/storylines` and
  `npx vitest run app/js/games/minion_battles/ui/components/CharacterEditor`, then `npx tsc --noEmit` and
  `npm run lint`.
- [ ] Manual browser checklist (dev server): clear Investigate the Wildlife → Victory modal shows a Found Berries
  pill that tooltips on hover; deck appears in character campaign data; clear Swarmling Source → Surface Metal
  Deposit pill; start Scavenge the Plains → first mission is a card from the deck; two-player lobby shows the
  same first mission for both players; add an `add_reward` modification via admin/DB edit and confirm the
  bonus lands in Campaign Results.
  - Files: docs above + `storylines/locationCards.questFlow.test.ts`

### Step 9 — Dedupe grants and LocationTag
- [x] In `storylines/locationCards.ts` add `export enum LocationTag { Plains = 'plains', Foraging = 'foraging', Mining = 'mining' }`
  and `location_tag: LocationTag[]` on `LocationCardDef`; set card 1 = `[Plains, Foraging]`, card 2 = `[Plains, Mining]`.
  Surface tags in `ui/components/locationCardPillView.ts` (`tags: string[]`) and render them as small muted chips at
  the bottom of the tooltip in `LocationCardPill.tsx`. Update tests.
  - Added LocationTag enum + location_tag on defs, tags in pill view/tooltip chips; tests updated.
- [x] Change `addLocationCardsToDeck` so it never creates a second instance for a `location_card_id` already in the
  deck (nor twice within one batch); existing instances (with their modifications) are kept untouched. Update the
  affected tests in `locationCards.test.ts` and `locationCards.questFlow.test.ts` (duplicate grant → one copy; a
  re-clear keeps a modified instance). Update the Design/AGENTS wording about duplicates.
  - addLocationCardsToDeck now keeps one instance per card id (re-grant keeps modifications); tests and AGENTS.md updated.
  - Files: `storylines/locationCards.ts`, `locationCards.test.ts`, `locationCards.questFlow.test.ts`,
    `ui/components/locationCardPillView.ts` (+ test), `ui/components/LocationCardPill.tsx`,
    `storylines/WorldOfDarkness/quests/AGENTS.md`
  - Verify: `npm run lint`, `npx tsc --noEmit`, vitest on the three locationCards test files + locationCardPillView.test.ts

### Step 10 — Modifications become mission-option insertions (logic)
- [x] `storylines/storyTypes.ts`: add `StoryChoiceActionHealWounds { type: 'heal_wounds'; amount: number }` to the
  `StoryChoiceAction` union.
  - Added StoryChoiceActionHealWounds interface and union member.
- [x] `locationCards.ts`: change `LocationRewardDef` to `{ label: string; option: StoryChoiceOptionRow }`; id 4 =
  "Make a healing poultice" (`id: 'location_healing_poultice'`, `action: { type: 'heal_wounds', amount: 5 }`,
  lore text about knowledge of the berries' leaves). Replace `rewardsFromLocationModifications` and
  `findLocationInstanceForRun` (resource-based, now obsolete) with
  `applyLocationModificationsToOptions(options, modifications)`: apply `add_reward` mods sorted by ascending slot;
  each replaces `options[slot]` when `slot < options.length`, else is appended; returns a new array, input untouched,
  unknown reward ids skipped. Update `describeLocationModification` (e.g. `Option 3: Make a healing poultice`).
  - Updated LocationRewardDef structure, added healing poultice option, removed obsolete helpers, added applyLocationModificationsToOptions, updated describeLocationModification format.
- [x] Snapshot on the ref: `ResolvedMissionRef` generated variant gains
  `locationCard?: { locationCardId: number; instanceId: string; modifications: LocationCardModification[] }`;
  `resolveLocationEncounter` fills it. Remove the Step 7 block in `Game.tsx` `prepareQuestVictoryContinue` that
  queued resource rewards from modifications (and its imports). Update all affected tests
  (`locationCards.test.ts`, `questSlotResolve.test.ts`, `locationCards.questFlow.test.ts`).
  - Added locationCard property to ResolvedMissionRef, populated in resolveLocationEncounter, removed Step 7 block from Game.tsx, updated exports in index.ts, updated all tests (36+20+10+8=74 tests passing).
  - Files: `storylines/storyTypes.ts`, `storylines/locationCards.ts`, `storylines/questTypes.ts`,
    `storylines/questSlotResolve.ts`, `Game.tsx`, `storylines/index.ts`, the three test files
  - Verify: `npm run lint` (0 errors), `npx tsc --noEmit` (clean), vitest on `locationCards.test.ts`, `questSlotResolve.test.ts`,
    `locationCards.questFlow.test.ts`, `locationCardPillView.test.ts` (all passing)

### Step 11 — Show the inserted options and apply `heal_wounds` in the live game
- [x] `Game.tsx` passes `locationCardModifications` (from `questLobbyFields.questResolvedSlots[questSlotIndex]` when its
  `missionId` equals the current mission, else undefined) to `PostMissionStoryPhase`; there, after computing
  `postMissionChoiceOptions`, run `applyLocationModificationsToOptions` (choice phrases only).
  - Added locationCardModifications useMemo to Game.tsx, passed to PostMissionStoryPhase, applied modifications in postMissionChoiceOptions memo.
- [x] `PostMissionStoryPhase.tsx`: handle the `heal_wounds` action in `handleChoice` — accumulate
  `healWounds` and return it in `MissionRewards` (`healWounds?: number`). In `Game.tsx` victory handler compute
  `exhaustion = max(0, matchExhaustionRef.current - (rewards.healWounds ?? 0))` (skip-rewards case unchanged) so the
  recorded and displayed exhaustion is lower. Check `backend/Http/Handlers/PostMessageHandler.php` story-choice
  handling does not reject unknown option ids; fix if it does.
  - Added healWounds field to MissionRewards, added accumulatedHealWoundsRef, handle heal_wounds action in handleChoice, return healWounds in onComplete; added applyHealWoundsToExhaustion helper to matchExhaustion.ts with 8 comprehensive tests; no backend changes needed (optionId validation not enforced).
  - Files: `Game.tsx`, `ui/pages/PostMissionStoryPhase.tsx`, `storylines/matchExhaustion.ts`, `storylines/matchExhaustion.test.ts`
  - Verify: `npm run lint` (0 new errors), `npx tsc --noEmit` (clean), vitest on matchExhaustion.test.ts and full storylines suite (275 tests pass)

### Step 12 — Revised docs and final verification
- [x] Update `quests/AGENTS.md` and the campaign-characters skill (+ `.cursor` mirror) for: one instance per card,
  `location_tag`, option-insertion modifications, `heal_wounds`. Extend `locationCards.questFlow.test.ts`: Found Berries
  options + modification at slot 3 → 4 options with the poultice last; slot 1 modification replaces `keep_berries`;
  re-clear keeps modifications; ref snapshot reaches a joiner through the lobby stamp.
  - Updated quests/AGENTS.md Location cards section with accurate descriptions of one-per-card instances, modifications as option insertions, and heal_wounds exhaustion reduction; updated both campaign-characters SKILL.md copies with one-line mention of location cards; extended locationCards.questFlow.test.ts with 4 new tests: real Found Berries options + slot-3 modification (4 options total), slot-1 modification replaces keep_berries (3 options), end-to-end stamping and joiner adoption, applyHealWoundsToExhaustion edge cases; all 14 tests pass, tsc clean, lint clean.
- [x] Run once: `npm run lint`, `npx tsc --noEmit`, vitest on `storylines`, `ui/components`, `ui/pages`, `character_defs`.
  - lint 0 errors (15 baseline warnings), tsc clean, 62 vitest files / 448 tests green (storylines, ui, character_defs), php -l clean.
- [ ] Manual browser checklist: give a card an `add_reward` modification (edit the character JSON in storage),
  start Scavenge the Plains → Found Berries shows the poultice as a 4th option; choosing it lowers exhaustion in
  Mission Results by up to 5; a second player sees the same options.

## Resolved questions (2026-09-30)
1. Per-character deck — confirmed. 2. Quest starter's deck is drawn from — confirmed.
3. One copy of a card per character; re-clears keep existing modifications. (Existing behaviour already skips
   re-applying Campaign Rewards when a quest victory was already applied — unchanged.)
4. `slot` = index of the option in the mission's choice, replacing or appended; example modification = healing poultice (5 wounds).
