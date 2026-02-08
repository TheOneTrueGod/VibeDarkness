<?php

/**
 * WebSocket Server Entry Point
 * 
 * Run with: php backend/server.php
 */

require __DIR__ . '/../vendor/autoload.php';

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use App\WebSocketHandler;

$port = getenv('WS_PORT') ?: 8080;

echo "Starting WebSocket server on port {$port}...\n";

$server = IoServer::factory(
    new HttpServer(
        new WsServer(
            new WebSocketHandler()
        )
    ),
    $port
);

echo "WebSocket server running at ws://localhost:{$port}\n";
echo "Press Ctrl+C to stop\n";

$server->run();
