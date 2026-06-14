---
name: PlayerInteractionManager refactor
overview: Extract all player-input handling from BattlePhase.tsx into a PlayerInteractionManager owned by BattleSession. Uses a tool-model where each interaction mode (ability targeting, movement, debug) is a first-class Tool class. BattlePhase becomes a thin shell that routes raw events and syncs React state from the manager.
todos:
  - id: shell
    content: "InteractionTool interface + PlayerInteractionManager shell: context refs, activeTool routing, subscribe/emit, submitOrder"
    status: pending
  - id: default-tool
    content: "DefaultTool: right-click movement, shift waypoints, ctrl pixel-precision, unit pursuit"
    status: pending
  - id: ability-targeting-tool
    content: "AbilityTargetingTool: multi-step click targeting (new-style + legacy), lock-on cache, submit on completion"
    status: pending
  - id: debug-tools
    content: "Debug tools: UnitSelectorDebugTool and AdminMoveDebugTool"
    status: pending
  - id: hotkeys
    content: "Hotkeys: Space (wait/endTurn), Escape (cancel targeting or nonconfirmed), 1-9 (select ability)"
    status: pending
  - id: battlesession-wiring
    content: "Wire PlayerInteractionManager into BattleSession: create on startEngine, expose getter, destroy on destroy()"
    status: pending
  - id: battlephase-cutover
    content: "BattlePhase cutover: remove handler functions + dead React state, subscribe to manager, pass canUseOrderUi"
    status: pending
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
- [ ] Define `InteractionTool` interface: optional `onCanvasClick`, `onCanvasRightClick`, `onCanvasMouseMove`, `onDeactivate` — each receives `(ctx: PlayerInteractionContext, manager: PlayerInteractionManager)` plus the event-specific args; return `boolean` (true = handled, prevents DefaultTool fallback)
- [ ] Define `PlayerInteractionContext` type: `{ engine: GameEngine; camera: Camera; renderer: GameRenderer; session: BattleSessionHandle; playerId: string }`
- [ ] Define `PlayerInteractionUIState` type: `{ selectedAbility: AbilityStatic | null; selectedCardIndex: number | null; nonconfirmedOrder: BattleOrder | null; currentTargets: ResolvedTarget[]; mouseWorld: { x: number; y: number }; previewOrderUnitId: string | null }` — `previewOrderUnitId` is the active local waiter's unit ID, needed by the renderer's `targetingState` parameter
- [ ] Implement `PlayerInteractionManager` class:
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

---

## Step 2 — DefaultTool (movement)

**Files**
- NEW `app/js/games/minion_battles/game/interaction/tools/DefaultTool.ts`

**Checklist**
- [ ] Implement `DefaultTool implements InteractionTool`
- [ ] `onCanvasRightClick(screenX, screenY, shiftKey, ctrlKey, ctx, manager)`:
  - Guard: early-return if `!manager.canUseOrderUi`, `!waitingForOrders`, or unit has `conditionalCancelPaused` active ability
  - **CTRL path**: pixel-precision move — `destGrid` + `targetPixel = { x: clampedX, y: clampedY }`, single waypoint, `setMovement(..., targetPixel)`
  - **Clicked-on-unit path**: find unit within `UNIT_HIT_RADIUS = 20`; pathfind to its grid cell; `setMovement(path, clickedUnit.id, tick)`; `pendingMoveTargetUnitIdRef = clickedUnit.id`
  - **Shift path**: append waypoint (max `PLAYER_MOVE_WAYPOINT_MAX`), pathfind through all waypoints
  - **Default path**: single-waypoint move
  - After each: if `nonconfirmedOrder` exists and not `AUTO_END_TURN`, re-submit updated order with new `movePath` / `moveTargetUnitId` / `moveTargetPixel`
- [ ] Fields (plain, not React refs): `pendingMovePath`, `pendingMoveWaypoints`, `pendingMoveTargetUnitId`, `pendingMoveTargetPixel`
- [ ] `reset()` — clears all pending path fields; called by manager when `waitingForOrders` changes
- [ ] `seedFromUnit(unit)` — reads `unit.movement.path` / `targetUnitId` / `targetPixel` (if not `pathInvalidated`) to populate pending fields; called by manager when waiting-for-orders fires

---

## Step 3 — AbilityTargetingTool

**Files**
- NEW `app/js/games/minion_battles/game/interaction/tools/AbilityTargetingTool.ts`

**Checklist**
- [ ] Implement `AbilityTargetingTool implements InteractionTool`
- [ ] Constructor: `(ability: AbilityStatic, cardIndex: number, casterUnitId: string)`
- [ ] Internal state: `currentTargets: ResolvedTarget[]`, `targetsByLabel: Record<string, ResolvedTarget>`, `lockOnCache: LockOnCache | null` (same shape as `lockOnCacheRef` in BattlePhase)
- [ ] `onCanvasClick(screenX, screenY, ctx, manager)`:
  - Resolve click via `resolveClick(screenX, screenY, ctx.camera, ctx.engine.units)`
  - **New-style path** (`getSelectTargetDefsFromTimings(ability).length > 0`): collect into `currentTargets` and `targetsByLabel`; when all collected, build `orderTargets` (extra lock-on units + aim pixel for multi-target hitboxes), call `manager.submitOrder(ability.id, orderTargets, targetsByLabel)`, then `manager.deactivateTool()`
  - **Legacy path** (`getAbilityTargets`): collect into `currentTargets`; when all collected, call `manager.submitOrder(ability.id, currentTargets)` then `manager.deactivateTool()`
- [ ] `onCanvasMouseMove(screenX, screenY, ctx)`:
  - Compute `worldPos = ctx.camera.screenToWorld(screenX, screenY)`
  - Recompute `lockOnCache` when mouse moves > 2px (new-style + legacy lock-on paths, same logic as current `handleCanvasMouseMove`)
- [ ] `getLockOnCache()` — exposed for the click handler only: `AbilityTargetingTool.onCanvasClick` reads the cached result to avoid re-running the hitbox on every click. **The renderer does not use this cache** — `PreviewRenderer.renderTargetingPreview` re-derives candidate units from scratch on every frame using `selectedAbility + currentTargets + mouseWorld` from `targetingStateRef`.
- [ ] `onDeactivate()` — resets `currentTargets`, `targetsByLabel`, `lockOnCache`

---

## Step 4 — Debug tools

**Files**
- NEW `app/js/games/minion_battles/game/interaction/tools/UnitSelectorDebugTool.ts`
- NEW `app/js/games/minion_battles/game/interaction/tools/AdminMoveDebugTool.ts`
- MODIFIED `app/js/games/minion_battles/game/interaction/PlayerInteractionManager.ts`

**Checklist**
- [ ] `UnitSelectorDebugTool implements InteractionTool`:
  - `onCanvasClick`: `resolveClick` → if unit found, `ctx.renderer.setDebugUnitOutline(null)`, `ctx.camera.snapTo(unit.x, unit.y, unit.radius)`, sets `window.__minionBattlesDebugAutoFollowPausedUntil`, calls `debugState.unitSelectorCallback(unit.id)`, then `manager.deactivateTool()`
  - `onCanvasMouseMove`: calls `ctx.renderer.setDebugUnitOutline(hoverUnit?.id ?? null)` via `resolveClick`
  - `onDeactivate`: clears outline via `ctx.renderer.setDebugUnitOutline(null)`
- [ ] `AdminMoveDebugTool implements InteractionTool`:
  - Constructor: `(unitId: string)`
  - `onCanvasClick`: `ctx.camera.screenToWorld(screenX, screenY)` → `window.__minionBattlesAdminMoveUnit?.(unitId, worldX, worldY)` → clears `window.__minionBattlesAdminMovePendingUnitId` → `manager.deactivateTool()`
- [ ] In `PlayerInteractionManager.onCanvasClick`: check `getDebugState().unitSelectorMode` first — if true, activate `UnitSelectorDebugTool` and route the current click to it (so the first click in that mode is not swallowed)
- [ ] In `PlayerInteractionManager.onCanvasClick`: check `window.__minionBattlesAdminMovePendingUnitId` — if set, activate `AdminMoveDebugTool(unitId)` and route the click to it

---

## Step 5 — Hotkeys

**Files**
- MODIFIED `app/js/games/minion_battles/game/interaction/PlayerInteractionManager.ts`

**Checklist**
- [ ] Add `onKeyDown(e: KeyboardEvent)` to `PlayerInteractionManager`
- [ ] `Space` (no repeat, `canUseOrderUi`): if `nonconfirmedOrder && !AUTO_END_TURN` → `handleEndTurn()`; else → `handleWait()`; `e.preventDefault()`
- [ ] `Escape`: if `activeTool instanceof AbilityTargetingTool` → `deactivateTool()` + emit; else if `nonconfirmedOrder` → send `{ unitId, abilityId: 'wait', targets: [], endTurn: false }` via `ctx.session.submitPlayerOrder`, clear `nonconfirmedOrder`, emit
- [ ] `1-9` (only if `canUseOrderUi`): index = key - 1; if `myAbilityIds[index]` exists, look up ability via `getAbility`, activate `new AbilityTargetingTool(ability, index, activeLocalWaiter.unitId)`; `e.preventDefault()`
- [ ] `handleWait()`: guard `canUseOrderUi && waitingForOrders && activeWaiter`; calls `submitOrder('wait', [])`; deactivates any active tool; emits
- [ ] `handleEndTurn()`: guard `nonconfirmedOrder && canUseOrderUi`; sends `{ ...nonconfirmedOrder, endTurn: true }` via `ctx.session.submitPlayerOrder`; clears `nonconfirmedOrder`; emits

---

## Step 6 — Wire into BattleSession

**Files**
- MODIFIED `app/js/games/minion_battles/game/BattleSession.ts`

**Checklist**
- [ ] Import `PlayerInteractionManager` and add `private interactionManager: PlayerInteractionManager | null = null`
- [ ] In `startEngine()` (after engine, camera, renderer are ready): `this.interactionManager = new PlayerInteractionManager(); this.interactionManager.setContext({ engine, camera, renderer, session: this, playerId: this.playerId })`
- [ ] Expose `getInteractionManager(): PlayerInteractionManager | null`
- [ ] In `destroy()`: call `this.interactionManager?.destroy(); this.interactionManager = null`
- [ ] Verify no other BattleSession methods need to notify the manager (waitingForOrders is pushed from BattlePhase, not BattleSession)

---

## Step 7 — BattlePhase cutover

**Files**
- MODIFIED `app/js/games/minion_battles/ui/pages/BattlePhase.tsx`

**Checklist**
- [ ] Replace `handleCanvasClick`, `handleCanvasRightClick`, `handleCanvasMouseMove` with inline arrow callbacks that call `sessionRef.current?.getInteractionManager()?.onCanvasClick(...)` etc.; keep `forceRender` call in `onCanvasMouseMove` callback
- [ ] Wire `AbilityBar.onSelectCard` to the manager: pass `(cardIndex, ability) => sessionRef.current?.getInteractionManager()?.activateAbilityTargeting(cardIndex, ability)` — **not** the removed `handleSelectCard`. This is what drives card-highlight toggling and `AbilityTargetingTool` activation from the AbilityBar UI.
- [ ] Remove `handleWait` and `handleEndTurn` functions; pass `() => manager.handleWait()` / `() => manager.handleEndTurn()` to `AbilityBar`'s `onWait` prop (guard with null check on manager)
- [ ] Remove keydown `useEffect`; replace with a `useEffect` that adds `manager.onKeyDown` as a `window` keydown listener, tearing it down on unmount (gate on `battleInitPhase === 'ready'`)
- [ ] Remove React state: `selectedAbility`, `selectedCardIndex`, `currentTargets`, `targetsByLabelRef`, `lockOnCacheRef`, `pendingMovePathRef`, `pendingMoveWaypointsRef`, `pendingMoveTargetUnitIdRef`, `pendingMoveTargetPixelRef`, `nonconfirmedOrder`, `nonconfirmedOrderRef`
- [ ] Add `useEffect` that subscribes to manager UI state changes and mirrors `selectedAbility`, `selectedCardIndex`, and `nonconfirmedOrder` into local React state (these three drive AbilityBar rendering)
- [ ] Assign `targetingStateRef.current` **in the component body** (not in a `useEffect`) by reading from `manager.getUIState()` combined with `waitingForOrders` and `ghostPlans`. The shape must match the renderer's expected type — **`nonconfirmedOrder` is NOT included** in what's passed to the renderer (it was in the ref only for the ghost plan interval). The renderer's `targetingState` fields are: `selectedAbility`, `currentTargets`, `mouseWorld`, `waitingForOrders`, `previewOrderUnitId`, `ghostPlans`. **Note:** BattleCanvas's `handlePointerDown` reads `targetingStateRef.current.selectedAbility` to suppress drag-to-pan when an ability is selected — this must keep working, so `targetingStateRef` must always be current before each render.
- [ ] Ghost plan broadcast interval: read `nonconfirmedOrder` and `selectedAbility` / `currentTargets` from `manager.getUIState()` instead of removed refs/state
- [ ] Add effects to push `canUseOrderUi`, `waitingForOrders`, and `myAbilityIds` into the manager: `manager.setCanUseOrderUi(canUseOrderUi)`, `manager.setWaitingForOrders(waitingForOrders)`, `manager.setMyAbilityIds(myAbilityIds)`
- [ ] Run `npx vitest run --changed` and `npx tsc --noEmit`; fix any type errors

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
