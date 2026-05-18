---
name: battle-camera
description: Camera, viewport, and zoom for the Minion Battles battle view. Use when editing Camera.ts, zoom levels, coordinate conversion, pan/follow behaviour, or how GameRenderer applies the camera transform.
---

# Battle Camera

## Overview

`Camera` (`game/Camera.ts`) is **ephemeral view state** — it is never serialized or checkpointed.
`BattleCanvas` (`ui/components/BattleCanvas.tsx`) mutates it freely; `GameRenderer` reads it to position the Pixi `gameContainer`.

## Key Properties

| Property | Description |
|----------|-------------|
| `x`, `y` | Camera center in world space |
| `zoom` | Current zoom multiplier (always one of `ZOOM_LEVELS`) |
| `viewportWidth`, `viewportHeight` | Canvas dimensions in CSS pixels |
| `worldWidth`, `worldHeight` | Map bounds in world pixels |

## Zoom

Discrete steps only: `Camera.ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.5, 2.0]`.

- `zoomIn(pivotScreenX, pivotScreenY)` — step up one level, keeping the pivot world point fixed on screen.
- `zoomOut(pivotScreenX, pivotScreenY)` — step down one level.

**Scroll wheel:** pivot = mouse cursor position on canvas.
**Keyboard (T/G):** pivot = viewport center (`viewportWidth/2`, `viewportHeight/2`).

## Coordinate Conversions

Both methods are zoom-aware:

```
worldToScreen:  screenX = (worldX - camera.x) * zoom + viewportWidth / 2
screenToWorld:  worldX  = (screenX - viewportWidth / 2) / zoom + camera.x
```

Always use these methods when converting player input (clicks, drags) to world positions.

## Camera Bounds (Clamp)

The camera clamp enforces a 100 px buffer outside the map:

```
halfW  = viewportWidth  / (2 * zoom)   // half-width of visible world area
minX   = halfW  - 100                  // left edge of visible area ≥ -100
maxX   = worldWidth - halfW + 100      // right edge ≤ worldWidth + 100
```

If `minX > maxX` (viewport wider than map + buffer), the camera is centered on `worldWidth / 2`.

## Applying the Camera in GameRenderer

`GameRenderer.render` (around lines 556–560 in `GameRenderer.ts`) positions the Pixi `gameContainer`:

```typescript
this.gameContainer.scale.set(camera.zoom);
this.gameContainer.x = -camera.x * camera.zoom + camera.viewportWidth / 2;
this.gameContainer.y = -camera.y * camera.zoom + camera.viewportHeight / 2;
```

## Pan and Follow

- `panBy(dx, dy)` — move camera by a **world-space** delta, then clamp.
- `centerOn(wx, wy)` — auto-follow with dead zone (centre 50% of viewport); smooth lerp.
- `snapTo(wx, wy)` — instant snap.

**Drag pan:** screen-space pixel delta must be divided by `zoom` before calling `panBy` so the map moves naturally under the cursor.

**WASD/arrow keys:** use world-space speed directly; no zoom division needed.

## Input Wiring (BattleCanvas)

| Input | Action |
|-------|--------|
| Scroll wheel (on canvas) | `zoomIn` / `zoomOut` at mouse position |
| T key | `zoomIn` at viewport center |
| G key | `zoomOut` at viewport center |
| WASD / arrows | `panBy` at `PAN_SPEED` world px/frame |
| Left-drag | `panBy(-dx/zoom, -dy/zoom)` per pointer-move event |

The wheel listener must be added as a native DOM listener with `{ passive: false }` so
`preventDefault()` can suppress page scroll. Do not use a React `onWheel` prop for this.
