# Multiplayer Game Lobby

A real-time multiplayer game lobby system using HTTP polling for messages, with chat and click tracking.

## Features

- **Lobby Management**: Create, join, and list public game lobbies
- **Real-time Communication**: Clients poll the `getMessages` API every second for new messages
- **Chat System**: In-lobby chat with message history
- **Click Tracking**: Click anywhere on the game canvas to mark your position (unique colors per player)
- **Host Management**: Automatic host reassignment when the host leaves
- **Message IDs**: Every message has a `messageId` for polling (return up to 10 messages after a given id)

## Architecture

```
MultiplayerLobby/
├── index.php              # HTTP API entry point (lobbies + messages)
├── composer.json          # PHP dependencies
├── backend/
│   ├── LobbyManager.php   # Lobby management singleton
│   ├── Lobby.php          # Individual lobby class (message log)
│   ├── Player.php         # Player class
│   ├── Message.php        # Message validation class
│   └── MessageTypes.php   # Message type enum
└── app/
    ├── index.html         # Main HTML page
    ├── css/
    │   └── style.css      # Styling
    └── js/
        ├── main.js        # Application entry point (polling)
        ├── EventEmitter.js # Pub/sub pattern utility
        ├── LobbyClient.js  # HTTP API client (getMessages, sendMessage)
        ├── ChatManager.js  # Chat UI management
        ├── GameCanvas.js   # Click tracking
        └── UI.js           # UI utilities
```

## Requirements

- PHP 8.1 or higher
- Composer
- A modern web browser

## Installation

1. **Install dependencies:**

   ```bash
   composer install
   npm install
   ```

2. **Start the PHP API server** (with auto-restart on file changes):

   ```bash
   npm run php
   ```

3. **Start the Vite frontend dev server** (in a second terminal):

   ```bash
   npm run dev
   ```

4. **Open the application:**

   Navigate to `http://localhost:5173` in your browser (Vite dev server proxies API calls to the PHP server).

No WebSocket server is required; clients poll for messages over HTTP every second.

### Production Build

```bash
npm run build
php -S localhost:8000 index.php
```

This builds the frontend to `dist/` and the PHP server serves both the API and the built frontend at `http://localhost:8000`.

## Usage

### Creating a Lobby

1. Enter your name in the "Your Name" field
2. Enter a lobby name
3. Click "Create Lobby"

### Joining a Lobby

**By Code:**
1. Enter your name
2. Enter the 6-character lobby code
3. Click "Join by Code"

**From List:**
1. Enter your name
2. Click "Join" on any available lobby in the list

### In-Game Features

- **Chat**: Type messages in the sidebar and press Enter or click Send
- **Click Tracking**: Click anywhere on the game canvas to place a marker with your color
- **Player List**: See all players in the lobby

## Message storage (server)

Messages are stored so every member of a lobby can see the same history:

- **Current approach**: Messages are stored in the same lobby file as the rest of the lobby state: `storage/lobbies/{lobbyId}.json`. The `messages` array holds up to 500 entries per lobby, each with `messageId`, `type`, `timestamp`, and `data`. This keeps all state in one place and works with the existing file-based persistence used for create/join across requests.

- **Alternatives** you could use instead:
  - **Separate message file per lobby**: e.g. `storage/lobbies/{id}/messages.json` (or append-only log). Reduces rewrite size when only messages change.
  - **Database**: Store messages in a table keyed by `lobby_id` and `message_id` for scale and querying.
  - **Redis/list**: Append to a per-lobby list with TTL; good for high traffic and optional expiry.

The **getMessages** API returns the last 10 messages when no `messageId` is sent, or up to 10 messages after the given `messageId`, so clients poll once per second and only process new messages.

## Message Types

The system uses strongly-typed messages for all communication:

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `chat` | Chat messages | `message` |
| `click` | Click position | `x`, `y` |
| `state_request` | Request game state from host | - |
| `state_response` | Full game state sync | `players`, `clicks`, `chatHistory` |
| `player_join` | Player joined notification | `playerId`, `playerName`, `color` |
| `player_leave` | Player left/disconnected | `playerId` |
| `player_rejoin` | Player reconnected | `playerId`, `playerName` |
| `host_changed` | New host assigned | `newHostId` |
| `ping` / `pong` | Keep-alive messages | - |

## Extending the System

### Adding New Message Types

1. **Backend** (`backend/MessageTypes.php`):
   ```php
   case YOUR_TYPE = 'your_type';
   
   public function getRequiredFields(): array
   {
       return match($this) {
           self::YOUR_TYPE => ['field1', 'field2'],
           // ...
       };
   }
   ```

2. **Frontend** (`app/js/MessageTypes.js`):
   ```javascript
   const MessageType = Object.freeze({
       YOUR_TYPE: 'your_type',
       // ...
   });
   
   const MessageSchema = Object.freeze({
       [MessageType.YOUR_TYPE]: {
           required: ['field1', 'field2'],
           optional: [],
       },
       // ...
   });
   ```

3. **Add message to log** where appropriate (e.g. in `index.php` for new POST types, or in `LobbyManager`/`Lobby`). Use `$lobby->addMessage('your_type', $data)` so polling clients receive it.

4. **Handle on client** (`app/js/main.js` in `applyMessage()`):
   ```javascript
   } else if (type === 'your_type') {
       // Handle the message using msg.data
   }
   ```

### Adding Game State

The `Lobby` class can be extended to store additional game state:

1. Add properties to `Lobby.php`
2. Include them in `getGameState()` method
3. Handle state updates via messages
4. Sync state on player join/rejoin

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lobbies` | List public lobbies |
| POST | `/api/lobbies` | Create a new lobby |
| GET | `/api/lobbies/{id}` | Get lobby details |
| GET | `/api/lobbies/{id}/state` | Get lobby state (players, clicks, chat, lastMessageId). Query: `playerId` |
| GET | `/api/lobbies/{id}/messages` | Get messages (polling). Query: `playerId`, optional `after` (messageId) |
| POST | `/api/lobbies/{id}/messages` | Send a message. Body: `{ playerId, type, data }` (type: `chat` or `click`) |
| POST | `/api/lobbies/{id}/join` | Join a lobby |
| POST | `/api/lobbies/{id}/leave` | Leave a lobby |
| GET | `/api/stats` | Server statistics |

## Troubleshooting

### "Lobby not found" Error

- Lobbies expire after 1 hour of inactivity
- Empty lobbies are automatically removed
- Lobby codes are case-insensitive (automatically uppercased)

## License

MIT License
