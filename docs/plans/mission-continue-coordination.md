# Plan: Coordinated Multi-Player Mission Continue

## Goal

When a multiplayer game ends, the host chooses the next mission from the victory modal.
This creates a new lobby and writes its ID (`nextLobbyId`) back into the current lobby's
game state. Clients keep polling the current lobby until they see `nextLobbyId`, then show
a "Continue" button that takes them directly to the new lobby.

Previously every player independently created their own lobby on "Continue", landing in
separate games.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first
step in document order with unchecked items), verifies it, then hands off with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/mission-continue-coordination.md`.

Rules for all steps:
- **Read every file listed in "Touches" before writing a single line.** Do not assume types or signatures.
- Run `npx tsc --noEmit` after any change that crosses a type boundary.
- Run `npm run lint` and fix any errors before marking an item done.
- `npx vitest run --changed` after each step to catch regressions.
- After verifying, change `- [ ]` to `- [x]` and add a one-line summary of what changed.

Relevant skills: `working-on-minion-battles`, `game-sync-data-flow`, `debugging-lobbies`.

---

## Architecture Summary

| Concern | Location |
|---|---|
| Game state blob (polled by all clients) | `MinionBattlesGameStatePayload` in `api/types.ts` |
| Writing game state (host-only) | `lobbyClient.updateGameState(lobbyId, gameId, playerId, patch)` |
| Polling cadence | `GameSyncContext.tsx` — full fetch every 500 ms or on phase change |
| `gameData` in `Game.tsx` | Passed as prop from `GameScreen.tsx` as `effectiveLobbyGameData` |
| Host detection | `isHost` prop already in `MinionBattlesGameProps` |

**Key sequence (host side):**
1. Victory modal opens → host selects next mission.
2. New lobby created → `nextLobbyId` written to old lobby via `updateGameState`.
3. Host navigates to new lobby.

**Key sequence (client side):**
1. Victory modal opens → clients see "Waiting for host…" (polling continues).
2. Poll returns `nextLobbyId` in `gameData` → "Continue" button appears.
3. Client clicks → leaves old lobby, joins new lobby.

---

## Step 1 — Add `nextLobbyId` to the game-state type

**Touches**: `app/js/games/minion_battles/api/types.ts`

- [x] Add `nextLobbyId?: string` to `MinionBattlesGameStatePayload`.
  Added after `battleSeed` with a doc comment explaining its purpose.

No backend change needed: `updateGameState` already does a `array_merge` on arbitrary JSON
fields. `MinionBattlesGameDataPayload` extends the base type with `Record<string, unknown>`,
so the field will round-trip correctly without touching PHP.

---

## Step 2 — Host: create next lobby and stamp `nextLobbyId` on the old lobby

**Touches**: `app/js/App.tsx`

The host flow must stamp the old lobby *before* clearing React state, because
`updateGameState` is host-only (server validates `isHost`) and we need the old
`currentLobby.id`, `lobbyGameId`, and `currentPlayer.id` to still be in state.

- [x] Add `handleHostContinueToNextMission(missionId: string, campaignId: string | null): Promise<boolean>`.
  Inlined lobby-creation logic from `handleCreateLobbyForMission` so the new lobby ID is available before stamping the old lobby. Stamps `nextLobbyId` on the old lobby via fire-and-forget `updateGameState` after the new lobby is created but before navigating.

- [x] Add `handleClientJoinNextLobby(nextLobbyId: string): Promise<void>`.
  Clears all lobby state immediately (same block as `handleLeaveLobby`), fire-and-forgets `leaveLobby` on the old lobby, then calls `joinLobby` + `startInLobby` for the new lobby.

- [x] Wire into `GameScreen` render:
  `onTryAgain` now points to `handleHostContinueToNextMission`; `onJoinNextLobby={handleClientJoinNextLobby}` added as a new prop. `GameComponentProps`, `GameScreenProps`, and `centralSection` useMemo updated in `GameScreen.tsx` to thread the prop through.

---

## Step 3 — Thread `onJoinNextLobby` and `nextLobbyId` through `Game.tsx`

**Touches**: `app/js/games/minion_battles/Game.tsx`

`gameData` is already available in `Game.tsx` as a prop (type `MinionBattlesGameDataPayload`).
`isHost` is also already a prop.

- [x] Add `onJoinNextLobby?: (lobbyId: string) => void` to `MinionBattlesGameProps`.
  Added `onJoinNextLobby?: (lobbyId: string) => Promise<void>` to `MinionBattlesGameProps` interface and destructured it in the component function.

- [x] Derive `nextLobbyId` inside the component:
  ```ts
  const nextLobbyId = (gameData as MinionBattlesGameDataPayload | null)?.nextLobbyId ?? null;
  ```
  Added after the `raw` useMemo, casting via `MinionBattlesGameDataPayload` import from `./api/types`.

- [x] Pass `isHost`, `nextLobbyId`, and `onJoinNextLobby` into `VictoryModal` (added in Step 4).
  Added `isHost`, `nextLobbyId`, `onJoinNextLobby` props to `VictoryModalProps` interface and function signature (prefixed with `_` to suppress unused-var lint). Passed all three from `Game.tsx` VictoryModal usage.

- [x] On the `onClose` of `VictoryModal`:
  - **Host path** (unchanged): call `onTryAgain(nextMissionId)` → `onContinue` → `onLeave`
    (existing decision tree, no change needed).
  - The host `onTryAgain` now points to `handleHostContinueToNextMission`, so the host path
    works without further changes here.
  No code change needed — existing `onClose` logic is correct.

- [x] Wire `GameScreen.tsx` to pass the new `onJoinNextLobby` prop down to `MinionBattlesGame`.
  Already complete from Step 2: `GameScreen.tsx` already has `onJoinNextLobby` in `GameComponentProps`, `GameScreenProps`, destructuring, and passes it to `GameComp`.

---

## Step 4 — Update `VictoryModal` with host / client split UI

**Touches**: `app/js/games/minion_battles/ui/components/VictoryModal.tsx`

- [x] Add props: `isHost: boolean`, `nextLobbyId?: string | null`, `onJoinNextLobby?: (lobbyId: string) => void`.
  Props were already in the interface from Step 3; removed the `_` prefixes from destructuring so they are actually used in render.

- [x] **Host** (`isHost === true`): render existing UI unchanged — mission-selection buttons and
  the "Continue" button that calls `onClose`. No visual change.
  Wrapped original Continue button in `(isHost === true || isHost === undefined)` guard to preserve solo-play behaviour.

- [x] **Client, waiting** (`isHost === false`, `nextLobbyId` falsy): replace the "Continue"
  button with a disabled/muted "Waiting for host…" indicator. The button should be visually
  distinct (e.g. grey, no hover effect) so players know to wait.
  Rendered a disabled grey button with `cursor-not-allowed` styling when `isHost === false && !nextLobbyId`.

- [x] **Client, ready** (`isHost === false`, `nextLobbyId` truthy): show an active "Continue"
  button. Clicking calls `onJoinNextLobby(nextLobbyId)`.
  Rendered a primary-styled button calling `onJoinNextLobby?.(nextLobbyId)` when `isHost === false && nextLobbyId`.

Polling in `GameSyncContext` already runs every 500 ms regardless of game phase, so no
changes to the sync loop are needed — the "Continue" button will appear within one poll
cycle after the host navigates away.

---

## Testing

This feature lives entirely in the lobby/network/UI layer. The game engine is unchanged.
**No AbilityTests apply** — the existing ability-test harness simulates the battle engine
in-process and has no concept of lobbies, polling, or navigation.

Manual E2E verification checklist (run after Step 4):
- [ ] Solo play: host clicks Continue → new lobby created → host lands on character-select.
  (Regression: solo flow must not break.)
- [ ] 2-player: both players in victory screen → host clicks Continue → host lands in new
  lobby; client sees "Continue" button appear within ~1 s → clicking lands client in same
  lobby as host.
- [ ] 2-player, no next mission in storyline graph: host clicks Continue → both players
  navigate back to campaign home (existing `onContinue` / `onLeave` fallback path
  unchanged).
- [ ] Network failure on `updateGameState`: host navigates fine; client stays on "Waiting…"
  (they can refresh to recover).
