<?php

/**
 * HTTP API Entry Point
 *
 * Sets CORS, handles OPTIONS, serves static files, then delegates to Router.
 * Run with: php -S localhost:8000 index.php
 */

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/backend/Http/helpers.php';

use App\AccountService;
use App\LobbyManager;
use App\Router;
use App\Storage\FlatFilePlayerAccountStorage;

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Static: app root, index, and lobby deep-link (SPA routes)
if ($path === '/' || $path === '/index.html' || preg_match('#^/lobby/[A-Za-z0-9]+$#', $path)) {
    header('Content-Type: text/html');
    readfile(__DIR__ . '/app/index.html');
    exit;
}

// Static: app, css, js assets
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

// API: route via Router
$lobbyManager = LobbyManager::getInstance();
$accountStorage = new FlatFilePlayerAccountStorage();
$accountService = new AccountService($accountStorage);
$router = new Router();

try {
    $response = $router->dispatch($method, $path, $lobbyManager, $accountService);
    echo json_encode($response);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
