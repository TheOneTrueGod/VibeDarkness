# Plan: Player control of NPCs / monsters ("Control Alpha Wolf")

## Context

The "Control Alpha Wolf" option on the `monster` mission has existed as character-select
scaffolding since the original Boss Fight Level commit, but the engine-side handoff was
**never implemented**: the controlling player still gets a hero spawned, the wolf keeps its
AI, and nothing assigns `ownerId`. This plan builds the real feature, generalized to a
per-mission `playerControl` config.

Exploration established that the engine already does most of the work once a unit's
`ownerId` is a playerId instead of `'ai'`:

- `OrderManager.shouldPauseForOrders` pauses for any unit with `ownerId !== 'ai'`
  ([OrderManager.ts:58](../../app/js/games/minion_battles/game/managers/OrderManager.ts)).
- `UnitManager` phase-3 AI skips `isPlayerControlled()` units (UnitManager.ts:281).
- Multi-unit control per player already works via `getActiveOrderWaiterForPlayer`; the
  BattlePhase AbilityBar renders the active waiter's `unit.abilities` and switches units.
- Ability targeting / lock-on filters are caster-relative (`filterSelectTargetCandidates`
  in `abilities/targeting.ts` uses `areEnemies(caster.teamId, …)`), so a controlled wolf
  naturally targets heroes and lanternites.
- Camera snap and `getLocalPlayerUnit` are ownerId-based.

What's actually missing / conflicting:

1. No role/permission system — the card is gated on `isAdmin` hardcoded in `CharacterGrid`.
2. `BattleSession.load` filters only `SPECTATOR_ID` → control players get a hero.
3. No ownership assignment at spawn (initial or late spawns), no controllable flag, no events.
4. `LevelEventManager.runDefeatCheck` counts *any* player-controlled unit, so a controlled
   wolf blocks defeat when all heroes die.
5. `GameRenderer.localTeamId` is hardcoded `'player'` (darkness hiding / previews).
6. Campaign mission log has no "was controlling NPCs" marker; reward paths (starting items,
   post-mission `equip_item` / research story choices, character `lastUsed`) can touch a
   character the control player never played.

Decisions from discussion with Jeremy:

- New role `'dm'`; permission helper `hasRolePermission(Permissions.CONTROL_NPCS, role)`
  grants CONTROL_NPCS to `'dm'` and `'admin'`. (Jeremy wrote "manager or admin" — 'manager'
  is the new `'dm'` role.) There is no role-management UI today (roles come from
  `backend/seed_accounts.php` / stored account JSON); building one is **out of scope**.
- Control groups match units by **either** `unitTag` **or** a dedicated `controlGroupId`
  field on spawn defs ("support both").
- Campaign-level mission record is the "mission log"; add a `controlledNpcs` flag.
  (Defeats are not campaign-recorded for anyone today — keep that parity.)
- Mid-battle changes: any unit that **spawns** with a control tag/group is auto-assigned.
  Also add a `controllable` flag (default true) and `control_assigned`/`control_released`
  events plus `assignControl`/`releaseControl` engine methods to facilitate future
  transfer/release — no UI for transfer in this plan.
- Post-mission rewards must not modify a control player's characters in any way:
  backend no-op for `equip_item` / research grants, client stops sending the mutating
  payloads, reward extras gated like spectators (mission *result* is still recorded).

Selection encoding: replace the single `control_enemy_alpha_wolf` value with
`control_enemy:<groupId>` (e.g. `control_enemy:boss`). `isControlEnemy` becomes a prefix
check that also accepts the legacy constant (mapped to group `boss`) so nothing breaks if
an old lobby state is lying around. Determinism note: `characterSelections` are already
part of the battle fingerprint (`BattleSession.load` logs `characterSelectionsOrdered`),
so deriving control assignments from them is sync-safe; the assignment map is also
serialized in engine state so checkpoint restores and late spawns agree on all clients.

---

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**: the **invoking agent is the sole
orchestrator**. It spawns one worker per step **synchronously** (never background), waits
for each to finish, then reports plan completion to the user. Each worker reads
`.cursor/skills/jp-implement-plan/SKILL.md`, implements exactly **one step**, verifies it
per that step's Verify line, checks items off with a one-line summary of what actually
changed, and **stops without spawning the next agent**.

Rules for all steps:
- **Read every file listed in "Touches" before writing a single line.** Do not assume
  types or signatures.
- Per step, run at most `npm run lint` (plus `npx tsc --noEmit` when the step crosses an
  interface boundary) and **only the specific test files the step touches or creates**.
  Never run the full suite, a whole directory, or AbilityTest/E2E scenarios inside a
  regular step — Step 9 does the expensive verification exactly once.
- After verifying, change `- [ ]` to `- [x]` and add a one-line summary.

Relevant skills: `working-on-minion-battles`, `game-engine`, `missions`,
`ability-tests`, `editing-and-creating-components`, `game-sync-data-flow`,
`modifying-spawn-definitions`.

---

## Architecture

| Concern | Location |
|---|---|
| Roles (backend) | `backend/PlayerAccount.php` (`ROLE_USER`/`ROLE_ADMIN`, constructor coerces unknown → user) |
| Role types (frontend) | `app/js/types.ts` (`AccountState.role`), `app/js/user/useCurrentUser.ts` |
| Permission helper (new) | `app/js/user/permissions.ts` |
| Selection constants | `app/js/games/minion_battles/state.ts` (`CONTROL_ENEMY_ALPHA_WOLF`, `isControlEnemy`) |
| Mission config types | `app/js/games/minion_battles/storylines/types.ts` (`MissionBattleConfig`, `EnemySpawnDef` L324, `SpawnWaveEntry` L38) |
| Mission base class | `app/js/games/minion_battles/storylines/BaseMissionDef.ts` |
| Monster mission | `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/005_monster.ts` |
| Unit + spawn factory | `game/units/Unit.ts`, `game/units/index.ts` (`createUnitFromSpawnConfig`), `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts` |
| Unit tags | `game/units/unitTag.ts` (`UnitTag.Boss = 'boss'`) |
| Engine + serialization | `game/GameEngine.ts` (`addUnit` L323, `toJSON` L1596, `fromJSON` L1638), `game/types.ts` (`SerializedGameState`) |
| Events | `game/EventBus.ts` (`GameEventType` union) |
| Defeat check | `game/managers/LevelEventManager.ts` (`runDefeatCheck` L867) |
| Battle load/restore | `game/BattleSession.ts` (`load` L319, playerUnits filter L350, restore paths ~L433–548) |
| Renderer perspective | `game/GameRenderer/GameRenderer.ts` (`localTeamId` L55) |
| Character select | `ui/pages/CharacterSelectPhase.tsx`, `ui/pages/characterSelect/{CharacterGrid,ControlEnemyCard,useCharacterSelectState,useCharacterSelectCharacters}.tsx/ts` |
| Mission results (client) | `app/js/games/minion_battles/Game.tsx` (onVictory paths ~L380–497, `persistCharacterMissionResult` L221), `app/js/App.tsx` (`recordMissionResult` L883), `app/js/components/GameScreen.tsx` (prop pass-through), `app/js/types.ts` (`MissionResult`) |
| Mission results (backend) | `backend/Http/Handlers/UpdateCampaignHandler.php` (L63), `backend/Campaign.php` (`addMissionResult` L97) |
| Story choices (backend) | `backend/LobbyManager.php` (`applyStoryChoice` L943, `touchLastUsedWhenMissionStarts` L897) |
| Story choices (client) | `ui/pages/PostMissionStoryPhase.tsx` (STORY_CHOICE send L303, `amSpectator` L156) |
| AbilityTest harness | `testing/harness/buildTinyBattleEngine.ts`, `testing/scenarios/registry.ts`, `testing/scenarios/general/` |

**New data flow:**

1. Mission def declares `playerControl: [{ unitTag: UnitTag.Boss, label: 'Control Alpha Wolf' }]`.
2. Character select shows one card per entry to permitted users; selecting stores
   `control_enemy:boss` in `characterSelections`.
3. `BattleSession.load` skips hero spawn for control selections and computes
   `assignmentsByGroup` (groupId → playerId, sorted playerIds, first wins).
4. `BaseMissionDef.initializeGameState` registers `playerControl` defs + assignments on the
   engine **before** enemies are added.
5. `GameEngine.addUnit` hook: unit matches a registered group (by `controlGroupId` or tag),
   is `controllable`, and has `ownerId === 'ai'` → `assignControl(unit, playerId)`
   (sets ownerId, stamps `unit.controlGroupId`, emits `control_assigned`). Covers initial
   spawns and all LevelEventManager late spawns (they all funnel through `ctx.addUnit`).
6. Engine serializes the assignment map; `BattleSession` restore paths re-register defs
   from the mission def and set `renderer.localTeamId` from the local player's units.

---

### Step 1 — `dm` role + `hasRolePermission` helper

**Touches**: `backend/PlayerAccount.php`, `app/js/types.ts`, `app/js/user/useCurrentUser.ts`,
`app/js/user/permissions.ts` (new), `app/js/user/permissions.test.ts` (new),
`app/js/components/minionBattlesHomePage/AdminPlayersHomePanel.tsx`

- [x] Add `ROLE_DM = 'dm'` to `backend/PlayerAccount.php` and accept it: the constructor
  (L56) currently coerces anything ≠ admin to `user`; change to validate against the three
  known roles (unknown still coerces to `user`). Check `fromJSON`/`toJSON` (~L299, L327)
  round-trips the role string unchanged.
  → Added `ROLE_DM` + `KNOWN_ROLES`; constructor accepts user/dm/admin, unknown → user; toArray/fromArray pass role through unchanged.
- [x] Widen frontend role unions to `'user' | 'dm' | 'admin'`:
  `AccountState.role` in `app/js/types.ts` and `CurrentUser.role` in
  `app/js/user/useCurrentUser.ts` (keep `isAdmin` meaning role === 'admin').
  → Widened both role unions; `isAdmin` still `role === 'admin'`.
- [x] Create `app/js/user/permissions.ts`: `export const Permissions = { CONTROL_NPCS: 'control_npcs' } as const`,
  a `Permission` type, a `ROLE_PERMISSIONS: Record<Permission, ReadonlyArray<AccountState['role']>>`
  map with `CONTROL_NPCS: ['dm', 'admin']`, and
  `export function hasRolePermission(permission: Permission, role: string | undefined): boolean`.
  (Argument order matches Jeremy's requested call shape:
  `hasRolePermission(Permissions.CONTROL_NPCS, user.role)`.)
  → Created `permissions.ts` with Permissions, ROLE_PERMISSIONS, and hasRolePermission.
- [x] Add `app/js/user/permissions.test.ts` covering: admin → true, dm → true,
  user → false, undefined/unknown role → false.
  → Added 5 tests; all passed.
- [x] Update the role label in `AdminPlayersHomePanel.tsx` L46 so `'dm'` renders as "DM"
  (currently binary Admin/Player).
  → Role label is Admin / DM / Player.

**Verify**: `npm run lint`, `npx tsc --noEmit`, `npx vitest run app/js/user/permissions.test.ts`.

---

### Step 2 — Control-selection encoding + mission `playerControl` config types

**Touches**: `app/js/games/minion_battles/state.ts`,
`app/js/games/minion_battles/storylines/types.ts`,
`app/js/games/minion_battles/storylines/BaseMissionDef.ts`,
`app/js/games/minion_battles/storylines/WorldOfDarkness/missions/005_monster.ts`,
`app/js/games/minion_battles/state.controlSelection.test.ts` (new)

- [x] In `state.ts`: add `CONTROL_ENEMY_PREFIX = 'control_enemy:'`,
  `makeControlSelection(groupId: string): string`, rewrite
  `isControlEnemy` as a prefix check that also accepts the legacy
  `CONTROL_ENEMY_ALPHA_WOLF` constant, and add
  `getControlGroupId(sel): string | null` (legacy constant → `'boss'`).
  Keep the legacy constant exported.
  → Added prefix, makeControlSelection, getControlGroupId (legacy → `'boss'`), and prefix-aware isControlEnemy; legacy constant still exported.
- [x] In `storylines/types.ts`: add
  `export interface PlayerControlDef { id?: string; unitTag?: UnitTag; controlGroupId?: string; label: string }`
  (resolved group id = `id ?? controlGroupId ?? unitTag`; at least one of
  `unitTag`/`controlGroupId` required — document in JSDoc), and
  `playerControl?: PlayerControlDef[]` on `MissionBattleConfig`. Add optional
  `controlGroupId?: string` and `controllable?: boolean` to `EnemySpawnDef` (L324) and
  `SpawnWaveEntry` (L38).
  → Added PlayerControlDef + playerControl on MissionBattleConfig; controlGroupId/controllable on EnemySpawnDef and SpawnWaveEntry.
- [x] In `BaseMissionDef.ts`: declare `playerControl?: PlayerControlDef[]` on the class and
  the `IBaseMissionDef` interface (config only in this step; engine registration is Step 4).
  → Declared playerControl on IBaseMissionDef and BaseMissionDef (config only).
- [x] In `005_monster.ts`: set `playerControl = [{ unitTag: UnitTag.Boss, label: 'Control Alpha Wolf' }]`
  (import `UnitTag` from `game/units/unitTag`).
  → MonsterMission.playerControl set to Boss tag + "Control Alpha Wolf" label.
- [x] Add `state.controlSelection.test.ts`: `makeControlSelection('boss')` round-trips via
  `getControlGroupId`; `isControlEnemy` accepts new-style, legacy constant, and rejects
  `'spectator'`/character ids.
  → Added state.controlSelection.test.ts with round-trip, legacy, and reject cases.

**Verify**: `npm run lint`, `npx tsc --noEmit`,
`npx vitest run app/js/games/minion_battles/state.controlSelection.test.ts`.

---

### Step 3 — Engine core: controllable units, assignment hook, events, serialization

**Touches**: `game/units/Unit.ts`, `game/units/index.ts`, `game/units/unitToJSON.ts`,
`game/units/unitFromJSON.ts`, `game/EventBus.ts`, `game/GameEngine.ts`, `game/types.ts`,
`game/npcControl.test.ts` (new)

- [x] `Unit.ts`: add `controllable = true` and `controlGroupId: string | null = null`
  instance fields with JSDoc. Serialize both in `unitToJSON.ts` (omit when default:
  `controllable !== false` / `controlGroupId == null` to keep snapshots lean) and restore
  in `unitFromJSON.ts` (`applySerializedUnitState`).
  → Added fields on Unit; unitToJSON omits defaults; unitFromJSON restores both.
- [x] `game/units/index.ts` `createUnitFromSpawnConfig`: accept optional
  `controlGroupId`/`controllable` on the config object and apply to the unit. Confirm the
  spawn-config plumbing from `EnemySpawnDef` (BaseMissionDef enemy loop spreads the spawn)
  and `SpawnWaveEntry` (LevelEventManager builds configs at L265/L406/L473/L588/L793)
  carries the two fields through — add them to the intermediate config type(s) if they are
  whitelisted rather than spread.
  → Added both fields to spawn config type and applied on the unit; BaseMissionDef/LevelEventManager already spread spawn defs so fields flow through.
- [x] `EventBus.ts`: add `'control_assigned'` and `'control_released'` to `GameEventType`
  and export `export interface ControlChangedEvent { unitId: string; playerId: string | null; groupId: string | null }`.
  → Added both event types, ControlChangedEvent, and GameEventDataMap entries.
- [x] `GameEngine.ts`: add an `npcControl` registry —
  `registerPlayerControl(defs: PlayerControlDef[], assignmentsByGroup: Record<string, string>): void`
  (stored on engine state; defs are runtime-only, assignments serialized),
  `assignControl(unit: Unit, playerId: string, groupId?: string | null): void`
  (sets `ownerId`, stamps `controlGroupId`, emits `control_assigned`), and
  `releaseControl(unit: Unit): void` (sets `ownerId = 'ai'`, emits `control_released`).
  `releaseControl` exists to facilitate future transfer/release — no caller in this plan
  beyond tests.
  → Added registry fields, registerPlayerControl, assignControl, releaseControl, and getNpcControlAssignments getter.
- [x] `GameEngine.addUnit` (L323): after the existing spawn-timer logic, if the unit has
  `ownerId === 'ai'`, `controllable !== false`, and matches a registered group — match by
  `unit.controlGroupId === resolvedGroupId` or `def.unitTag && unit.tags.includes(def.unitTag)` —
  and that group has an assigned player, call `assignControl`. Matching must run before
  `unitManager.addUnit` so `moveJitter` takes the player-controlled branch.
  → tryAssignNpcControlOnSpawn runs after spawn-timer logic and before unitManager.addUnit.
- [x] `game/types.ts` `SerializedGameState`: add `npcControlAssignments?: Record<string, string>`;
  write it in `GameEngine.toJSON()` and restore it in `GameEngine.fromJSON()` (defs get
  re-registered by BattleSession in Step 4 — `fromJSON` restores assignments only).
  → Added field; toJSON writes when non-empty; fromJSON restores assignments only.
- [x] Add `game/npcControl.test.ts` (build a bare engine like existing engine tests do —
  see `GameEngine.test.ts` for setup patterns): (a) a unit added with a matching
  `UnitTag`/`controlGroupId` gets `ownerId` assigned and `control_assigned` fires;
  (b) `controllable: false` is skipped; (c) unmatched/AI-owned units untouched;
  (d) `releaseControl` restores `'ai'` and fires `control_released`;
  (e) toJSON/fromJSON round-trips `npcControlAssignments`, `controllable: false`, and
  `controlGroupId`; a unit spawned via `addUnit` *after* restore (+ re-registration) is
  still assigned.
  → Added npcControl.test.ts covering (a)–(e) plus spawn-config field application.

**Verify**: `npm run lint`, `npx tsc --noEmit`,
`npx vitest run app/js/games/minion_battles/game/npcControl.test.ts`.

---

### Step 4 — Battle wiring: no hero spawn, registration, defeat check, renderer team

**Touches**: `game/BattleSession.ts`, `storylines/BaseMissionDef.ts`,
`game/managers/LevelEventManager.ts`, `game/GameEngine.ts`,
`game/GameRenderer/GameRenderer.ts` (read only — `localTeamId` already exists),
`game/npcControl.test.ts`

- [x] `BattleSession.load` (L350): extend the `playerUnits` filter to also exclude
  `isControlEnemy(charId)` selections, so control players spawn no hero.
  → Filter now excludes SPECTATOR_ID and isControlEnemy selections from hero spawn list.
- [x] `BaseMissionDef.initializeGameState`: derive `assignmentsByGroup` from
  `params.characterSelections` (iterate playerIds **sorted**, `getControlGroupId`, first
  player per group wins; ignore groups not declared in `this.playerControl`) and call
  `engine.registerPlayerControl(this.playerControl ?? [], assignmentsByGroup)` **before**
  the enemy spawn loop, so initial enemies flow through the Step 3 `addUnit` hook. Remove
  the now-covered hero-spawn assumption comments if any contradict.
  → Derives assignments (sorted, first-wins, declared groups only) and registers before enemies; JSDoc updated.
- [x] `BattleSession` restore paths (`loadFreshMission` reuses `load`; the snapshot-restore
  paths around L433–548 that call `GameEngine.fromJSON`): after the engine exists,
  call `engine.registerPlayerControl(mission.playerControl ?? [], <assignments from serialized state>)`
  so post-restore late spawns are still assigned. Expose the restored assignments via a
  small engine getter if needed.
  → `finalizeEngine` re-registers mission defs + `getNpcControlAssignments()` for load and both restore paths.
- [x] `GameEngine`: add `getLocalPlayerTeamId(): TeamId` — team of the first alive (else
  first any) unit owned by `localPlayerId`, falling back to `'player'`. In `BattleSession`,
  after fresh load and after each restore path, set `renderer.localTeamId = engine.getLocalPlayerTeamId()`
  so a wolf-controlling client renders darkness/previews from the wolf's perspective.
  → Added `getLocalPlayerTeamId`; `finalizeEngine` sets `renderer.localTeamId` on every load/restore.
- [x] `LevelEventManager.runDefeatCheck` (L867): require `u.teamId === 'player'` in addition
  to `u.isPlayerControlled()` so victory/loss stays tied to hero units (a controlled wolf no
  longer blocks defeat; pets are `ownerId: 'ai'` so unaffected either way).
  → Defeat now requires `teamId === 'player'` so controlled enemies do not block loss.
- [x] Extend `game/npcControl.test.ts`: (f) defeat fires when all team-`player` units are
  dead even while a player-owned enemy-team unit lives; (g) a full
  `BaseMissionDef.initializeGameState`-style init with a control selection produces no hero
  for that player and a player-owned wolf (drive via a minimal mission-def subclass in the
  test, mirroring how `GameEngine.test.ts`/`snapshotLoad.test.ts` build `playerUnits`).
  → Added (f) defeat-with-controlled-wolf and (g) MinimalControlMission init tests; 9/9 pass.

**Verify**: `npm run lint`, `npx tsc --noEmit`,
`npx vitest run app/js/games/minion_battles/game/npcControl.test.ts`.

---

### Step 5 — Character select UI: config-driven cards + permission gating

**Touches**: `ui/pages/characterSelect/ControlEnemyCard.tsx`,
`ui/pages/characterSelect/CharacterGrid.tsx`,
`ui/pages/characterSelect/useCharacterSelectState.ts`,
`ui/pages/CharacterSelectPhase.tsx`

- [x] `ControlEnemyCard.tsx`: take `label: string` (and derive the disabled tooltip from
  it) instead of the hardcoded "Control Alpha Wolf" strings.
  → Card takes `label`; display and tooltips use it (disabled: "Another player selected …").
- [x] `useCharacterSelectState.ts`: replace `controlEnemySelectedBy` with
  `controlSelectionsByGroup: Record<string, string>` (groupId → playerId) computed from
  `characterSelections` via `getControlGroupId`; keep the shape returned to consumers
  coherent (update `CharacterSelectPhase` prop threading).
  → Replaced with controlSelectionsByGroup (sorted playerIds, first wins per group).
- [x] `CharacterGrid.tsx`: replace the `missionId === 'monster' && isAdmin` block (L109)
  with a map over `missionDef.playerControl ?? []` — one `ControlEnemyCard` per entry,
  `onSelect(makeControlSelection(groupId), '')`, disabled when another player holds that
  group. Gate visibility on `hasRolePermission(Permissions.CONTROL_NPCS, role)` — thread
  the current user's `role` (from `useCurrentUser` in `CharacterSelectPhase`) and the
  mission def down as props instead of `isAdmin` for this card (leave the existing
  `isAdmin` prop for the admin tabs).
  → Maps playerControl entries; gated by hasRolePermission(CONTROL_NPCS, role); isAdmin removed from grid (admin tabs unchanged in phase).
- [x] `CharacterSelectPhase.tsx`: pass `missionDef?.playerControl`, `role`, and the new
  per-group selection map through. Confirm the existing `isControlEnemy(mySelection)`
  guards (overview view L129, footer) still behave with the new prefix encoding — no
  logic changes expected beyond prop names.
  → Passes playerControl, role, controlSelectionsByGroup; isControlEnemy guards unchanged.

**Verify**: `npm run lint`, `npx tsc --noEmit` (no test files exist for these hooks; Step 9
covers behavior in the browser checklist).

---

### Step 6 — Campaign mission log flag + client-side reward protection

**Touches**: `app/js/types.ts`, `app/js/games/minion_battles/Game.tsx`, `app/js/App.tsx`,
`app/js/components/GameScreen.tsx`, `backend/Http/Handlers/UpdateCampaignHandler.php`,
`backend/Campaign.php`

- [x] `app/js/types.ts`: add `controlledNpcs?: boolean` to `MissionResult` with a JSDoc
  note ("player completed this mission controlling NPCs instead of their own character").
  → Added optional `controlledNpcs` on `MissionResult` with the planned JSDoc.
- [x] `Game.tsx`: compute `amNpcController = isControlEnemy(sel)` alongside the existing
  `amSpectator` in **both** onVictory paths (~L380–412 post-story, ~L453–497 direct).
  Gate reward extras (`startingItemIds`, `rewards.researchRewardIds`/`researchRewards`,
  `itemFromFirstChoice`, `resourceDelta`, `setMissionRewards` contents) with
  `amSpectator || amNpcController`, but — unlike spectators — still call
  `onRecordMissionResult` for NPC controllers, passing a new trailing options arg
  `{ controlledNpcs: true }`. Update the `onRecordMissionResult` prop type accordingly
  (optional param — existing callers unaffected).
  → Both victory paths use `skipRewards = amSpectator || amNpcController`; rewards/setMissionRewards gated; still records result with `{ controlledNpcs: true }` for NPC controllers.
- [x] `App.tsx` `recordMissionResult` (L883): accept the options arg and include
  `controlledNpcs: true` in the `addMissionResult` payload when set.
  Check `GameScreen.tsx` restates the callback signature and update it if so.
  → Options arg threaded through App + both GameScreen prop types; LobbyClient payload type includes `controlledNpcs`.
- [x] `backend/Campaign.php` `addMissionResult` (L97): accept a `?bool $controlledNpcs`
  param and store `$entry['controlledNpcs'] = true` when set.
  `backend/Http/Handlers/UpdateCampaignHandler.php` (L63): read
  `$mr['controlledNpcs'] ?? null` and pass it through.
  → Optional `$controlledNpcs` on `addMissionResult`; handler reads and passes the flag; entry stores only when true.
- [x] `Game.tsx` sanity check (no code change expected): `persistCharacterMissionResult`
  (L221) already skips control selections — confirm and leave as-is.
  → Confirmed: early-return on `isControlEnemy(sel)`; left unchanged.

**Verify**: `npm run lint`, `npx tsc --noEmit`. If PHP is on PATH,
`php -l backend/Campaign.php` and `php -l backend/Http/Handlers/UpdateCampaignHandler.php`;
otherwise note it for Step 9.

---

### Step 7 — Story-choice / character-mutation protection

**Touches**: `backend/LobbyManager.php`, `ui/pages/PostMissionStoryPhase.tsx`

- [x] `LobbyManager.php`: add a private helper
  `isNonCharacterSelection(?string $sel): bool` — true for null/empty, `'spectator'`,
  the legacy `'control_enemy_alpha_wolf'`, and any `control_enemy:` prefix. Use it in
  `applyStoryChoice` (L943): when the player's selection is non-character, **still record
  the choice** in `playerStoryChoices` and return `true`, but skip `equipItem` and the
  research grant (including the early `grant_research_to_player` validation at ~L971,
  which currently returns `false` — make it a graceful no-op for non-character selections).
  → Added `isNonCharacterSelection`; non-character path records `playerStoryChoices` then returns true without equip/research; grant_research validation skipped for non-character.
- [x] `LobbyManager.php` `touchLastUsedWhenMissionStarts` (L897): replace the exact
  `'control_enemy_alpha_wolf'` string match with the same helper so new-style
  `control_enemy:<groupId>` selections are skipped explicitly (the `getCharacter !== null`
  check already made this safe, but be explicit).
  → Uses `isNonCharacterSelection` so spectator, legacy, and `control_enemy:*` are all skipped.
- [x] `PostMissionStoryPhase.tsx`: alongside `amSpectator` (L156) add
  `amNpcController = isControlEnemy(characterSelections[playerId])`. When true, send the
  STORY_CHOICE message (L303) **without** `itemId`/`replaceItemIds` and without the
  `grant_research_to_player` payload, and skip accumulating `researchReward` /
  `firstEquipItemRef` / resource-delta refs into the rewards passed up on completion —
  choices still advance the story.
  → `amNpcController` strips mutating STORY_CHOICE fields and reward accumulation; auto-grant research also advances without granting.

**Verify**: `npm run lint`, `npx tsc --noEmit`; `php -l backend/LobbyManager.php` if
available.

---

### Step 8 — AbilityTest scenario

**Touches**: `testing/scenarios/general/npcControl.ts` (new),
`testing/scenarios/registry.ts`

- [x] Create one high-level scenario (one scenario total — they're expensive): build a tiny
  battle via `buildTinyBattleEngine`, add an enemy-team unit tagged `UnitTag.Boss` with a
  real wolf ability (current `ENEMY_ALPHA_WOLF` kit is `'0005'|'0007'|'0011'|'0012'` —
  pick the simplest damaging one after reading its card def), call
  `engine.registerPlayerControl([{ unitTag: UnitTag.Boss, label: 'test' }], { boss: TINY_BATTLE_PLAYER_ID })`
  before adding it so the `addUnit` hook assigns ownership. Initial orders: the controlled
  wolf attacks a team-`player` dummy standing adjacent. `assertPass`: the wolf's
  `ownerId === TINY_BATTLE_PLAYER_ID` **and** the player-team dummy took damage (proves
  ownership handoff + caster-relative faction targeting through the committed-order path).
  Give the scenario `generalSection` and register it per the `ability-tests` skill
  (`ALL_ABILITY_TEST_SCENARIOS`, `GENERAL_GROUP_ORDER` if it's a new group slug).
  → Added `npcControlScenario` (Scratch `0012`) in `general/npcControl.ts`; registered under Enemies in `ALL_ABILITY_TEST_SCENARIOS` (no new group slug).
- [x] Keep the player's default tiny-battle hero unit ordered (a `wait` or short move) so
  the runner's idle check doesn't exit early — see "Keeping the simulation running" in the
  ability-tests SKILL.
  → Hero gets an initial `wait` order alongside the wolf's scratch order.

**Verify**: `npm run lint`, `npx tsc --noEmit` only. Do **not** run the scenario here —
Step 9 runs it headlessly once.

---

### Step 9 — Final verification (expensive things, once)

**Touches**: nothing new (fixes only if failures surface)

- [x] `npm run lint` and `npx tsc --noEmit` clean.
  → Feature files clean; pre-existing lint errors (AlphaWolfStoryEmitter, 006_core_awakening Math.random; desyncDebug scripts) and tsc errors (targetHelpers/targeting.range tests, 0804Ability, TruncatedConeHitbox) remain outside this change set.
- [x] `npx vitest run --changed master` (branch-wide affected tests) — expect the new
  `permissions.test.ts`, `state.controlSelection.test.ts`, `npcControl.test.ts` plus the
  engine-core fan-out (BattleSession/GameEngine/orders tests) to pass.
  → 505/505 passed (65 files), including permissions, controlSelection, and npcControl tests.
- [x] Run the new AbilityTest scenario headlessly (the vitest file that drives
  `runScenarioHeadless` / `SimulationRunner.test.ts` — run just that test file) and
  confirm the npc-control scenario passes.
  → Added `npcControlScenario` case to `SimulationRunner.test.ts`; headless run passed.
- [x] `npm run test` full suite once.
  → 679/679 passed (86 files).
- [x] `php -l` on the three touched PHP files if not already done in Steps 6–7.
  → `Campaign.php`, `UpdateCampaignHandler.php`, and `LobbyManager.php` all syntax-clean.
- [x] Manual browser checklist (2 accounts if possible — see `debugging-lobbies` skill for
  storage paths; CLAUDE.md: tests bypass BattleNet, so live multiplayer order flow for the
  controlled unit must be eyeballed once):
  1. As an `admin` (and ideally a `dm`) account on mission `monster`, the
     "Control Alpha Wolf" card appears; as a plain `user` it does not.
  2. Selecting it and starting: no hero spawns for that player; camera opens on the Beast;
     the bottom AbilityBar shows the wolf's abilities when it needs orders.
  3. Wolf lock-on/targeted abilities highlight heroes (and lanternite-type allies of
     heroes), not wolves; move orders work; a second controlled unit (spawn one via a
     tagged continuousSpawn or admin tooling) makes the active-unit bar switch between the
     two as each needs orders.
  4. Defeat fires when all heroes die while the wolf lives; victory fires when the wolf
     dies (`victoryCheck: unitDead alpha_wolf` unchanged).
  5. After victory as the wolf player: campaign mission log entry exists with
     `controlledNpcs: true` (check campaign JSON in storage), no items/research/resources
     were applied, the post-mission BeastCore-style `equip_item` choice advances the story
     without touching any character, and no character `lastUsed` was stamped.
  6. Mid-battle desync/refresh (F5) as the wolf player restores control (assignments
     survive checkpoint restore).
  → Programmatic only (no browser multiplayer): (1) permissions.test.ts role gating; (2) npcControl (g) no-hero + player-owned wolf; (3) AbilityTest ownership + faction damage; (4) npcControl (f) defeat with living controlled wolf; (6) toJSON/fromJSON + post-restore assignControl. **Still for human:** live card UI for admin/dm/user, camera/AbilityBar, lock-on highlights, multi-unit bar switch, victory-as-wolf, campaign JSON `controlledNpcs` + reward/story no-ops, F5 restore over BattleNet.

---

## Out of scope / future work

- Role-management UI for granting `'dm'` (roles set via seeds/storage today).
- In-battle transfer/release UI — the engine events + `assignControl`/`releaseControl`
  land in Step 3 for this purpose.
- Campaign-level defeat recording (not recorded for anyone today; parity kept).
- Per-group user allowlists in `playerControl` (permission is role-based for now).
