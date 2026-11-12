# Multiple concurrent quest runs per character

Allow a Campaign Character to have any number of sidequests started at once (parked runs). A player still only plays one lobby at a time. Do **not** split character/campaign save files into smaller documents.

This plan is investigation-complete and ready to implement; it does not implement anything by itself.

## Agent Instructions

This plan is executed by `/jp-implement-plan docs/plans/multiple-active-quests.md`. The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. See `.cursor/skills/jp-implement-plan/SKILL.md` for the workflow — do not restate it here.

Relevant project skills: `working-on-minion-battles`, `campaign-characters`, `missions`, `campaign-home-tabs`, `editing-and-creating-components`, `scoped-testing`, `working-with-skills`, `writing-nested-agents-files`.

Rules for every worker:

- Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first. This is a persistence/collection change, not a one-off UI flag.
- Paths below are relative to the repo root.
- Per-step verification: `npm run lint:changed`, `npx tsc --noEmit` when the step crosses TS/PHP interface boundaries, and **only the test files the step names**. Never run the full suite or AbilityTests in a regular step. Vitest, not Jest.
- PHP changes must stay in the existing Character / CharacterManager / SaveMigrator patterns. Do not invent a second storage layout.

---

## Save-file investigation (do not split)

### How saves are laid out today

| Entity | Path | Grain |
|---|---|---|
| Account | `storage/accounts/` | One file per account |
| Campaign | `storage/campaigns/<id>.json` | One file per campaign |
| Character | `storage/characters/<id>.json` | One file per character (research, missionResults, questResults, the quest run blob, locationDeck, equipment) |
| Lobby / battle | `storage/lobbies/<lobbyId>/` | **Already split**: game JSON, `pending_orders.jsonl`, `applied_orders.jsonl`, snapshots, fingerprints |

Battle storage is the only place that *needed* multiple files: append-only order logs, large per-tick snapshots, and concurrent host/client writers. `BattleStorage` uses `flock` plus temp-file rename for that.

Character and campaign are small JSON documents. `CharacterManager::updateCharacter` already takes an exclusive lock on `<id>.json.lock`, reloads from disk (bypassing cache), merges the PATCH, and writes the whole character back.

### Recommendation: keep one character file

**Do not** split quests, mission results, or research into sibling files.

Reasons:

1. **The grain is already right.** One file per character / campaign / account, and a lobby *directory* for high-churn battle artifacts. Extra files would fight that pattern.
2. **Campaign Home always loads the whole character.** Mission Map, quest banks, equipment, research, and location deck are shown together. Splitting would add assembly on every `GET /api/characters/:id` with no fewer bytes on the wire.
3. **Atomicity.** Victory currently writes `activeQuestRun` and `questResults` (and sometimes `locationDeck`) in one PATCH. `useQuestFlow` even warns that a parallel `missionResults` PATCH can stomp `currentSlotIndex`. Two files would need nested locks or a journal. The existing character lock already serializes that.
4. **Migrations.** `CharacterMigrations` + deploy sweep (`M0001`…`M0005`) walk one JSON blob. A quests directory would need its own version, backup `touchedDirs()`, and lazy load for every parked run.
5. **Size.** A `QuestRunState` is a frozen loadout, a short slot list, and queued Campaign Rewards — kilobytes. Even a dozen parked sidequests will not approach battle snapshot size.
6. **The real race is the PATCH shape, not the file.** The lock serializes HTTP workers, but the client sends a *whole* `activeQuestRun`. Two tabs that each `GET` then `PATCH` can still clobber. Multiple runs make that worse if the client replaces the entire map. Fix it with **server-side upsert/delete by `runId` on the same file**, not more files.

Revisit splitting only if a later system adds large append-only history (per-mission transcripts, replay dumps) that Campaign Home does not need on every poll. That is not this work.

---

## Locked design

### Vocabulary

| Term | Meaning |
|---|---|
| **Campaign Character** | Persistent template (unchanged) |
| **Quest run** | One `QuestRunState` (`runId`, frozen Quest Character, slots, roster, queued Campaign Rewards) |
| **Active runs** | All runs with status `prep` or `active`, stored together on the character |
| **Parked run** | An active run whose lobby is not the one the player is in right now |

### Persistence

- Replace singular `activeQuestRun` with **`activeQuestRuns: Record<string, QuestRunState>`** keyed by `runId`.
- Character save version **6**: if `activeQuestRun` is a non-null object with `runId`, insert it into `activeQuestRuns` and drop `activeQuestRun`. Empty/null stays `{}`.
- PHP `Character` / `toArray` / `fromArray` and TS `CampaignCharacterData` / `CampaignCharacter` / LobbyClient payloads follow the map. Do not keep a live singular field after migration (no dual-write forever).
- **`questResults` stays a list** of completed/abandoned placements (already multi).

### PATCH merge (same file, keyed writes)

Client must not replace the whole map from a stale GET.

Add PATCH keys (names can match code, but semantics are fixed):

- `upsertActiveQuestRun`: one `QuestRunState` — server stores it at `activeQuestRuns[run.runId]`.
- `removeActiveQuestRunId`: string — server deletes that key.

Keep accepting a full `activeQuestRuns` map only for tests/admin if needed; production UI paths use upsert/remove. `UpdateCharacterHandler` whitelist and `CharacterManager::updateCharacter` apply these **under the existing file lock**.

Same-lock upsert is how two parked runs survive concurrent “start quest A” / “advance quest B” PATCHes.

### Rules

- **Any number of different quests** may be `prep`/`active` at once.
- **At most one run per `questDefId`.** Starting a quest that already has a prep/active run continues that run; it does not create a second attempt. Abandon that run first to re-roll.
- A character is still **one lobby at a time**. Other runs stay parked.
- Lobbies already stamp `questRunId` / `questSlotIndex` / `questResolvedSlots`. Continue, victory, and equipment merge **look up by `runId`**, never “the” run.
- Location deck stays on the character. Each run resolves `location_encounter` into its own `resolvedSlots` at start (same as today). Overlap between parked runs is acceptable; do not add cross-run card reservations in this plan.

### Equipment / dual sheet

Today `isEquipmentLockedByQuest` locks **all** campaign gear for non-admins while the singular run exists, and editor/prep dual-write campaign equipment into that snapshot. That does not scale: five parked sidequests would freeze the campaign sheet forever.

Locked policy:

- **Campaign equipment stays editable** while other quests are parked. Editor PATCH sends `equipment` only — it must **not** mutate any quest snapshot.
- **Quest battles** keep using `questCharacter.equipment` when `lobby.questRunId` matches that run (existing `LobbyManager::mergePlayerEquipmentIntoState` logic, but search the map).
- **Snapshot clone** still happens in `startQuestRun`. Later missions of that run do not re-clone from campaign gear.
- **Quest Prep Ready** (first slot) still freezes `selectedAbilityIds` onto **that** run. If prep also writes equipment, write only that run via `upsertActiveQuestRun` (plus campaign `equipment` if the player changed the template).
- **Mid-quest story `equipItem`:** `LobbyManager` already has `questRunId` on game state. Pass it into `CharacterManager::equipItem` so the grant updates campaign equipment **and only the matching run’s snapshot**. Other parked snapshots stay frozen.
- `isEquipmentLockedByQuest`: stop using “any run exists”. If prep still needs a lock, gate it on **this lobby’s** run (e.g. later quest slots / already-frozen), not on the collection.

### UI

- Remove replace-and-abandon (`confirmReplaceActiveQuest` and the “already have an active quest” copy).
- Each prep/active quest row: **Continue** + **Abandon** (confirm only that run).
- Other eligible quests: **Start** (creates another run).
- Map `activeQuestDefId` becomes a **set** (or the tooltip/picker takes the runs map) so several nodes can show in-progress.

### Out of scope

- AbilityTests (not a battle system).
- Splitting save files.
- Concurrent *lobbies* for one character.
- Two simultaneous attempts at the same `questDefId`.

---

## Architecture

```
Campaign Character JSON (one file, lock on PATCH)
  equipment, research, missionResults, questResults, locationDeck
  activeQuestRuns: { [runId]: QuestRunState }

Lobby game JSON
  questDefId, questRunId, questSlotIndex, questResolvedSlots
       │
       ▼
  find run by runId → snapshot equipment, slot advance, continuation claim
```

Helpers (one module, e.g. `storylines/activeQuestRuns.ts`): `runsFromCharacter`, `findRunById`, `findRunByQuestDefId`, `listPrepOrActive`, `canStartQuestDef`. PHP: `Character::getActiveQuestRuns()` + `findActiveQuestRun(string $runId)`.

---

## Step 1 — Domain collection helpers (no persistence change yet)

**Touches:** `app/js/games/minion_battles/storylines/activeQuestRuns.ts` (new), `app/js/games/minion_battles/storylines/activeQuestRuns.test.ts` (new), `app/js/games/minion_battles/storylines/index.ts`, `app/js/games/minion_battles/storylines/questTypes.ts` (comment only: drop “at most one” / “never concurrent”)

- [x] Add pure helpers: normalize a runs map, find by `runId` / `questDefId`, list prep-or-active, reject a second run for the same `questDefId`.
  Added `storylines/activeQuestRuns.ts` (`normalizeActiveQuestRuns`, `legacySingularToMap`, find/list/canStart, `upsertActiveQuestRunInMap` + `DuplicatePrepActiveQuestDefError`); exported from `index.ts`; `activeQuestRuns.test.ts` (8 cases); `questTypes` comment updated for concurrent runs.

**Verify:** `npm run lint:changed`; `npx vitest run app/js/games/minion_battles/storylines/activeQuestRuns.test.ts`

---

## Step 2 — TypeScript character shape + round-trip

**Touches:** `app/js/games/minion_battles/character_defs/campaignCharacterTypes.ts`, `app/js/games/minion_battles/character_defs/CampaignCharacter.ts`, `app/js/games/minion_battles/character_defs/questRunPersistence.test.ts`, `app/js/games/minion_battles/api/types.ts`, `app/js/LobbyClient.ts`

- [x] Replace `activeQuestRun` with `activeQuestRuns` on `CampaignCharacterData`, `CampaignCharacter`, API payload, and `updateCharacter` (add `upsertActiveQuestRun` / `removeActiveQuestRunId`; stop sending singular `activeQuestRun`).
  `coalesceActiveQuestRunsFromWire` + constructor normalize; PATCH keys on `LobbyClient` / `CharacterUpdates`; quest flow call sites use keyed upsert/remove (compile-safe).

- [x] Extend `questRunPersistence.test.ts` to round-trip two concurrent runs and default empty map.
  Six persistence cases including legacy singular fixture and dual concurrent runs.

**Verify:** `npx tsc --noEmit`; `npm run lint:changed`; `npx vitest run app/js/games/minion_battles/character_defs/questRunPersistence.test.ts`

**Step 2 surprises (compile adapters, real behavior in later steps):** `useMissionStart`, `useNextMissionHandoff`, `useQuestFlow`, `modalActions`, `useCharacterQuestActions`, `CharacterEditor`, `MissionMapTab`, `QuestBankPickerPopup`, `CharacterSelectPhase`, `PrepEquipmentContext` (+ `questRunId` prop), `equipmentSlots` / `.test.ts`, `storylines/activeQuestRuns.ts` (`coalesceActiveQuestRunsFromWire`), `storylines/index.ts` export. PHP still serves singular `activeQuestRun` until Step 3 — `coalesceActiveQuestRunsFromWire` handles GET payloads.

---

## Step 3 — PHP character field, keyed PATCH, save v6 + deploy sweep

**Touches:** `backend/Character.php`, `backend/CharacterManager.php`, `backend/Http/Handlers/UpdateCharacterHandler.php`, `backend/SaveData/CharacterMigrations.php`, `backend/Migrations/Versions/M0006ActiveQuestRuns.php` (new), `backend/Migrations/MigrationRegistry.php`, `backend/scripts/migrate.php` (`runSelfTest` fixture)

Follow `SaveMigrator` recipe: `v5To6`, bump `CURRENT_VERSION` to 6, register `M0006` as version 6, append to `MigrationRegistry`, self-test wrapping a singular run into the map.

- [x] Store `activeQuestRuns` on `Character`; `getActiveQuestRun(string $runId)` (or equivalent) for lobby merge.
  `Character` map + `getActiveQuestRuns()` / `getActiveQuestRun($runId)`; `LobbyManager` merge + quest prep loadout use runId + `upsertActiveQuestRun` (full `equipItem` by runId still Step 4).

- [x] `updateCharacter` merges `upsertActiveQuestRun` / `removeActiveQuestRunId` under the existing lock; whitelist in `UpdateCharacterHandler`.
  Keyed upsert/remove + optional full `activeQuestRuns` replace; singular `activeQuestRun` PATCH removed.

- [x] `v5To6` + `M0006ActiveQuestRuns` sweep `storage/characters` through `CharacterMigrations::migrate` (copy `M0005`’s character loop). `touchedDirs(): ['characters']`.
  `CURRENT_VERSION` 6, `M0006` registered, self-test v6 pure + disk sweep; `CampaignMigrations` reads quest snapshot via `questSnapshotEquipmentFromCharData`.

**Verify:** `php backend/scripts/migrate.php --self-test`; `npx tsc --noEmit` if TS clients were already switched in Step 2.

---

## Step 4 — Lobby equipment merge and mid-quest `equipItem`

**Touches:** `backend/LobbyManager.php` (`mergePlayerEquipmentIntoState`, story `equipItem` call ~1519), `backend/CharacterManager.php` (`equipItem`)

- [x] Equipment merge: read `questRunId` from lobby state, pick `activeQuestRuns[runId]`, use that snapshot when it matches (same conditions as today: equipment array present).
  Already in Step 3: `mergePlayerEquipmentIntoState` reads lobby `questRunId`, `getActiveQuestRun($lobbyRunId)`, uses `questCharacter.equipment` when present.
- [x] `equipItem(..., ?string $questRunId = null)` updates campaign equipment always; updates **only** that run’s `questCharacter.equipment` when `$questRunId` is found. Pass lobby `questRunId` from `LobbyManager`.
  Added optional `$questRunId` on `CharacterManager::equipItem` (keyed snapshot only); story choice + group-vote grant paths pass lobby `questRunId`; removed single-run count fallback.

**Verify:** `npm run lint:changed` (if any TS); no Vitest unless you add a PHP unit — if none exists, rely on migrate self-test already green and Step 9.

---

## Step 5 — Quest flow write paths (start / continue / victory / abandon / prep freeze)

**Touches:** `app/js/app/useMissionStart.ts`, `app/js/games/minion_battles/useQuestFlow.ts`, `app/js/games/minion_battles/ui/components/CharacterEditor/useCharacterQuestActions.ts`, `app/js/games/minion_battles/ui/pages/CharacterSelectPhase.tsx`, `app/js/app/useNextMissionHandoff.ts`, `app/js/games/minion_battles/phaseHandlers/modalActions.ts`, `app/js/games/minion_battles/storylines/questLobby.ts` (only if match helpers need a runs map overload)

- [x] Start: if a prep/active run exists for that `questDefId`, continue it; else `startQuestRun` + `upsertActiveQuestRun`. Never overwrite other keys.
  `useMissionStart`: `mode: 'start'` reuses prep/active run for same `questDefId`; keyed `upsertActiveQuestRun` only.
- [x] Continue / admin seek / slot skip: upsert the same `runId` only.
  Continue/skip/seek paths unchanged (keyed upsert); admin reset/mark-victory already targeted by `questDefId`.
- [x] Victory continue: match lobby via `questRunMatchesLobby(findRunById(...), fields)`; upsert advanced run; on finale `removeActiveQuestRunId` and append `questResults` (existing complete path).
  `useQuestFlow.prepareQuestVictoryContinue` requires lobby `questRunId` + `findRunById`; dropped first-map fallback.
- [x] Abandon / admin reset / mark-quest-victory: `removeActiveQuestRunId` for **that** quest’s run only.
  `handleAbandonQuest(questDefId)` + map tooltip/picker pass `q.id`; in-lobby abandon uses lobby `questRunId`.
- [x] Quest Prep freeze: upsert the lobby-matched run (`selectedAbilityIds` / equipment snapshot), not a singular field.
  `CharacterSelectPhase` uses `findRunById` for prep run; Ready PATCH `upsertActiveQuestRun` for that run only.

**Step 5 surprises:** Abandon callback typing required small edits in `MissionMapTab`, `QuestBankPickerPopup`, `QuestBankTooltip` (Step 7 still owns picker redesign / `confirmReplaceActiveQuest`).

**Verify:** `npx tsc --noEmit`; `npm run lint:changed`; `npx vitest run app/js/games/minion_battles/storylines/questLobby.test.ts app/js/games/minion_battles/storylines/questRun.test.ts` plus any test file you had to update in this step (`locationCards.questFlow.test.ts` if it constructs `activeQuestRun`).

---

## Step 6 — Equipment helpers and Campaign / Prep UI lock

**Touches:** `app/js/games/minion_battles/character_defs/items/equipmentSlots.ts`, `app/js/games/minion_battles/character_defs/items/equipmentSlots.test.ts`, `app/js/games/minion_battles/ui/components/CharacterEditor/CharacterEditor.tsx`, `app/js/games/minion_battles/ui/pages/characterSelect/prep/PrepEquipmentContext.tsx`

- [x] `buildEquipmentUpdate` writes campaign `equipment` only (no snapshot dual-write).
  `buildEquipmentUpdate(equipment)` returns `{ equipment }` only; editor/prep PATCH no longer upserts quest snapshots.
- [x] `isEquipmentLockedByQuest` no longer locks because *any* run exists. If Quest Prep later slots must stay read-only, lock from lobby `questSlotIndex` / freeze flag already used in character select — not from the runs map.
  Lock is `(isAdmin, optional QuestEquipmentLockParams)` — editor omits params; prep locks on `questSlotIndex >= QUEST_PARTY_RESERVATION_MIN_SLOT_INDEX` or run `status === 'active'`.
- [x] Character Editor and `PrepEquipmentContext` call the new helpers; tests updated.
  Editor dropped quest lock banner; `PrepEquipmentProvider` takes `questSlotIndex`; `equipmentSlots.test.ts` covers new lock/PATCH shape.

**Verify:** `npm run lint:changed`; `npx vitest run app/js/games/minion_battles/character_defs/items/equipmentSlots.test.ts`

---

## Step 7 — Mission Map / picker: multiple in-progress quests

**Touches:** `app/js/games/minion_battles/ui/components/CharacterEditor/questBankUi.ts`, `app/js/games/minion_battles/ui/components/CharacterEditor/questBankUi.test.ts`, `app/js/games/minion_battles/ui/components/CharacterEditor/QuestBankPickerPopup.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/QuestPickRow.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/MissionMap/QuestBankTooltip.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/MissionMapTab.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/useCharacterQuestActions.ts` (abandon takes `runId` or `questDefId`)

- [x] Delete `confirmReplaceActiveQuest` (and tests/copy that assume replace).
  Removed `confirmReplaceActiveQuest` from `questBankUi.ts` plus picker/tooltip replace `window.confirm` copy.
- [x] Picker/tooltip: Continue+Abandon on every prep/active row; Start on others; `onAbandonQuest(questDefId)` not a single global abandon.
  Picker uses per-row `findRunByQuestDefId`; tooltip/footer uses `prepActiveQuestDefIds.has(q.id)`.
- [x] Map highlighting: all prep/active `questDefId`s, not one `activeQuestDefId`.
  `prepActiveQuestDefIdSet` drives sky ring on every bank with any in-progress eligible quest.

**Verify:** `npm run lint:changed`; `npx vitest run app/js/games/minion_battles/ui/components/CharacterEditor/questBankUi.test.ts` (and any map test that stubs `activeQuestRun`)

---

## Step 8 — Skills / AGENTS (singular-run docs)

**Touches:** `.cursor/skills/campaign-characters/SKILL.md`, `.claude/skills/campaign-characters/SKILL.md` (keep in sync if both exist), `app/js/games/minion_battles/storylines/WorldOfDarkness/quests/AGENTS.md`

- [x] Document `activeQuestRuns` map, keyed PATCH, at-most-one-run-per-`questDefId`, campaign gear not locked by parked runs, lookup by lobby `questRunId`. Stay under 200 lines; do not paste type unions.
  Updated **campaign-characters** skill (both mirrors) + `WorldOfDarkness/quests/AGENTS.md` for map, keyed PATCH, equipment policy, and lobby `questRunId` lookup.

**Verify:** `npm run lint:changed` if anything lintable changed; **no Vitest** (skills-only).

---

## Step 9 — Final verification

- [x] `npx tsc --noEmit`
  Exit 0 (no errors).
- [x] `npx vitest run` on the quest/character files this plan touched (explicit paths: `activeQuestRuns.test.ts`, `questRunPersistence.test.ts`, `questRun.test.ts`, `questLobby.test.ts`, `equipmentSlots.test.ts`, `questBankUi.test.ts`, plus any other `*.test.ts` edited in earlier steps). Not `npm run test`.
  6 files, 75 tests passed.
- [x] AbilityTests: **none** (campaign persist/UI, not battle).
  Skipped per plan (`test:sim` not run).
- [ ] Browser checklist (manual or existing Playwright `e2e/quest-bank-map.spec.ts` / `e2e/quest-prep-flow.spec.ts` if they still match):
  Specs still target single-quest Start/prep smoke only (no multi-run flows). Playwright Chromium installed; both specs timed out clicking `characters-create` (overlay intercepts pointer, empty account). Multi-run checklist not observed — needs manual play or new e2e.
  - Start quest A, leave, start quest B — both show Continue; A did not abandon.
  - Continue A, win a slot, confirm B’s run is unchanged on the character GET.
  - Abandon B only; A remains.
  - Starting A again while A is active continues A (no second run).
  - Campaign Editor can change equipment while B is parked; A’s quest battle still uses A’s snapshot.
  - Main-path mission still startable with parked sidequests.

---

## AbilityTest coverage

None. This is character JSON, lobby stamps, and Mission Map UI. Headless battle scenarios cannot see `activeQuestRuns`. Use the Vitest files above and the browser checklist.
