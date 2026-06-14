<!-- Completed 2026-06-14. All 7 steps implemented and verified. PlayerInteractionManager is fully wired: InteractionTool interface, DefaultTool (movement), AbilityTargetingTool (multi-step targeting), UnitSelectorDebugTool + AdminMoveDebugTool, hotkeys (Space/Escape/1-9), BattleSession integration (create on startEngine, expose getInteractionManager, destroy on destroy()), and BattlePhase cutover (canvas callbacks, AbilityBar wiring, manager subscription, push effects for canUseOrderUi/waitingForOrders/myAbilityIds). Pre-existing Entomb Chain test failures (2) are unrelated to this work. Follow-up: AbilityTest coverage (AT-1 through AT-4) described at the bottom of the plan was not implemented — consider adding these unit tests for the interaction layer. -->
---
name: PlayerInteractionManager refactor
overview: Extract all player-input handling from BattlePhase.tsx into a PlayerInteractionManager owned by BattleSession. Uses a tool-model where each interaction mode (ability targeting, movement, debug) is a first-class Tool class. BattlePhase becomes a thin shell that routes raw events and syncs React state from the manager.
todos:
  - id: shell
    content: "InteractionTool interface + PlayerInteractionManager shell: context refs, activeTool routing, subscribe/emit, submitOrder"
    status: completed
  - id: default-tool
    content: "DefaultTool: right-click movement, shift waypoints, ctrl pixel-precision, unit pursuit"
    status: completed
  - id: ability-targeting-tool
    content: "AbilityTargetingTool: multi-step click targeting (new-style + legacy), lock-on cache, submit on completion"
    status: completed
  - id: debug-tools
    content: "Debug tools: UnitSelectorDebugTool and AdminMoveDebugTool"
    status: completed
  - id: hotkeys
    content: "Hotkeys: Space (wait/endTurn), Escape (cancel targeting or nonconfirmed), 1-9 (select ability)"
    status: completed
  - id: battlesession-wiring
    content: "Wire PlayerInteractionManager into BattleSession: create on startEngine, expose getter, destroy on destroy()"
    status: completed
  - id: battlephase-cutover
    content: "BattlePhase cutover: remove handler functions + dead React state, subscribe to manager, pass canUseOrderUi"
    status: completed
isProject: false
---

# PlayerInteractionManager Refactor

## Goal

Kill the inline interaction logic in `BattlePhase.tsx` and move it into a dedicated `PlayerInteractionManager` class owned by `BattleSession` alongside the existing Engine / Camera / Renderer trio.

The manager uses a **tool model**: at any moment there is one active `InteractionTool` that owns how clicks, right-clicks, and mouse moves are interpreted. `DefaultTool` (movement), `AbilityTargetingTool`, `UnitSelectorDebugTool`, and `AdminMoveDebugTool` are first-class classes — nothing is special-cased.

BattlePhase becomes a thin orchestrator: it passes raw canvas events to the manager, subscribes to manager state changes to update React state for rendering, and hands `canUseOrderUi` to the manager so it can gate tool dispatch.

---

## Agent handoff instructions

Each step is self-contained. Hand each step to a fresh sub-agent with:

> "Implement step N of `docs/player-interaction-manager.plan.md`. Read the plan file first. Implement only that step's checklist items, then verify with `npx vitest run --changed` and a TypeScript check (`npx tsc --noEmit`). Mark each completed checklist item with a one-line summary inside the `[ ]` brackets."

After verifying the diff, mark the corresponding `todos` entry `status: completed` in the frontmatter.

---

## Step 1 — InteractionTool interface + PlayerInteractionManager shell

**Files**
- NEW `app/js/games/minion_battles/game/interaction/InteractionTool.ts`
- NEW `app/js/games/minion_battles/game/interaction/PlayerInteractionManager.ts`

**Checklist**
- [x] Define `InteractionTool` interface: optional `onCanvasClick`, `onCanvasRightClick`, `onCanvasMouseMove`, `onDeactivate` — each receives `(ctx: PlayerInteractionContext, manager: PlayerInteractionManager)` plus the event-specific args; return `boolean` (true = handled, prevents DefaultTool fallback)
  - Defined in `InteractionTool.ts`; manager parameter typed as `IPlayerInteractionManager` interface (avoids circular import)
- [x] Define `PlayerInteractionContext` type: `{ engine: GameEngine; camera: Camera; renderer: GameRenderer; session: BattleSessionHandle; playerId: string }`
  - Uses `PlayerInteractionSession` interface (subset of `BattleSession`) to avoid pulling in the full handle type
- [x] Define `PlayerInteractionUIState` type: `{ selectedAbility: AbilityStatic | null; selectedCardIndex: number | null; nonconfirmedOrder: BattleOrder | null; currentTargets: ResolvedTarget[]; mouseWorld: { x: number; y: number }; previewOrderUnitId: string | null }` — `previewOrderUnitId` is the active local waiter's unit ID, needed by the renderer's `targetingState` parameter
  - Defined in `InteractionTool.ts`
- [x] Implement `PlayerInteractionManager` class:
  - Private: `ctx`, `activeTool: InteractionTool | null`, `defaultTool: DefaultTool` (always present, never null), `uiState: PlayerInteractionUIState`, `canUseOrderUi: boolean`, `waitingForOrders: WaitingForOrders | null`, `myAbilityIds: string[]`, listener set
  - `setContext(ctx)` — called by BattleSession after engine is ready; also creates `defaultTool`
  - `setCanUseOrderUi(value: boolean)` — called by BattlePhase on each render cycle
  - `setWaitingForOrders(info: WaitingForOrders | null)` — called by BattlePhase; resets DefaultTool path state when changed
  - `setMyAbilityIds(ids: string[])` — kept in sync by BattlePhase
  - `onCanvasClick(screenX, screenY)` — routes to `activeTool ?? defaultTool`
  - `onCanvasRightClick(screenX, screenY, shiftKey, ctrlKey)` — routes to `activeTool ?? defaultTool`
  - `onCanvasMouseMove(screenX, screenY)` — routes to `activeTool ?? defaultTool`; updates `uiState.mouseWorld`
  - `activateTool(tool)` / `deactivateTool()` — calls `tool.onDeactivate()`, updates `uiState`, emits
  - `activateAbilityTargeting(cardIndex: number, ability: AbilityStatic)` — public entry point for card selection; if the currently active tool is an `AbilityTargetingTool` with the same `cardIndex`, **toggle off** (deactivate) instead of re-activating; otherwise create `new AbilityTargetingTool(ability, cardIndex, activeWaiter.unitId)` and call `activateTool`
  - `submitOrder(abilityId, targets, targetsByLabel?)` — builds `BattleOrder` from active waiter; `wait` and `AUTO_END_TURN` set `endTurn: true` immediately; otherwise stores as `nonconfirmedOrder`; calls `ctx.session.submitPlayerOrder`; emits UI state change
  - `handleWait()` and `handleEndTurn()` — public, called by AbilityBar and hotkeys
  - `subscribe(listener) / unsubscribe(listener)` — returns unsubscribe function
  - `getUIState(): PlayerInteractionUIState`
  - `destroy()` — clears listeners, deactivates tool
  - Note: `DefaultTool` and `AbilityTargetingTool` stubs created so Step 1 compiles; Steps 2 & 3 fill them in
  - Note: 2 pre-existing test failures in `SimulationRunner.test.ts` (Entomb Chain) — not caused by these changes

---

## Step 2 — DefaultTool (movement)

**Files**
- NEW `app/js/games/minion_battles/game/interaction/tools/DefaultTool.ts`

**Checklist**
- [x] Implement `DefaultTool implements InteractionTool`
  - Full implementation in `app/js/games/minion_battles/game/interaction/tools/DefaultTool.ts`
- [x] `onCanvasRightClick(screenX, screenY, shiftKey, ctrlKey, ctx, manager)`:
  - Guard: early-return if `!manager.canUseOrderUi`, `!waitingForOrders`, or unit has `conditionalCancelPaused` active ability
  - **CTRL path**: pixel-precision move — `destGrid` + `targetPixel = { x: clampedX, y: clampedY }`, single waypoint, `setMovement(..., targetPixel)`
  - **Clicked-on-unit path**: find unit within `UNIT_HIT_RADIUS = 20`; pathfind to its grid cell; `setMovement(path, clickedUnit.id, tick)`; `pendingMoveTargetUnitIdRef = clickedUnit.id`
  - **Shift path**: append waypoint (max `PLAYER_MOVE_WAYPOINT_MAX`), pathfind through all waypoints
  - **Default path**: single-waypoint move
  - After each: if `nonconfirmedOrder` exists and not `AUTO_END_TURN`, re-submit updated order with new `movePath` / `moveTargetUnitId` / `moveTargetPixel`
  - Added `updateNonconfirmedMovement` to `IPlayerInteractionManager` interface and `PlayerInteractionManager` to allow DefaultTool to update manager UI state + resubmit order atomically
- [x] Fields (plain, not React refs): `pendingMovePath`, `pendingMoveWaypoints`, `pendingMoveTargetUnitId`, `pendingMoveTargetPixel`
  - All four fields as class properties with correct types
- [x] `reset()` — clears all pending path fields; called by manager when `waitingForOrders` changes
  - Sets all fields to null/empty
- [x] `seedFromUnit(unit)` — reads `unit.movement.path` / `targetUnitId` / `targetPixel` (if not `pathInvalidated`) to populate pending fields; called by manager when waiting-for-orders fires
  - Guards on `unit.pathInvalidated`; seeds waypoints from last element of path

---

## Step 3 — AbilityTargetingTool

**Files**
- NEW `app/js/games/minion_battles/game/interaction/tools/AbilityTargetingTool.ts`

**Checklist**
- [x] Implement `AbilityTargetingTool implements InteractionTool`
  - Full implementation in `app/js/games/minion_battles/game/interaction/tools/AbilityTargetingTool.ts`
- [x] Constructor: `(ability: AbilityStatic, cardIndex: number, casterUnitId: string)`
  - Constructor takes ability, cardIndex, casterUnitId as readonly public fields
- [x] Internal state: `currentTargets: ResolvedTarget[]`, `targetsByLabel: Record<string, ResolvedTarget>`, `lockOnCache: LockOnCache | null` (same shape as `lockOnCacheRef` in BattlePhase)
  - LockOnCache type defined locally with targetIdx, mouseWorldPos, candidate, allCandidates
- [x] `onCanvasClick(screenX, screenY, ctx, manager)`:
  - Resolve click via `resolveClick(screenX, screenY, ctx.camera, ctx.engine.units)`
  - **New-style path** (`getSelectTargetDefsFromTimings(ability).length > 0`): collect into `currentTargets` and `targetsByLabel`; when all collected, build `orderTargets` (extra lock-on units + aim pixel for multi-target hitboxes), call `manager.submitOrder(ability.id, orderTargets, targetsByLabel)`, then `manager.deactivateTool()`
  - **Legacy path** (`getAbilityTargets`): collect into `currentTargets`; when all collected, call `manager.submitOrder(ability.id, currentTargets)` then `manager.deactivateTool()`
  - Both paths call `manager.setCurrentTargets(newTargets)` to keep manager UI state in sync
- [x] `onCanvasMouseMove(screenX, screenY, ctx)`:
  - Compute `worldPos = ctx.camera.screenToWorld(screenX, screenY)`
  - Recompute `lockOnCache` when mouse moves > 2px (new-style + legacy lock-on paths, same logic as current `handleCanvasMouseMove`)
- [x] `getLockOnCache()` — exposed for the click handler only: `AbilityTargetingTool.onCanvasClick` reads the cached result to avoid re-running the hitbox on every click. **The renderer does not use this cache** — `PreviewRenderer.renderTargetingPreview` re-derives candidate units from scratch on every frame using `selectedAbility + currentTargets + mouseWorld` from `targetingStateRef`.
  - Returns `this.lockOnCache`
- [x] `onDeactivate()` — resets `currentTargets`, `targetsByLabel`, `lockOnCache`
  - Sets all three fields back to empty/null

---

## Step 4 — Debug tools

**Files**
- NEW `app/js/games/minion_battles/game/interaction/tools/UnitSelectorDebugTool.ts`
- NEW `app/js/games/minion_battles/game/interaction/tools/AdminMoveDebugTool.ts`
- MODIFIED `app/js/games/minion_battles/game/interaction/PlayerInteractionManager.ts`

**Checklist**
- [x] `UnitSelectorDebugTool implements InteractionTool`:
  - Implemented in `app/js/games/minion_battles/game/interaction/tools/UnitSelectorDebugTool.ts`; `onCanvasClick` resolves click, snaps camera, sets `__minionBattlesDebugAutoFollowPausedUntil`, calls `unitSelectorCallback`, clears outline, deactivates; `onCanvasMouseMove` sets hover outline; `onDeactivate` clears outline.
- [x] `AdminMoveDebugTool implements InteractionTool`:
  - Implemented in `app/js/games/minion_battles/game/interaction/tools/AdminMoveDebugTool.ts`; constructor takes `unitId`; `onCanvasClick` converts screen to world, calls `__minionBattlesAdminMoveUnit`, clears `__minionBattlesAdminMovePendingUnitId`, deactivates.
- [x] In `PlayerInteractionManager.onCanvasClick`: check `getDebugState().unitSelectorMode` first — if true, activate `UnitSelectorDebugTool` and route the current click to it (so the first click in that mode is not swallowed)
  - Added before the regular tool routing in `PlayerInteractionManager.ts`; imports added for both debug tools and `getDebugState`.
- [x] In `PlayerInteractionManager.onCanvasClick`: check `window.__minionBattlesAdminMovePendingUnitId` — if set, activate `AdminMoveDebugTool(unitId)` and route the click to it
  - Added after the unitSelectorMode check, before regular tool routing.

---

## Step 5 — Hotkeys

**Files**
- MODIFIED `app/js/games/minion_battles/game/interaction/PlayerInteractionManager.ts`

**Checklist**
- [x] Add `onKeyDown(e: KeyboardEvent)` to `PlayerInteractionManager`
  - Added to `PlayerInteractionManager.ts`; added `import { getAbility } from '../../abilities/AbilityRegistry'` for the 1-9 path
- [x] `Space` (no repeat, `canUseOrderUi`): if `nonconfirmedOrder && !AUTO_END_TURN` → `handleEndTurn()`; else → `handleWait()`; `e.preventDefault()`
  - Implemented; guards on `!e.repeat` and `!this._canUseOrderUi`; calls existing `handleEndTurn()` or `handleWait()`
- [x] `Escape`: if `activeTool instanceof AbilityTargetingTool` → `deactivateTool()` + emit; else if `nonconfirmedOrder` → send `{ unitId, abilityId: 'wait', targets: [], endTurn: false }` via `ctx.session.submitPlayerOrder`, clear `nonconfirmedOrder`, emit
  - Implemented; deactivateTool() already emits via activeTool.onDeactivate + emitChange
- [x] `1-9` (only if `canUseOrderUi`): index = key - 1; if `myAbilityIds[index]` exists, look up ability via `getAbility`, activate `new AbilityTargetingTool(ability, index, activeLocalWaiter.unitId)`; `e.preventDefault()`
  - Delegates to `this.activateAbilityTargeting(index, ability)` which handles toggle-off and active waiter lookup
- [x] `handleWait()`: guard `canUseOrderUi && waitingForOrders && activeWaiter`; calls `submitOrder('wait', [])`; deactivates any active tool; emits
  - Already existed in PlayerInteractionManager from Step 1; verified matches plan spec
- [x] `handleEndTurn()`: guard `nonconfirmedOrder && canUseOrderUi`; sends `{ ...nonconfirmedOrder, endTurn: true }` via `ctx.session.submitPlayerOrder`; clears `nonconfirmedOrder`; emits
  - Already existed in PlayerInteractionManager from Step 1; verified matches plan spec

---

## Step 6 — Wire into BattleSession

**Files**
- MODIFIED `app/js/games/minion_battles/game/BattleSession.ts`

**Checklist**
- [x] Import `PlayerInteractionManager` and add `private interactionManager: PlayerInteractionManager | null = null`
  - Added import from `./interaction/PlayerInteractionManager` and private field in `BattleSession.ts`
- [x] In `startEngine()` (after engine, camera, renderer are ready): `this.interactionManager = new PlayerInteractionManager(); this.interactionManager.setContext({ engine, camera, renderer, session: this, playerId: this.playerId })`
  - Destroys any previous manager, creates new one, calls setContext with engine/camera/renderer/session/playerId; guarded behind camera && renderer null-checks
- [x] Expose `getInteractionManager(): PlayerInteractionManager | null`
  - Added after `getRenderer()` in `BattleSession.ts`
- [x] In `destroy()`: call `this.interactionManager?.destroy(); this.interactionManager = null`
  - Calls destroy before teardownEngineAndRendererOnly in full teardown path
- [x] Verify no other BattleSession methods need to notify the manager (waitingForOrders is pushed from BattlePhase, not BattleSession)
  - Confirmed: waitingForOrders flows BattleSession→BattlePhase event, then BattlePhase calls manager.setWaitingForOrders(); no additional wiring needed here

---

## Step 7 — BattlePhase cutover

**Files**
- MODIFIED `app/js/games/minion_battles/ui/pages/BattlePhase.tsx`

**Checklist**
- [x] Replace `handleCanvasClick`, `handleCanvasRightClick`, `handleCanvasMouseMove` with inline arrow callbacks that call `sessionRef.current?.getInteractionManager()?.onCanvasClick(...)` etc.; keep `forceRender` call in `onCanvasMouseMove` callback
  - Already done in prior agent pass; useCallback wrappers delegate to manager
- [x] Wire `AbilityBar.onSelectCard` to the manager: pass `(cardIndex, ability) => sessionRef.current?.getInteractionManager()?.activateAbilityTargeting(cardIndex, ability)` — **not** the removed `handleSelectCard`. This is what drives card-highlight toggling and `AbilityTargetingTool` activation from the AbilityBar UI.
  - Replaced undefined `handleSelectCard` reference with inline lambda in AbilityBar JSX
- [x] Remove `handleWait` and `handleEndTurn` functions; pass `() => manager.handleWait()` / `() => manager.handleEndTurn()` to `AbilityBar`'s `onWait` prop (guard with null check on manager)
  - Replaced undefined `handleWait`/`handleEndTurn` references with inline lambdas via sessionRef manager
- [x] Remove keydown `useEffect`; replace with a `useEffect` that adds `manager.onKeyDown` as a `window` keydown listener, tearing it down on unmount (gate on `battleInitPhase === 'ready'`)
  - Already done; useEffect at line 843 delegates to manager.onKeyDown
- [x] Remove React state: `selectedAbility`, `selectedCardIndex`, `currentTargets`, `targetsByLabelRef`, `lockOnCacheRef`, `pendingMovePathRef`, `pendingMoveWaypointsRef`, `pendingMoveTargetUnitIdRef`, `pendingMoveTargetPixelRef`, `nonconfirmedOrder`, `nonconfirmedOrderRef`
  - Old refs removed; `selectedAbility`, `selectedCardIndex`, `nonconfirmedOrder` kept as mirror state (sourced from manager subscription)
- [x] Add `useEffect` that subscribes to manager UI state changes and mirrors `selectedAbility`, `selectedCardIndex`, and `nonconfirmedOrder` into local React state (these three drive AbilityBar rendering)
  - Already done; useEffect at line 811 subscribes to manager and calls setSelectedAbility/setSelectedCardIndex/setNonconfirmedOrder
- [x] Assign `targetingStateRef.current` **in the component body** (not in a `useEffect`) by reading from `manager.getUIState()` combined with `waitingForOrders` and `ghostPlans`. The shape must match the renderer's expected type — **`nonconfirmedOrder` is NOT included** in what's passed to the renderer (it was in the ref only for the ghost plan interval). The renderer's `targetingState` fields are: `selectedAbility`, `currentTargets`, `mouseWorld`, `waitingForOrders`, `previewOrderUnitId`, `ghostPlans`. **Note:** BattleCanvas's `handlePointerDown` reads `targetingStateRef.current.selectedAbility` to suppress drag-to-pan when an ability is selected — this must keep working, so `targetingStateRef` must always be current before each render.
  - Already done; inline block at line 171 reads from manager.getUIState() and assigns targetingStateRef.current each render
- [x] Ghost plan broadcast interval: read `nonconfirmedOrder` and `selectedAbility` / `currentTargets` from `manager.getUIState()` instead of removed refs/state
  - Already done; interval at line 214 reads from manager.getUIState()
- [x] Add effects to push `canUseOrderUi`, `waitingForOrders`, and `myAbilityIds` into the manager: `manager.setCanUseOrderUi(canUseOrderUi)`, `manager.setWaitingForOrders(waitingForOrders)`, `manager.setMyAbilityIds(myAbilityIds)`
  - Already done; three useEffects at lines 828-838 push these values to the manager
- [x] Run `npx vitest run --changed` and `npx tsc --noEmit`; fix any type errors
  - All 5 changed-file tests pass; no TS errors in changed files; 2 pre-existing Entomb Chain failures unchanged

---

## AbilityTest coverage

These are lightweight unit tests with an engine stub (not full SimulationRunner scenarios). They run fast and deterministically without the full game loop.

**New file**: `app/js/games/minion_battles/game/interaction/PlayerInteractionManager.test.ts`

### AT-1: Multi-step targeting submits correct order
- Instantiate `PlayerInteractionManager` with a stub context (minimal engine with two units, stub camera with identity `screenToWorld`, stub session that captures submitted orders)
- Activate an `AbilityTargetingTool` for a two-target ability (e.g. Double Punch)
- Call `manager.onCanvasClick(x1, y1)` then `manager.onCanvasClick(x2, y2)`
- Assert: `session.submitPlayerOrder` was called once with both targets in `order.targets` and correct `abilityId`
- Do **not** check damage or engine simulation — only the order structure

### AT-2: Right-click movement path populates BattleOrder movePath
- Same stub setup with a walkable terrain grid
- Call `manager.onCanvasRightClick(screenX, screenY, false, false)` to queue a path
- Submit an ability order via `AbilityTargetingTool`
- Assert: submitted `BattleOrder` has `movePath` populated (non-empty array of grid cells)

### AT-3: Escape clears nonconfirmed order
- Submit a non-wait ability order (produces `nonconfirmedOrder` in the manager)
- Call `manager.onKeyDown({ code: 'Escape', preventDefault: () => {} })` (cast to KeyboardEvent)
- Assert: `session.submitPlayerOrder` received `{ abilityId: 'wait', targets: [], endTurn: false }` and `manager.getUIState().nonconfirmedOrder === null`

### AT-4: DefaultTool does not fire when canUseOrderUi is false
- Set `manager.setCanUseOrderUi(false)`
- Call `manager.onCanvasRightClick(...)` and `manager.onKeyDown({ code: 'Space' })`
- Assert: `session.submitPlayerOrder` was never called

---

## Out of scope

- BattleCanvas raw pointer handling (drag vs click disambiguation) — stays in BattleCanvas
- `targetingStateRef` type shape — keep unchanged; Step 7 updates the assignments feeding it
- Ghost plan context broadcasting logic — stays in BattlePhase; Step 7 updates its source from manager `getUIState()`
- Admin heal/kill/move `window` globals (`adminHealUnit`, `adminKillUnit`) — stay in BattlePhase; only `adminMoveUnit` canvas routing moves into `AdminMoveDebugTool`
- `nonconfirmedOrder` ghost plan broadcast interval — stays in BattlePhase, reads from manager in Step 7
