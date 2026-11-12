# Project Notes for Claude

## Testing

Tests use **Vitest**, not Jest. Never use `npx jest` — it will fail.

After file create/save/delete, follow **`.cursor/rules/post-change-test-hook.mdc`**: `npm run lint:changed`, then the smallest named Vitest set. Decision tree: **`.cursor/skills/scoped-testing/SKILL.md`**.

Scripts:

- **`npm run test`** — unit project
- **`npm run test:sim`** — headless AbilityTest / sim project
- **`npm run test:all`** — both projects (full suite; CI / when the user asks)

Vitest discovery lives in `vitest.workspace.ts` (unit + sim). Root `vite.config.ts` keeps shared `globals` / `environment` / `setupFiles` only.

## Debugging behavior bugs

**Write a failing test first** before tracing code paths. Engine bugs show up as test failures. If the test passes, the engine is correct and the bug is in the BattleNet/UI layer. Deep static analysis of the engine is rarely the right first move for a "game isn't pausing" or "player can't act" report.

## Live app debugging

Read **`.cursor/skills/playwright-e2e/SKILL.md`** when checking the running app (lobby, battle, or UI).

Log in with the helper account in `.env.playwright.local` only (`PLAYWRIGHT_USERNAME` / `PLAYWRIGHT_PASSWORD`). Those credentials are for local debugging, including browser login. Use no other account. Do not commit that file or copy the password into notes, chat, or source.

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


## Frontend: component root `data-className`

When creating a React component, the top-level element it renders must have `data-className="<ComponentName>"` as its **first** attribute/prop, matching the component's name. This lets anyone inspecting the DOM trace a piece of UI back to the component that renders it.

```tsx
function QuestSlotList({ rows }: Props) {
    return (
        <ul data-className="QuestSlotList" className="flex flex-col gap-1">
            ...
        </ul>
    );
}
```

Apply this to new components and add it when you substantially edit an existing one; don't sweep-edit unrelated components just to add it.
