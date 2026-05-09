---
name: game-engine
description: Architecture of the GameEngine manager-of-managers pattern, tick loop, and serialization. Use when working on the engine's tick loop, managers, or checkpoint serialization.
---

# Game Engine

**Multiplayer naming:** While paused for parallel orders, **`gameTick`** is **last fully completed** (same as **`clientTick`**). The batch under collection uses **`waitingForOrders.atTick`**. **`serverTick`** / heartbeat **`hostTick`** mirror last completed after server clamp — see **`game-sync-data-flow`**.

**See `app/js/games/minion_battles/game/SKILL.md` for the full guide.**
