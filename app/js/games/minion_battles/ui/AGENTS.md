# Minion Battles — UI layer agent guide

Paths below are relative to `app/js/games/minion_battles/`.

## Directory layout

| Directory | Purpose |
|-----------|---------|
| `ui/components/` | Reusable React battle UI widgets (card hand, targeting overlays, canvas wrapper). |
| `ui/pages/` | Full-screen or phase-level React surfaces (`BattlePhase.tsx`, lobby-adjacent flow, editors). |

## Battle view stack

The battle view has three distinct layers with a strict ownership boundary:

```
BattlePhase (ui/pages/BattlePhase.tsx)
 │  Creates BattleSession, Camera, GameRenderer on mount.
 │  Owns targeting/interaction React state.
 │  Delegates order submission to session.
 ▼
BattleCanvas (ui/components/BattleCanvas.tsx)
 │  Mounts the Pixi <canvas> element.
 │  Runs the requestAnimationFrame render loop.
 │  Handles all user input: clicks, drag-pan, scroll-zoom, keyboard (WASD, T/G).
 │  May freely mutate Camera — it is ephemeral view state, never checkpointed.
 │  Calls GameRenderer.render(engine, camera, targetingState) each frame.
 ▼
GameRenderer (game/GameRenderer.ts)
 │  Reads engine state (units, effects, terrain, tiles, light grid).
 │  Positions the Pixi gameContainer using Camera (pan + zoom).
 │  Manages sprites, overlays, hit-flash effects, and targeting previews.
 │  Mutates canvas pixels only — never domain objects.
 ▼
Camera (game/Camera.ts)
    Ephemeral view state: pan (x, y), zoom, viewport size, world bounds.
    See skill: battle-camera (.cursor/skills/battle-camera/SKILL.md)
```

## Camera and coordinate conversion

`Camera` (`game/Camera.ts`) is the single source of truth for the viewport. Use its
`worldToScreen` / `screenToWorld` methods whenever converting input coordinates — they are
zoom-aware. See the **battle-camera** skill for full details.

## Input conventions

All user input for the battle view lives in `BattleCanvas.tsx`:

- **Pointer events** — handled via React `onPointerDown/Move/Up/Cancel` props on the `<canvas>`.
- **Keyboard events** — added/removed as `window` event listeners in a `useEffect`.
- **Wheel events** — added as a native (non-React) listener with `{ passive: false }` so
  `preventDefault()` can stop page scroll.

Do not add battle input handling anywhere else. `BattlePhase` wires the resolved click/right-click
callbacks via props; the canvas remains unaware of ability logic.

## Phase subdirectory convention

When a file in `ui/pages/` grows beyond ~200 lines, split it into a same-named subdirectory:
- `ui/pages/characterSelect/` for `CharacterSelectPhase.tsx`
- `ui/pages/preMissionStory/` for `PreMissionStoryPhase.tsx`

The subdirectory holds extracted components, named `useXxx` hooks for state and handlers, and any local-only helper components. The main `XxxPhase.tsx` becomes a thin orchestrator that imports from the subdirectory.

## What does NOT belong here

- Domain state mutations (units, orders, cards) — go through `BattleSession` / `GameEngine`.
- Ability targeting resolution — lives in `abilities/targeting.ts`.
- Per-frame simulation — runs in `GameEngine.fixedUpdate`, not the rAF loop.
