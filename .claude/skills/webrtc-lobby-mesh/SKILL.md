---
name: webrtc-lobby-mesh
description: WebRTC peer-to-peer data channel mesh between lobby players — connection lifecycle, signaling path, disconnect detection, auto-reconnect, and how it differs from HTTP polling. Use when working on WebRtcLobbyMesh, peer connection state, the disconnect indicator in PlayerPill, or any client-to-client real-time event (pings, future uses).
---

# WebRTC Lobby Mesh

## Purpose and scope

`WebRtcLobbyMesh` provides a **client-to-client** data channel mesh between players in a lobby. It carries low-latency events that don't need server authority — currently **ping flashes**; future uses could include cursor positions, voice signaling, etc.

**It is completely separate from HTTP polling.** All authoritative game state (orders, heartbeats, snapshots, fingerprints) flows through the HTTP layer described in `game-sync-data-flow`. WebRTC supplements it; it never replaces it.

---

## Connection lifecycle

### When connections are established

Connections are **not** created on lobby join. They are initiated when the game phase first enters `pre_mission_story`, `battle`, or `post_mission_story`. This is gated in `App.tsx`:

```ts
const gameStarted = phase === 'pre_mission_story' || phase === 'battle' || phase === 'post_mission_story';
webRtcMeshRef.current.updatePeers(gameStarted ? Object.keys(players) : []);
```

During `character_select`, `updatePeers([])` is called — no connections exist yet.

### Initiator determination

To avoid both peers sending offers simultaneously, the player with the **lexicographically lower** `playerId` is always the initiator:

```ts
const isInitiator = localPlayerId < remoteId;
```

### Signaling path

WebRTC signaling (offer/answer/ICE candidates) is relayed through the **HTTP lobby message system** — not a dedicated WebSocket:

1. Initiator sends `POST /api/lobbies/{id}/messages` with `type: 'webrtc_signal'`, `toPlayerId`, and `signal`
2. Receiving client polls `GET /api/lobbies/{id}/messages?after={lastId}` (via `GameSyncContext` every ~2.5 s)
3. App.tsx routes `WEBRTC_SIGNAL` messages to `webRtcMeshRef.current.handleSignal(fromPlayerId, signal)`

ICE candidates that arrive before `setRemoteDescription` completes are **buffered** in `PeerEntry.pendingCandidates` and flushed once the remote description is set.

---

## Disconnect detection

`onconnectionstatechange` fires on the `RTCPeerConnection`. When state is `'failed'`, `'closed'`, or `'disconnected'`:

1. `onPeerDisconnected(playerId)` callback fires → `App.tsx` sets `webRtcPeerConnected[id] = false`
2. `PlayerPill` renders a red WiFi-off icon for that player
3. `closeConnection(remoteId, intentional: false)` cleans up the connection and schedules reconnect

---

## Auto-reconnect

When a connection drops **unintentionally** (network glitch, tab backgrounded, etc.) and the peer is still in `lastKnownPeerIds`:

- A 3-second timer fires `updatePeers(lastKnownPeerIds)` — re-creating the dropped connection
- The timer is cancelled if `updatePeers` is called with a list that no longer includes that peer (i.e. they actually left the lobby)

When a player **hard-leaves** (closes tab, hard-redirect) and **rejoins** later:

1. Backend sends `PLAYER_JOIN` message
2. `App.tsx` updates `players` state
3. The `updatePeers` effect in App.tsx fires → re-creates the peer connection

---

## Key files

| File | Role |
|------|------|
| [`app/js/WebRtcLobbyMesh.ts`](app/js/WebRtcLobbyMesh.ts) | Peer connection management, signaling, data channels, auto-reconnect |
| [`app/js/App.tsx`](app/js/App.tsx) | Feature flag (`ENABLE_WEBRTC_LOBBY`), mesh lifecycle, `webRtcPeerConnected` state, game-phase gate on `updatePeers` |
| [`app/js/components/GameScreen.tsx`](app/js/components/GameScreen.tsx) | Accepts `webRtcPeerConnected`, merges into `effectivePlayers` |
| [`app/js/components/PlayerPill.tsx`](app/js/components/PlayerPill.tsx) | Renders WiFi-off icon when `player.isConnected === false` |
| [`app/js/MessageTypes.ts`](app/js/MessageTypes.ts) | `WEBRTC_SIGNAL` message type and `Messages.webrtcSignal()` helper |
| [`backend/Http/Handlers/PostMessageHandler.php`](backend/Http/Handlers/PostMessageHandler.php) | Server-side relay of `webrtc_signal` messages |

---

## `WebRtcLobbyMeshOptions` API

```ts
interface WebRtcLobbyMeshOptions {
    localPlayerId: string;
    sendSignal: (toPlayerId: string, signal: Record<string, unknown>) => void;
    onPeerEvent?: (fromPlayerId: string, event: Record<string, unknown>) => void;
    onPeerConnected?: (playerId: string) => void;    // data channel opened
    onPeerDisconnected?: (playerId: string) => void; // connection dropped (before cleanup)
}
```

Public methods:
- `updatePeers(allPlayerIds)` — sync peer list; closes removed peers (intentional), creates new ones
- `handleSignal(fromPlayerId, signal)` — process incoming offer/answer/candidate
- `sendEventToAll(event)` — broadcast JSON event to all open data channels
- `dispose()` — tear down everything; cancels reconnect timers

---

## Sending peer events

```ts
mesh.sendEventToAll({ type: 'ping', fromPlayerId: localId });
```

Received via `onPeerEvent(fromPlayerId, event)`. Current handler in App.tsx:
- `event.type === 'ping'` → `triggerPlayerFlash(fromPlayerId)`

---

## How this differs from HTTP polling

| Aspect | WebRTC mesh | HTTP polling |
|--------|-------------|--------------|
| Path | Client ↔ Client (P2P) | Client ↔ PHP server |
| Authoritative? | No — supplementary only | Yes — all game state |
| Latency | ~10–50 ms once connected | ~500 ms heartbeat |
| Reliability | Best-effort (data channels are reliable by default, but connection can drop) | Durable (disk-backed JSONL) |
| When active | `pre_mission_story` / `battle` / `post_mission_story` | Always while in lobby |
| Reconnect | Auto (3 s timer) + player-rejoin path | Stateless; clients just resume polling |

See [`game-sync-data-flow`](../game-sync-data-flow/SKILL.md) for the HTTP layer.

---

## Common pitfalls

- **Signaling delay**: ICE candidates travel via HTTP polling (~2.5 s cadence). Initial connection setup takes several seconds. This is expected.
- **No server push**: If signaling messages pile up while a tab is hidden, `ondatachannel` may fire after a significant delay.
- **`isConnected` is local-only**: `PlayerState.isConnected` is set from local WebRTC state; the server never knows about it. Don't use it for game-authoritative decisions.
- **Self-exclusion**: `updatePeers` filters out `localPlayerId` — you never connect to yourself.
