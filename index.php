<?php

/**
 * HTTP API Entry Point
 * 
 * Handles lobby management operations (create, list, join)
 * Run with: php -S localhost:8000 index.php
 */

require __DIR__ . '/vendor/autoload.php';

use App\LobbyManager;

// Enable CORS for development
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get request path and method
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Serve static files for the app
if ($path === '/' || $path === '/index.html') {
    header('Content-Type: text/html');
    readfile(__DIR__ . '/app/index.html');
    exit;
}

// Serve static assets
if (preg_match('/^\/(app|css|js)\//', $path)) {
    $filePath = __DIR__ . $path;
    if (file_exists($filePath)) {
        $mimeTypes = [
            'html' => 'text/html',
            'css' => 'text/css',
            'js' => 'application/javascript',
            'json' => 'application/json',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
        ];
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        $mime = $mimeTypes[$ext] ?? 'text/plain';
        header("Content-Type: {$mime}");
        readfile($filePath);
        exit;
    }
}

// API Routes
$lobbyManager = LobbyManager::getInstance();

try {
    $response = match(true) {
        // List all public lobbies
        $method === 'GET' && $path === '/api/lobbies' 
            => handleListLobbies($lobbyManager),
        
        // Create a new lobby
        $method === 'POST' && $path === '/api/lobbies' 
            => handleCreateLobby($lobbyManager),
        
        // Get specific lobby details
        $method === 'GET' && preg_match('/^\/api\/lobbies\/([A-Z0-9]+)$/', $path, $matches) 
            => handleGetLobby($lobbyManager, $matches[1]),
        
        // Join a lobby
        $method === 'POST' && preg_match('/^\/api\/lobbies\/([A-Z0-9]+)\/join$/', $path, $matches) 
            => handleJoinLobby($lobbyManager, $matches[1]),
        
        // Leave a lobby
        $method === 'POST' && preg_match('/^\/api\/lobbies\/([A-Z0-9]+)\/leave$/', $path, $matches)
            => handleLeaveLobby($lobbyManager, $matches[1]),

        // Get lobby state (players, clicks, chat) for initial load
        $method === 'GET' && preg_match('/^\/api\/lobbies\/([A-Z0-9]+)\/state$/', $path, $matches)
            => handleGetLobbyState($lobbyManager, $matches[1]),

        // Get messages (polling). Query: after (messageId), playerId (required for auth)
        $method === 'GET' && preg_match('/^\/api\/lobbies\/([A-Z0-9]+)\/messages$/', $path, $matches)
            => handleGetMessages($lobbyManager, $matches[1]),

        // Send a message (chat or click)
        $method === 'POST' && preg_match('/^\/api\/lobbies\/([A-Z0-9]+)\/messages$/', $path, $matches)
            => handlePostMessage($lobbyManager, $matches[1]),
        
        // Get server stats
        $method === 'GET' && $path === '/api/stats'
            => handleStats($lobbyManager),
        
        // 404 for unknown routes
        default => notFound(),
    };
    
    echo json_encode($response);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}

/**
 * List all public lobbies
 */
function handleListLobbies(LobbyManager $manager): array
{
    return [
        'success' => true,
        'lobbies' => $manager->getPublicLobbies(),
    ];
}

/**
 * Create a new lobby
 */
function handleCreateLobby(LobbyManager $manager): array
{
    $data = getJsonBody();
    
    $name = $data['name'] ?? null;
    $playerName = $data['playerName'] ?? null;
    $maxPlayers = $data['maxPlayers'] ?? 8;
    $isPublic = $data['isPublic'] ?? true;
    
    if (!$name) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Lobby name is required'];
    }
    
    if (!$playerName) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Player name is required'];
    }
    
    // Generate a unique player ID
    $playerId = generatePlayerId();
    
    $result = $manager->createLobby($name, $playerId, $playerName, $maxPlayers, $isPublic);
    
    return [
        'success' => true,
        'lobby' => $result['lobby'],
        'player' => $result['player'],
    ];
}

/**
 * Get lobby details
 */
function handleGetLobby(LobbyManager $manager, string $lobbyId): array
{
    $lobby = $manager->getLobby($lobbyId);
    
    if ($lobby === null) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Lobby not found'];
    }
    
    return [
        'success' => true,
        'lobby' => $lobby->toArray(true),
    ];
}

/**
 * Join a lobby
 */
function handleJoinLobby(LobbyManager $manager, string $lobbyId): array
{
    $data = getJsonBody();
    
    $playerName = $data['playerName'] ?? null;
    
    if (!$playerName) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Player name is required'];
    }
    
    $playerId = generatePlayerId();
    
    $result = $manager->joinLobby($lobbyId, $playerId, $playerName);
    
    if ($result === null) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Lobby not found'];
    }
    
    if (isset($result['error'])) {
        http_response_code(400);
        return ['success' => false, 'error' => $result['error']];
    }
    
    return [
        'success' => true,
        'lobby' => $result['lobby'],
        'player' => $result['player'],
        'isRejoin' => $result['isRejoin'] ?? false,
    ];
}

/**
 * Leave a lobby
 */
function handleLeaveLobby(LobbyManager $manager, string $lobbyId): array
{
    $data = getJsonBody();
    
    $playerId = $data['playerId'] ?? null;
    
    if (!$playerId) {
        http_response_code(400);
        return ['success' => false, 'error' => 'Player ID is required'];
    }
    
    $success = $manager->leavelobby($lobbyId, $playerId);
    
    return [
        'success' => $success,
        'error' => $success ? null : 'Failed to leave lobby',
    ];
}

/**
 * Get lobby state (players, clicks, chat) for initial client load
 */
function handleGetLobbyState(LobbyManager $manager, string $lobbyId): array
{
    $lobby = $manager->getLobby($lobbyId);
    if ($lobby === null) {
        http_response_code(404);
        return ['success' => false, 'error' => 'Lobby not found'];
    }
    $playerId = $_GET['playerId'] ?? null;
    if ($playerId && !$manager->isPlayerInLobby($lobbyId, $playerId)) {
        http_response_code(403);
        return ['success' => false, 'error' => 'Not in lobby'];
    }
    return [
        'success' => true,
        'gameState' => $lobby->getGameState(),
        'lastMessageId' => $lobby->getLastMessageId(),
    ];
}

/**
 * Get recent messages (polling). Query: after (messageId), playerId (required)
 */
function handleGetMessages(LobbyManager $manager, string $lobbyId): array
{
    $playerId = $_GET['playerId'] ?? null;
    if (!$playerId) {
        http_response_code(400);
        return ['success' => false, 'error' => 'playerId required'];
    }
    if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
        http_response_code(403);
        return ['success' => false, 'error' => 'Not in lobby'];
    }
    $after = isset($_GET['after']) ? (int) $_GET['after'] : null;
    $messages = $manager->getMessages($lobbyId, $after, 10);
    return [
        'success' => true,
        'messages' => $messages,
    ];
}

/**
 * Post a message (chat or click). Body: { playerId, type, data }
 */
function handlePostMessage(LobbyManager $manager, string $lobbyId): array
{
    $data = getJsonBody();
    $playerId = $data['playerId'] ?? null;
    $type = $data['type'] ?? null;
    $payload = $data['data'] ?? [];

    if (!$playerId || !$type) {
        http_response_code(400);
        return ['success' => false, 'error' => 'playerId and type required'];
    }
    if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
        http_response_code(403);
        return ['success' => false, 'error' => 'Not in lobby'];
    }

    if ($type === 'chat') {
        $message = $payload['message'] ?? '';
        $messageId = $manager->addChatMessage($lobbyId, $playerId, $message);
        if ($messageId === null) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to add message'];
        }
        return ['success' => true, 'messageId' => $messageId];
    }

    if ($type === 'click') {
        $x = isset($payload['x']) ? (float) $payload['x'] : null;
        $y = isset($payload['y']) ? (float) $payload['y'] : null;
        if ($x === null || $y === null) {
            http_response_code(400);
            return ['success' => false, 'error' => 'x and y required'];
        }
        $messageId = $manager->recordClick($lobbyId, $playerId, $x, $y);
        if ($messageId === null) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to record click'];
        }
        return ['success' => true, 'messageId' => $messageId];
    }

    http_response_code(400);
    return ['success' => false, 'error' => 'Unknown message type'];
}

/**
 * Get server statistics
 */
function handleStats(LobbyManager $manager): array
{
    return [
        'success' => true,
        'stats' => $manager->getStats(),
    ];
}

/**
 * Return 404 response
 */
function notFound(): array
{
    http_response_code(404);
    return ['success' => false, 'error' => 'Not found'];
}

/**
 * Get JSON body from request
 */
function getJsonBody(): array
{
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?? [];
}

/**
 * Generate a unique player ID
 */
function generatePlayerId(): string
{
    return 'player_' . bin2hex(random_bytes(8));
}
