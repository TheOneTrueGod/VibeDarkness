# Mission Objectives Popover

> **Implemented 2026-10-15 (automated, Sonnet workers).** Steps 1-6 built and checked by the orchestrator: lint 0
> errors, `tsc` clean, 73 test files / 531 tests green across `ui/`, `storylines/`, `game/managers/`. Kill switch:
> `OBJECTIVES_POPOVER_ENABLED` in `ui/components/objectivesPopover/objectivePresentation.ts`. `play:smoke` now presses
> the intro Start button (`scripts/testIds.mjs` mirrors the new ids). **Remaining:** the manual browser checklist (Step 7,
> last item); Playwright Chromium is not installed locally, so no browser run happened. Follow-up: `vitest --changed` /
> `related` fails with a pre-existing PARSE_ERROR.

Make objective changes impossible to miss. A centred objectives popover opens at mission start; the player clicks
**Start** and it shrinks and flies onto the existing objectives panel. When objectives change mid-mission, the popover
grows out of that panel, checks off the completed row, slides it out to the right like a cleared checklist item, fades
in the new rows, then flies back. On victory it opens one last time, crosses off the remaining rows, shows
"Victory", and fades into the victory modal.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`; its workflow is not
restated here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously**
(never in the background), waits for each to finish, then reports plan completion to the user. Each worker implements
**exactly one step**, checks its items off with a one-line summary, and **stops without spawning the next agent**.

Per-step verification: at most `npm run lint` (plus `npx tsc --noEmit` when the step crosses interface boundaries)
and **only the test files that step touches or creates**. Never run the full suite, whole directories, AbilityTests or
Playwright inside a regular step. The final step does that once.

Relevant project skills: `working-on-minion-battles`, `editing-and-creating-components`, `components-for-the-ui`,
`missions`, `hud-effects` (read its "Canvas boundary limitation"), `writing-nested-agents-files`, `scoped-testing`,
`playwright-e2e` (final step only).

## Findings that shape the design

- **The objectives list is not on the canvas.** `ObjectivePanel` is rendered by `app/js/components/GameScreen.tsx`
  (`chatTopContent`, at the top of the right-hand chat column), fed by `useBattleSidebarPolling` →
  `engine.getBattleObjectiveRows()` every 500 ms. The Pixi `hudContainer` is clipped to the canvas, so it **cannot**
  fly onto that panel. The popover must be a **DOM overlay portaled to `document.body`** (`position: fixed`), which
  can travel anywhere on screen.
- **Objective state** lives in `game/managers/ObjectiveManager.ts` (`completedIds` / `revealedIds`, checkpointed).
  `getDisplayRows()` returns revealed rows in def order with a `completed` flag. Victory is decided separately by
  `victoryCheck` level events, so the final objective may **not** be marked completed when victory fires.
- **Victory flow:** `engine.setOnVictory` → `BattleSession` → `BattlePhase` `onVictory` prop → `Game.tsx`, which
  either switches the phase to `post_mission_story` (BattlePhase unmounts) or opens `VictoryModal`. So the victory
  sequence has to finish **before** `onVictory` is forwarded.
- **On mobile/tablet** the chat column (and so the panel) can be closed, so the fly-to target may not exist.

## Design decisions (assumptions; flag to the user if wrong)

- **Presentation only, with no sim changes.** No new serialized state and no engine events. The UI diffs successive
  `getBattleObjectiveRows()` snapshots. That also covers non-host clients, reconnects and checkpoint restores without
  having to replay events.
- **Start does not pause the simulation.** In multiplayer, one player's popover must not stall everyone else. The
  intro is modal for **local input only**: it blocks clicks on the battle area until Start is pressed. Rounds already
  open waiting for orders, so in practice nothing runs before the player acts.
- **When the intro shows:** only on a fresh battle (engine `gameTick === 0` when the battle is ready), and only after
  any opening story pause (`storyPauseActive`) has ended. Dismissal is remembered in `sessionStorage`, keyed by
  `lobbyId + missionId`, so a page refresh does not replay it. Missions with no objectives skip the whole feature.
  A mission can opt out with a new optional `objectivesIntro?: false` on the mission def.
- **Mid-mission changes are not modal.** The popover ignores pointer input and closes itself after the sequence
  (about 2.5 s in total). Changes that land while a sequence is playing are **coalesced** into the next sequence
  instead of queueing many popovers.
- **Noise suppression:** while ITS preview or rewind is active (`interactiveTargetingState !== 'inactive'` or
  `rewindOverlay != null`), and when the engine instance is replaced (resync / restore), the presenter re-baselines
  silently instead of animating. Otherwise preview playahead would check off objectives that then get rewound.
- **Victory:** cross off every revealed row that is still incomplete (presentation only), show "Victory", then fade
  out while `VictoryModal` fades in. Total about 2.5 s; `BattlePhase` forwards `onVictory` when the sequence finishes,
  with a hard timeout fallback so a broken animation can never block victory. Defeat is out of scope.
- **Global kill switch:** `OBJECTIVES_POPOVER_ENABLED` (exported boolean constant, default `true`, in
  `objectivePresentation.ts`). When `false`, the presenter never leaves `hidden`, `playVictory()` resolves
  immediately, and nothing is portaled. The game behaves exactly as before this feature.
- **Fly target:** the panel registers its DOM element in a small reusable **HUD anchor registry**. If the anchor is
  missing (chat closed), the popover flies to the top-right corner of the battle canvas area instead.
- **Reusable pieces (engine, not feature):** the HUD anchor registry and the "anchored popover" flight primitive
  (centre ⇄ anchor rect, FLIP transform) are generic, so later features (quest updates, boss intros) can reuse them.
  The sequence logic is a pure reducer with tunable duration constants.

## Steps

### Step 1 — HUD anchor registry
- [x] Add `app/js/games/minion_battles/ui/components/hudAnchors.ts`: a module-level registry
  `registerHudAnchor(id, el)`, `unregisterHudAnchor(id)`, `getHudAnchorRect(id): DOMRect | null`, a
  `useHudAnchorRef(id)` ref-callback hook, and a `HudAnchorId` string-literal union starting with `'objectives'`.
  Add `hudAnchors.test.ts` (register, overwrite, unregister, missing id → null; stub `getBoundingClientRect`).
- [x] Register the panel: in `ObjectivePanel.tsx`, attach `useHudAnchorRef('objectives')` to the root element of
  **both** render branches. No visual change.
  - Done: `ObjectivePanel.tsx` calls `useHudAnchorRef('objectives')` and sets `ref` on both root divs.

### Step 2 — Pure sequence logic
- [x] Add `app/js/games/minion_battles/ui/components/objectivesPopover/objectivePresentation.ts` with:
  - `diffObjectiveRows(prev, next) → { newlyCompleted: string[]; newlyRevealed: string[]; removed: string[] }`.
  - A reducer `objectivesPopoverReducer(state, action)` and `initialObjectivesPopoverState`. Phases: `hidden`,
    `intro` (centred, awaiting Start), `docking` (flying to the anchor), `docked`, `expanding` (growing from the
    anchor), `checking`, `sliding`, `revealing`, `victoryCrossing`, `victoryText`, `fadingOut`. Actions: `showIntro`,
    `start`, `objectivesChanged(diff, rows)`, `victory`, `phaseElapsed`, `rebaseline(rows)`. The state holds
    `displayRows` (rows as presented, including rows mid-slide) plus a `pendingDiff` used for coalescing.
  - `OBJECTIVES_POPOVER_TIMINGS` (ms per phase), so tuning never touches the logic.
  - `export const OBJECTIVES_POPOVER_ENABLED = true;` with a doc comment ("set false to disable the objectives
    popover entirely; battle UI falls back to the plain sidebar panel"). Steps 4–5 must respect it.
  - Done: `objectivePresentation.ts` exports diff, reducer (state has `displayRows`, `latestRows`, `activeDiff`, `pendingDiff`; also `isVictoryPhase`, `isSequencePhase`, `victorySequenceDurationMs`), `OBJECTIVES_POPOVER_TIMINGS`, `OBJECTIVES_POPOVER_ENABLED` (reducer is a no-op when false).
- [x] Add `objectivePresentation.test.ts`: diff cases (complete, reveal, both, unchanged); full intro → start →
  docked path; mid-mission change runs expanding → checking → sliding → revealing → docking; a change arriving
  mid-sequence is coalesced; victory crosses off every incomplete row and ends in `fadingOut`; `rebaseline` while
  docked does not animate.
  - Done: `objectivePresentation.test.ts` added (9 tests, passing).
  - Handoff notes for Steps 3–5: use `activeDiff` to know which rows are checking / sliding / revealing. Dispatch
    `phaseElapsed` after `OBJECTIVES_POPOVER_TIMINGS[phase]` ms; `hidden`, `intro` and `docked` are untimed. The
    sequence skips `checking`/`sliding` when nothing was completed and `revealing` when nothing was revealed. A
    coalesced `pendingDiff` restarts at `expanding` with no fly-back. `rebaseline` keeps `intro`/`docking`/`hidden`
    and drops other non-victory phases to `docked`. When the constant is false the reducer is a no-op, so
    `playVictory()` in Step 4 must short-circuit and resolve immediately on its own.

### Step 3 — `ObjectivesPopover` component (anchored flight + row animations)
- [x] Add `ui/components/objectivesPopover/ObjectivesPopover.tsx`: a presentational component portaled to
  `document.body`, taking `state`, `onStart`, `onPhaseAnimationEnd` and `fallbackAnchorRect`. Flight is a FLIP
  transform: measure the centred card, read `getHudAnchorRect('objectives') ?? fallbackAnchorRect`, and animate
  `transform: translate(...) scale(...)` plus opacity with CSS transitions. Rows reuse the `ObjectivePanel` look
  (checkbox, label). The check animates in, the label gets a line-through, the slid row moves `translateX(110%)`
  and fades, new rows fade in, and "Victory" text fades in. A "Start" button appears in `intro` only. While modal,
  a translucent backdrop covers the battle area; otherwise the popover is `pointer-events: none`. Honour
  `prefers-reduced-motion` (swap movement for fades). Add `TestIds.objectivesPopover` and
  `TestIds.objectivesPopoverStart` to `app/js/testing/testIds.ts`. Follow `editing-and-creating-components` for
  Tailwind theme tokens.
  - Keep geometry math in a small pure helper (`computeFlightTransform(fromRect, toRect)`) in the same folder,
    with `objectivesPopoverGeometry.test.ts`.
  - Done: added `ObjectivesPopover.tsx`, `objectivesPopoverGeometry.ts` (+ 4-test file, passing) and the two
    `TestIds`. Lint (only the known warning) and `tsc` are clean.
  - Handoff notes for Steps 4-5:
    - Props: `{ state: ObjectivesPopoverState; onStart(): void; onPhaseAnimationEnd?(phase): void;
      fallbackAnchorRect: { left, top, width, height } | null }` (default export; `RectLike` is exported from
      `objectivesPopoverGeometry.ts`, and a `DOMRect` satisfies it).
    - Renders nothing for `hidden` and `docked` (the real panel shows) or when `OBJECTIVES_POPOVER_ENABLED` is false.
      Always mount it; it handles its own visibility.
    - `onPhaseAnimationEnd(phase)` fires at most once per phase entry, only for `docking`, `expanding` and
      `fadingOut`, on the card's CSS transitionend. It is an optional early-advance hint. The hook's
      `OBJECTIVES_POPOVER_TIMINGS` timers stay authoritative, so dedupe by phase so a phase never advances twice
      (the reduced-motion and `fadingOut` transitions are about 350-700 ms and can fire before or after the timer).
    - Timings: the flight CSS is 450 ms, matching `docking` 500 / `expanding` 400; tweak the timings if the
      motion looks clipped. The card measures its own centred rect via offsetWidth/Height, so no rect is passed in.
    - Only `intro` is modal: a full-viewport translucent backdrop (not just the battle area) with
      `pointer-events: auto`. All other phases are `pointer-events: none`.
    - Test ids: `TestIds.objectivesPopover` (card, carries `data-phase`) and `TestIds.objectivesPopoverStart`.
    - Not covered by an automated render test (no DOM test env for it); verify visually in Step 7.

### Step 4 — Presenter hook
- [x] Add `ui/pages/battlePhase/useObjectivesPresenter.ts`. Inputs: `sessionRef`, `engine`, `missionId`,
  `lobbyId`, `storyPauseActive`, `suppress` (ITS/rewind active). It owns the reducer; polls
  `engine.getBattleObjectiveRows()` on a short interval (about 250 ms); runs `diffObjectiveRows`; dispatches
  `objectivesChanged` or, when suppressed or the engine instance changed, `rebaseline`; advances phases with timers
  from `OBJECTIVES_POPOVER_TIMINGS`; implements the intro rules (fresh battle, after story pause, `sessionStorage`
  key, `objectivesIntro !== false`, has objectives). It returns `{ state, onStart, onPhaseAnimationEnd,
  playVictory(): Promise<void> }`. `playVictory` resolves when `fadingOut` ends or after a timeout of total timing
  plus 1 s.
  - Done: added `useObjectivesPresenter.ts` (also exports `objectivesIntroStorageKey`). tsc and lint clean.
  - Handoff notes for Step 5:
    - Call: `useObjectivesPresenter({ sessionRef, engine, missionId, lobbyId, storyPauseActive, suppress, objectivesIntro })`
      where `engine: GameEngine | null`, `missionId`/`lobbyId: string | null | undefined`,
      `suppress = interactiveTargetingState !== 'inactive' || rewindOverlay != null`, and
      `objectivesIntro = mission.objectivesIntro`. Returns `{ state, onStart, onPhaseAnimationEnd, playVictory }`,
      which map directly onto `<ObjectivesPopover state onStart onPhaseAnimationEnd fallbackAnchorRect>`.
    - `playVictory()` resolves immediately when `OBJECTIVES_POPOVER_ENABLED` is false or the mission has no
      objectives; otherwise it dispatches `victory` and resolves when the phase returns to `hidden` (or after
      victory timings + 1 s). Safe to call more than once; all callers resolve together.
    - Polling uses `sessionRef.current.getEngine() ?? engine`, so engine replacement re-baselines silently.
      The intro waits while `storyPauseActive`; it is skipped if `gameTick > 0`, the sessionStorage key is set
      (written on Start), or `objectivesIntro === false`.
    - `onPhaseAnimationEnd` advances early only if that phase is still current; the timer effect is keyed on
      phase, so it is cancelled when the hint advances first.
- [x] Add optional `objectivesIntro?: boolean` to the mission def type in `storylines/types.ts` (next to
  `battleObjectives`, with a doc comment). Run `npx tsc --noEmit`.
  - Done: `objectivesIntro?: boolean` added after `battleObjectives` in `storylines/types.ts`; tsc clean.

### Step 5 — Wire into BattlePhase and the victory hand-off
- [x] In `ui/pages/BattlePhase.tsx`: call `useObjectivesPresenter`, render `<ObjectivesPopover>` (fallback anchor =
  top-right of `battleCanvasAreaRef`'s rect), and wrap the `onVictory` passed to the session lifecycle so it awaits
  `playVictory()` before forwarding `(missionResult, exhaustion)`. Defeat stays unchanged. Keep BattlePhase edits
  minimal: put new logic in the hook, not inline.
  - Done: BattlePhase calls `useObjectivesPresenter` and renders `<ObjectivesPopover>` after `HudEffectCanvas`. Fallback anchor is a 240x80 rect at the canvas area's top-right (`getCanvasTopRightRect`, computed per render). `BattleSession` captures `onVictory` once, so the lifecycle gets a stable `useCallback([])` wrapper that reads `playVictoryRef` and the latest `onVictory` prop through refs (no session re-create); it forwards once (`victoryForwardedRef`) after `playVictory()`. `onDefeat` is untouched.
- [x] In `ui/components/VictoryModal.tsx`: make sure the modal enters with a short opacity fade (add one if missing),
  so the popover's fade-out hands off cleanly. Run `npx tsc --noEmit`.
  - Done: none existed; added `fade-in` animation/keyframes (0.4 s) to `tailwind.config.js` and `animate-fade-in` on the modal overlay. Lint (known warning only) and tsc clean.

### Step 6 — Docs
- [x] Add entries for `hudAnchors` and `objectivesPopover/` to `app/js/games/minion_battles/ui/components/AGENTS.md`
  (anchor registry: when to use it vs `registerHudFlightTarget`, which is canvas-clipped). Add the
  `ObjectivesPopover` line to the `components-for-the-ui` skill. In the `missions` skill, document
  `objectivesIntro`.
  - Done: `ui/components/AGENTS.md` gained an `objectivesPopover/` row plus a HUD anchors / popover section (anchor registry vs canvas-clipped `registerHudFlightTarget`, `OBJECTIVES_POPOVER_ENABLED` kill switch). `ObjectivesPopover` row added to `components-for-the-ui`, and `objectivesIntro` documented in `missions` (both `.claude/skills` and `.cursor/skills` mirrors).

### Step 7 — Final verification
- [x] `npm run lint` and `npx tsc --noEmit`.
  - Done: lint 0 errors (1 pre-existing warning), tsc clean.
- [x] `npx vitest run --changed master` (covers the new test files plus `ObjectiveManager.test.ts` and anything
  importing `ObjectivePanel` / `BattlePhase`).
  - Done: `--changed`/`related` hit a pre-existing vitest PARSE_ERROR (also at baseline before any edits), so ran
    `ui/`, `storylines/` and `game/managers/` directly: 73 files / 531 tests green.
- [x] AbilityTests: none added, since the sim is untouched (see below). Run `ObjectiveManager.test.ts` and any
  existing mission scenario with `battleObjectives` once, as a regression check that objective rows still report
  the same data.
  - Done: `ObjectiveManager.test.ts` green (3 tests) as part of the run above.
- [ ] Manual browser checklist
  - Browser pass (2026-10-16, in-app browser, Dark Awakening solo; the pane rendered at ~1 fps, so CSS motion was
    not observable; phases, inline target transforms and row states were verified instead):
    - OK: intro centred with backdrop + Start; backdrop blocks Wait; Start → docking → docked and writes the
      `sessionStorage` key; refresh / rejoin mid-battle does not replay the intro.
    - OK: change sequence (driven by dispatching the round-3 diff) expanding starts exactly on the sidebar panel
      (inline translate matches the anchor rect), checking ticks + strikes, sliding goes opacity 0 / `translateX(110%)`,
      revealing fades the new row in, docking flies back.
    - OK: real victory (engine `onVictory` callback) → victoryCrossing (only the open row) → victoryText → fadingOut;
      `VictoryModal` appears only after the popover is gone.
    - Fixed during the pass: (1) slid-off rows reappeared on docking and in the victory list → new `dismissedIds`
      state; (2) after a refresh the presenter stayed `hidden`, so later changes never animated → new `skipIntro`
      action (hook uses it when the intro is skipped). Reducer tests added for both.
    - Note: `animate-fade-in` (new in `tailwind.config.js`) is missing from the running dev server's CSS; restart Vite.
      A one-off Tailwind build confirms the config generates it.
    - Not checked: smooth flight motion by eye, chat-closed fallback anchor, reduced motion, 2 players.
  - Fresh mission with objectives: the centred popover shows, the battle area ignores clicks, and Start flies it
    onto the sidebar panel.
  - Refresh mid-battle: no intro replay. Mission without objectives: nothing shows.
  - Complete an objective that reveals another: expand from the panel, check, slide right, fade in the new row,
    fly back. Input keeps working throughout.
  - ITS preview that would complete an objective, then undo: no popover.
  - Victory (modal path and `post_mission_story` path): cross-off, "Victory", fade into the modal or story.
  - Chat column closed / mobile width: the popover flies to the canvas top-right corner.
  - `prefers-reduced-motion`: fades only.

## AbilityTest coverage

This feature is presentation-only: no engine, serialization or order changes. A new AbilityTest would therefore
only re-assert `ObjectiveManager` behaviour, which `ObjectiveManager.test.ts` already covers. Coverage instead comes
from the pure reducer and diff tests (Step 2), the geometry test (Step 3), and the final manual and Playwright
checklist. If a later change adds engine-side objective events, add one high-level scenario then: "complete
objective A → B revealed → victory", asserting the event order.
