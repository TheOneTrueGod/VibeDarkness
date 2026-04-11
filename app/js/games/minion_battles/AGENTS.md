# Minion Battles — agent guide

## General note

- This is a legacy project, so not everything will follow the conventions listed here. These are not instructions on where to find files. They are instructions on where to put them.
- This document describes a **target architecture**; it may not match the codebase today.

## Folder structure

- Frontend for this game: `app/js/games/minion_battles/*`
- Backend (PHP API, checkpoints, etc.): `backend/*`
- API clients and API-related utilities: `app/js/games/minion_battles/api`
  - Holds HTTP calls and **DTOs** (raw JSON shapes). Parsing into domain **GameObjects** belongs in **`game/`** (or a dedicated **`sync/`** module under this package), not in React components.

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

- **Host runtime** — The host’s simulation (tick loop + application of **commands**) is **canonical** for battle progression.
- **Server** — Stores **checkpoints** and **orders** so clients can reconnect, non-hosts can submit orders, and state can be verified.
- **Non-host clients** — Run a local copy of the simulation for responsiveness; they **verify** against server-delivered snapshots / hashes and **resync** when they diverge. They do not treat minimal polling as “correcting” the host’s sim.

### Mutation and controller boundaries

Domain state may change only through a **defined set of entry points**:

- The **tick / fixed update** path (simulation step).
- **Command handlers** that apply player or AI **commands** at the appropriate tick (see **Commands**).
- **Load / apply snapshot** (full state replace or controlled merge from checkpoint JSON).

Arbitrary React handlers, canvas code, or API success callbacks must **not** mutate nested GameObject fields directly; they should go through those entry points (or thin facades that delegate to them).

### Commands

- Represent player and AI inputs as **immutable command records** (move path, ability use, wait, etc.), analogous to today’s **orders at tick**.
- The **GameEngine** (or equivalent orchestrator) **applies** commands at the correct **game tick** so replay from checkpoints stays **deterministic**.

### React

- Use React for UI elements.
- Store React files under `app/js/games/minion_battles/ui`.
- `ui/components` — reusable UI components.
- `ui/pages` — full-screen or phase-level surfaces (e.g. character select, story, battle shell).
- Do not put game logic in React. React should call into the domain (commands, facades, or engine APIs) to change state.

### Battle canvas (Pixi / WebGL)

- React **mounts** the canvas, wires **input** (clicks, drag, keys), and passes stable references (e.g. engine, renderer).
- **Per-frame drawing** reads **runtime model** state on a **stable cadence** (e.g. `requestAnimationFrame`) or an explicit subscription; React itself does **not** drive the simulation tick.
- The canvas layer does **not** own authoritative rules (damage, legality, turn order); it sends **intents** that become **commands** through the same mutation boundaries as the rest of the UI.

### GameState and GameEngine

- **GameState** — Aggregate **data**: managers, collections of GameObjects, and anything that belongs in a **snapshot** shape. It should be straightforward to serialize via the root snapshot builder.
- **GameEngine** — **Orchestration**: tick loop, scheduling, applying **commands**, calling into managers, cross-cutting step order (projectiles, effects, round boundaries, etc.). It **uses** **GameState** rather than duplicating ownership of every list.
- Today much logic lives in **GameEngine**; the target is a clear split so **GameState** is the “what” and **GameEngine** is the “when / how steps run,” with both living under `game/` as today’s layout suggests.

### Managers

- Each **manager** owns a **slice** of **GameObjects**: storage, **invariants** for that slice (valid add/remove, lookups), and behavior that is **local** to that slice.
- **Cross-manager** rules default to the **GameEngine** (facade) or to **domain events** on a bus—pick one primary style per feature and avoid ad hoc cross-calls from UI.

### Snapshot-shaped vs derived state

- **Snapshot-shaped** types appear in (or nest under) persisted JSON. They implement **`toJSON`** and **`fromJSON`** (or factories) and round-trip with the snapshot.
- **Nested snapshot** pieces exist only **inside** a parent’s JSON blob; they implement **`fromJSON`** as needed and are serialized **only** as part of the parent’s `toJSON`, not as standalone checkpoint roots.
- **Derived / ephemeral** state can be recomputed from the snapshot + tick (e.g. cached pathfinding, purely visual interpolations). It is **not** written to checkpoints; rebuild it after load or on demand.

Rules for what belongs in snapshots:

- If a value can be **derived entirely** from another GameObject’s context and the tick, prefer **derived / ephemeral** over a standalone snapshot type.
- **Snapshot-shaped** parents should **recursively** include nested snapshot types in their serialized shape (especially under managers).

**Root assembly for network transfer:** only the **root snapshot builder** (typically coordinated by **GameEngine** with **GameState** data) assembles the wire payload; it may call `toJSON` on children as part of that assembly.

#### Layout on disk

- GameObjects and simulation core: `app/js/games/minion_battles/game/` (including **GameEngine**, **GameState**, and managers).
- Each GameObject family gets its own folder, e.g. units under `app/js/games/minion_battles/game/units/`.

### Missions and level flow

- **Mission / story** concerns (objectives, spawn waves, terrain assembly, narrative gating) stay **data-driven** under the existing **`storylines/` / `missions/`** style trees where possible.
- Orchestration that is not the battle tick itself (e.g. picking a mission, phase transitions) is **not** the same as **GameEngine**; keep it in **phase / UI** modules or a thin **mission coordinator** that does not absorb per-tick simulation.

### Object definitions

- A GameObject holds **instance** state (position, AI state, current health/resources, etc.). Many **kinds** of the same object type can exist.
- Example: a **GameUnit** has runtime fields and a **unit type** that references a **unit_def** (image, max health, move speed, abilities, etc.). A GameUnit may override some def values; the def is the static baseline.
- **Definitions (`*_defs`)** are **immutable at runtime** after load: no mutating def objects during ticks. Overrides and dynamic values live on the **instance**.
- Store definitions next to their GameObjects in a `*_defs` folder, e.g. `app/js/games/minion_battles/game/units/unit_defs/`.
