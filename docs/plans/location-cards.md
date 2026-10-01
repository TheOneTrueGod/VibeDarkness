# Location Cards

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
  (`backend/Character.php`). A grant creates a new instance per quest clear (duplicates allowed).
- **Two-level model.** `LocationCardDef` (static lookup, keyed by numeric `location_card_id`: `displayName`,
  `description`, `flavourText`, `missionId`) vs `LocationCardInstance` (what the player owns:
  `instanceId`, `location_card_id`, optional `displayNameOverride`, `modifications`). `mission_id` lives only on
  the def, so the user's example (`mission_id` on the instance) is resolved via the lookup.
- **Modifications:** `{ type: 'add_reward'; slot: number; reward_id: number }`. `reward_id` indexes a
  `LOCATION_REWARD_DEFS` lookup (resource deltas only for now). `slot` is stored and shown but has no
  gameplay meaning yet beyond ordering — rewards are queued as Campaign Rewards when that encounter is won.
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
- [ ] Add `storylines/locationCards.ts` with `LocationCardId`, `LocationCardDef`, `LocationCardInstance`,
  `LocationCardModification`, `LOCATION_CARD_DEFS` (ids 1 and 2 using `FOUND_BERRIES_MISSION_ID` /
  `SURFACE_METAL_DEPOSIT_MISSION_ID`, with description + flavour text), `LOCATION_REWARD_DEFS` (e.g. id 4 =
  `{ resourceDelta: { food: 2 } }`), helpers `getLocationCardDef`, `createLocationCardInstance`,
  `describeLocationModification`, and re-export from `storylines/index.ts`. Add `locationCards.test.ts`
  (every def's `missionId` resolves to a registered mission; reward ids referenced by defs exist).
  - Files: `storylines/locationCards.ts`, `storylines/locationCards.test.ts`, `storylines/index.ts`
  - Verify: `npx vitest run app/js/games/minion_battles/storylines/locationCards.test.ts`, `npm run lint`

### Step 2 — Picker, new slot kind, run + reward plumbing (pure logic)
- [ ] In `questTypes.ts`: add `{ kind: 'location_encounter' }` to `MissionSlotSpec` (optional
  `tags`/fallback params reuse `RandomStorySlotParams` for the empty-deck fallback); add
  `locationCardIds?: number[]` to `QuestDef.completionRewards`, `CampaignReward`, `QuestResult`; extend
  `ResolvedMissionRef` generated variant with optional `locationCardInstanceId?: string`.
- [ ] In `locationCards.ts` add `pickLocationCardInstance(deck, usedInstanceIds, slotSeed)` (min-use-count
  filter, then seeded index over a stable sort by `instanceId`).
- [ ] In `questSlotResolve.ts` add `resolveLocationEncounter` and thread a `locationDeck` through
  `QuestSlotResolveContext` / `resolveQuestSlots`; usage counts come from earlier refs resolved in the same
  call. Empty deck → fall back to `pickRandomStoryMission`. Generator id `location_encounter_v1`.
- [ ] In `questRun.ts`: `StartQuestRunParams.locationDeck?`, pass into `resolveQuestSlots`; add
  `locationCardIds` to `CampaignRewardsPayload`, `buildCampaignRewardsPayload` (merge completion + queued),
  `completeQuestRun` result; update `questCampaignRewards.ts` (`isCampaignRewardsPayloadEmpty`,
  `campaignRewardsToMissionGrantArgs` stays unchanged — location cards are granted via the character, not the
  campaign mission-result path).
- [ ] Tests: extend `questSlotResolve.test.ts` (deterministic; no repeat until all used equally; empty-deck
  fallback; duplicate instances of one card count separately), `questRun.test.ts` (payload carries
  `locationCardIds`), `questCampaignRewards.test.ts` (empty-payload check).
  - Files: `storylines/questTypes.ts`, `storylines/locationCards.ts`, `storylines/questSlotResolve.ts`,
    `storylines/questRun.ts`, `storylines/questCampaignRewards.ts` + the three test files above
  - Verify: `npx vitest run` on those three test files, `npx tsc --noEmit`, `npm run lint`

### Step 3 — Quest content wiring
- [ ] `scavenge_the_plains.ts`: replace slot 0 (`random_story`) with `{ kind: 'location_encounter' }` (keep
  the same fallback story params). `investigate_the_wildlife.ts`: `completionRewards.locationCardIds: [1]`
  (Found Berries). `swarmling_source.ts`: `completionRewards.locationCardIds: [2]` (Surface Metal Deposit).
  Update `questSlotMissionIds` in `questLobby.ts` to label `location_encounter` slots (`'location_encounter'`).
  Fix any existing tests that assert scavenge's first slot is `random_story` (grep
  `questTypes.test.ts`, `questRun.test.ts`, `unlock.questBanks.test.ts`).
  - Files: `storylines/WorldOfDarkness/quests/{scavenge_the_plains,investigate_the_wildlife,swarmling_source}.ts`,
    `storylines/questLobby.ts`, affected existing tests
  - Verify: `npx vitest run` on only the test files you edited, `npx tsc --noEmit`

### Step 4 — Persistence and granting
- [ ] Backend: add `locationDeck` (per-campaign map of instance arrays, normalised to a list of
  `{instanceId, location_card_id, displayNameOverride?, modifications[]}`) to `Character.php`
  (constructor/getter/`toArray`/`fromArray`), `CharacterManager::updateCharacter` and
  `UpdateCharacterHandler.php`. Mirror in `campaignCharacterTypes.ts` and `api/types.ts` (`updateCharacter`
  payload).
- [ ] Grant on quest clear: in `Game.tsx` `prepareQuestVictoryContinue` finale branch, inside the existing
  `shouldGrant` guard, append `createLocationCardInstance` for each `payload.locationCardIds` to
  `rawChar.locationDeck[campaignId]` and include `locationDeck` in the same `api.updateCharacter` call that
  writes `questResults`. Pure helper `addLocationCardsToDeck(deck, ids, now)` lives in `locationCards.ts`
  with a test.
  - Files: `backend/Character.php`, `backend/CharacterManager.php`, `backend/Http/Handlers/UpdateCharacterHandler.php`,
    `character_defs/campaignCharacterTypes.ts`, `api/types.ts`, `Game.tsx`, `storylines/locationCards.ts` (+ test)
  - Verify: `npx vitest run .../locationCards.test.ts`, `npx tsc --noEmit`, `npm run lint`;
    run any existing PHP test touching `Character` if one exists (grep `tests/`)

### Step 5 — Feed the deck into run creation (incl. multiplayer stamping)
- [ ] `App.tsx` `startQuestRun` call: pass `locationDeck: character.locationDeck?.[questDef.campaignId]`.
- [ ] Lobby stamping: add `questResolvedSlots?: ResolvedMissionRef[]` to `QuestLobbyFields`,
  `questLobbyFieldsFromRun`, `readQuestLobbyFields`, `planQuestVictoryContinue`, the continuation claim payload,
  `api/types.ts`, and persist it where `questRunSeed` is persisted in `LobbyManager.php`.
  `ensureQuestPrepRun` uses `lobby.questResolvedSlots` (when present) as the run's `resolvedSlots` instead of
  re-resolving; falls back to seed resolve for old lobbies.
- [ ] Tests: `questLobby.test.ts` (round-trips the stamp), `questPrepFinalize.test.ts` (joiner with an empty
  deck gets the starter's picks).
  - Files: `App.tsx`, `storylines/questLobby.ts`, `storylines/questPrepFinalize.ts`, `api/types.ts`,
    `backend/LobbyManager.php` + the two test files
  - Verify: `npx vitest run` on the two test files, `npx tsc --noEmit`, `npm run lint`

### Step 6 — LocationCard pill + tooltip UI
- [ ] Add `ui/components/LocationCardPill.tsx`: small pill (lucide `Mountain` icon + display name, styled like
  `ResourcePill` small/medium) that opens a medium `LocationCardTooltip` via `AnchoredPortalTooltip` on hover
  (name, description, italic flavour text, mission type badge battle/story, modifications list from
  `describeLocationModification`). Accepts `{ locationCardId }` or an instance. Handle unknown ids gracefully.
- [ ] Wire it into: `VictoryModal.tsx` Campaign Results (new "Location cards gained:" row from
  `campaignRewards.locationCardIds`); the character's Campaign data view (`CampaignDataPanel.tsx` — list the
  deck with counts); the Mission Map quest panel slot pills for `location_encounter`
  (`MissionMapTab.tsx` — note this file has uncommitted edits in git status; read before editing).
- [ ] Register the component in `.claude/skills/components-for-the-ui/SKILL.md` (and the `.cursor/skills/` mirror
  if one exists). Add a pure test for any helper (e.g. `describeLocationModification`) rather than rendering.
  - Files: `ui/components/LocationCardPill.tsx`, `VictoryModal.tsx`, `characters/CampaignDataPanel.tsx`,
    `CharacterEditor/MissionMapTab.tsx`, skill doc
  - Verify: `npx vitest run` on `CampaignDataPanel.test.ts` only if that file changed, `npx tsc --noEmit`, `npm run lint`

### Step 7 — Apply `add_reward` modifications
- [ ] When a quest mission resolved from a location card is won, `prepareQuestVictoryContinue` looks up the
  instance (via `ResolvedMissionRef.locationCardInstanceId`) in the character's deck and
  `queueCampaignReward({ source: 'other', resourceDelta })` for each `add_reward` modification (using
  `LOCATION_REWARD_DEFS`). Pure helper `rewardsFromLocationModifications(instance)` in `locationCards.ts`
  with tests. Show the extra reward in the tooltip (already listed in step 6).
  - Files: `storylines/locationCards.ts` (+ test), `Game.tsx`
  - Verify: `npx vitest run .../locationCards.test.ts`, `npx tsc --noEmit`

### Step 8 — Docs and final verification (run the expensive things once)
- [ ] Update `storylines/WorldOfDarkness/quests/AGENTS.md` and `.claude/skills/campaign-characters/SKILL.md`
  (+ `.cursor` mirror) with the location deck, `location_encounter` slot, lobby stamping, and repeat rule.
- [ ] Add one high-level, deterministic integration test `storylines/locationCards.questFlow.test.ts`
  (E2E-style, pure — no battle engine): start Investigate the Wildlife → complete → grant card 1 to the deck →
  start Scavenge the Plains → slot 0 resolves to `found_berries`; add card 2 → run a synthetic quest with
  three `location_encounter` slots and assert all three cards are used before any repeats; joiner adopts
  stamped slots. No AbilityTest is needed: nothing in the battle engine, abilities, or battle sync changes.
- [ ] Run once: `npx vitest run app/js/games/minion_battles/storylines` and
  `npx vitest run app/js/games/minion_battles/ui/components/CharacterEditor`, then `npx tsc --noEmit` and
  `npm run lint`.
- [ ] Manual browser checklist (dev server): clear Investigate the Wildlife → Victory modal shows a Found Berries
  pill that tooltips on hover; deck appears in character campaign data; clear Swarmling Source → Surface Metal
  Deposit pill; start Scavenge the Plains → first mission is a card from the deck; two-player lobby shows the
  same first mission for both players; add an `add_reward` modification via admin/DB edit and confirm the
  bonus lands in Campaign Results.
  - Files: docs above + `storylines/locationCards.questFlow.test.ts`

## Open questions for the user
1. Per-character deck (assumed) vs per-account deck shared across a player's characters?
2. In multiplayer, whose deck is drawn? Plan assumes the **quest starter's**.
3. Should repeat quest clears grant another copy of the card, or only if the deck lacks it?
4. What should `slot` mean on `add_reward` (reward slot index vs. quest slot index)?
