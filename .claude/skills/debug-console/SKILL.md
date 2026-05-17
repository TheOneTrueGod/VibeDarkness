---
name: debug-console
description: Explains how the DebugConsole drawer and its tabs work in the VibeDarkness UI.
---

# Debug Console

**See `app/js/components/DebugConsole/SKILL.md` for the full guide.**

**Minion Battles · Heartbeat tab** (`DebugHeartbeatSyncPanel.tsx`): compares local **clientTick** (`engine.gameTick`) to server **last completed** tick (`hostTick` heartbeat field) and shows **order batch** (`orderBatchAtTick`).
