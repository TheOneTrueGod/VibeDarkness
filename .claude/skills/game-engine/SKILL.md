---
name: game-engine
description: Architecture of the GameEngine manager-of-managers pattern, tick loop, and serialization. Use when working on the engine's tick loop, managers, or checkpoint serialization.
---

# Game Engine

**Multiplayer naming:** While paused for parallel orders, **`gameTick`** is **last fully completed** (same as **`clientTick`**). The batch under collection uses **`waitingForOrders.atTick`**. **`serverTick`** / heartbeat **`hostTick`** mirror last completed after server clamp — see **`game-sync-data-flow`**.

**See `app/js/games/minion_battles/game/SKILL.md` for the full guide.**

**Time dilation:** the tick loop resolves world pace, advances `gameTime` by world pace, and steps each unit/projectile on its own local time (tempo, step pieces, Time Stop). Read the **time-dilation** skill and `app/js/games/minion_battles/game/time/AGENTS.md` before touching clocks; pace 1 must stay byte-identical.
