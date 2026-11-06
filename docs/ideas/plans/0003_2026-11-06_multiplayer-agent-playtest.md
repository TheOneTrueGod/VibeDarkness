# Multiplayer agent playtest: issues and tooling

Running log of an orchestrated two-player co-op run. Two Claude sessions each drive one browser tab: `stormy` (testuser_a, Rocks + Storm Core and the full Storm tree) and `rocky` (testuser_b, Charged Rocks + Earth Core, with Craft Bone Claws, Stone Tomb and Digging Claws). The goal is to play A Dark Awakening, Investigate the Wildlife (a side quest of three lobbies) and Displacer in co-op. Along the way it records where the agents struggle, which console tools they needed, and any desyncs, softlocks or hardlocks found and fixed. The plan is updated as the run goes.

- **Low:** a few changes to a few files.
- **Medium:** overhauls a small subsystem.
- **Large:** touches many parts of the code and likely needs a data migration.

Baseline: the read-only `window.__minionBattlesPlaytest` bridge (`ui/pages/battlePhase/usePlaytestBridge.ts`) exists. There are no console tools for menus, lobbies or orders. The user's own PHP backend was not running when the run started, so it was restarted from the orchestrating session.

---

## P0: Blockers found during the run

### [x] P0.1 Browser pane sessions share one cookie jar
**Complexity:** Low (worked around; no code change)
- Every Claude session's built-in browser pane shares cookies, and cookies ignore the port. The two sessions had logged in on `localhost:5174` and `localhost:5175`, but both tabs ended up as whichever user logged in last (`testuser_a`).
- Workaround: each player uses a different hostname. Player A uses `http://localhost:5173`, and player B uses `http://127.0.0.1:5176` (`vite-dev-ip` in `.claude/launch.json`). Cookies are keyed by host, so the logins stay separate.
- Recorded in the **session-testing** skill.

---

### P0.2 Non-admin test characters can't see their loadout
**Complexity:** Low
- Non-admins see only the Mission Map tab. The Equipment tab is admin-only, and Upgrades needs the `SystemUpgrades` account knowledge (`accountKnowledge.ts`). So a test player can't check what it's playing with.
- Done for this run: both accounts were given `SystemUpgrades` on disk, and the loadouts were checked server-side with `resolveCharacterLoadout`. Pitfall: account `knowledge` is a keyed map (`{ SystemUpgrades: { acquiredAt } }`). A JSON array silently does nothing.
- Proposal: a read-only `__mbAgent.loadout()` that reports the resolved abilities of the open character, using the same resolver battle setup uses.

### P0.3 Chapter 2 targets need chapter 1 cleared, and non-admins can't skip chapters
**Complexity:** Low
- Displacer and Investigate the Wildlife sit on the chapter 2 map, after `core_awakening` and the Surface Quest banks (`WorldOfDarkness.ts` edges). Skip Chapter is admin-only (`MissionMapChapterBar.tsx`).
- Plan for this run: play A Dark Awakening in co-op, then move both saves forward on disk.

### [x] P0.5 False full resync at battle start (non-host, tick 0)
**Complexity:** Low
- Lobby DA8A43, player 21 (non-host): `equal-tick fingerprint mismatch vs heartbeat (non-host) — full resync` at tick 0 with `localLatestFpHead: null`. The client's fingerprint ring was still empty when the first heartbeat (`hostTick` 0) arrived. `HeartbeatTerminalReconciler.reconcileFingerprintsEqualHostTick` fell through to its last branch and requested a full resync for "no local row". Every recovery tier failed, and the page reloaded (`runDesyncRecovery: all recovery tiers failed; reloading page`). The battle then recovered from the tick 1 snapshot.
- Checked: the client's tick-0 state matches the host's. `desyncDebug-diffSnapshot` against the tick 1 snapshot shows only one tick of play, and the client's seed 4956160 advances one LCG step to the host's 3941814329.
- Fix: a missing local row (or a row for a different tick) waits with `waiting_for_host` and compares on the next tick. It resyncs only after `BATTLE_NET_T2_RESYNC_POLLS` polls with still no row. A real disagreeing row still resyncs immediately. Tests are in `HeartbeatTerminalReconciler.test.ts`.
- Follow-up: why did every recovery tier fail at tick 0 (no checkpoint yet)? Recovery at tick 0 should be able to rebuild from the lobby's setup data instead of reloading.

### P0.4 Dark Awakening's weapon choice overwrites a better weapon
**Complexity:** Low
- The `dark_awakening_weapon` choice (`001_dark_awakening.ts`) runs `equip_item` for Rocks `001` or Stick `002`. For rocky it replaced Charged Rocks `011` in the saved character. On a replay, a veteran character loses its upgraded weapon. The prep screen also showed "Throw Charged Rock" in the lobby while the battle used `earth_core_throw_rock` after the choice, which confused the agent.
- Restored `011` on disk after the run.
> [!DECISION] Should story `equip_item` choices skip characters that already hold a higher-tier item for that slot?
> - Skip when the slot already holds a same-family upgrade (ItemDef `tier`): keeps veterans' gear; the choice becomes flavour for them.
> - Keep the current behaviour (always equip): tutorial missions stay deterministic.
> Recommendation: skip by tier, and grey the option out with "you already have better" in the choice UI.

### P0.6 The orchestrator can send about 10 cross-session messages per user message
**Complexity:** Low (process, not code)
- Claude Desktop pauses session-to-session messages after about 10 sends without a user message in the orchestrating session ("looks like sessions messaging each other automatically"). Turn-by-turn orchestration of two players hits this within one mission.
- Options: the user nudges the orchestrator periodically; batch more turns into each instruction (players self-drive N turns and report); or give each player a self-driving loop on the console tools, with only checkpoint reports.
- **Outcome:** with the message cap, the panes rendering only while their session is on screen (P0.8), and the stopped servers (P0.7), the two-session setup needed the user's input every few minutes. The user switched the rest of the run to the headless two-player driver, `scripts/playtest-multiplayer.mjs`. It now supports `PLAYTEST_ACCOUNTS=session` (the session-testing accounts, with A hosting) and `PLAYTEST_LOBBY=CODE` (rejoin an existing lobby). It logs desync, resync and recovery console lines per player. Chromium can't start inside the agent sandbox, so the user runs it from their own terminal (jp-playtest Step 0).

### P0.7 Dev servers stopped by the app mid-run
**Complexity:** Low (process, not code)
- At 09:30 UTC the app stopped all three preview servers started from the orchestrating session (PHP 8000, Vite 5173 and Vite 5176), and the run sat idle for about 7 hours. Player A came back to a blank, hidden pane, and navigation was "denied or failed". Nothing on the player side said the server was gone.
- Restarted with `preview_start` (php, vite-dev, vite-dev-ip). Lobby DA8A43 survived on disk.
- Proposal: before each burst, the orchestrator runs a `curl` health check on 5173, 5176 and 8000 (`preview_list` shows "stopped by the app"). Player briefs say: "navigate failed, so report a server-down; don't retry".

### P0.8 A hidden or minimized page stalls the battle (and a host stalls everyone)
**Complexity:** Medium
- `GameEngine.loop` runs only on `requestAnimationFrame`, and `frameTime` is capped at 0.1s. When a browser hides a page (a minimized window, a background tab, or a hidden Claude browser pane), rAF stops or drops to about 1 Hz. The simulation then freezes or runs at about 10% speed. In co-op the host drives the ticks, so a host who minimizes freezes the battle for every player. That looks like a softlock.
- Seen in the run: player B's pane was hidden (`innerHeight` 0). The canvas collapsed, and `__mbAgent.click` reported the ability card covered by the BattleCanvas container. The desktop app window was minimized too, so the orchestrator couldn't bring the panes on screen.
- A session's browser pane renders only while that session is on screen. When the user opened the orchestrator's session, both player panes dropped to rAF 0 mid-mission. Fix for the run: `open_session_in` with target `window` pops each player session out into its own window, so both stay rendered.
- Tooling added: `await __mbAgent.env()` reports viewport, visibility, measured rAF/s and `healthy`. `click` now refuses with a clear message on a 0-height viewport. It also tries several inner points before calling the card covered, and scrolls off-screen targets into view.
> [!DECISION] How should the engine keep ticking while the page is hidden?
> - Worker-clock fallback: while `document.hidden`, drive `fixedUpdate` from a Web Worker `setInterval` (not throttled like main-thread timers) and skip rendering. Keeps the host authoritative and on time.
> - Pause and tell others: a hidden host broadcasts "host tabbed out" and peers show it instead of looking frozen. Cheap, but co-op still stops.
> Recommendation: the worker-clock fallback, plus a "host is in the background" banner when the heartbeat shows the host's tick rate dropping.
- **Fix applied (worker-clock fallback, not yet verified in a real browser):** `game/loopClock.ts` starts a Web Worker timer (or `setInterval` where there is no Worker) at 50 ms. When no loop has run for 250 ms, `GameEngine.onLoopClock` steps `loop` on each beat until a real animation frame arrives again. `requestLoopFrame` keeps only one rAF pending. The simulation stays identical, because the fixed-step accumulator is the same either way. Tests in `GameEngine.loopStall.test.ts`: ticks advance with rAF never firing, one pending frame at most, stop() halts the fallback, and no double stepping while rAF runs. The engine, interaction and battlenet suites pass (537 tests), and `tsc` is clean. The "host is in the background" banner is still open.

### [x] P0.9 The host dropped every running-tick fingerprint after the first ITS restore
**Complexity:** Low
- `BattleNet` built its `FingerprintBatcher` without `getCurrentEngineEpoch`, so the batcher compared every canonical token against epoch 0. The first ITS restore bumps the session timeline's `engineEpoch`. After that, every non-paused fingerprint the host queued was "stale" and dropped (`diag: queueFingerprint skipped (stale or missing token)`, with tokenEpoch 1/3/5 vs currentEpoch 0). In DA8A43, `fingerprints.jsonl` held only paused ticks. A mid-round divergence (P0.10) could only be noticed at the next pause, and couldn't be located afterwards.
- Fix: pass `getCurrentEngineEpoch: () => session.getTimeline()?.engineEpoch ?? 0`, the same way `SnapshotPersistence` already did. The test is in `BattleNet.test.ts` ("fingerprint queue epoch"), and the battlenet suite passes (315 tests).

### P0.10 Desync: the host's ITS in-place commit diverged from the canonical replay of the same order
**Complexity:** Medium
- DA8A43, tick 259, Playwright run 2026-11-06T16-57-41: the host (unit_2) cast Dodge (`0101`) with ITS. The mark was 258, and the target was its own position (544.34, 349.91). The preview ran 258 → 284 and was committed **in place** (`commitMode: in_place`, persisted `atTick` 259).
- Host state at 288 (`snapshots/288.json`): unit_2 at (543.33, 349.25). That's exactly where a replay *without* the dodge has it at tick 262. So the host's unit drifted for 3 ticks (crowd spacing) before the dash claimed its movement.
- Joiner, applying the persisted order at 259: unit_2 never moved from (544.34, 349.91). Its dodge ended earlier, it formed the next order pause at 285 instead of 289, and it hit `paused behind host tail — forcing full resync` at 284. Snapshot recovery (tier 2) fixed it in about 4s, and the fingerprints matched afterwards.
- Hypothesis: during the select pause, the host's ITS preview advanced (or applied the queued order) a few ticks later than the mark+1 it persists, so the in-place-committed timeline isn't the timeline every other client replays. Non-host commits always roll back and replay, which is why only the host diverges.
- Next step: an ability-test-style headless repro. Host ITS in-place commit of a Dodge versus `applyOrder` of the same `{atTick: 259}` order, comparing per-tick fingerprints. Note that `replay-battle` from snapshot 258 did not apply the 259 order at all, which needs checking too.

### [x] P0.12 Desync: restoring a snapshot mid-cast dropped every in-flight sustained cast behaviour
**Complexity:** Medium
- **Root cause of most desyncs in this run.** A sustained cast behaviour (a lunge, dash or beam) keeps its per-tick record in `Unit.activeCastBehaviours`, which was runtime-only. Its data lives in `ActiveAbility.castBehaviourPayloads`, and its setup marker in `setupFiredBehaviourKeys`; neither was in `unitToJSON`. The record is only created when the cast enters its timing interval. So any engine restored from a snapshot taken mid-window simply stopped running that behaviour, while the engine that never restored kept running it. That covers ITS rollback (every non-host commit restores its mark), checkpoint resync and rejoin.
- Found from DA8A43 tick 1235. The joiner's tick history held both its live ITS preview (it matched the host's fingerprints through 1293) and its post-rollback re-run from mark 1235. The re-run's wolf `unit_15` was on the last tick of its Dark Wolf Bite lunge. Live, it lunged about 4 px per tick and shoved stormy; restored, it barely moved. The fingerprint split at 1245, and the client hit the resyncs at 1293 and 1345 ("all recovery tiers failed; reloading page"). The same mechanism plausibly explains P0.10 and the later divergences at 1849, 2081 and 2187.
- Fix (engine-wide, for every sustained behaviour):
  - `castBehaviourStateSerialization.ts` serializes `castBehaviourPayloads`, Set/Map-safe, since dash payloads carry a `hitIds` Set. It also serializes `setupFiredBehaviourKeys`.
  - `unitFromJSON` flags restored units with `castBehavioursNeedRehydrate`.
  - On the first cast tick after a restore, `rehydrateSustainedCastBehaviours` (`unitAbilityTick.ts`) rebuilds the records of behaviours whose setup fired and whose window and interval hadn't ended. It doesn't re-run `onSetup`. Live engines never take this path.
- Test: `game/snapshotMidCastBehaviour.test.ts` plays Dark Awakening until an enemy is mid-lunge, restores a copy from `toJSON`, and requires identical unit positions for 30 ticks plus the same fingerprint. It fails without the fix (the restored wolf freezes at 450.0 vs 454.17) and passes with it.

### [x] P0.14 Hardlock: the host never saw an end-turn order that replaced a fetched draft
**Complexity:** Low
- Lobby 83C3E9 (Investigate the Wildlife, mission 1) froze at tick 420 for 14 minutes. Both clients were alive, and the host showed "TESTUSER_B'S TURN".
- Sequence:
  - rocky right-clicked a move, which sent `wait` with endTurn:false, a draft (2d7e616d). It then pressed Wait, which sent `wait` with endTurn:true (54ead977).
  - The host's poll fetched and applied the draft.
  - `mergeFinalizedPendingForBatch` then dropped the draft from pending and appended the final row to applied.
  - The heartbeat's `ordersRecordCount` was a *line count* across pending and applied. It stayed at 15, and clients only refetch when it rises, so the host never saw the end-turn order.
- Right-click-then-Wait is the normal human flow, so this can freeze real games. It's the counter half of the earlier lobby E7F4B2 fix, which made merges drop drafts.
- Fix: `BattleStorage::getOrdersRevision` is a monotonic counter in `orders_revision.json`, bumped on every append, every merge that changes the streams, and every prune. Lobbies from before it existed seed it from the line count. The heartbeat serves it under the same `ordersRecordCount` key, so clients needed no change. Test: `php backend/tests/BattleStorageOrdersRevisionTest.php`, and the existing overlay test still passes.
- Verified live: bumping 83C3E9's revision to 16 un-froze the battle (421 → 726 within a minute).

### P0.15 The joiner forms an order pause the host doesn't (same fingerprint up to the pause)
**Complexity:** Medium (open)
- 83C3E9, tick 838, with P0.12 in: the joiner's history matches the host's fingerprints on every canonical tick. That includes each post-restore re-run (789–813, then 817–838 three times); only discarded ITS playahead ticks differ. Even so, the joiner paused waiting for orders at 839 while the host ran on to 841, and the joiner hit `paused behind host tail — forcing full resync`. A soft-align ("host expects local player at earlier batch") ran just before, at about 816.
- So this isn't a sim divergence the fingerprint can see. Pause *formation* differs: the joiner forms a waiter the host doesn't, likely from order-queue state such as a stale optimistic own order or a staged row after the soft-align, rather than unit state.
- Next step: dump `orderMgr.pendingOrders` and `waitingForOrders` on both sides at the pause (add them to the "recent tick history" debug dump), and reproduce soft-align followed by the next batch in a BattleNet test.

### P0.16 A client with no unit in the battle resyncs in a loop (and the joiner was left out)
**Complexity:** Medium (open)
- Displacer with Playtest Vitality (lobby 9A0775, 30 min, ticks 0 → 13046): `applied_orders` holds orders for **one** player unit only, the host's `unit_1`. The joiner (21) went through character select but has no unit in the battle; it took 0 turns.
- As a spectator it paused at every host batch (`waiterUnitIds: ["unit_1"]`). The host was already 2–4 ticks ahead with its order applied, and the joiner hit `paused behind host tail — forcing full resync` within the 3-poll grace, about every 250 ticks. It logged 150 sync events, and four of those episodes ended in "all recovery tiers failed; reloading page".
- Two things to fix:
  - Why the joiner wasn't in the battle: probably a race between its Ready and the host's start, since Displacer has no pre-battle story to wait on.
  - A non-host that waits only on *other* players' orders should fetch and apply them rather than resync. This "behind host tail" path probably also feeds P0.15.

### P0.13 Recovery tiers fail when early fingerprints are missing
**Complexity:** Low (follow-up)
- At 1345 and 2081, the tier-1 checkpoint bootstrap didn't align: it bootstrapped from the host's newest checkpoint, which may have been saved mid-ITS. Tier 2 then took its "first mismatch" from fingerprint history (759, from before the P0.9 fix, when the host had almost no fingerprints). It loaded snapshot 685, replayed to 1320, failed again, and reloaded the page. Recheck once P0.9 and P0.12 are in, since both inputs to the tier choice were bad in this lobby.

### P0.11 The driver retried a target prompt it couldn't answer, a 7-minute softlock
**Complexity:** Low (driver)
- The joiner's `0537` asks for a "Rock" target. The driver clicked the enemy, gave up after 30 ITS steps, pressed Undo, and picked `0537` again on every turn. Host and joiner sat at tick 1085 until the 15-minute budget ran out. The game itself was fine: the host was correctly waiting on the joiner's order.
- Fix: the driver now skips an ability for the rest of the battle once its prompt fails, logs the prompt label, and tries the next ability.
- Also seen: the joiner logged one React "Maximum update depth exceeded" error during the run (source not yet found).

---

## P1: Agent tooling requests

### [x] P1.1 `window.__mbAgent` DOM console
**Complexity:** Low
- `app/js/testing/agentConsole.ts`, installed in dev from `main.tsx`. Lists visible `data-testid` controls with their disabled reasons, and does native-event `click`, `clickButton`, `fill` and `waitFor`. React handlers run exactly as for a mouse.
- Why: player B's `read_page` and `find` returned an empty accessibility tree in the pane. The agent fell back to raw `javascript_tool` selectors, and had to split each click and read into separate calls to avoid "page navigated" errors.

### [x] P1.2 Battle canvas input on the playtest bridge
**Complexity:** Low
- `__minionBattlesPlaytest.input` (`usePlaytestBridge.ts`) has `clickWorld`, `rightClickWorld`, `hoverWorld`, `clickUnit` and `rightClickUnit`. They dispatch native pointer, click and contextmenu events on the battle canvas at the camera's screen point for a world position, and focus the camera first if the point is off-screen. Orders still go through BattleCanvas, targeting and ITS, `submitPlayerOrder` and `BattleNet.submitOrder`.

### [x] P1.4 `__mbAgent.click` must hit-test like a mouse
**Complexity:** Low
- The first version called `el.click()` on the test-id element. Battle ability cards put `data-testid` on a wrapper `<div>` (`RowSlotAbilities.tsx`) and the `onClick` on the inner `AbilitySlot`, so the click bubbled up and never reached the handler. Both agents' first casts silently did nothing.
- Now `click` takes `document.elementFromPoint` at the element's centre and sends pointerover, pointerdown, mousedown, pointerup, mouseup and click to the topmost element there. If that element is outside the target (a tutorial, modal or overlay), it throws and names the cover instead of clicking through.

### [x] P1.5 ITS preview ticks look like rollbacks to agents
**Complexity:** Low
- Both agents read `snapshot().tick` during interactive targeting and saw it jump (B: 1 → 24 → 1; A: 119 → 78, with "damage gone"). ITS runs the live engine ahead as a preview, then restores to the mark on commit. A reported it as a possible desync rollback.
- `snapshot().its` now carries `InteractiveTargetingSession.getDiagState()`: active, markTick, and lastRestore with from/to ticks. Both helps say that `tick` is a preview tick while `its.active` is true.
- `input.castAt(abilityId, unitId)` (async) clicks the card and then the unit once per target prompt. It's a macro of the real clicks, added because the two-click ITS flow was fiddly.
- Declined: a `selectAbility` shortcut that calls the card handler directly. It would skip the real click path.

### [x] P1.6 Small tool fixes from burst 3
**Complexity:** Low
- The `data-disabled-reason` on battle ability cards was the `DisabledReason` object, so the agents saw `[object Object]`. It now reads `<reason_id>: <title>` (`RowSlotAbilities.tsx`).
- `castAt` now waits up to 6s for the first target prompt. Stone Tomb takes about 3s to raise "Tomb location", and clicks before that were ignored.
- Players can't SendMessage back once they hit their own 10-send cap. Now they end each burst with the report as their final message, and the orchestrator reads it with `list_events`. A "stall" A reported at tick 207 was really B going quiet after hitting its cap.

### P1.7 The battle layout breaks below about 900px wide
**Complexity:** Medium
- In an 885x766 pane, the battle canvas shrank to 245x475 and the ability row was laid out at y≈1059, below the viewport inside an `overflow-hidden` container. Neither a human nor `__mbAgent.click` could reach the cards. The side columns (players and chat) take most of the width.
- Workaround for the run: `resize_window` 1440x900 (scaled to fit).
- Proposal: below a breakpoint, collapse the chat column into a drawer, and give the bottom ability row a fixed height so the canvas shrinks instead of the row overflowing.

### [x] P1.8 Playtest Vitality: a disabled research node so autoplay survives long runs
**Complexity:** Low
- The autoplay lost Ember at the Threshold and Displacer to plain attrition, which cut sync testing short. At the user's request, the disabled (admin-only) Training node `playtest_vitality` grants +1000 Max Health and heals 100 Health at each round start.
- New engine stat: `PassiveStatKey.HealthRegenPerRound`, labelled "Health Regen / Round". It's read by `Unit.getHealthRegenPerRound()` and applied in `unitRoundStart` through `applyHeal` with no heal-penalty injury. Any future node, item or Darkness bag can use it. Tests are in `game/units/healthRegenPerRound.test.ts`.
- Granted on both test saves as an `Admin` research source (`researchTrees.training`, levels and sources). `computePassiveBonuses` on the saves gives maxHealth +1000 and healthRegenPerRound +100.

### P1.9 The driver's ITS handling gives up on abilities while a parallel batch is open
**Complexity:** Low (driver)
- In Displacer, the host's driver marked `throw_rock` and `1301` (Arc Bolt) "unanswerable" after 30 ITS steps. Those prompts are plain target picks. ITS stays active while the other player's order for the same batch is outstanding (`assumedRemoteWait`), and the driver reads that as a failed prompt, so its skip list grows until little is castable.
- Proposal: in `driveIts`, treat "target picked and the preview is waiting on a remote order" as success; only skip an ability when `waitingForTargetInput` is still set after the clicks.

### [x] P1.3 Test ids on the Join Mission form
**Complexity:** Low
- `join-lobby-code-input` and `join-lobby-by-code` (`JoinMissionPanel.tsx`, `testIds.ts` and `scripts/testIds.mjs`).

---

## P2: Hygiene

### P2.1 React warns about the `data-className` convention
**Complexity:** Low (13 files, plus the convention text in root `AGENTS.md`)
- Root `AGENTS.md` asks every component root to carry `data-className="<Name>"`. React logs "does not recognize the `data-className` prop" because the camelCase name isn't a valid data attribute. Agents read it as an error.
- Proposal: switch the convention to `data-component` (or lowercase `data-classname`), and replace it everywhere in one pass.

### P2.2 Equipment slots have no visible text
**Complexity:** Low
- On the Prepare screen, slots show only an icon. Both agents reported "empty Weapon and Core slots" while Rocks and the Storm Core were equipped. The aria-labels (`weapon: Rocks`, `core: Storm Core (locked)`) were right.
- Proposal: have `__mbAgent` read the slots, or add a `data-item-id` on `PrepEquipmentSlots` cells.

## Run log
- 2026-11-06: save files edited, servers started, sessions briefed.
- 2026-11-06: lobby DA8A43 (A Dark Awakening). Hosting took one `__mbAgent.click` per step, and the join by code worked first try (about 5s to land). Both loadouts in the lobby match the resolver.
- 2026-11-06: servers restarted (P0.7). Both players rejoined DA8A43 cleanly, at tick 1 with state intact. A came back via Join Mission by code in about 3s, and B via a direct /lobby URL. A saw one transient "Loading terrain..." screen that cleared in about 30s. Neither could act: `__mbAgent.env()` showed a 0x0 viewport and rAF 0/s in both panes (P0.8), because the desktop window was minimized. A's `rightClickWorld` and B's card click never registered. Added `input.debugHit(x, y)` at A's request. The tutorial skip is `__mbAgent.clickButton('Skip tutorial')`.
- 2026-11-06: panes shown, and real turns started. Ticks: A (host) cast Arc Bolt ×2 (1, 74) and Chain Lightning (152, chained to a second wolf). B cast Throw Rock (1) and Stone Tomb (about 75–150; the counter went 2/2 → 1/2, and wolf unit_3 died). No desync, resync or recovery lines, and no spinner over 1.4s. Host reload at tick 206 (while it was B's turn): back in the battle in about 1s with identical state. That's a clean host-rejoin.
- 2026-11-06: first Playwright run (`tmp/playwright/playtest/2026-11-06T16-57-41-810Z`). Both players rejoined DA8A43 in 8s and played ticks 206 → 1085: host 15 attacks, joiner 18, and spinner p50 about 2.2s (joiner max 6.3s). Found P0.9, P0.10 and P0.11. Desync tooling: 16 events, including the old tick-0 resync (fixed in P0.5), a tick-131 "pause plane structural divergence" from the earlier session, the tick-284 divergence (P0.10), and a tick-760 soft-align after the driver's Undo (it recovered).
- 2026-11-06: Playwright run 2 crashed on a page navigation, so the driver now survives reloads and skips `0537` by default.
- 2026-11-06: Playwright run 3 (`2026-11-06T17-22-25-932Z`) won **A Dark Awakening**: host victory in 538s (ticks 1085 → 2200). The code at that point had P0.9 but not P0.12. The joiner diverged at 1293, 1345, 1849, 2081 and 2187; two of those ended in "all recovery tiers failed; reloading page", and the driver rode out both reloads. P0.12 was found from this run.
- 2026-11-06: finish run. Both players rejoined DA8A43 and reached victory, and both saves now record **A Dark Awakening: victory**. The driver had been stopping the joiner the moment the host won, so the joiner never got to the victory popover's Continue and its result went unrecorded; the driver now gives the other players a 90s grace. Saves were then moved forward with adminGranted victories (towards_the_light through core_awakening, plus campsite_2), and rocky's Charged Rocks `011` was restored. `getUnlockedMissionIds` confirms Displacer, and the Investigate the Wildlife bank is open for both.
- 2026-11-06: **Investigate the Wildlife**, mission 1 (Ember at the Threshold, lobby 83C3E9), with the driver's new quest mode (`quest:<bankId>/<questDefId>/<n>`).
  - It hardlocked at 420; that's P0.14, fixed and verified live.
  - The joiner then hit P0.15 resyncs at 813, 838, 2476 and 2669; two of them ended in "all recovery tiers failed; reloading page".
  - It ended in **defeat** for both at tick about 2880. The enemy-clicking autoplay doesn't play to the "Find out what the creatures are doing" objective.
  - The driver also skipped rocky's `throw_charged_rock` as unanswerable.
  - Missions 2 and 3 were not reached.
- 2026-11-06: **Displacer** (lobby 364276).
  - The first attempt "lost" in 10s because the driver detected defeat by text, and the objective reads "Defeat the Displacer Spirit". `DefeatModal` now carries `data-testid="defeat-modal"`, which the driver uses.
  - The rerun was a real defeat at tick about 2170 (1071s): host 21 attacks, joiner 26.
  - The joiner hit one P0.15 resync at 726.
  - Spinner: host p50 2.1s, p90 4.9s, **max 14.5s**; joiner max 4.6s. The 14.5s host stall needs a look; check `spinnerSpans` against the persist backlog.
  - P1.9 driver skips also seen.
- 2026-11-06: **Displacer with Playtest Vitality** (lobby 9A0775). It survived the whole 30-minute budget (to tick 13046, no outcome). Host: 168 attacks, spinner p50 1.1s, p90 2.0s, max 6.6s, one reload survived. The joiner had no unit in the battle and resync-looped (P0.16), so this wasn't a real co-op run.
- **Run stopped here** to stay under the session-usage limit (about 80% of the 5-hour window used). Not done: Investigate the Wildlife missions 2–3 (mission 1 lost; the quest run is kept and can be retried) and a two-player Displacer clear. Next steps: P0.16 and P0.15 first, then rerun both with Playtest Vitality.
