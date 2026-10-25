# Plan: Break Up BattlePhase.tsx (1469 → ~450 lines)

> **Completed 2026-07-09.** All implementation steps (1–10) done plus pressure-valve extractions; **uncommitted**. `BattlePhase.tsx` is **495 lines** (down from 1469). Full CI: **889 tests passed**, lint 5 / tsc 3 (pre-existing baseline). Manual browser checklist still needs a human pass.

## Context

`BattlePhase.tsx` is 1469 lines and mixes three layers: React UI, minion_battles game logic (ITS click resolution, battle bootstrap sequencing), and glue between them. Goal: get the main file below 500 lines, moving game behaviour out of React (into `game/`) and UI behaviour into co-located hooks/components — a behavior-preserving refactor, plus one architectural upgrade requested during review: a **WebRTC provider layer** around the app that owns peer state (last event per peer, with the tick it was sent for) instead of ghost-plan state living ad-hoc in `App.tsx`.

**Conventions (verified):** decomposed pages get a co-located camelCase folder (`ui/pages/battlePhase/`) holding PascalCase components, `use*.ts` hooks, and camelCase pure helpers. Headless game interaction logic lives in `game/interaction/` with co-located `.test.ts`.

**Key architectural decisions:**

- `sessionRef` / `netRef` stay owned by `BattlePhase` and are passed into hooks. The lifecycle hook populates them; polling hooks read them lazily. Avoids circular hook dependencies; behavior-identical.
- WebRTC peer state moves to an app-level provider. `BattlePhase` keeps only what needs session access: the outbound ghost-plan builder and the ITS render policy.
- Approved scope: game-layer bootstrap extraction (Step 10) and new targeted tests.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Read
`.claude/skills/jp-implement-plan/SKILL.md` — the **invoking agent is the sole orchestrator**;
it spawns one worker per step **synchronously** (never background), waits for each to finish, then
reports plan completion to the user. Each worker implements exactly one step, checks items off
with a one-line summary, and **stops without spawning the next agent**.

Relevant skills: `working-on-minion-battles`, `editing-and-creating-components`, `game-engine`,
`game-sync-data-flow`, `webrtc-lobby-mesh`, `scoped-testing`, `ability-tests` (final step only).

Rules for this plan:

- Move code **verbatim** where the spec says "preserve exactly" — this is a refactor, not a rewrite.
- Read every file listed in a step's **Touches** line before writing code.
- Per step: `npm run lint` (fix errors), `npx tsc --noEmit` when the step crosses interface boundaries, then **only** the specific test files the step touches or creates (see each step).
- Never run the full suite or AbilityTest scenarios inside a regular step — those run once in the final step.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary beneath the item.
- Preserve all **Traps** (below) — do not "fix" Strict Mode deps, handler capture, or phase ordering.

---

## Part 1 — App-level WebRTC provider layer (Step 4)

Today `App.tsx` handles the mesh inline: creation/dispose effect (~385–453), `updatePeers` phase gate (~455–461), `onPeerEvent` dispatch (ping → flash; `ghost_plan_update` → `setGhostPlans`), re-broadcast of the current ghost plan on peer connect, `webRtcPeerConnected` / `webRtcReady` state, and a minimal `GhostPlanContext`. This all moves into a provider.

**New:** `app/js/contexts/PeerStateStore.ts` (~60 lines) — framework-free class:

- `recordInbound(eventType, peerId, payload, tick)` → stores `{ payload, tick: number | null, receivedAtMs }` as last state per `(eventType, peerId)`
- `clearPeer(peerId)` — on peer disconnect (preserves today's `ghostPlans[id] = null` semantics)
- `recordOutbound(eventType, payload, tick)` / `getOutboundForResend()` — generalizes today's `currentGhostPlanRef` re-broadcast-on-connect behavior
- `getPeerStates(eventType)` returning `Record<peerId, ReceivedPeerState>`

**New:** `app/js/contexts/WebRtcMeshContext.tsx` (~200 lines) — `WebRtcMeshProvider` (forwardRef) + context:

- Props: `{ enabled, lobby, player, sendSignal, peerIds, onTransientEvent, children }`. App computes `peerIds = gameStarted ? Object.keys(players) : []`.
- Owns (moved verbatim where possible): mesh create/dispose effect keyed on `[lobby, player, ...]` mirroring today's deps; `onPeerEvent` dispatch; peer connect/disconnect handling; `__vibeTestWebRtcPing` dev helper.
- Context value: `{ ready, peerConnected, peerStatesByType, broadcastPeerState, sendTransientEvent }`.
- Imperative handle: `{ handleSignal, sendTransientEvent }` — for App's `WEBRTC_SIGNAL` poll routing and ping callback.
- Wire format: outbound ghost-plan events become `{ type: 'ghost_plan_update', plan, tick }` (tick is additive).

**Edits:** `App.tsx` (~90 lines removed), `GameScreen.tsx` reads context instead of props, delete `GhostPlanContext.tsx`, point `BattlePhase` ghost reads at new context (mechanical rename — 100 ms builder stays in place until Step 5).

---

## Part 2 — New files for BattlePhase decomposition

### Game layer (headless, no React)

| File | ~Lines | Source |
|------|--------|--------|
| `game/interaction/itsCanvasInput.ts` | ~130 | BattlePhase ~1012–1100 |
| `game/battleBootstrap.ts` | ~140 | BattlePhase ~667–847 |

### UI layer — `ui/pages/battlePhase/`

| File | ~Lines | Role |
|------|--------|------|
| `useBattleRoundState.ts` | 120 | Round/pause/waiter/card state + non-rewind session-event branches |
| `useBattleNetSyncState.ts` | 150 | ~14 sync-status states + all `net.on(...)` wiring |
| `useBattleSessionLifecycle.ts` | ~120 | Mount-once effect minus rewind/round dispatch; exports `BattleInitPhase` |
| `useBattleDebugBridge.ts` | 145 | Debug bridge + 100 ms snapshot/synchash poll |
| `useBossHudPolling.ts` | 95 | Boss HUD 100 ms poll |
| `useBattleGhostPlans.ts` | ~70 | Outbound 100 ms builder; consumes `WebRtcMeshContext` |
| `useInteractiveTargetingProgress.ts` | 75 | 50 ms ITS poll + AUTO_END_TURN auto-commit |
| `useRewindOverlay.ts` | 95 | Overlay state + fade timers + frame capture |
| `useInteractionManagerBridge.ts` | 85 | Ability mode state, manager UI mirror, keydown |
| `battlePhaseTargetingState.ts` | 75 | **Done** — targeting ref snapshot |
| `turnIndicatorState.ts` | 35 | **Done** — turn indicator props |
| `InteractiveTargetingControls.tsx` | 95 | **Done** |
| `RewindOverlay.tsx` | 40 | **Done** |
| `OrderSubmitFailedBanner.tsx` | 25 | **Done** |
| `BattleLoadingScreen.tsx` | 25 | **Done** |

### Rewind cross-cut composition (in BattlePhase body)

Hook order: `roundState` → `itsProgress` → `ghost` → `rewind` → `sync` → `lifecycle`, then:

```ts
const handleSessionEvent = (ev, session) => {
  if (ev.type === 'sequential_targeting_rewind') {
    ghost.setPeerGhostPlansVisibleAfterRewind(true);
    rewind.captureAndFade(session);
    return;
  }
  roundState.handleSessionEvent(ev, session);
};
```

The lifecycle hook stores `onSessionEvent` in a ref reassigned each render.

### Stays in `BattlePhase.tsx` (~450 lines)

Refs (`sessionRef`, `netRef`, canvas refs, `targetingStateRef`); resync/lobby effects; sidebar/HUD polling; canvas callbacks; portal; JSX tree. Pressure valve if over budget: extract sidebar polling and lobby-host-log into small hooks.

---

## Traps (must-preserve behaviors)

| # | Trap |
|---|------|
| T1 | Strict Mode double-mount: `effectAlive`, `tearDownNetForAbortedLoad`, `cleanupRef` chaining, eslint-disable + `[]` deps move verbatim. Effect captures first-render prop values — do not "fix" with refs. |
| T2 | Handler capture: `wireNetEvents`, `captureAndFade`, `handleSessionEvent`, `setPeerGhostPlansVisibleAfterRewind` must be render-stable or dispatched through a per-render-updated ref. |
| T3 | `onPhase('ready')` must stay synchronous and immediately precede `startEngine()`. |
| T4 | `targetingStateRef`: render-body assignment (not an effect). Initialize with fresh object per mount via `createEmptyTargetingState()`. |
| T5 | Shared refs in interval closures: `adminMovePendingRef`, `abilityModeByAbilityIdRef`, `autoCommitItsAttemptedRef`, `updateCardStateRef`. |
| T6 | Heartbeat listener order: three separate `net.on('heartbeat', ...)` + non-host fingerprint — keep registration order identical. |
| T7 | Unmount cleanup order: `effectAlive=false` → `cleanupRef.current()` → `unsub()` → `session.destroy()` → `sessionRef.current=null`. |
| T8 | Final `bumpOrderPipeline()` after `net.start()` uses handle from `wireNetEvents`. |
| T9 | Portal: abilityBar + `createPortal` fallback stay in main file. |
| T10 | `playerTileRefresh` must return from hook to trigger re-renders. |
| T11 | Mesh recreate cadence: provider effect keeps object-identity deps on lobby/player; bootstrap `updatePeers` call and comment move with it. |
| T12 | Ghost-plan lifecycle: disconnect clears peer state; connect re-sends only non-null outbound; unmount broadcasts null. |
| T13 | Wire format: add `tick` to `ghost_plan_update`; keep `plan` field name. |
| T14 | Ping flash stays in App — HTTP PING fallback via poll handler; provider forwards mesh pings via `onTransientEvent`. |

**Follow-up (do NOT change now):** `isAdmin` and `canSubmitOrders = true` look vestigial; `_isWaitHovered` is write-only — leave as-is.

---

## New tests

| File | Coverage |
|------|----------|
| `game/interaction/itsCanvasInput.test.ts` | Pure `resolveItsSelectTargetForClick`: lock-on beats pixel; `allowMiss !== false` pixel fallback; no resolution when no candidates and `allowMiss === false`; clamp applied; melee order-target list. Use tiny-battle harness like `targeting.lockOnLunge.test.ts`. |
| `app/js/contexts/PeerStateStore.test.ts` | Last-state-per-peer overwrite; tick + `receivedAtMs`; `clearPeer`; outbound resend snapshot (null not re-sent). |
| `ui/pages/battlePhase/turnIndicatorState.test.ts` | **Done** — table-driven over nested ternaries. |

Everything else is a pure move: tsc + existing suites + smoke suffice.

---

## AbilityTest coverage (final step only)

No new AbilityTest scenarios required — this is a behavior-preserving refactor. Final manual smoke covers ITS click/right-click, ghost plans, rewind overlay, boss HUD, debug bridge. If regressions appear during smoke, add a targeted scenario then — do not pre-emptively.

---

## Step 1 — Leaf components

**Touches:** `ui/pages/battlePhase/BattleLoadingScreen.tsx`, `OrderSubmitFailedBanner.tsx`, `RewindOverlay.tsx`, `InteractiveTargetingControls.tsx`, `ui/pages/BattlePhase.tsx`

- [x] Extract the four leaf components and wire them into `BattlePhase` (both loading early-returns, order-submit banner, rewind overlay, ITS pill/buttons).
  Created `ui/pages/battlePhase/` with all four components; `BattlePhase` imports them and replaces inline JSX (~120 lines removed). `REWIND_OVERLAY_FADE_MS` exported from `RewindOverlay.tsx`.

**Verify:** `npx tsc --noEmit` + app smoke (battle loads, ITS controls visible during targeting).

---

## Step 2 — Pure helpers

**Touches:** `ui/pages/battlePhase/turnIndicatorState.ts`, `turnIndicatorState.test.ts`, `battlePhaseTargetingState.ts`, `ui/pages/BattlePhase.tsx`

- [x] Extract `turnIndicatorState.ts` with table-driven test; replace inline `TurnIndicator` ternaries.
  `computeTurnIndicatorProps` + 6-case `it.each` test; `TurnIndicator` props wired from helper after early returns.
- [x] Extract `battlePhaseTargetingState.ts` (`BattleTargetingState`, `createEmptyTargetingState`, `computeTargetingState`); wire `targetingStateRef` render-body assignment.
  Targeting ref type and compute logic moved; render-body assignment preserved (T4).

**Verify:** `npx tsc --noEmit` + `npx vitest run app/js/games/minion_battles/ui/pages/battlePhase/turnIndicatorState.test.ts`

---

## Step 3 — Game layer: ITS canvas input

**Touches:** `game/interaction/itsCanvasInput.ts`, `game/interaction/itsCanvasInput.test.ts`, `ui/pages/BattlePhase.tsx`

- [x] Create `itsCanvasInput.ts`:
  - `handleItsCanvasClick(session, screenX, screenY): boolean` — returns true iff `session.interactiveTargeting.isActive` (swallows click whenever ITS is active, even if engine/camera/waitingSignal missing — preserve exactly). Uses `resolveClick`, `getSelectTargetDefsFromTimings`, `resolveSelectTargetLockOnCandidates`, `clampSelectTarget`, `buildMeleeSelectOrderTargets` from `abilities/targeting.ts`, then `its.resolveTarget(...)`.
  - `handleItsCanvasRightClick(session, screenX, screenY, shiftKey, ctrlKey): boolean` — movement re-input via `buildPlayerMovePathThroughWaypoints` + `its.resolveMovement`. Ctrl/non-ctrl branches differ only by `moveTargetPixel` — preserve verbatim, don't merge.
  - Export pure `resolveItsSelectTargetForClick(abilityDef, caster, selectDef, mouseWorld, clickWorldPos, collectedTargets, engine)` (no camera/session) for testing.
  Extracted verbatim from BattlePhase ~1012–1100; handlers return true whenever ITS is active.
- [x] Shrink `BattlePhase`'s `handleCanvasClick` / `handleCanvasRightClick` to ~6 lines each: try ITS handler, else fall through to `getInteractionManager()?.onCanvasClick(...)`.
  Both callbacks now delegate to `handleItsCanvasClick` / `handleItsCanvasRightClick`; removed unused targeting imports (~90 lines removed).
- [x] Add `itsCanvasInput.test.ts` for `resolveItsSelectTargetForClick` (tiny-battle harness).
  Five cases: lock-on beats pixel, pixel fallback, allowMiss false → null, range clamp, melee order-target list.

**Verify:** `npx tsc --noEmit` + `npx vitest run app/js/games/minion_battles/game/interaction/itsCanvasInput.test.ts`

---

## Step 4 — WebRTC provider layer

**Touches:** `app/js/contexts/PeerStateStore.ts`, `PeerStateStore.test.ts`, `WebRtcMeshContext.tsx`, `App.tsx`, `components/GameScreen.tsx`, delete `contexts/GhostPlanContext.tsx`, `ui/pages/BattlePhase.tsx` (mechanical ghost context rename only)

- [x] Create `PeerStateStore.ts` + unit test.
  Framework-free store: inbound/outbound last-state, clearPeer null semantics, getOutboundForResend skips null; 4 Vitest cases.
- [x] Create `WebRtcMeshContext.tsx` (`WebRtcMeshProvider` forwardRef, context, imperative handle).
  Mesh lifecycle, onPeerEvent dispatch, connect resend, dev ping helper, bootstrap updatePeers (T11); context exposes ready/peerConnected/peerStatesByType/broadcastPeerState/sendTransientEvent.
- [x] Rewire `App.tsx`: remove mesh lifecycle effects, ghost state, `GhostPlanContext.Provider`; wrap return in `<WebRtcMeshProvider>`; route signals/ping through ref handle. Move bootstrap `updatePeers` call + comment (T11).
  ~90 lines removed; WEBRTC_SIGNAL → ref.handleSignal; onPing → ref.sendTransientEvent; peerIds derived from game phase.
- [x] Update `GameScreen.tsx`: read `peerConnected` and `ready` from context (replace props).
  useWebRtcMeshOptional for pingEnabled + effectivePlayers merge; dropped webRtcPeerConnected/pingEnabled props.
- [x] Delete `GhostPlanContext.tsx`.
- [x] Point `BattlePhase` ghost-plan **reads** at new context (`peerStatesByType['ghost_plan_update']`); keep 100 ms outbound builder in place for now (moves to hook in Step 5). Add `tick` to outbound wire format (T13).
  ghostPlans derived from peerStatesByType payloads; broadcastPeerState(..., engine.gameTick) on 100 ms interval.

**Verify:** `npx tsc --noEmit` + `npx vitest run app/js/contexts/PeerStateStore.test.ts app/js/games/minion_battles/game/interaction/itsCanvasInput.test.ts` + **two-client smoke:** ally ghost plan visible during targeting, ping flash both ways, WiFi-off icon on tab close, ghost plan reappears after auto-reconnect.

---

## Step 5 — Independent hooks (order-independent)

**Touches:** `ui/pages/battlePhase/useBossHudPolling.ts`, `useBattleDebugBridge.ts`, `useInteractiveTargetingProgress.ts`, `useBattleGhostPlans.ts`, `useRewindOverlay.ts`, `ui/pages/BattlePhase.tsx`

- [x] Extract `useBossHudPolling.ts` — 100 ms poll; module-level `buildBossHudSlice` / equality fns.
  Module-level `buildBossHudSlice` + `bossHudSlicesEqual`; hook returns `{ bossHud }`.
- [x] Extract `useBattleDebugBridge.ts` — global declare block, debug bridge, 100 ms snapshot/synchash poll, `adminMovePending` sync.
  Window declare + bridge registration + snapshot poll + admin-move sync moved verbatim.
- [x] Extract `useInteractiveTargetingProgress.ts` — 50 ms ITS poll, AUTO_END_TURN auto-commit, `playerTileRefresh`, `getItsPlayaheadTicks`. Keep `[activeLocalWaiter]` dep.
  Returns ITS state, tile refresh bump, playahead getter, and `autoCommitItsAttemptedRef`.
- [x] Extract `useBattleGhostPlans.ts` — outbound 100 ms builder (from BattlePhase ~290–318), `renderGhostPlans` memo + held-peer refs + reset effect (~158–187). Consumes `WebRtcMeshContext`; `broadcastPeerState('ghost_plan_update', plan, engine.gameTick)` on change; cleanup broadcasts null. Returns `{ renderGhostPlans, setPeerGhostPlansVisibleAfterRewind }`.
  Full ghost render policy + outbound builder; unmount null broadcast preserved (T12).
- [x] Extract `useRewindOverlay.ts` — overlay state, fade timers, `captureAndFade(session)`; exports `REWIND_OVERLAY_FADE_MS` (remove duplicate export from component if hook owns timing).
  Hook owns fade constant; `RewindOverlay.tsx` imports it; mount effect uses refs for T2 handler capture.
- [x] Wire all five hooks into `BattlePhase`; remove corresponding inline state/effects/intervals.
  ~280 lines removed from BattlePhase; hook order its → ghost → rewind → debug → boss HUD.

**Verify:** `npx tsc --noEmit` + `npx vitest run app/js/games/minion_battles/game/interaction/itsCanvasInput.test.ts` + app smoke.

---

## Step 6 — useInteractionManagerBridge

**Touches:** `ui/pages/battlePhase/useInteractionManagerBridge.ts`, `ui/pages/BattlePhase.tsx`

- [x] Extract ability mode state+ref, manager UI-state mirror, push `canUseOrderUi`/`waitingForOrders`/`myAbilityIds`/`modeResolver`, keydown handler (~993–1037, ~1215–1223).
  New hook owns ability-mode state/ref, manager UI mirror subscription, config push effect, keydown listener, and `handleCycleAbilityMode`.
- [x] Wire into `BattlePhase`; remove inline ability-mode / keydown logic.
  BattlePhase calls hook after `canUseOrderUi`; ~55 lines removed; `hoveredAbility` stays in main file for timeline preview.

**Verify:** `npx tsc --noEmit` + app smoke (card select, ability modes, keybinds).

---

## Step 7 — useBattleNetSyncState

**Touches:** `ui/pages/battlePhase/useBattleNetSyncState.ts`, `ui/pages/BattlePhase.tsx`

- [x] Extract ~14 sync-status states + all `net.on(...)` wiring (~756–824) into hook returning sync state + `wireNetEvents(net, session): { unsubscribe, bumpOrderPipeline }`.
  New hook owns 15 sync states, resync-inform dismiss, `onBattleNetResyncingChange` effect, and `initialHeartbeatCheckedRef`.
- [x] Keep all ~15 registrations in current order incl. `initialHeartbeatCheckedRef` + non-host fingerprint check (T6). Must be render-stable.
  `wireNetEvents` is `useCallback([isHost])`; heartbeat trio + fingerprint listener order preserved verbatim.
- [x] Replace inline `net.on` block in mount effect with `const wired = wireNetEvents(net, session)`; cleanup calls `wired.unsubscribe()`.
  Mount effect uses `wired.unsubscribe()` + `wired.bumpOrderPipeline()` after `net.start()`.

**Verify:** `npx tsc --noEmit` + `npx vitest run app/js/games/minion_battles/game/battlenet` + two-client smoke.

---

## Step 8 — useBattleRoundState

**Touches:** `ui/pages/battlePhase/useBattleRoundState.ts`, `ui/pages/BattlePhase.tsx`

- [x] Extract round/pause/waiter/card state + non-rewind session-event branches into hook with `handleSessionEvent(ev, session)`.
  New `useBattleRoundState` owns round/pause/waiter/card/storyPause/orderSubmitFailed state, `updateCardStateRef`, and non-rewind session dispatch.
- [x] Compose rewind dispatcher in `BattlePhase` body (cross-cut with ghost + rewind hooks from Step 5).
  `handleSessionEvent` composes rewind → ghost + rewind hooks, then delegates to `roundState.handleSessionEvent`.
- [x] Lifecycle hook will consume composed `handleSessionEvent` via ref (Step 9).
  `handleSessionEventRef` updated each render; mount-once `session.subscribe` calls ref (T2).

**Verify:** `npx tsc --noEmit` + app smoke (turns, pause, rounds, teamwork toast).

---

## Step 9 — useBattleSessionLifecycle

**Touches:** `ui/pages/battlePhase/useBattleSessionLifecycle.ts`, `ui/pages/BattlePhase.tsx`

- [x] Move mount-once effect (~582–871) minus rewind visuals & round dispatch; export `BattleInitPhase` type from hook file.
  Verbatim mount-once load/teardown moved to `useBattleSessionLifecycle.ts`; exports `BattleInitPhase`.
- [x] Hook takes `wireNetEvents` from Step 7, `onSessionEvent` ref pattern (T2), all bootstrap props; returns `{ battleInitPhase }`.
  Hook accepts `wireNetEvents`, `onSessionEventRef`, bootstrap props, refs; returns `{ battleInitPhase }`.
- [x] Delegates sequencing to `runBattleBootstrap` (Step 10) once that exists — for this step, inline sequencing may remain inside the hook if Step 10 is not yet done; **prefer completing Step 10 immediately after** so the hook calls `runBattleBootstrap` from the start.
  Inline `runLoad` sequencing kept in hook until Step 10 extracts `runBattleBootstrap`.
- [x] Preserve T1/T7 cleanup order verbatim.
  `effectAlive` flag, `tearDownNetForAbortedLoad`, `cleanupRef` chaining, mount-once `[]` deps, and unmount order unchanged.

**Verify:** `npx tsc --noEmit` + Strict Mode dev smoke (double-mount abort — no orphaned BattleNet polling); host + non-host load; reconnect-from-checkpoint.

---

## Step 10 — game/battleBootstrap.ts

**Touches:** `game/battleBootstrap.ts`, `game/battleBootstrap.test.ts` (if practical), `ui/pages/battlePhase/useBattleSessionLifecycle.ts`

- [x] Extract async `runLoad` sequencing from lifecycle hook into `runBattleBootstrap({ session, net, api, missionId, playerId, isHost, players, characterSelections, initialGameState, isAlive, onPhase, wireNet, registerCleanup, onFatalMissingSeed })`.
  Headless `runBattleBootstrap` in `game/battleBootstrap.ts`; exports `BattleInitPhase` + wire result type; lifecycle passes `netRef`, `isAlive`, and chained `registerCleanup`.
- [x] Owns: `tearDownNetForAbortedLoad`, `logInit`, `fetchBattleAssets` → checkpoint bootstrap → `session.load` fallback → `wireNet` → `registerCleanup` → host `saveInitialState` → `onPhase('ready')` → `startEngine()` → `net.start()` → final `bumpOrderPipeline()` (T3, T8).
  Verbatim sequencing moved; abort checks after each await; T3 order preserved in test.
- [x] Update lifecycle hook to delegate to `runBattleBootstrap`.
  Hook creates session/net, then `void runBattleBootstrap(...)`; cleanupRef chaining via `registerCleanup` callback.
- [x] Add `battleBootstrap.test.ts` for abort-between-awaits teardown with fake session/net, if practical.
  Four cases: happy path, post-fetch abort teardown, missing battleSeed, T3 phase→startEngine order.

**Verify:** `npx tsc --noEmit` + full multiplayer smoke.

---

## Step 11 — Final verification

- [x] `npm run ci` (lint + full suite + tsc) — zero new failures vs baseline.
  889 tests passed; lint 5 / tsc 3 match pre-existing baseline (AlphaWolfStoryEmitter, 006_core_awakening, desyncDebug scripts, itsLobbyLog, interactiveTargeting.test).
- [x] Confirm `(Get-Content BattlePhase.tsx).Count` **< 500** (or `wc -l` on Unix).
  **495 lines** — pressure-valve hooks (`useLobbyHostChangeLog`, `useBattleSidebarPolling`, `useHudEffectCanvasBridge`, `useBattleHudPanelsPolling`) + `BattleAbilityBar.tsx`.
- [ ] **Manual browser checklist** (host solo + dev Strict Mode):
  - Battle loads through all init phases.
  - SelectTargetDef ability: click resolution + right-click movement re-input.
  - ITS pill Reset/Replay/Continue.
  - Rewind overlay fades on sequential targeting rewind.
  - Boss HUD updates on a boss mission.
  - Debug console bridge (heal/kill/move unit).
  - No orphaned BattleNet polling after mount/unmount cycles.
  - Two-client: ghost plans, ping flash, disconnect icon, reconnect re-broadcast.

---

## Step dependency graph

```
1 → 2 → 3
         ↓
         4 → 5 → 6
              ↓
         7 → 8 → 9 → 10 → 11
```

Steps 7→8→9→10 are **sequential** (each reshapes the big mount effect). Step 4 must precede Step 5 (ghost hook consumes new context).
