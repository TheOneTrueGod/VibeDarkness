# High level overview
This is a multiplayer turn based game.  Whenever a unit has no actions to perform, its turn is ready.  Actions can take different amounts of time, and can be interrupted by other units actions, so the duration of an action cannot be determined at the time it is started, and turns may happen in any order.  There can also be multiple units that have a turn at the same time, or one player controlling multiple units, and it's possible that one player (even the host) is spectating (they don't have a unit) instead of playing.
It's also possible for the host to change over the course of the game (in case the host disconnects)

There is a metagame aspect to this game.  This document is only concerned with the "mission" state.  Note that "mission" may include story segments, a battle, and an end story segment.  It is not guaranteed to have any or all of these -- for example, a valid mission could just be a story segment, or could be just a battle.

This document outlines the approach for synchronizing game state during battles as play progresses.

## Key Terms
| Term | Definition |
| "Server" | The backend. Holds the state of the game on disk. |
| "Host" | One of the players.  They are considered to have the authoritative state of the game. |
| "Client" | One of the non-host players.  They will still need to be able to submit orders, but cannot change the game state itself |
| "orders" | A set of instructions to a unit.  Can be given by players, by an AI system, or forced upon the unit by some game effect.  Usually contains a move target, and an ability. |
| "unit action" | A unit performs one (or more) actions as defined by an order.  An example could be "Use Ability <0001> on target <unitId>" |
| "Lobby" | holds all of the game state for an individual mission |
| "Heartbeat Loop" | A loop on the client side.  Fetch the current minimal game state, and compare the results to the previous heartbeat response / the expected game state on the client to compute when gameplay should resume or when a desync has happened |

## Key Classes

### BattleNet
Responsible for storing network state, handling async calls, doing automatic retries, and handles sync state.
Parent class of ClientBattleNet and HostBattleNet.  Should not be instantiated or used as is.
Holds behaviour that is reuseable across client and host

### ClientBattleNet extends BattleNet
Holds network behaviour specific to clients

### HostBattleNet extends BattleNet
Holds network behaviour specific to hosts

## Data Structures
### Lobby
Each lobby contains all of the data related to a single mission.
Each lobby has an ID (for example, 49FA79) which we will call the LobbyId.
Each lobby has a folder located in `storage/lobbies/<LobbyId>`.
Inside the lobby folder you'll fine the following;
- `lobby_state.json`.  Stores a variety of lobby details, such as choices made by the players.  (Legacy file:  `storage/lobbies/<LobbyId>.json`)
- `lobby_log.jsonl` which stores any logs that the clients send.  It is primarily used for debugging.
- `pending_orders.jsonl`.  Stores the uncommitted orders.
- `applied_orders.jsonl`.  Stores the orders that have been committed and applied by the game state.
- `snapshots/<tickId>.json`.  Stores each snapshot.

A lobby is primarily a backend concept.  The frontend is aware of them, and the organization of the game into lobbies, but it will load what it needs to.

### GameState
- Game state is stored in JSON format.  Game state is stored in snapshots, and in the `initial_state.json`.
- Hosts will post a new snapshot every time they reach a "pause" point.  We don't want to store more fidelity than that.
- Each gameState has a "gameTick", which represents how many gameplay ticks have passed.  The higher the game tick, the farther into the game we have progressed.  A game tick does not represent any specific unit of time.  Time may speed up or slow down over the course of a game, so we need a way to differentiate between "time passed" and "processing ticks passed".
- The game state that is stored on the server is implicitly paused (because the frontend host saves it when the game pauses), however, it's possible that as soon as the client loads the gamestate + pending orders, that the game will be ready to resume.
- Every game state can be hashed into a SHA fingerprint.  We will reuse the existing approach for generating fingerprints.  This should be done at the end of the tick, after everything else has been done.  For hosts, it should be done before the game state has been sent to the server.  It should be stored on the game state.
- SHA fingerprints are used for debugging, and checking desyncs
- Outside of that, we will not go into details about what is stored in the game state in this document.  This document is concerned with how we save & sync data, not with what that data is.

### Orders
Orders are stored in two places;  `pending_orders.jsonl`, and `applied_orders.jsonl`.
The orders inside of applied_orders are considered "canonical", and are part of the game playback.
Pending orders are those that have been submitted by clients or the host.  They may not be valid (Because the client is desynched and not aware of it), or a race condition could cause a pending order to be added, but the host is not aware of it by the time the turn starts.
The host will be responsible for telling the server to merge pending orders into applied_orders.
The server will be responsible for cleaning up pending_orders.  Whenever a new snapshot is submitted, check and see which pending_orders are not for the next tick.  Everything else should be deleted.  For example, if the host submits snapshot "132" (for gameTick 132), and there are pending orders for tick 112, 132, 133, and 145.  When the backend checks these pending orders, it should delete 112, 132, and 145.  This leaves only 133.  Since tick 132 is "completed", valid orders will be for tick 133.
An order should have a game fingerprint in it as well, to catch sync issues.  When doing the "cleanup" step listed above, if the tick the order is for doesn't have the correct hash, the order should be discarded.
When a client or host issues an order, it should get sent to the server to be stored in pending_orders.  Both should opportunistically assume the API call will be successful, but have appropriate error handling in case it isn't.
The server should allow pending orders for the "next" gameTick (determined by max(snapshot_ids) + 1), or ahead (in case a client is opportunistically ahead of the host).
A pending order should have a "finalized" state, so we can send partial orders to simulate what the player is thinking about to other players.
Each order should be unique for { playerId, unitId, gameTick }.
That means that if there's a pending order for { playerId: 1, unitId: 1, gameTick: 95 }, and another comes in for { playerId: 1, unitId: 1, gameTick: 95 }, it should override the existing one.

### "Minimal" current Game state at tick (Part of "heartbeat loop")
The minimal game state is used to avoid fetching the entire game state every tick.
It should contain enough information to determine if there has been a desync.  It should include;
- latestServerGameTick; The tick the server thinks the game is currently on -- the latest snapshot tick which represents the last completed game tick.
- latestServerGameHash
- gameTick; The requested tick.
- gameHash; The hash from the game at the requested tick
- pendingOrders;  The orders that have been queued up for the game.  MAY CONTAIN INVALID ORDERS.
- appliedOrdersAtTick; The orders that have been applied for the tick.  Will only contain valid orders.

## "Full Resync"
A full resync is a last resort that we use when we can't fix the game state locally.  It means something very similar to refreshing the page.
- Get rid of local game state
- Do a fetch for the "latest" game state
- - A fetch for the latest game state should also get the applied orders
- - Also get back the latest pending orders
- The game state is likely paused, but do a sanity check anyway just in case.

Note:  It's also possible to "Do a full resync on tick #".
This is primarily useful for playback -- we can say "Do a full resync from the first tick", and then with the orders & game state all merged in, we can watch the game replay itself.

Also note:  I'd like to experiment with automatically resuming after a resync, vs having the user choose to resume gameplay.  Have a constant to control this behaviour in the global constants.  When triggering a full resync at the start of the game, we always want it to autoplay.  When triggering a full resync during desync checks on a client with the constant enabled, we'll want to keep the "resynching" spinner showing, and add a "continue" button to it when the resync is complete, which will cause the game to either play out or not.  The goal is to indicate to the player that there has been a resync, so it's not unexpected.

## Heartbeat loop (normative)

The minimal-fetch loop polls `GET …/heartbeat` about every **500ms** while the battle tab is in the foreground. **Hidden browser tabs** use a slower interval (see **`HEARTBEAT_POLL_INTERVAL_HIDDEN_MS`** in `global_constants.js`) to reduce idle battery use; restoring the tab should trigger an immediate poll.

Polling must **never stack** overlapping requests for the periodic loop: schedule the next tick only **after** the previous heartbeat completes.

When to poll:

- **Host:** While **paused for parallel player orders** (`waitingForOrders`), **or** while there are **outbound deferred order POSTs** not yet flushed, **or** during **desync recovery**—so pending peer rows and merge outcomes stay visible without spamming requests while the sim runs freely alone.
- **Client:** While the **simulation would advance** if not blocked, **or** while **paused for parallel orders**, **or** while **deferring POSTs**, **or** during **recovery**—so merges, peer submissions, and “waiting for host” stalls remain observable while the client is paused for orders.

These rules supersede older wording below; they unify “poll while paused for orders”, “poll while catching up”, and the error-path requirement to **keep heartbeat going** during “waiting for host” stalls.

**Debug pause** (devtools / debug-console): pauses simulation for inspection only and **must not run** the periodic minimal-fetch loop until debug pause ends. Recovery and explicit one-shot polls may still run when needed.

### Implementation notes

File-level handshake, endpoints, and field names drift faster than this document—see **[`.cursor/skills/game-sync-data-flow/SKILL.md`](../.cursor/skills/game-sync-data-flow/SKILL.md)** for the current code map (`BattleNet`, `LobbyClient`, PHP handlers).

## Host Synching Calls
### "GET" calls
Since the host has the authoritative state of the game, its "read" flow should be pretty simple.
- On page load it does a full resync (this is true for all players)
- If the game is ready to resume (All units have orders) then it should let the game play out until it reaches the next pause state.
- Follow the **[Heartbeat loop (normative)](#heartbeat-loop-normative)** rules above for when to poll; when polling, use the minimal fetch cadence described there.

### "SAVE" calls
This part is a little more interesting.
When starting a new game, the initial game state should be sent to the server for snapshot 0.  This should happen after ALL initialization is done (game loaded, terrain added, units added, etc).
It is very likely that the game will be paused on tick 0, because there will be player units that need orders.  This isn't guaranteed though, as some missions may have forced orders, and some missions may delay the spawning of player units.
If the game isn't paused, then let it play out to the next pause state.
When the "minimal ping" returns sufficient applied + pending orders to start the next tick, the client should send a command to the server to merge the new pending orders it is applying into the applied orders.  Then the game should resume.  Assume that API call is successful, but it is imperative that this API call succeeds.  If it fails, then retry 3 times.  While it is retrying, orders should not be allowed to be submitted and the next game state should not be allowed to resume.  The game cannot continue until this API call is successful.  If the API call fails too many times, trigger a full resync.
When the game ends, the host should also save the game state with the end condition.
Since the host is saving the lobby state when the game is in a state to continue (which may or may not be when the host has issued orders), it will be able to handle cases where the host has no units, or is spectating.

### Desync concerns
Hosts definitionally can't desync, so we don't need to worry about it.

## Client Synching Calls
### "GET" calls
- On initial load, the client does a full resync
- If the game is ready to resume, then it should
- If the game is not (it should start paused) then leave it paused
- Follow the **[Heartbeat loop (normative)](#heartbeat-loop-normative)** rules (including polling while paused for parallel orders / waiting-for-host stalls). Do not queue overlapping periodic requests.
- If we get back enough applied orders to resume gameplay, then do so.

Non-host **`includePastApplied`**: the client sends it when behind the last observed host completed tick (including the “`hostTick` was 0 but local `gameTick` > 0`” bootstrap case), or when **`nonHostPastAppliedHeartbeatLatch`** is on—set after a poll observes post-merge **`engineTick < hostTick`** while the engine is paused for parallel order sync, and cleared when caught up (`engineTick >= hostTick` and not paused for order sync), on invalid **`hostTick`**, or at desync recovery entry. **`BattleSession.applyRemoteOrders`** dedupes each wire row by **`idHash`** or **`hashOrderId(playerId, atTick, order)`**; **`BattleNet`** updates **`appliedOrderIdHashes`** from the session apply outcome so skipped duplicates do not leave orphan hash entries.

### Optimistic playahead
When a client is the one to submit the last order needed for a turn, we want to allow for that client to optimistically assume the API call is going to succeed, and to let the game resume.  If the clients find out that something changed underneath them, then they'll need to roll back to the previous state and play out the game from there.  For more serious desyncs, we'll need to do a full resync.
In order to do this, we'll need desync detection logic.
Situation:  Game is waiting on orders from one unit;  Client B's last unit.
The game is in a confirmed synched state.  (If they're not, then orders should not be submitted, just held on the client side.)
Client B submits orders for the game state that would give all units valid orders.

Handling:  Battlenet should store the last known valid remote game state (This should be generic behaviour that happens as part of the synching logic)
- The client should optimistically merge the appropriate and valid pending actions into the applied actions
- The client should start playback immediately while they wait for the submit_orders call to finish

Case 1:  Submit Orders call fails
- This means the orders were rejected from being added to pending_orders on the server.  It means our orders submitted were invalid, or the game was already resumed for some other reason.
- There's not a whole lot we can do here without intervention, so trigger a partial resync (A "full resync from a specific tick")
- - Sync Status becomes "Desynched.  Reason: Optimistic Playahead orders rejected by server. <Rejection reason from server here>"
- - Since we are in a desynched state, the user should not be able to apply orders
- - Trigger a full resync from the last valid server game state.  We'll likely get orders and can resume the game from here, but it's also possible the API call was rejected for some other reason, and we'll need to resubmit orders.  Either way, we go back to a resynched state, and the user either gets to see the turn play out, or needs to resubmit orders.

Case 2:  Submit Orders call succeeds
- This means the orders were accepted by the server, but the host hasn't necessarily picked them up yet
- Start the heartbeat loop (fetch minimal state on the **[normative](#heartbeat-loop-normative)** cadence). **Do not** force the top-level sync terminal status to **"Waiting for host"** for the whole optimistic run — see **`optimistic_client_playahead`** below.

After the submit orders call succeeds, there will be a few different possible states we need to keep track of and check for, but in the golden path;
- The game will continue playing until it reaches a pause point
- The heartbeat loop will at some point (either before or after the above) update to a new tick
- After both of the above have completed, the heartbeat tick will match the paused game tick, and the heartbeat hash will match the paused game hash.  When this happens, the game state should be updated to "Synched".

#### Client ahead of host: two causes (normative)

Definitions:

- **Optimistic client playahead (benign):** `localEngineTick` may exceed heartbeat **`hostTick`** after the local player's orders were accepted and the client resumed simulation **assuming** the host will merge pending orders and advance storage. This is **not** a desync by itself.
- **True playback desync:** local deterministic playback diverged from what the host/storage will produce (bug, platform difference, etc.). The client cannot repair this locally; **full resync** is required.

**Benign optimistic playahead — sync UX**

- While the local sim is past **`hostTick`** but has **not** yet reached the next **parallel-order pause** (`waitingForOrders` / order-sync pause), terminal sync status should be **`optimistic_client_playahead`** (or equivalent UX: treat like **synced** for "sim is allowed to run" — not **waiting_for_host**).
- When the client **does** reach that pause while still ahead of the heartbeat tail, use **`waiting_for_host`**. In that state the client may still **select** orders locally, but **must not POST** them until the host timeline and heartbeat align (same cautions as before).

**True desync — detection (non-host)**

- When optimistic playahead **begins** (first poll where **`localEngineTick > hostTick`**), record an **anchor**: **`(anchorHostTick, anchorLocalTick)`** = `(heartbeat.hostTick, localEngineTick)` at that observation.
- If later **both** the heartbeat shows **`hostPaused`** and the local engine is **paused for parallel order sync**, **and** **`heartbeat.hostTick !== anchorHostTick`**, **`localEngineTick !== anchorLocalTick`**, **`heartbeat.hostTick !== localEngineTick`**, treat as **optimistic playback divergence**: log at **error** severity with ticks, fingerprints, pause flags, batch ids, `expectingFromPlayerIds`, and material heartbeat fields — then **full resync**.
- **Same tick, different fingerprint** (`localEngineTick === hostTick` but local ring hash ≠ `hostFingerprint`) is **not** classified under "ahead of host tail"; it is handled on the **equal-tick fingerprint reconcile** path (`reconcileFingerprintsEqualHostTick` → **`hash-mismatch`** resync), with structured logging.

**Stall while `waiting_for_host` (implementation)**

- If sync is **`waiting_for_host`** **and** the engine is paused for parallel orders **and** heartbeat **material** (`hostTick` + `hostFingerprint`) stays **unchanged** for **15 seconds** (wall clock), assume the host failed to apply/merge; **full resync** (`waiting-for-host-paused-stall`). This timer applies **only** in the post-pause **`waiting_for_host`** phase, not during free-running **`optimistic_client_playahead`**.

#### Heartbeat material change & reconcile (implementation)

- **Material change** on a poll means the pair **`(hostTick, hostFingerprint)`** from the minimal heartbeat **differs** from the previous poll’s pair (when both fingerprints were present). **`heartbeatSeq` alone is not sufficient** (mtime-based noise).
- When **`localEngineTick < hostTick`** and the material pair **changed** (or **`ordersRecordCount`** increased) while the local engine is **paused for parallel order sync**, the client treats it as **"server moved while we were stuck"**. The fix is staged:
  1. **Catch-up rescan first.** After {@link BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS} consecutive polls satisfying `(paused && hostTick - engineTick >= BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP && server-moved && engineTick-not-advancing)`, **`BattleNet`** forces a full **order rescan from tick 0** (`fetchAndApplyNewOrders({ rescanOrdersFromTickZero: true })`) so any rows the client missed at intermediate ticks are applied.
  2. **Resync escalation.** If the same conditions persist for {@link BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS} additional polls after the rescan (engine still paused and behind), escalate to **full resync** with reason **`stuck-paused-host-ahead`**.
- The general **"material changed while behind"** case (engine not paused for parallel orders, but tail moved past us) is still handled via the existing pause-plane and `behind-host-heartbeat-moved` paths; only the **stuck paused** branch is unified into the new staged rescan-then-resync flow.
- **Optimistic play-ahead vs clamped pause plane:** when **`localEngineTick > hostTick`** and the heartbeat still shows **`hostPaused`** (server completed tail clamped by snapshot `waitingForOrders.atTick`) while the local engine is **not** paused for parallel order sync, **`BattleNet` sets `optimistic_client_playahead`** and **does not** resync immediately — the server pause metadata may lag merges/checkpoints (e.g. spectator host). Heartbeat polling continues. Once the client hits a parallel-order pause in this regime, status moves to **`waiting_for_host`** as above.
- **Pause-plane transition:** the client also tracks a composite key of **`hostPaused`**, **`hostTick`**, **`hostFingerprint`**, **`orderBatchAtTick`**, and **`expectingFromPlayerIds`**. When that key **changes** vs the previous poll, **`BattleNet` re-checks** the local fingerprint ring at the new **`hostTick`** against **`hostFingerprint`**; a **mismatch** triggers **resync** (`pause-plane-transition-hash-mismatch`). When the host **clears pause** and fingerprints **agree**, sync can return to **`synced`**.
- Optional wire fields **`fingerprintTailTick`** / **`fingerprintTailFingerprint`** expose the **unclamped** max row in `fingerprints.jsonl` for debug; authoritative append / **`hostTick`** semantics stay clamped vs snapshot `waitingForOrders.atTick`.
- **Dual fingerprint echo (`?gameTick=N`).** The heartbeat handler echoes the row at the client-requested tick via **`requestedGameTick`** / **`requestedGameHash`** / **`requestedGamePaused`** (null when the client passes a sentinel like `'latest'` or no matching row exists). These are explicit add-on fields; the **authoritative latest completed tail** remains in **`hostTick`** / **`hostFingerprint`** / **`hostPaused`**. The legacy **`gameTick`** / **`gameHash`** echo fields are still returned for older clients but are equivalent to the new pair.
- **Past applied on heartbeat (`?includePastApplied=1`).** With numeric **`?gameTick=N`** (last completed local tick), when **`N < hostTick`** the response includes **`pastAppliedActions`**: applied rows for **`atTick >= N + 1`**, built from the same **`BattleStorage::getOrdersRangeSplit`** path as **`GET …/orders`** `appliedOrders` for that range (see **`BattleStorage::getAppliedOrdersRangeForWire`**). **`BattleNet`** sends **`includePastApplied=1`** only for non-hosts that detect they are behind the last observed host tail, and applies the payload through the same **`applyRemoteOrders`** + id-hash dedupe path as periodic **`GET …/orders`** fetches.

Nonstandard path to handle;
- It's possible that the game will finish playing out and reach the pause point 5 - 10 real-world seconds before the host does
- In this state, the client should be allowed to select orders, and the synching state should be **"Waiting for host"** (entered when the pause is reached — see above).
- As long as synching state is "Waiting for host", the client's orders should not be submitted to the server.  They should remain tracked on the client side.  This is because the game may yet become desynched, or something may have gone wrong with the host's connection.

**Current implementation note:** the live UI may temporarily hold both targeting and server POST when the host pause plane blocks (`blocking-host-pause-plane`) or when orders are deferred ahead of the host tick; detailed "select-only / stage-then-submit" behaviour is not fully split yet — see `BattleNet` + `BattlePhase` (`canUseOrderUi`). Server reject reasons are surfaced via `sync-details` where possible.

Error paths to handle;
- The game will reach a pause point, but the heartbeat loop will never update.
- - This indicates that the host never resumed, or ran into a problem.
- - After the game reaches its paused state, show a "Waiting for host" sync state with how many seconds have elapsed while waiting.
- - Keep the heartbeat loop going in this time
- - **Implementation:** if **`waiting_for_host`** persists while paused **and** heartbeat material (`hostTick` + `hostFingerprint`) is unchanged for **15s** (wall clock), **full resync** (`waiting-for-host-paused-stall`). Distinct from optional UI timing below.
- - After waiting for 5 seconds, a "reload" button should appear in the sync state box
- - After waiting for 20 seconds, change the colour of the sync state box to red.
- - At this point, we can keep waiting for the host, but it's unlikely they'll be catching up.  Something has probably gone wrong.  We'll leave the option of reloading up to the user, but the game can't proceed without the host, so we'll keep heartbeat looping until we hear back from them.
- - It's possible the host will change.  This will change the behaviour of the system.  For now, if that happens, let's throw a critical log, with a "TODO" note in it to handle this.
- The game will reach a pause point, and the heartbeat loop will update with a new tick + game Hash.
- - If either of them don't match with the client's game state, then we had a desync problem.  Trigger a full resync.  Log the issue with an error, the client tick, the client game state, and any other information to help track down the issue.
- - If there were any queued orders from the optimistic playahead, drop them.  They won't be valid anymore.
- The heartbeat loop will update with a new tick + game hash, but the client's game hasn't reached a pause point yet.
- - If the new heartbeat has a gameTick that's older than the client's gameTick, then we'll desync by the time we reach a pause point.  Trigger a full resync.
- - If the new heartbeat has a gameTick that's newer than the client's gameTick, then we may not have reached it yet.  Let the game continue forward until we either reach that tick and validate our game state, or until we pass it.

A very similar loop to the "Error paths to handle" will need to happen during regular playback when someone else has submitted the final order & the host merges it into applied orders.  We'll still need to do the heartbeat loop to compare with the game's gameTick.

### "SAVE" calls
The client primarily interacts with the server through the order system.
Client submits Order -> Server adds to pending orders -> Host reads pending orders and merges them into applied orders, and submits them to the server when applicable
