# Project Notes for Claude

## Minion Battles: build the engine, not the feature

Treat every Minion Battles gameplay change as engine work: reusable properties, definitions, presets and building blocks rather than one-off behaviour. Read "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` before designing, planning or implementing a change.

## Testing

Tests use **Vitest**, not Jest. Never use `npx jest` — it will fail.

After file create/save/delete, follow **`.cursor/rules/post-change-test-hook.mdc`**: `npm run lint:changed`, then the smallest named Vitest set. Decision tree: **`.cursor/skills/scoped-testing/SKILL.md`**.

Scripts:

- **`npm run test`** — unit project
- **`npm run test:sim`** — headless AbilityTest / sim project
- **`npm run test:all`** — both projects (full suite; CI / when the user asks)

Vitest discovery lives in `vitest.workspace.ts` (unit + sim). Root `vite.config.ts` keeps shared `globals` / `environment` / `setupFiles` only.

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
