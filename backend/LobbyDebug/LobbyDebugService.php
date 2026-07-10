<?php

namespace App\LobbyDebug;

use App\BattleStorage;
use App\LobbyManager;
use App\UserStateStorage;
use InvalidArgumentException;

/**
 * Read-only lobby investigation tools for /lobby_debug/{method}.
 * Mirrors the desyncDebug npm scripts where practical.
 */
final class LobbyDebugService
{
    public const MAX_TICK_RANGE = 2000;
    public const MAX_USER_STATE_RESULTS = 20;
    public const MAX_SNAPSHOTS_PER_REQUEST = 5;
    public const MAX_JSONL_RESULTS = 500;
    public const MAX_LOBBY_LOG_RESULTS = 200;
    public const DEFAULT_DESYNC_WINDOW = 20;

  private const SEVERITY_LEVELS = ['log', 'info', 'warn', 'error', 'critical'];

    private readonly string $storageRoot;
    private readonly LobbyManager $manager;
    private readonly BattleStorage $battleStorage;
    private readonly UserStateStorage $userStateStorage;

    public function __construct(?LobbyManager $manager = null, ?string $storageRoot = null)
    {
        $this->manager = $manager ?? LobbyManager::getInstance();
        $this->storageRoot = $storageRoot ?? dirname(__DIR__, 2) . '/storage';
        $this->battleStorage = new BattleStorage($this->storageRoot);
        $this->userStateStorage = new UserStateStorage($this->storageRoot);
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function dispatch(string $method, array $params): array
    {
        $method = strtolower(trim($method));
        if ($method === '' || $method === 'index' || $method === 'help') {
            return $this->methodIndex();
        }

        $handlers = [
            'overview' => fn(array $p) => $this->overview($p),
            'get_players' => fn(array $p) => $this->getPlayers($p),
            'get_lobby_log' => fn(array $p) => $this->getLobbyLog($p),
            'get_fingerprints' => fn(array $p) => $this->getFingerprints($p),
            'get_orders' => fn(array $p) => $this->getOrders($p),
            'list_snapshots' => fn(array $p) => $this->listSnapshots($p),
            'get_snapshots' => fn(array $p) => $this->getSnapshots($p),
            'get_user_state_index' => fn(array $p) => $this->getUserStateIndex($p),
            'get_user_state' => fn(array $p) => $this->getUserState($p),
            'detect_desyncs' => fn(array $p) => $this->detectDesyncs($p),
            'diff_snapshot' => fn(array $p) => $this->diffSnapshot($p),
            'get_game' => fn(array $p) => $this->getGame($p),
        ];

        if (!isset($handlers[$method])) {
            http_response_code(404);
            return [
                'success' => false,
                'error' => "Unknown lobby debug method: {$method}",
                'hint' => 'Call GET /lobby_debug or /lobby_debug/index for the method catalog.',
                'availableMethods' => array_keys($handlers),
            ];
        }

        try {
            return $handlers[$method]($params);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function methodIndex(): array
    {
        return [
            'success' => true,
            'environment' => LobbyDebugAuth::environmentLabel(),
            'basePath' => '/lobby_debug/{method}',
            'usage' => 'Pass lobby code as query param or JSON body field "lobby". GET and POST are supported.',
            'methods' => [
                [
                    'name' => 'overview',
                    'description' => 'Lobby summary: players, gameId, which artifacts exist on disk.',
                    'params' => ['lobby (required)'],
                ],
                [
                    'name' => 'get_players',
                    'description' => 'Players from lobby_state.json (ids, names, host).',
                    'params' => ['lobby (required)'],
                ],
                [
                    'name' => 'get_lobby_log',
                    'description' => 'Filtered lobby_log.jsonl entries.',
                    'params' => ['lobby (required)', 'from, to (optional ticks)', 'keyword (repeatable)', 'severity (log|info|warn|error|critical floor)'],
                ],
                [
                    'name' => 'get_fingerprints',
                    'description' => 'fingerprints.jsonl entries in a tick range.',
                    'params' => ['lobby (required)', 'from, to (required ticks)'],
                ],
                [
                    'name' => 'get_orders',
                    'description' => 'Order lines from applied_orders.jsonl, pending_orders.jsonl, or lobby_log.jsonl.',
                    'params' => ['lobby (required)', 'from, to (required)', 'file (applied|pending|log, default applied)', 'keyword (repeatable)'],
                ],
                [
                    'name' => 'list_snapshots',
                    'description' => 'Available host snapshot tick numbers.',
                    'params' => ['lobby (required)', 'from, to (optional tick filter)'],
                ],
                [
                    'name' => 'get_snapshots',
                    'description' => 'Load one or more snapshot JSON payloads by tick.',
                    'params' => ['lobby (required)', 'ticks (required: comma-separated or array, max ' . self::MAX_SNAPSHOTS_PER_REQUEST . ')'],
                ],
                [
                    'name' => 'get_user_state_index',
                    'description' => 'Per-player user_state file coverage and hashes.',
                    'params' => ['lobby (required)'],
                ],
                [
                    'name' => 'get_user_state',
                    'description' => 'Per-player user_state entries in a tick range (max ' . self::MAX_USER_STATE_RESULTS . ' results).',
                    'params' => ['lobby (required)', 'player (required)', 'fromTick, toTick (required)'],
                ],
                [
                    'name' => 'detect_desyncs',
                    'description' => 'Find fingerprint mismatch events in lobby_log and bundle nearby context.',
                    'params' => ['lobby (required)', 'window (optional ticks, default ' . self::DEFAULT_DESYNC_WINDOW . ')'],
                ],
                [
                    'name' => 'diff_snapshot',
                    'description' => 'Compare host snapshot at tick vs client state from lobby_log at vsLogTick.',
                    'params' => ['lobby (required)', 'tick (required)', 'vsLogTick (required)'],
                ],
                [
                    'name' => 'get_game',
                    'description' => 'Lobby game payload from game_<instanceId>.json.',
                    'params' => ['lobby (required)'],
                ],
            ],
            'localNpmAlternatives' => [
                'desyncDebug-getTick' => 'Richer per-tick user_state extraction with --field',
                'desyncDebug-diffTick' => 'Deep diff two players at one tick',
                'desyncDebug-getCombatEvents' => 'Combat timing / VFX inference from snapshots',
            ],
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function overview(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);

        $lobby = $this->manager->getLobby($lobbyId);
        $gameId = $lobby?->getGameId();
        $artifacts = $this->scanArtifacts($lobbyDir);

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'environment' => LobbyDebugAuth::environmentLabel(),
            'storagePath' => 'storage/lobbies/' . $lobbyId . '/',
            'lobbyState' => $lobby?->getLobbyState(),
            'gameId' => $gameId,
            'players' => $this->playersFromLobby($lobbyId),
            'artifacts' => $artifacts,
            'hints' => $this->overviewHints($artifacts),
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getPlayers(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $this->lobbyDirOrError($lobbyId);

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'players' => $this->playersFromLobby($lobbyId),
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getLobbyLog(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        $path = $lobbyDir . '/lobby_log.jsonl';

        if (!is_file($path)) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'entries' => [],
                'count' => 0,
                'hint' => 'lobby_log.jsonl not found. Client logging may be off (VITE_LOBBY_LOG_THRESHOLD defaults to off). '
                    . 'Enable Debug Console → Debug Toggles → Persisted lobby log, or raise LOBBY_LOG_BATTLE_SYNC in global_constants.js.',
            ];
        }

        $fromTick = $this->optionalInt($params, 'from');
        $toTick = $this->optionalInt($params, 'to');
        $keywords = $this->stringList($params, 'keyword');
        $severityFloor = $this->parseSeverityFloor($params['severity'] ?? null);

        $entries = [];
        foreach ($this->readJsonl($path) as $obj) {
            if (count($entries) >= self::MAX_LOBBY_LOG_RESULTS) {
                break;
            }
            if (!$this->matchesLobbyLogFilters($obj, $fromTick, $toTick, $keywords, $severityFloor)) {
                continue;
            }
            $entries[] = $obj;
        }

        $response = [
            'success' => true,
            'lobby' => $lobbyId,
            'entries' => $entries,
            'count' => count($entries),
            'maxResults' => self::MAX_LOBBY_LOG_RESULTS,
        ];
        if (count($entries) === 0) {
            $response['hint'] = 'No matching lobby_log lines. Widen tick range, remove keyword/severity filters, '
                . 'or check whether logging was enabled during the incident.';
        }
        return $response;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getFingerprints(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        [$fromTick, $toTick] = $this->requireTickRange($params, 'from', 'to');
        $path = $lobbyDir . '/fingerprints.jsonl';

        if (!is_file($path)) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'entries' => [],
                'count' => 0,
                'hint' => 'fingerprints.jsonl not found. Battle may not have started syncing yet, or storage was cleared.',
            ];
        }

        $entries = $this->filterJsonlByTickRange($path, $fromTick, $toTick);

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'from' => $fromTick,
            'to' => $toTick,
            'entries' => $entries,
            'count' => count($entries),
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getOrders(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        [$fromTick, $toTick] = $this->requireTickRange($params, 'from', 'to');

        $fileType = strtolower((string) ($params['file'] ?? 'applied'));
        $fileName = match ($fileType) {
            'pending' => 'pending_orders.jsonl',
            'log' => 'lobby_log.jsonl',
            'applied' => 'applied_orders.jsonl',
            default => throw new InvalidArgumentException(
                'Invalid file param. Use applied, pending, or log.'
            ),
        };

        $path = $lobbyDir . '/' . $fileName;
        if (!is_file($path)) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'file' => $fileName,
                'entries' => [],
                'count' => 0,
                'hint' => "{$fileName} not found under storage/lobbies/{$lobbyId}/.",
            ];
        }

        $keywords = $this->stringList($params, 'keyword');
        $entries = [];
        foreach ($this->readJsonl($path) as $obj) {
            if (count($entries) >= self::MAX_JSONL_RESULTS) {
                break;
            }
            $tick = $this->extractTick($obj);
            if ($tick === null || $tick < $fromTick || $tick > $toTick) {
                continue;
            }
            if ($keywords !== [] && !$this->lineMatchesKeywords($obj, $keywords)) {
                continue;
            }
            $entries[] = $obj;
        }

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'file' => $fileName,
            'from' => $fromTick,
            'to' => $toTick,
            'entries' => $entries,
            'count' => count($entries),
            'maxResults' => self::MAX_JSONL_RESULTS,
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function listSnapshots(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        $fromTick = $this->optionalInt($params, 'from');
        $toTick = $this->optionalInt($params, 'to');

        $ticks = $this->listSnapshotTicks($lobbyDir);
        if ($fromTick !== null) {
            $ticks = array_values(array_filter($ticks, fn(int $t) => $t >= $fromTick));
        }
        if ($toTick !== null) {
            $ticks = array_values(array_filter($ticks, fn(int $t) => $t <= $toTick));
        }

        $response = [
            'success' => true,
            'lobby' => $lobbyId,
            'ticks' => $ticks,
            'count' => count($ticks),
        ];
        if ($ticks === []) {
            $response['hint'] = 'No snapshots on disk. Host may not have checkpointed yet, or battle storage was cleared.';
        } else {
            $response['hint'] = 'Load payloads with get_snapshots&ticks=' . implode(',', array_slice($ticks, -3));
        }
        return $response;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getSnapshots(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        $ticks = $this->parseTickList($params['ticks'] ?? null);
        if ($ticks === []) {
            throw new InvalidArgumentException(
                'ticks is required (comma-separated numbers or JSON array). Example: ticks=372,380,400'
            );
        }
        if (count($ticks) > self::MAX_SNAPSHOTS_PER_REQUEST) {
            throw new InvalidArgumentException(
                'Too many ticks requested (max ' . self::MAX_SNAPSHOTS_PER_REQUEST . '). Split into multiple calls.'
            );
        }

        $available = $this->listSnapshotTicks($lobbyDir);
        $snapshots = [];
        $missing = [];

        foreach ($ticks as $tick) {
            $path = $lobbyDir . '/snapshots/' . $tick . '.json';
            if (!is_file($path)) {
                $missing[] = $tick;
                continue;
            }
            $raw = file_get_contents($path);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($decoded)) {
                $missing[] = $tick;
                continue;
            }
            $snapshots[] = ['tick' => $tick, 'snapshot' => $decoded];
        }

        $response = [
            'success' => true,
            'lobby' => $lobbyId,
            'snapshots' => $snapshots,
            'missingTicks' => $missing,
        ];
        if ($missing !== []) {
            $response['hint'] = 'Missing ticks: ' . implode(', ', $missing)
                . '. Available nearby: ' . $this->nearestTicksHint($available, $missing);
        }
        return $response;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getUserStateIndex(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        $userStateDir = $lobbyDir . '/user_state';

        if (!is_dir($userStateDir)) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'users' => (object) [],
                'hint' => 'No user_state directory. Enable Debug Console → Debug Toggles → "Log user state to server" and reproduce.',
            ];
        }

        $users = [];
        $userStateHashes = [];
        foreach (scandir($userStateDir) ?: [] as $userId) {
            if ($userId === '.' || $userId === '..') {
                continue;
            }
            $userDir = $userStateDir . '/' . $userId;
            if (!is_dir($userDir)) {
                continue;
            }
            $files = [];
            foreach (scandir($userDir) ?: [] as $fileName) {
                if (!preg_match('#^user_state_(\d+)\.md$#', $fileName, $m)) {
                    continue;
                }
                $fileNum = (int) $m[1];
                $files[] = [
                    'fileNum' => $fileNum,
                    'fromTick' => ($fileNum - 1) * 100,
                    'toTick' => $fileNum * 100 - 1,
                ];
            }
            usort($files, fn(array $a, array $b) => $a['fileNum'] <=> $b['fileNum']);
            $users[$userId] = $files;
            $userStateHashes[$userId] = $this->userStateStorage->getUserStateHashes($lobbyId, $userId);
        }

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'users' => $users !== [] ? $users : (object) [],
            'userStateHashes' => $userStateHashes !== [] ? $userStateHashes : (object) [],
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getUserState(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $this->lobbyDirOrError($lobbyId);

        $playerId = isset($params['player']) ? (string) $params['player'] : '';
        if ($playerId === '') {
            throw new InvalidArgumentException('player is required (user id subdirectory under user_state/).');
        }

        $fromTick = $this->optionalInt($params, 'fromTick') ?? $this->optionalInt($params, 'from');
        $toTick = $this->optionalInt($params, 'toTick') ?? $this->optionalInt($params, 'to');
        if ($fromTick === null || $toTick === null) {
            throw new InvalidArgumentException('fromTick and toTick are required (aliases: from, to).');
        }
        if ($fromTick < 0 || $toTick < $fromTick) {
            throw new InvalidArgumentException('Invalid tick range: fromTick must be >= 0 and <= toTick.');
        }
        if (($toTick - $fromTick) > self::MAX_TICK_RANGE) {
            throw new InvalidArgumentException('Tick range too large (max ' . self::MAX_TICK_RANGE . '). Query multiple windows.');
        }

        $entries = $this->userStateStorage->getRange($lobbyId, $playerId, $fromTick, $toTick);
        $response = [
            'success' => true,
            'lobby' => $lobbyId,
            'player' => $playerId,
            'fromTick' => $fromTick,
            'toTick' => $toTick,
            'entries' => $entries,
            'count' => count($entries),
            'maxResults' => self::MAX_USER_STATE_RESULTS,
        ];
        if ($entries === []) {
            $response['hint'] = "No user_state entries for player {$playerId} in [{$fromTick}, {$toTick}]. "
                . 'Call get_user_state_index to see which tick files exist per player.';
        }
        return $response;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function detectDesyncs(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);
        $window = isset($params['window']) ? (int) $params['window'] : self::DEFAULT_DESYNC_WINDOW;
        if ($window < 0) {
            throw new InvalidArgumentException('window must be >= 0');
        }

        $logPath = $lobbyDir . '/lobby_log.jsonl';
        if (!is_file($logPath)) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'events' => [],
                'count' => 0,
                'hint' => 'lobby_log.jsonl not found — cannot auto-detect desyncs. Try get_fingerprints or get_user_state instead.',
            ];
        }

        $allLogLines = $this->readJsonl($logPath);
        $desyncEvents = array_values(array_filter($allLogLines, [$this, 'isDesyncEvent']));

        if ($desyncEvents === []) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'events' => [],
                'count' => 0,
                'hint' => 'No fingerprint mismatch events in lobby_log. Logging may be below threshold, or issue is not fingerprint-based.',
            ];
        }

        $fingerprints = is_file($lobbyDir . '/fingerprints.jsonl')
            ? $this->readJsonl($lobbyDir . '/fingerprints.jsonl')
            : [];
        $orders = is_file($lobbyDir . '/applied_orders.jsonl')
            ? $this->readJsonl($lobbyDir . '/applied_orders.jsonl')
            : [];
        $snapshotTicks = $this->listSnapshotTicks($lobbyDir);

        $bundles = [];
        foreach ($desyncEvents as $event) {
            $tick = $this->extractTick($event);
            $bundle = [
                'event' => $event,
                'tick' => $tick,
            ];
            if ($tick !== null) {
                $lo = $tick - $window;
                $hi = $tick + $window;
                $bundle['fingerprints'] = $this->filterObjectsByTickRange($fingerprints, $lo, $hi);
                $bundle['orders'] = $this->filterObjectsByTickRange($orders, $lo, $hi);
                $bundle['nearbyLog'] = array_values(array_filter(
                    $allLogLines,
                    function (array $line) use ($event, $lo, $hi): bool {
                        if ($line === $event) {
                            return false;
                        }
                        $t = $this->extractTick($line);
                        return $t !== null && $t >= $lo && $t <= $hi;
                    }
                ));
                $bundle['snapshotsInWindow'] = array_values(array_filter(
                    $snapshotTicks,
                    fn(int $t) => $t >= $lo && $t <= $hi
                ));
                $bundle['nearestSnapshot'] = $this->nearestTick($snapshotTicks, $tick);
                $bundle['suggestedNext'] = $bundle['nearestSnapshot'] !== null
                    ? "diff_snapshot with tick={$bundle['nearestSnapshot']} and vsLogTick={$tick}"
                    : 'list_snapshots to find a host checkpoint tick';
            }
            $bundles[] = $bundle;
        }

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'window' => $window,
            'events' => $bundles,
            'count' => count($bundles),
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function diffSnapshot(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);

        $tick = $this->optionalInt($params, 'tick');
        $vsLogTick = $this->optionalInt($params, 'vsLogTick') ?? $this->optionalInt($params, 'vs_log_tick');
        if ($tick === null || $vsLogTick === null) {
            throw new InvalidArgumentException('tick and vsLogTick are required.');
        }

        $hostState = $this->loadSnapshotState($lobbyDir, $tick);
        if ($hostState === null) {
            http_response_code(404);
            return [
                'success' => false,
                'error' => "Host snapshot not found for tick {$tick}",
                'hint' => 'Call list_snapshots to see available ticks.',
            ];
        }

        $clientState = $this->findStateDumpInLog($lobbyDir, $vsLogTick);
        if ($clientState === null) {
            http_response_code(404);
            return [
                'success' => false,
                'error' => "No client state dump found in lobby_log near tick {$vsLogTick}",
                'hint' => 'Client state dumps appear when Debug Console logs local serialized state. '
                    . 'Try get_lobby_log with keyword serializedGameState or enable user_state logging.',
            ];
        }

        $keyFields = ['randomSeed', 'gameTick', 'gameTime'];
        $keyComparison = [];
        foreach ($keyFields as $field) {
            $keyComparison[$field] = [
                'host' => $hostState[$field] ?? null,
                'client' => $clientState[$field] ?? null,
                'match' => ($hostState[$field] ?? null) === ($clientState[$field] ?? null),
            ];
        }

        $divergentTopLevel = [];
        $allKeys = array_unique(array_merge(array_keys($hostState), array_keys($clientState)));
        sort($allKeys);
        foreach ($allKeys as $key) {
            $a = $hostState[$key] ?? null;
            $b = $clientState[$key] ?? null;
            if (json_encode($a) !== json_encode($b)) {
                $divergentTopLevel[] = $key;
            }
        }

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'hostTick' => $tick,
            'clientLogTick' => $vsLogTick,
            'keyFields' => $keyComparison,
            'statesAgree' => $divergentTopLevel === [],
            'divergentTopLevelFields' => $divergentTopLevel,
            'hint' => !($keyComparison['randomSeed']['match'] ?? false)
                ? 'randomSeed differs — genuine simulation divergence.'
                : (($divergentTopLevel === [])
                    ? 'Serialized states match — possible phantom desync (fingerprint-only divergence).'
                    : 'Top-level fields differ — inspect divergentTopLevelFields or use local desyncDebug-diffSnapshot --field.'),
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function getGame(array $params): array
    {
        $lobbyId = $this->requireLobbyId($params);
        $lobbyDir = $this->lobbyDirOrError($lobbyId);

        $gameFiles = [];
        foreach (scandir($lobbyDir) ?: [] as $entry) {
            if (preg_match('/^game_([A-Za-z0-9_-]+)\.json$/', $entry, $m)) {
                $gameFiles[] = $m[1];
            }
        }

        $lobby = $this->manager->getLobby($lobbyId);
        $activeGameId = $lobby?->getGameId();

        $payload = null;
        $loadedGameId = null;
        if ($activeGameId !== null && $activeGameId !== '') {
            $path = $lobbyDir . '/game_' . $activeGameId . '.json';
            if (is_file($path)) {
                $raw = file_get_contents($path);
                $decoded = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($decoded)) {
                    $payload = $decoded;
                    $loadedGameId = $activeGameId;
                }
            }
        } elseif (count($gameFiles) === 1) {
            $loadedGameId = $gameFiles[0];
            $path = $lobbyDir . '/game_' . $loadedGameId . '.json';
            $raw = file_get_contents($path);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }

        if ($payload === null) {
            return [
                'success' => true,
                'lobby' => $lobbyId,
                'gameId' => $activeGameId,
                'gameFilesOnDisk' => $gameFiles,
                'game' => null,
                'hint' => $gameFiles === []
                    ? 'No game_<id>.json files found. Lobby may not have started a game yet.'
                    : 'Multiple game files on disk — pass gameId from overview or lobby_log.',
            ];
        }

        return [
            'success' => true,
            'lobby' => $lobbyId,
            'gameId' => $loadedGameId,
            'gameFilesOnDisk' => $gameFiles,
            'game' => $payload,
        ];
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * @param array<string, mixed> $params
     */
    private function requireLobbyId(array $params): string
    {
        $lobbyId = isset($params['lobby']) ? strtoupper(trim((string) $params['lobby'])) : '';
        if ($lobbyId === '') {
            throw new InvalidArgumentException(
                'lobby is required (short lobby code, e.g. F22344). Pass as query param or JSON body field.'
            );
        }
        if (!preg_match('#^[A-Z0-9]+$#', $lobbyId)) {
            throw new InvalidArgumentException('Invalid lobby code format. Expected alphanumeric uppercase id.');
        }
        return $lobbyId;
    }

    private function lobbyDirOrError(string $lobbyId): string
    {
        $dir = $this->storageRoot . '/lobbies/' . $lobbyId;
        if (!is_dir($dir)) {
            http_response_code(404);
            throw new InvalidArgumentException(
                "Lobby {$lobbyId} not found at storage/lobbies/{$lobbyId}/. "
                . 'Confirm you are querying the correct environment (local vs production).'
            );
        }
        return $dir;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function playersFromLobby(string $lobbyId): array
    {
        $lobby = $this->manager->getLobby($lobbyId);
        if ($lobby === null) {
            $statePath = $this->storageRoot . '/lobbies/' . $lobbyId . '/lobby_state.json';
            if (!is_file($statePath)) {
                return [];
            }
            $data = json_decode((string) file_get_contents($statePath), true);
            if (!is_array($data)) {
                return [];
            }
            $players = [];
            foreach ($data['players'] ?? [] as $playerId => $player) {
                if (!is_array($player)) {
                    continue;
                }
                $players[] = [
                    'id' => (string) $playerId,
                    'name' => $player['name'] ?? null,
                    'isHost' => ($data['hostId'] ?? null) === $playerId,
                ];
            }
            return $players;
        }

        $out = [];
        foreach ($lobby->getPlayers() as $player) {
            $arr = $player->toArray(true);
            $out[] = [
                'id' => $arr['id'] ?? null,
                'name' => $arr['name'] ?? null,
                'isHost' => (bool) ($arr['isHost'] ?? false),
            ];
        }
        return $out;
    }

    /**
     * @return array<string, bool>
     */
    private function scanArtifacts(string $lobbyDir): array
    {
        $checks = [
            'lobby_state.json' => is_file($lobbyDir . '/lobby_state.json'),
            'lobby_log.jsonl' => is_file($lobbyDir . '/lobby_log.jsonl'),
            'fingerprints.jsonl' => is_file($lobbyDir . '/fingerprints.jsonl'),
            'applied_orders.jsonl' => is_file($lobbyDir . '/applied_orders.jsonl'),
            'pending_orders.jsonl' => is_file($lobbyDir . '/pending_orders.jsonl'),
            'initial_state.json' => is_file($lobbyDir . '/initial_state.json'),
            'snapshots/' => is_dir($lobbyDir . '/snapshots'),
            'user_state/' => is_dir($lobbyDir . '/user_state'),
        ];
        return $checks;
    }

    /**
     * @param array<string, bool> $artifacts
     * @return list<string>
     */
    private function overviewHints(array $artifacts): array
    {
        $hints = [];
        if (!$artifacts['lobby_log.jsonl']) {
            $hints[] = 'lobby_log.jsonl missing — enable persisted lobby log or LOBBY_LOG_BATTLE_SYNC before reproducing.';
        }
        if ($artifacts['user_state/']) {
            $hints[] = 'user_state/ present — prefer get_user_state for per-player SerializedGameState.';
        } elseif (!$artifacts['fingerprints.jsonl']) {
            $hints[] = 'No user_state or fingerprints yet — battle sync may not have started.';
        }
        if ($artifacts['snapshots/']) {
            $hints[] = 'Snapshots on disk — use list_snapshots then get_snapshots.';
        }
        return $hints;
    }

    /**
     * @return list<int>
     */
    private function listSnapshotTicks(string $lobbyDir): array
    {
        $snapDir = $lobbyDir . '/snapshots';
        if (!is_dir($snapDir)) {
            return [];
        }
        $ticks = [];
        foreach (scandir($snapDir) ?: [] as $file) {
            if (!is_string($file) || !preg_match('/^(\d+)\.json$/', $file, $m)) {
                continue;
            }
            $ticks[] = (int) $m[1];
        }
        sort($ticks);
        return $ticks;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function readJsonl(string $path): array
    {
        $out = [];
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return [];
        }
        try {
            while (!feof($fh)) {
                $line = fgets($fh);
                if ($line === false) {
                    break;
                }
                $trimmed = trim($line);
                if ($trimmed === '') {
                    continue;
                }
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    $out[] = $decoded;
                }
            }
        } finally {
            fclose($fh);
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $obj
     */
    private function extractTick(array $obj): ?int
    {
        foreach (['tick', 'gameTick', 'atTick'] as $key) {
            if (isset($obj[$key]) && is_numeric($obj[$key])) {
                return (int) $obj[$key];
            }
        }
        if (isset($obj['context']) && is_array($obj['context'])) {
            foreach (['engineTick', 'tick'] as $key) {
                if (isset($obj['context'][$key]) && is_numeric($obj['context'][$key])) {
                    return (int) $obj['context'][$key];
                }
            }
        }
        return null;
    }

    /**
     * @param array<string, mixed> $params
     * @return array{0:int,1:int}
     */
    private function requireTickRange(array $params, string $fromKey, string $toKey): array
    {
        $from = $this->optionalInt($params, $fromKey);
        $to = $this->optionalInt($params, $toKey);
        if ($from === null || $to === null) {
            throw new InvalidArgumentException("{$fromKey} and {$toKey} are required integer tick bounds.");
        }
        if ($from < 0 || $to < $from) {
            throw new InvalidArgumentException("Invalid tick range: {$fromKey} must be >= 0 and <= {$toKey}.");
        }
        if (($to - $from) > self::MAX_TICK_RANGE) {
            throw new InvalidArgumentException('Tick range too large (max ' . self::MAX_TICK_RANGE . ').');
        }
        return [$from, $to];
    }

    /**
     * @param array<string, mixed> $params
     */
    private function optionalInt(array $params, string $key): ?int
    {
        if (!isset($params[$key]) || $params[$key] === '' || $params[$key] === null) {
            return null;
        }
        if (!is_numeric($params[$key])) {
            throw new InvalidArgumentException("{$key} must be an integer.");
        }
        return (int) $params[$key];
    }

    /**
     * @param array<string, mixed> $params
     * @return list<string>
     */
    private function stringList(array $params, string $key): array
    {
        if (!isset($params[$key])) {
            return [];
        }
        $raw = $params[$key];
        if (is_string($raw)) {
            return $raw === '' ? [] : [strtolower($raw)];
        }
        if (is_array($raw)) {
            return array_values(array_filter(array_map(
                fn($v) => is_string($v) ? strtolower($v) : '',
                $raw
            )));
        }
        return [];
    }

  private function parseSeverityFloor(mixed $severity): int
    {
        if ($severity === null || $severity === '') {
            return -1;
        }
        $idx = array_search(strtolower((string) $severity), self::SEVERITY_LEVELS, true);
        if ($idx === false) {
            throw new InvalidArgumentException(
                'Invalid severity. Use one of: ' . implode(', ', self::SEVERITY_LEVELS)
            );
        }
        return (int) $idx;
    }

    /**
     * @param array<string, mixed> $obj
     * @param list<string> $keywords
     */
    private function matchesLobbyLogFilters(
        array $obj,
        ?int $fromTick,
        ?int $toTick,
        array $keywords,
        int $severityFloor
    ): bool {
        $tick = $this->extractTick($obj);
        if ($fromTick !== null && ($tick === null || $tick < $fromTick)) {
            return false;
        }
        if ($toTick !== null && ($tick === null || $tick > $toTick)) {
            return false;
        }
        if ($severityFloor >= 0) {
            $entryLevel = array_search(strtolower((string) ($obj['severity'] ?? '')), self::SEVERITY_LEVELS, true);
            if ($entryLevel === false || $entryLevel < $severityFloor) {
                return false;
            }
        }
        if ($keywords !== [] && !$this->lineMatchesKeywords($obj, $keywords)) {
            return false;
        }
        return true;
    }

    /**
     * @param array<string, mixed> $obj
     * @param list<string> $keywords
     */
    private function lineMatchesKeywords(array $obj, array $keywords): bool
    {
        $encoded = json_encode($obj);
        if (!is_string($encoded)) {
            return false;
        }
        $raw = strtolower($encoded);
        foreach ($keywords as $keyword) {
            if ($keyword !== '' && str_contains($raw, $keyword)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function filterJsonlByTickRange(string $path, int $fromTick, int $toTick): array
    {
        $entries = [];
        foreach ($this->readJsonl($path) as $obj) {
            if (count($entries) >= self::MAX_JSONL_RESULTS) {
                break;
            }
            $tick = $this->extractTick($obj);
            if ($tick === null || $tick < $fromTick || $tick > $toTick) {
                continue;
            }
            $entries[] = $obj;
        }
        return $entries;
    }

    /**
     * @param list<array<string, mixed>> $objects
     * @return list<array<string, mixed>>
     */
    private function filterObjectsByTickRange(array $objects, int $fromTick, int $toTick): array
    {
        $out = [];
        foreach ($objects as $obj) {
            $tick = $this->extractTick($obj);
            if ($tick !== null && $tick >= $fromTick && $tick <= $toTick) {
                $out[] = $obj;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $event
     */
    private function isDesyncEvent(array $event): bool
    {
        $msg = strtolower((string) ($event['message'] ?? ''));
        return str_contains($msg, 'fingerprint')
            && (str_contains($msg, 'mismatch') || str_contains($msg, 'desync') || str_contains($msg, 'resync'));
    }

    /**
     * @param list<int> $ticks
     */
    private function nearestTick(array $ticks, int $target): ?int
    {
        if ($ticks === []) {
            return null;
        }
        $best = $ticks[0];
        foreach ($ticks as $t) {
            if (abs($t - $target) < abs($best - $target)) {
                $best = $t;
            }
        }
        return $best;
    }

    /**
     * @param list<int> $available
     * @param list<int> $missing
     */
    private function nearestTicksHint(array $available, array $missing): string
    {
        if ($available === []) {
            return '(none on disk)';
        }
        $parts = [];
        foreach ($missing as $tick) {
            $nearest = $this->nearestTick($available, $tick);
            if ($nearest !== null) {
                $parts[] = "{$tick}→{$nearest}";
            }
        }
        return $parts !== [] ? implode(', ', $parts) : implode(', ', array_slice($available, -5));
    }

    /**
     * @param mixed $raw
     * @return list<int>
     */
    private function parseTickList(mixed $raw): array
    {
        if ($raw === null || $raw === '') {
            return [];
        }
        if (is_array($raw)) {
            return array_values(array_unique(array_map('intval', $raw)));
        }
        if (is_string($raw)) {
            $parts = preg_split('/\s*,\s*/', $raw) ?: [];
            return array_values(array_unique(array_map('intval', $parts)));
        }
        return [];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function loadSnapshotState(string $lobbyDir, int $tick): ?array
    {
        $path = $lobbyDir . '/snapshots/' . $tick . '.json';
        if (!is_file($path)) {
            return null;
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        if (!is_array($decoded)) {
            return null;
        }
        return $this->normalizeGameState($decoded);
    }

    /**
     * @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    private function normalizeGameState(array $raw): array
    {
        if (isset($raw['state']) && is_array($raw['state'])) {
            return $raw['state'];
        }
        foreach (['game_state', 'gameState'] as $key) {
            if (isset($raw[$key]) && is_array($raw[$key])) {
                return $raw[$key];
            }
        }
        return $raw;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findStateDumpInLog(string $lobbyDir, int $searchTick): ?array
    {
        $logPath = $lobbyDir . '/lobby_log.jsonl';
        if (!is_file($logPath)) {
            return null;
        }

        $best = null;
        $bestDistance = PHP_INT_MAX;
        foreach ($this->readJsonl($logPath) as $obj) {
            $tick = $this->extractTick($obj);
            if ($tick === null) {
                continue;
            }
            $ctx = $obj['context'] ?? null;
            if (!is_array($ctx)) {
                continue;
            }
            $state = null;
            foreach (['serializedGameState', 'state', 'game_state', 'gameState'] as $key) {
                if (isset($ctx[$key]) && is_array($ctx[$key])) {
                    $state = $ctx[$key];
                    break;
                }
            }
            if ($state === null) {
                continue;
            }
            $distance = abs($tick - $searchTick);
            if ($distance < $bestDistance) {
                $bestDistance = $distance;
                $best = $state;
            }
            if ($tick === $searchTick) {
                return $state;
            }
        }
        return $best;
    }
}
