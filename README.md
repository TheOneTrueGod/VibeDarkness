# Multiplayer Game Lobby

A real-time multiplayer game lobby system with WebSocket communication, chat functionality, and click tracking.

## Features

- **Lobby Management**: Create, join, and list public game lobbies
- **Real-time Communication**: WebSocket-based messaging between clients
- **Chat System**: In-lobby chat with message history
- **Click Tracking**: Click anywhere on the game canvas to mark your position (unique colors per player)
- **Session Persistence**: Automatic reconnection if disconnected
- **Host Management**: Automatic host reassignment when the host leaves
- **Strongly Typed Messages**: All messages are validated on both client and server

## Architecture

```
MultiplayerLobby/
├── index.php              # HTTP API entry point
├── composer.json          # PHP dependencies
├── backend/
│   ├── server.php         # WebSocket server entry point
│   ├── WebSocketHandler.php
│   ├── LobbyManager.php   # Lobby management singleton
│   ├── Lobby.php          # Individual lobby class
│   ├── Player.php         # Player class
│   ├── Message.php        # Message validation class
│   └── MessageTypes.php   # Message type enum
└── app/
    ├── index.html         # Main HTML page
    ├── css/
    │   └── style.css      # Styling
    └── js/
        ├── main.js        # Application entry point
        ├── MessageTypes.js # Client-side message types
        ├── EventEmitter.js # Pub/sub pattern utility
        ├── WebSocketClient.js
        ├── LobbyClient.js  # HTTP API client
        ├── ChatManager.js  # Chat UI management
        ├── GameCanvas.js   # Click tracking
        └── UI.js           # UI utilities
```

## Requirements

- PHP 8.1 or higher
- Composer
- A modern web browser

## Installation

1. **Install PHP dependencies:**

   ```bash
   composer install
   ```

2. **Start the WebSocket server** (in a separate terminal):

   ```bash
   php backend/server.php
   ```

   The WebSocket server will run on port 8080 by default.

3. **Start the HTTP server:**

   ```bash
   php -S localhost:8000 index.php
   ```

4. **Open the application:**

   Navigate to `http://localhost:8000` in your browser.

## Configuration

### WebSocket Port

Set the `WS_PORT` environment variable to change the WebSocket server port:

```bash
WS_PORT=9000 php backend/server.php
```

Update the WebSocket URL in `app/js/main.js` if you change the port:

```javascript
this.wsUrl = `ws://${window.location.hostname}:9000`;
```

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
- **Player List**: See all connected players and their colors

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

3. **Handle the message** (`backend/WebSocketHandler.php`):
   ```php
   private function processMessage(Lobby $lobby, Player $player, Message $message): void
   {
       match($type) {
           MessageType::YOUR_TYPE => $this->handleYourType($lobby, $player, $message),
           // ...
       };
   }
   ```

4. **Listen on client** (`app/js/main.js`):
   ```javascript
   this.wsClient.on(`message:${MessageType.YOUR_TYPE}`, (msg) => {
       // Handle the message
   });
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
| POST | `/api/lobbies/{id}/join` | Join a lobby |
| POST | `/api/lobbies/{id}/leave` | Leave a lobby |
| GET | `/api/stats` | Server statistics |

## Troubleshooting

### WebSocket Connection Failed

- Ensure the WebSocket server is running (`php backend/server.php`)
- Check that port 8080 is not blocked by a firewall
- Verify the WebSocket URL in `main.js` matches your server configuration

### "Lobby not found" Error

- Lobbies expire after 1 hour of inactivity
- Empty lobbies are automatically removed
- Lobby codes are case-insensitive (automatically uppercased)

### Reconnection Issues

- Session data is stored in browser sessionStorage
- Closing the browser tab clears the session
- Reconnect tokens are valid until the lobby expires

## License

MIT License
