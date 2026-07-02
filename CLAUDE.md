# Project Notes for Claude

## Testing

Tests use **Vitest**, not Jest. Never use `npx jest` — it will fail.

### Selecting which tests to run

Run the subset of tests scoped to the change, not the whole suite:

- **Default:** `npx vitest run --changed` — uses the module graph to run tests affected by uncommitted changes. Use `npx vitest run --changed <base-ref>` when the work spans multiple commits on a branch.
- **Targeting one source file:** `npx vitest related <file> --run` runs the tests that import it.
- **Choosing paths manually:**
  - `game/battlenet/**` changes → `npx vitest run app/js/games/minion_battles/game/battlenet`
  - a card/ability change → its co-located `NNNNAbility.test.ts` plus `app/js/games/minion_battles/abilities`
  - engine-core changes (`GameEngine.ts`, `types.ts`, `BattleSession.ts`, managers) → `--changed` will legitimately fan out wide; that is expected, not a reason to skip tests.
- **The full suite (`npm run test`) is still right for** cross-cutting refactors (serialization, tick loop, shared types) and one final check at the end of a body of work — not after every edit.

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
