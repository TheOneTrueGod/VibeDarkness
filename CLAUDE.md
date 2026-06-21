# Project Notes for Claude

## Testing

Tests use **Vitest**, not Jest. Always run:
```
npx vitest run <path>
```
Never use `npx jest` — it will fail.

Vitest config lives in `vite.config.ts` (`test.include` / `test.exclude`). Discovery is scoped to `app/**/*.{test,spec}.{ts,tsx}` so `node_modules` and `.claude/worktrees/**` are never collected. If you add a separate `vitest.config.ts`, merge settings into `vite.config.ts` instead — a standalone config can override Vitest’s default excludes and accidentally run dependency tests.

## TypeScript

After adding new fields to interfaces or crossing an interface/class boundary, run:
```
npx tsc --noEmit
```
Vite's dev server does not surface TS errors at runtime — type gaps fail silently.

## Debugging behavior bugs

**Write a failing test first** before tracing code paths. Engine bugs show up as test failures. If the test passes, the engine is correct and the bug is in the BattleNet/UI layer. Deep static analysis of the engine is rarely the right first move for a "game isn't pausing" or "player can't act" report.

## Order-submission architecture

In the **live game**, player orders flow through:
```
BattlePhase (UI)
  → BattleSession.submitPlayerOrder
  → BattleNet.submitOrder          ← network layer; can defer, drop, or delay
  → session.applyRemoteOrders
  → engine.state.orderMgr.queueOrder
  → engine.tryResumeParallel
```

**Tests bypass BattleNet entirely** and call `engine.state.orderMgr.applyOrder` (or `queueOrder`) directly. A test that passes does not rule out BattleNet as the source of a live-game bug. When a behavior works in tests but not in the live game, check `BattleNet.submitOrder` first — it has several early-return paths (recovering, awaiting ack, client ahead of host heartbeat) that silently drop orders.
