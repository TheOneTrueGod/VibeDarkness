<?php

namespace App;

use App\Http\Handlers\CreateAccountHandler;
use App\Http\Handlers\CreateLobbyHandler;
use App\Http\Handlers\GetCurrentUserHandler;
use App\Http\Handlers\GetLobbyHandler;
use App\Http\Handlers\GetLobbyStateHandler;
use App\Http\Handlers\GetMessagesHandler;
use App\Http\Handlers\JoinLobbyHandler;
use App\Http\Handlers\LeaveLobbyHandler;
use App\Http\Handlers\ListLobbiesHandler;
use App\Http\Handlers\LoginHandler;
use App\Http\Handlers\LogoutHandler;
use App\Http\Handlers\SetLobbyStateHandler;
use App\Http\Handlers\UpdateGameStateHandler;
use App\Http\Handlers\SaveGameStateSnapshotHandler;
use App\Http\Handlers\GetGameStateSnapshotHandler;
use App\Http\Handlers\SaveGameOrdersHandler;
use App\Http\Handlers\GetGameOrdersHandler;
use App\Http\Handlers\NotFoundHandler;
use App\Http\Handlers\PostMessageHandler;
use App\Http\Handlers\StatsHandler;

/**
 * Matches request method and path to handler functions.
 * Routes are checked in order; first match wins. More specific paths must come first.
 */
class Router
{
    /** @var array<int, array{0: string, 1: string, 2: class-string}> method, path regex, handler class */
    private array $routes;

    public function __construct()
    {
        $this->routes = [
            ['POST', '#^/api/account/login$#', LoginHandler::class],
            ['POST', '#^/api/account/create$#', CreateAccountHandler::class],
            ['GET', '#^/api/account/me$#', GetCurrentUserHandler::class],
            ['POST', '#^/api/account/logout$#', LogoutHandler::class],
            ['GET', '#^/api/lobbies$#', ListLobbiesHandler::class],
            ['POST', '#^/api/lobbies$#', CreateLobbyHandler::class],
            ['GET', '#^/api/lobbies/([A-Z0-9]+)/state$#', GetLobbyStateHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/state$#', SetLobbyStateHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/games/([A-Za-z0-9_-]+)/state$#', UpdateGameStateHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/games/([A-Za-z0-9_-]+)/snapshots$#', SaveGameStateSnapshotHandler::class],
            ['GET', '#^/api/lobbies/([A-Z0-9]+)/games/([A-Za-z0-9_-]+)/snapshots/(\d+)$#', GetGameStateSnapshotHandler::class],
            ['GET', '#^/api/lobbies/([A-Z0-9]+)/games/([A-Za-z0-9_-]+)/snapshots$#', GetGameStateSnapshotHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/games/([A-Za-z0-9_-]+)/orders/(\d+)$#', SaveGameOrdersHandler::class],
            ['GET', '#^/api/lobbies/([A-Z0-9]+)/games/([A-Za-z0-9_-]+)/orders/(\d+)$#', GetGameOrdersHandler::class],
            ['GET', '#^/api/lobbies/([A-Z0-9]+)/messages$#', GetMessagesHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/messages$#', PostMessageHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/join$#', JoinLobbyHandler::class],
            ['POST', '#^/api/lobbies/([A-Z0-9]+)/leave$#', LeaveLobbyHandler::class],
            ['GET', '#^/api/lobbies/([A-Z0-9]+)$#', GetLobbyHandler::class],
            ['GET', '#^/api/stats$#', StatsHandler::class],
        ];
    }

    /**
     * Dispatch the request to the matching handler. Returns response array.
     */
    public function dispatch(string $method, string $path, LobbyManager $manager, AccountService $accountService): array
    {
        foreach ($this->routes as [$routeMethod, $pattern, $handlerClass]) {
            if ($method !== $routeMethod) {
                continue;
            }
            $matches = [];
            if (preg_match($pattern, $path, $matches)) {
                return $handlerClass::handle($manager, $accountService, $matches);
            }
        }
        return NotFoundHandler::handle($manager, $accountService, []);
    }
}
