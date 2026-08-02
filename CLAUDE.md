# Project Notes for Claude

## Testing

Tests use **Vitest**, not Jest. Never use `npx jest` — it will fail.

### Selecting which tests to run

Run the **smallest** set that covers the change — not the whole suite on every edit. **`npm run ci`** runs lint, the full Vitest suite, and `tsc` every 30 minutes locally; use that as the broad regression backstop.

See **`.cursor/skills/scoped-testing/SKILL.md`** for the full decision tree. Quick reference:

- **New or edited test file** → `npx vitest run path/to/That.test.ts`
- **Changed source with co-located `*.test.ts`** → that test file only (do **not** also `vitest related`)
- **Changed leaf with no co-located test** → `npx vitest related <file> --run` (skip hubs / `MISSION_MAP` missions / `storylines/index`)
- **Several files / unclear impact** → `npx vitest run --changed` (or `--changed <base-ref>` / `HEAD~1` when the tree is clean)
- **Domain folders:** `game/battlenet/**` → battlenet test dir; card/ability → co-located `NNNNAbility.test.ts` + `abilities/`
- **Full suite (`npm run test`)** → cross-cutting refactors, pre-merge handoff, or when the user asks — **not** after routine edits

Vitest config lives in `vite.config.ts` (`test.include` / `test.exclude`). Discovery is scoped to `app/**/*.{test,spec}.{ts,tsx}` so `node_modules` and `.claude/worktrees/**` are never collected.

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
