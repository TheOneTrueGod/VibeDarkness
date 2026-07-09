# Project Notes for Claude

## Testing

Tests use **Vitest**, not Jest. Never use `npx jest` — it will fail.

### Selecting which tests to run

Run the **smallest** set that covers the change — not the whole suite on every edit. **`npm run ci`** runs lint, the full Vitest suite, and `tsc` every 30 minutes locally; use that as the broad regression backstop.

See **`.cursor/skills/scoped-testing/SKILL.md`** for the full decision tree. Quick reference:

- **New or edited test file** → `npx vitest run path/to/That.test.ts`
- **One changed source file** → `npx vitest related <file> --run`
- **Several files / unclear impact** → `npx vitest run --changed` (or `--changed <base-ref>` / `HEAD~1` when the tree is clean)
- **Domain folders:** `game/battlenet/**` → battlenet test dir; card/ability → co-located `NNNNAbility.test.ts` + `abilities/`
- **Full suite (`npm run test`)** → cross-cutting refactors, pre-merge handoff, or when the user asks — **not** after routine edits

Vitest config lives in `vite.config.ts` (`test.include` / `test.exclude`). Discovery is scoped to `app/**/*.{test,spec}.{ts,tsx}` so `node_modules` and `.claude/worktrees/**` are never collected.

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

## Code style: no magic constants

Avoid bare numeric or string literals anywhere they carry domain meaning — especially in tests. Export named constants from the source of truth and import them at use sites.

```ts
// BAD — a test that breaks silently when the base value changes
return rt.maxUses === 6;

// GOOD — the assertion is self-documenting and tracks the source
import { SWORD_BASE_MAX_USES } from '.../0112Ability';
import { SWING_EXTRA_USES } from '.../abilityUses';
return rt.maxUses === SWORD_BASE_MAX_USES + SWING_EXTRA_USES;
```

This applies equally to source code: if the same number appears in two files, one of them should import it from the other. The goal is that when a value changes, the compiler (or a single grep) finds every affected site rather than silent test drift.
