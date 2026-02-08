<?php

namespace App;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Exception;

/**
 * WebSocket handler for real-time game communication.
 * Manages connections and routes messages.
 */
class WebSocketHandler implements MessageComponentInterface
{
    private LobbyManager $lobbyManager;

    public function __construct()
    {
        $this->lobbyManager = LobbyManager::getInstance();
        echo "WebSocket Server started\n";
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        echo "New connection: {$conn->resourceId}\n";
        
        // Connection will be associated with a lobby when they send a join/rejoin message
        $conn->send(json_encode([
            'type' => 'connected',
            'data' => ['connectionId' => $conn->resourceId],
        ]));
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        try {
            $data = json_decode($msg, true);
            
            if ($data === null) {
                $this->sendError($from, 'Invalid JSON');
                return;
            }

            // Handle connection/authentication messages separately
            if (isset($data['action'])) {
                $this->handleAction($from, $data);
                return;
            }

            // Handle game messages
            $lobby = $this->lobbyManager->getLobbyByConnection($from);
            
            if ($lobby === null) {
                $this->sendError($from, 'Not connected to a lobby');
                return;
            }

            $player = $lobby->getPlayerByConnection($from);
            
            if ($player === null) {
                $this->sendError($from, 'Player not found');
                return;
            }

            // Validate and process the message
            $message = Message::fromArray($data, $player->getId());
            $this->processMessage($lobby, $player, $message);
            
        } catch (Exception $e) {
            $this->sendError($from, $e->getMessage());
        }
    }

    public function onClose(ConnectionInterface $conn): void
    {
        echo "Connection closed: {$conn->resourceId}\n";
        
        $result = $this->lobbyManager->handleDisconnect($conn);
        
        if ($result !== null) {
            $lobby = $this->lobbyManager->getLobby($result['lobbyId']);
            
            if ($lobby !== null) {
                // Notify other players of disconnect
                $lobby->broadcast(Message::create(
                    MessageType::PLAYER_LEAVE,
                    ['playerId' => $result['playerId'], 'playerName' => $result['playerName']]
                ));
            }
        }
    }

    public function onError(ConnectionInterface $conn, Exception $e): void
    {
        echo "Error on connection {$conn->resourceId}: {$e->getMessage()}\n";
        $conn->close();
    }

    /**
     * Handle connection actions (join, rejoin, etc.)
     */
    private function handleAction(ConnectionInterface $conn, array $data): void
    {
        $action = $data['action'];
        
        match($action) {
            'connect' => $this->handleConnect($conn, $data),
            'rejoin' => $this->handleRejoin($conn, $data),
            default => $this->sendError($conn, "Unknown action: {$action}"),
        };
    }

    /**
     * Handle initial connection to a lobby
     */
    private function handleConnect(ConnectionInterface $conn, array $data): void
    {
        $lobbyId = $data['lobbyId'] ?? null;
        $playerId = $data['playerId'] ?? null;
        $reconnectToken = $data['reconnectToken'] ?? null;

        if (!$lobbyId || !$playerId) {
            $this->sendError($conn, 'Missing lobbyId or playerId');
            return;
        }

        $result = $this->lobbyManager->connectPlayer($lobbyId, $playerId, $conn);
        
        if ($result === null) {
            $this->sendError($conn, 'Failed to connect to lobby');
            return;
        }

        $lobby = $this->lobbyManager->getLobby($lobbyId);
        $player = $lobby->getPlayer($playerId);

        // Send success response
        $conn->send(json_encode([
            'type' => 'connected_to_lobby',
            'data' => [
                'lobby' => $result['lobby'],
                'player' => $result['player'],
                'gameState' => $lobby->getGameState(),
            ],
        ]));

        // Notify other players
        $lobby->broadcast(
            Message::create(
                MessageType::PLAYER_JOIN,
                [
                    'playerId' => $player->getId(),
                    'playerName' => $player->getName(),
                    'color' => $player->getColor(),
                    'isHost' => $player->isHost(),
                ]
            ),
            $playerId  // Exclude the joining player
        );
    }

    /**
     * Handle reconnection to a lobby
     */
    private function handleRejoin(ConnectionInterface $conn, array $data): void
    {
        $lobbyId = $data['lobbyId'] ?? null;
        $reconnectToken = $data['reconnectToken'] ?? null;

        if (!$lobbyId || !$reconnectToken) {
            $this->sendError($conn, 'Missing lobbyId or reconnectToken');
            return;
        }

        $result = $this->lobbyManager->rejoinLobby($lobbyId, $reconnectToken, $conn);
        
        if ($result === null) {
            $this->sendError($conn, 'Failed to rejoin lobby');
            return;
        }

        $lobby = $this->lobbyManager->getLobby($lobbyId);
        $player = $lobby->getPlayerByReconnectToken($reconnectToken);

        // Send success response with full game state
        $conn->send(json_encode([
            'type' => 'rejoined_lobby',
            'data' => [
                'lobby' => $result['lobby'],
                'player' => $result['player'],
                'gameState' => $result['gameState'],
            ],
        ]));

        // Notify other players of rejoin
        $lobby->broadcast(
            Message::create(
                MessageType::PLAYER_REJOIN,
                [
                    'playerId' => $player->getId(),
                    'playerName' => $player->getName(),
                ]
            ),
            $player->getId()
        );
    }

    /**
     * Process a validated game message
     */
    private function processMessage(Lobby $lobby, Player $player, Message $message): void
    {
        $type = $message->getType();
        $player->updateActivity();
        $lobby->updateActivity();

        match($type) {
            MessageType::CHAT => $this->handleChat($lobby, $player, $message),
            MessageType::CLICK => $this->handleClick($lobby, $player, $message),
            MessageType::STATE_REQUEST => $this->handleStateRequest($lobby, $player, $message),
            MessageType::STATE_RESPONSE => $this->handleStateResponse($lobby, $player, $message),
            MessageType::PING => $this->handlePing($player),
            default => $this->handleGenericMessage($lobby, $player, $message),
        };
    }

    /**
     * Handle chat messages
     */
    private function handleChat(Lobby $lobby, Player $player, Message $message): void
    {
        $chatMessage = $message->get('message');
        $chatEntry = $lobby->addChatMessage($player->getId(), $chatMessage);

        // Broadcast to all players including sender
        $lobby->broadcast(Message::create(
            MessageType::CHAT,
            [
                'message' => $chatMessage,
                'playerId' => $player->getId(),
                'playerName' => $player->getName(),
                'playerColor' => $player->getColor(),
                'timestamp' => $chatEntry['timestamp'],
            ]
        ));
    }

    /**
     * Handle click messages
     */
    private function handleClick(Lobby $lobby, Player $player, Message $message): void
    {
        $x = $message->get('x');
        $y = $message->get('y');
        
        $player->setLastClick($x, $y);

        // Broadcast to all players
        $lobby->broadcast(Message::create(
            MessageType::CLICK,
            [
                'x' => $x,
                'y' => $y,
                'playerId' => $player->getId(),
                'playerName' => $player->getName(),
                'color' => $player->getColor(),
                'timestamp' => microtime(true),
            ]
        ));
    }

    /**
     * Handle state request (new player asking host for state)
     */
    private function handleStateRequest(Lobby $lobby, Player $player, Message $message): void
    {
        // Forward request to host
        $host = $lobby->getHost();
        
        if ($host === null || !$host->isConnected()) {
            // No host available, send current server state
            $player->send(Message::create(
                MessageType::STATE_RESPONSE,
                $lobby->getGameState()
            ));
            return;
        }

        // Send request to host
        $host->send(Message::create(
            MessageType::STATE_REQUEST,
            ['requestingPlayerId' => $player->getId()]
        ));
    }

    /**
     * Handle state response (host sending state to a player)
     */
    private function handleStateResponse(Lobby $lobby, Player $player, Message $message): void
    {
        // Only host can send state responses
        if (!$player->isHost()) {
            return;
        }

        $targetPlayerId = $message->get('targetPlayerId');
        $targetPlayer = $lobby->getPlayer($targetPlayerId);
        
        if ($targetPlayer !== null) {
            $targetPlayer->send($message);
        }
    }

    /**
     * Handle ping messages
     */
    private function handlePing(Player $player): void
    {
        $player->send(Message::create(MessageType::PONG, []));
    }

    /**
     * Handle generic messages that should be broadcast
     */
    private function handleGenericMessage(Lobby $lobby, Player $player, Message $message): void
    {
        if ($message->shouldBroadcast()) {
            $lobby->broadcast($message);
        } elseif ($message->isHostOnly()) {
            $lobby->sendToHost($message);
        }
    }

    /**
     * Send an error message to a connection
     */
    private function sendError(ConnectionInterface $conn, string $message): void
    {
        $conn->send(json_encode([
            'type' => 'error',
            'data' => ['message' => $message],
        ]));
    }
}
