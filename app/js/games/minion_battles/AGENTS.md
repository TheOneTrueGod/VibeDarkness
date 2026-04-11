# Minion Battles — agent guide

## General note

- This is a legacy project, so not everything will follow the conventions listed here. These are not instructions on where to find files. They are instructions on where to put them.
- This document describes a **target architecture**; it may not match the codebase today.

## Folder structure

- Frontend for this game: `app/js/games/minion_battles/*`
- Backend (PHP API, checkpoints, etc.): `backend/*`
- API clients live in `app/js/LobbyClient.ts` (project-wide). There is no `api/` directory under `minion_battles` yet.

### Current layout (where to find things today)

| Directory | Contents |
|-----------|----------|
| `engine/` | `GameEngine`, `GameRenderer`, `Camera`, `EventBus`, `LightGrid`, type definitions (`types.ts`, `unitDef.ts`, `effectDef.ts`), and `managers/` sub-folder |
| `engine/managers/` | `UnitManager`, `CardManager`, `EffectManager`, `ProjectileManager`, `LevelEventManager`, `SpecialTileManager` |
| `objects/` | Runtime `GameObject` classes — `units/` (including `unitAI/` sub-tree and `dark_animals/`) |
| `terrain/` | `TerrainManager`, `TerrainGrid`, `Pathfinder`, terrain tile types |
| `abilities/` | `Ability` class, `targeting.ts`, `behaviors/`, `templates/`, preview helpers |
| `card_defs/` | Per-card ability definition folders (e.g. `0102_Punch/`, `0203_Pistol/`) |
| `character_defs/` | Character definitions and `items/` (weapons, hands, utility, core) |
| `constants/` | Shared constants (`unitConstants.ts`, etc.) |
| `buffs/` | Buff definitions and runtime buff logic |
| `components/` | React UI components (e.g. `BattleCanvas`, `CharacterEditor/`) |
| `phases/` | Phase-level React components (`BattlePhase`, `CharacterSelectPhase`, etc.) |
| `storylines/` | Campaign storylines and `missions/` per storyline |
| `resources/` | Resource system classes (`Mana`, `Rage`, etc.) |
| `hitboxes/` | Hitbox shape classes for ability collision |
| `utils/` | Shared utility functions |

### Target layout (migration not yet started)

The target architecture reorganizes into these top-level directories. Until the migration happens, use the **current** paths above when looking for code.

| Current | Target | Notes |
|---------|--------|-------|
| `engine/` | `game/` | Engine, managers, and simulation core merge under `game/` |
| `objects/` | `game/` (merge with engine) | Runtime GameObjects move alongside their managers |
| `components/` | `ui/components/` | Reusable UI components |
| `phases/` | `ui/pages/` | Full-screen / phase-level surfaces |
| *(none)* | `api/` | HTTP calls and DTOs; currently in project-wide `LobbyClient.ts` |

When the `api/` directory is created, it will hold HTTP calls and **DTOs** (raw JSON shapes). Parsing into domain **GameObjects** belongs in **`game/`** (or a dedicated **`sync/`** module), not in React components.

## Architecture for the game state

The following uses a **model / view / controller** lens as a **mental model only** (not a specific React or framework pattern).

| Role | Responsibility |
|------|----------------|
| **Model** | **Persisted:** JSON on the server (checkpoints, orders, lobby game payload). **Runtime:** in-memory **GameObjects** deserialized from or derived from that data. |
| **Controller** | No single owner; combine **command** application, action-style APIs on the domain, and **API calls**. Only approved **mutation entry points** may change state (see below). |
| **View** | Mostly React; UI actions should delegate to the domain. The battle canvas mounts in React but should re-render rarely. |

### Persisted vs runtime model

- **Persisted model** — What crosses the network or disk: checkpoint snapshots, queued orders, and lobby-level game JSON. It is authoritative for **recovery, catch-up, and desync repair**, not for every frame of local UI.
- **Runtime model** — The live object graph on the client (**GameState**, managers, **GameEngine** tick). This is what gameplay and rendering read during a session.

### Multiplayer authority (target)

- **Host runtime** — The host's simulation (tick loop + application of **commands**) is **canonical** for battle progression.
- **Server** — Stores **checkpoints** and **orders** so clients can reconnect, non-hosts can submit orders, and state can be verified.
- **Non-host clients** — Run a local copy of the simulation for responsiveness; they **verify** against server-delivered snapshots / hashes and **resync** when they diverge. They do not treat minimal polling as "correcting" the host's sim.

### Data flow lifecycle

The following traces every hop data makes between layers. Code that adds a new sync feature, API call, or rendering path should follow these pipelines; do not skip layers (e.g. do not deserialize checkpoints inside `GameSyncContext`, and do not call `LobbyClient` from inside `GameEngine`).

#### Server → client → runtime objects → canvas (read path)

```
Server (PHP)
 │  stores lobby state, checkpoint JSON, queued orders
 │
 ▼
LobbyClient  (app/js/LobbyClient.ts)
 │  HTTP GET — returns raw GameStatePayload / minimal state
 │
 ▼
GameSyncContext  (app/js/contexts/GameSyncContext.tsx)
 │  Unified poll loop. Owns all network I/O timing.
 │  Delivers lobby messages to App.tsx callback.
 │  Delivers battle data via registered BattleCallbacks
 │  (onFullResync, onOrdersReceived).
 │  Does NOT deserialize JSON into GameObjects.
 │
 ▼
App.tsx → Game.tsx  (phase routing, lobby-level React state)
 │  Syncs phase, votes, selections, equipment into React state.
 │  Passes initialGameState blob to the active phase component.
 │
 ▼
BattlePhase  (phases/BattlePhase.tsx)
 │  Owns the GameEngine (via refs). Creates engine on mount
 │  or on full resync via loadGameState().
 │  Registers BattleCallbacks with GameSyncContext.
 │  Bridges React UI ↔ engine: targeting state, order submission.
 │
 ▼
GameEngine.fromJSON()  (engine/GameEngine.ts)
 │  Deserializes SerializedGameState into the live object graph.
 │  Delegates to manager restoreFromJSON() and per-object fromJSON().
 │  This is the ONLY place where raw JSON becomes GameObjects.
 │
 ▼
GameEngine tick loop  (fixedUpdate @ 60 Hz)
 │  Advances simulation: orders, abilities, movement, AI, projectiles,
 │  effects, round boundaries, victory/defeat.
 │  Managers own slices; engine orchestrates step order.
 │
 ▼
BattleCanvas  (components/BattleCanvas.tsx)
   requestAnimationFrame loop calls GameRenderer.render(engine, camera, targetingState).
   Reads live engine state (units, effects, terrain, tiles).
   Mutates only Camera (pan, zoom, follow) — never domain objects.
```

#### Client → server (write path)

```
Player input (click, ability, right-click move)
 │
 ▼
BattlePhase.submitOrder()
 │  Builds a BattleOrder, calls engine.applyOrder().
 │
 ▼
GameEngine applies order at current or next tick
 │  On pause-for-orders, fires onCheckpoint(tick, toJSON(), pendingOrders).
 │
 ▼
BattlePhase checkpoint handler
 │  Calls gameSync.saveCheckpoint(tick, snapshot, orders).
 │
 ▼
GameSyncContext → LobbyClient
 │  POST /api — saves checkpoint + orders on server.
 │
 ▼
Server stores checkpoint; other clients pick up via next poll.
```

#### Non-host order submission

```
Non-host player submits order
 │
 ▼
BattlePhase → GameSyncContext.submitOrders()
 │  POST to server with the order payload.
 │
 ▼
Host polls minimal state → receives remote orders
 │  GameSyncContext delivers via onOrdersReceived callback.
 │
 ▼
BattlePhase calls engine.queueOrder() + engine.resumeAfterOrders()
   Engine applies the order at the correct tick.
```

### Mutation and controller boundaries

Domain state may change only through a **defined set of entry points**:

- The **tick / fixed update** path (simulation step).
- **Command handlers** that apply player or AI **commands** at the appropriate tick (see **Commands**).
- **Load / apply snapshot** (full state replace or controlled merge from checkpoint JSON).

Arbitrary React handlers, canvas code, or API success callbacks must **not** mutate nested GameObject fields directly; they should go through those entry points (or thin facades that delegate to them).

### Commands (BattleOrder / OrderAtTick)

Player and AI inputs are represented as **`BattleOrder`** records (`unitId`, `abilityId`, `targets: ResolvedTarget[]`, optional `movePath`), defined in `engine/types.ts`. Orders are scheduled for a specific game tick via **`OrderAtTick`** (`{ gameTick: number; order: BattleOrder }`).

- `GameEngine.applyOrder(order)` — queues at the current or next tick depending on pause state.
- `GameEngine.queueOrder(atTick, order)` — queues for a specific future tick; applies immediately if `atTick === gameTick`.
- `pendingOrders: OrderAtTick[]` is serialized into checkpoints so replay from a snapshot stays **deterministic**.

### React

- Use React for UI elements.
- **Currently:** React components live in `components/` and phase-level surfaces in `phases/` at the `minion_battles` root.
- **Target:** move to `ui/components/` (reusable UI) and `ui/pages/` (full-screen / phase-level surfaces).
- Do not put game logic in React. React should call into the domain (commands, facades, or engine APIs) to change state.

### Battle canvas (Pixi / WebGL)

- React **mounts** the canvas, wires **input** (clicks, drag, keys), and passes stable references (e.g. engine, renderer).
- **Per-frame drawing** reads **runtime model** state on a **stable cadence** (e.g. `requestAnimationFrame`) or an explicit subscription; React itself does **not** drive the simulation tick.
- The canvas layer does **not** own authoritative rules (damage, legality, turn order); it sends **intents** that become **commands** through the same mutation boundaries as the rest of the UI.

### Component responsibilities and the BattleSession target

Today `BattlePhase` is a monolithic React component (~800 lines) that mixes engine lifecycle, sync bridging, order submission, targeting UI, and rendering. The target is to extract a **`BattleSession`** class that owns the non-React concerns, leaving `BattlePhase` as a thin React shell.

#### Target split

| Component | Owns | Reads | May mutate |
|-----------|------|-------|------------|
| **`BattleSession`** (class, `engine/BattleSession.ts`) | `GameEngine`, `Camera`, `GameRenderer`; engine lifecycle (`loadFromSnapshot`, `loadFreshMission`, `destroy`); order submission (`submitOrder`, `skipTurn`); sync bridge API (`getSnapshot`, `applyRemoteOrders`, `fullResync`). | Mission defs for initialization. | Engine state (via defined entry points only). |
| **`BattlePhase`** (React, `phases/BattlePhase.tsx`) | Targeting / interaction state (`selectedCard`, `currentTargets`, `mouseWorld`, `pendingMovePath`). Creates `BattleSession` on mount, destroys on unmount. Subscribes to session events for React state. Registers session with `GameSyncContext` via `BattleCallbacks`. | Session (for engine/camera/renderer refs to pass to children). | React state only. Calls `session.submitOrder()` — never mutates engine directly. |
| **`GameSyncContext`** (React context, `app/js/contexts/GameSyncContext.tsx`) | Unified poll loop, network I/O timing, checkpoint saves, order submission to server. | Engine state via `BattleCallbacks` (delegates to session methods). | Network requests only; never touches engine or GameObjects. |
| **`BattleCanvas`** (React, `components/BattleCanvas.tsx`) | `requestAnimationFrame` render loop. | Engine, `Camera`, `GameRenderer`, targeting state — all read-only except `Camera`. | `Camera` (pan, zoom, follow) — view state only, never domain objects. |
| **`GameRenderer`** (class, `engine/GameRenderer.ts`) | Drawing logic, sprite management. | Engine state (units, effects, terrain, tiles, light grid). | Canvas pixels only. |
| **`Game.tsx`** (React, root component) | Phase routing, lobby-level state (phase, votes, selections, equipment). | `gameData` from `GameSyncContext`. | Lobby-level React state. Passes `initialGameState` blob to phase components. |

#### Data flow with BattleSession

```
GameSyncContext
  │  BattleCallbacks delegate to session methods:
  │    getEngineSnapshot → session.getSnapshot()
  │    onFullResync      → session.loadFromSnapshot(state)
  │    onOrdersReceived  → session.applyRemoteOrders(orders)
  │
  ▼
BattleSession                          BattlePhase (React)
  │                                      │
  │  loadFromSnapshot() / loadFresh()    │ creates session on mount
  │  engine.start()                      │ subscribes to session events:
  │  engine tick loop runs               │
  │  ── event: waitingForOrders ──────▶  setWaitingForOrders(), setIsPaused()
  │  ── event: roundChanged ──────────▶  setRoundNumber()
  │  ── event: cardsChanged ──────────▶  setMyCards()
  │  ── event: victory / defeat ──────▶  onVictory() / onDefeat()
  │                                      │
  │  submitOrder(order) ◀────────────── targeting resolves → calls session
  │    engine.applyOrder()               │
  │    saveCheckpoint() via sync         │
  │                                      │
  │  getEngine() ──────────────────────▶ BattleCanvas reads engine + camera
  │  getCamera()                         rAF render loop (read-only)
```

#### Why this split

- **No ref gymnastics.** Today `loadGameState` takes a params bag with 6 refs and 5 `setState` functions because a standalone function needs to reach back into React. `BattleSession` owns its own state — no refs needed.
- **Stable sync bridge.** Today `BattleCallbacks` are closures registered in a `useEffect` that reference `engineRef.current`. With `BattleSession`, callbacks are methods on a stable object instance — no stale closures.
- **Testable without React.** Engine lifecycle, order submission, and checkpoint flow can be unit-tested by constructing a `BattleSession` directly.
- **Clear event boundary.** Instead of `loadGameState` calling `ctx.setRoundNumber(engine.roundNumber)` through a params bag, the session emits typed events. React subscribes.
- **Targeting stays in React.** Card selection, target resolution, and movement preview are inherently UI interactions. They stay in `BattlePhase` but become easier to follow because session management noise is gone.

#### State domains

There are three distinct state domains with different lifecycles:

- **Lobby state** (`MinionBattlesState` in `state.ts`): phase, votes, character selections, equipment. **Server-authoritative.** Lives in React state, synced via polling. Mutations go through `LobbyClient` API calls → server → next poll.
- **Battle state** (`SerializedGameState` in `engine/types.ts` / `GameEngine` at runtime): units, terrain, cards, tick, orders. **Host-authoritative.** Lives in `GameEngine` (owned by `BattleSession`). Persisted as checkpoints. Mutations go through tick loop and order application only.
- **Interaction state** (targeting): `selectedAbility`, `selectedCardIndex`, `currentTargets`, `mouseWorld`, `pendingMovePath`, `waitingForOrders`. Lives in `BattlePhase` as React state and refs. This is neither domain state nor purely view state — it bridges UI intent and command submission. `BattlePhase` maintains a `targetingStateRef` that the rAF render loop reads without triggering React re-renders. Targeting resolution logic lives in `abilities/targeting.ts` (`resolveClick`, `validateAndResolveTarget`). Preview rendering is driven by `AbilityStatic.renderTargetingPreview` functions called from `GameRenderer`. It is acceptable for this state to be ephemeral — it is never checkpointed or synced.

Do not conflate these — they have different sources of truth, different persistence mechanisms, and different mutation paths.

### GameEngine (single source of truth for battle state)

- **GameState** — Aggregate **data**: managers, collections of GameObjects, and anything that belongs in a **snapshot** shape. It should be straightforward to serialize via the root snapshot builder.
- **GameEngine** — **Orchestration**: tick loop, scheduling, applying **commands**, calling into managers, cross-cutting step order (projectiles, effects, round boundaries, etc.). It **uses** **GameState** rather than duplicating ownership of every list.
- Today much logic lives in **GameEngine**; the target is a clear split so **GameState** is the "what" and **GameEngine** is the "when / how steps run," with both living under `engine/` (current) / `game/` (target).

### EventBus

`GameEngine` owns a typed **`EventBus`** instance (`engine/EventBus.ts`). The bus provides `on`, `off`, `emit`, and `clear` methods, all typed via `GameEventType` and `GameEventDataMap`.

**Current events:**

| Event | Payload type | Emitted by |
|-------|-------------|------------|
| `damage_taken` | `DamageTakenEvent` | `Unit.takeDamage` |
| `unit_died` | `UnitDiedEvent` | Unit death logic |
| `round_end` | `RoundEndEvent` | `GameEngine` fixed update |
| `turn_end` | `TurnEndEvent` | `GameEngine` (resume after orders) |
| `turn_start` | `TurnStartEvent` | *(declared but not yet emitted)* |
| `ability_used` | `AbilityUsedEvent` | `GameEngine` (after executing ability) |
| `projectile_hit` | `ProjectileHitEvent` | `Projectile` collision |

**Subscribers:** `GameEngine.registerCoreEventListeners()` wires engine-level reactions (e.g. `unit_died`, `round_end`). `Resource` subclasses (`Mana`, `Rage`) subscribe/unsubscribe for gain-on-event behavior. `GameRenderer` subscribes to `damage_taken` for hit-flash visuals.

The bus is passed into managers and `Unit.fromJSON` during deserialization. Listeners are cleared and re-registered on `fromJSON` / teardown.

### Camera and view state

`Camera` (`engine/Camera.ts`) is **ephemeral view state** — it is not part of `SerializedGameState` and is never checkpointed. `BattlePhase` creates `new Camera(...)` in `loadGameState` and stores it on a ref. The canvas layer (`BattleCanvas`) mutates it freely (pan, zoom, follow via `centerOn` / `setFocusTarget` / `panBy`), and `GameRenderer.render` reads it to position the Pixi `gameContainer`. `BattlePhase` uses `camera.screenToWorld` for input resolution.

It is acceptable for the canvas layer to mutate `Camera` on every frame — this is not domain state and does not need to go through engine mutation boundaries.

### Managers

- Each **manager** owns a **slice** of **GameObjects**: storage, **invariants** for that slice (valid add/remove, lookups), and behavior that is **local** to that slice.
- **Cross-manager** rules default to the **GameEngine** (facade) or to **domain events** on the **EventBus** — pick one primary style per feature and avoid ad hoc cross-calls from UI.

### Snapshot-shaped vs derived state

- **Snapshot-shaped** types appear in (or nest under) persisted JSON. They implement **`toJSON`** and **`fromJSON`** (or factories) and round-trip with the snapshot.
- **Nested snapshot** pieces exist only **inside** a parent's JSON blob; they implement **`fromJSON`** as needed and are serialized **only** as part of the parent's `toJSON`, not as standalone checkpoint roots.
- **Derived / ephemeral** state can be recomputed from the snapshot + tick (e.g. cached pathfinding, purely visual interpolations). It is **not** written to checkpoints; rebuild it after load or on demand.

Rules for what belongs in snapshots:

- If a value can be **derived entirely** from another GameObject's context and the tick, prefer **derived / ephemeral** over a standalone snapshot type.
- **Snapshot-shaped** parents should **recursively** include nested snapshot types in their serialized shape (especially under managers).

**Root assembly for network transfer:** only the **root snapshot builder** (typically coordinated by **GameEngine** with **GameState** data) assembles the wire payload; it may call `toJSON` on children as part of that assembly.

**TerrainManager is derived, not snapshot-shaped.** `TerrainManager` (`terrain/TerrainManager.ts`) wraps `TerrainGrid` and `Pathfinder` but is **not** serialized with `GameEngine.toJSON()`. Terrain is rebuilt from the mission definition on load: `mission.createTerrain()` → `new TerrainManager(terrainGrid)`, then passed into `GameEngine.fromJSON(snapshot, playerId, terrainManager)` or `prepareForNewGame({ terrainManager, ... })`. The same mission must always produce the same terrain, so terrain is deterministically derived from mission data and does not need to appear in checkpoints.

#### Layout on disk

- **Currently:** Engine and simulation core live in `engine/` (including `GameEngine`, managers under `engine/managers/`). Runtime GameObjects live in `objects/` (e.g. units under `objects/units/`). Unit definitions are in `constants/unitConstants.ts` and `engine/unitDef.ts`.
- **Target:** merge into `game/` (including **GameEngine**, **GameState**, and managers), with each GameObject family in its own sub-folder (e.g. `game/units/`).

### Missions and level flow

- **Mission / story** concerns (objectives, spawn waves, terrain assembly, narrative gating) stay **data-driven** under the existing **`storylines/` / `missions/`** style trees where possible.
- Orchestration that is not the battle tick itself (e.g. picking a mission, phase transitions) is **not** the same as **GameEngine**; keep it in **phase / UI** modules or a thin **mission coordinator** that does not absorb per-tick simulation.

### Object definitions

- A GameObject holds **instance** state (position, AI state, current health/resources, etc.). Many **kinds** of the same object type can exist.
- Example: a **GameUnit** has runtime fields and a **unit type** that references a **unit_def** (image, max health, move speed, abilities, etc.). A GameUnit may override some def values; the def is the static baseline.
- **Definitions (`*_defs`)** are **immutable at runtime** after load: no mutating def objects during ticks. Overrides and dynamic values live on the **instance**.
- **Currently:** unit definitions live in `constants/unitConstants.ts` and `engine/unitDef.ts`; runtime unit classes are in `objects/units/`.
- **Target:** store definitions next to their GameObjects in a `*_defs` folder, e.g. `game/units/unit_defs/`.
