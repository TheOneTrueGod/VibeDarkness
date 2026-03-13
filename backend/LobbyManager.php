<?php

namespace App;

use App\Game\BaseGame;
use App\Game\MinionBattlesGame;

/**
 * Singleton manager for all game lobbies.
 * Handles lobby creation, lookup, and cleanup. All communication is HTTP (polling).
 */
class LobbyManager
{
    private static ?LobbyManager $instance = null;
    private array $lobbies = [];

    private const ACTIVE_LOBBY_TTL_SECONDS = 600; // 10 minutes
    private const ACTIVE_LOBBY_MAX = 5;

    private function __construct() {}

    public static function getInstance(): LobbyManager
    {
        if (self::$instance === null) {
            self::$instance = new LobbyManager();
        }
        return self::$instance;
    }

    /**
     * Create a new lobby
     */
    public function createLobby(
        string $name,
        string $hostPlayerId,
        string $hostPlayerName,
        int $maxPlayers = 8,
        bool $isPublic = true
    ): array {
        $lobbyId = $this->generateLobbyId();
        
        $lobby = new Lobby($lobbyId, $name, $hostPlayerId, $maxPlayers, $isPublic);
        
        // Create the host player
        $hostPlayer = new Player($hostPlayerId, $hostPlayerName, true);
        $lobby->addPlayer($hostPlayer);
        
        $this->lobbies[$lobbyId] = $lobby;
        $lobby->addMessage('player_join', [
            'playerId' => $hostPlayer->getId(),
            'playerName' => $hostPlayer->getName(),
            'color' => $hostPlayer->getColor(),
            'isHost' => true,
        ]);
        $this->persistLobby($lobby);

        return [
            'lobby' => $lobby->toArray(true),
            'player' => $hostPlayer->toArray(true),
        ];
    }

    /**
     * Get a lobby by ID. If not in memory (e.g. created via HTTP), load from shared storage.
     */
    public function getLobby(string $lobbyId): ?Lobby
    {
        if (isset($this->lobbies[$lobbyId])) {
            return $this->lobbies[$lobbyId];
        }
        return $this->loadLobbyFromStorage($lobbyId);
    }

    /**
     * Get all public lobbies
     */
    public function getPublicLobbies(): array
    {
        $this->cleanupInactiveLobbies();
        
        return array_values(array_filter(
            array_map(fn($lobby) => $lobby->toArray(), $this->lobbies),
            fn($lobby) => $lobby['isPublic']
        ));
    }

    /**
     * Path to the flat file storing active lobbies (shared across processes).
     */
    private function getActiveLobbiesFilePath(): string
    {
        $dir = dirname(__DIR__) . '/storage';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir . '/active_lobbies.json';
    }

    /**
     * Load active lobbies list from file. Returns list of entries with lobby_id, last_update, player_ids.
     *
     * @return list<array{lobby_id: string, last_update: int, player_ids: list<string>}>
     */
    private function loadActiveLobbiesFromFile(): array
    {
        $path = $this->getActiveLobbiesFilePath();
        if (!is_file($path)) {
            return [];
        }
        $json = @file_get_contents($path);
        if ($json === false) {
            return [];
        }
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return [];
        }
        $list = [];
        foreach ($data as $entry) {
            if (is_array($entry) && isset($entry['lobby_id'], $entry['last_update'], $entry['player_ids'])) {
                $list[] = [
                    'lobby_id' => (string) $entry['lobby_id'],
                    'last_update' => (int) $entry['last_update'],
                    'player_ids' => array_values(array_map('strval', (array) $entry['player_ids'])),
                ];
            }
        }
        return $list;
    }

    /**
     * Save active lobbies list to file (exclusive lock for concurrent safety).
     *
     * @param list<array{lobby_id: string, last_update: int, player_ids: list<string>}> $list
     */
    private function saveActiveLobbiesToFile(array $list): void
    {
        $path = $this->getActiveLobbiesFilePath();
        file_put_contents($path, json_encode($list, JSON_PRETTY_PRINT), LOCK_EX);
    }

    /**
     * Record that a lobby had a get-state call. Updates the active-lobbies file (last 5, prune after 10 min).
     * Uses exclusive file lock for the whole read-modify-write so concurrent requests don't overwrite each other.
     */
    public function recordLobbyActivity(string $lobbyId, Lobby $lobby): void
    {
        $now = time();
        $playerIds = array_values(array_map(fn(Player $p) => $p->getId(), $lobby->getPlayers()));

        $path = $this->getActiveLobbiesFilePath();
        $fp = fopen($path, 'c+');
        if ($fp === false) {
            return;
        }
        if (!flock($fp, LOCK_EX)) {
            fclose($fp);
            return;
        }
        $json = stream_get_contents($fp);
        $list = [];
        if ($json !== false && $json !== '') {
            $data = json_decode($json, true);
            if (is_array($data)) {
                foreach ($data as $entry) {
                    if (is_array($entry) && isset($entry['lobby_id'], $entry['last_update'], $entry['player_ids'])) {
                        $list[] = [
                            'lobby_id' => (string) $entry['lobby_id'],
                            'last_update' => (int) $entry['last_update'],
                            'player_ids' => array_values(array_map('strval', (array) $entry['player_ids'])),
                        ];
                    }
                }
            }
        }
        $list = array_values(array_filter(
            $list,
            fn($entry) => ($now - $entry['last_update']) < self::ACTIVE_LOBBY_TTL_SECONDS
        ));
        $list = array_values(array_filter($list, fn($entry) => $entry['lobby_id'] !== $lobbyId));
        array_unshift($list, [
            'lobby_id' => $lobbyId,
            'last_update' => $now,
            'player_ids' => $playerIds,
        ]);
        $list = array_slice($list, 0, self::ACTIVE_LOBBY_MAX);
        $out = json_encode($list, JSON_PRETTY_PRINT);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $out);
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
    }

    /**
     * Get active lobbies (lobbies that had a get-state call in the last 10 minutes). Max 5.
     * Returns list of { lobby_id, last_update, player_ids } with name, lobbyState, gameType when lobby exists.
     */
    public function getActiveLobbies(): array
    {
        $now = time();
        $list = $this->loadActiveLobbiesFromFile();
        $list = array_values(array_filter(
            $list,
            fn($entry) => ($now - $entry['last_update']) < self::ACTIVE_LOBBY_TTL_SECONDS
        ));

        $result = [];
        foreach ($list as $entry) {
            $row = [
                'lobby_id' => $entry['lobby_id'],
                'last_update' => $entry['last_update'],
                'player_ids' => $entry['player_ids'],
            ];
            $lobby = $this->getLobby($entry['lobby_id']);
            if ($lobby !== null) {
                $row['name'] = $lobby->getName();
                $row['lobbyState'] = $lobby->getLobbyState();
                $row['gameType'] = $lobby->getGameType();
            }
            $result[] = $row;
        }
        return $result;
    }

    /**
     * Join an existing lobby
     */
    public function joinLobby(
        string $lobbyId,
        string $playerId,
        string $playerName
    ): ?array {
        $lobby = $this->getLobby($lobbyId);
        
        if ($lobby === null) {
            return null;
        }
        
        if ($lobby->isFull()) {
            return ['error' => 'Lobby is full'];
        }

        // Check if player already exists (reconnecting)
        $existingPlayer = $lobby->getPlayer($playerId);
        if ($existingPlayer) {
            return [
                'lobby' => $lobby->toArray(true),
                'player' => $existingPlayer->toArray(true),
                'isRejoin' => true,
            ];
        }

        $player = new Player($playerId, $playerName);
        
        if (!$lobby->addPlayer($player)) {
            return ['error' => 'Failed to join lobby'];
        }

        $lobby->addMessage('player_join', [
            'playerId' => $player->getId(),
            'playerName' => $player->getName(),
            'color' => $player->getColor(),
            'isHost' => false,
        ]);
        $this->persistLobby($lobby);

        return [
            'lobby' => $lobby->toArray(true),
            'player' => $player->toArray(true),
            'isRejoin' => false,
        ];
    }

    /**
     * Permanently remove a player from a lobby
     */
    public function leaveLobby(string $lobbyId, string $playerId): bool
    {
        $lobby = $this->getLobby($lobbyId);

        if ($lobby === null) {
            return false;
        }

        $player = $lobby->getPlayer($playerId);
        if ($player === null) {
            return false;
        }

        $playerName = $player->getName();
        $wasHost = $player->isHost();
        $lobby->addMessage('player_leave', ['playerId' => $playerId, 'playerName' => $playerName]);
        $lobby->removePlayer($playerId);

        if ($wasHost && !$lobby->isEmpty()) {
            $newHost = $lobby->getHost();
            if ($newHost !== null) {
                $lobby->addMessage('host_changed', ['newHostId' => $newHost->getId()]);
            }
        }

        $this->persistLobby($lobby);

        if ($lobby->isEmpty()) {
            unset($this->lobbies[$lobbyId]);
        }

        return true;
    }

    /**
     * Get recent messages for a lobby (for polling clients).
     * If $afterMessageId is null, returns the most recent $limit messages.
     * Otherwise returns up to $limit messages after that id.
     */
    public function getMessages(string $lobbyId, ?int $afterMessageId, int $limit = 10): array
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return [];
        }
        return $lobby->getMessages($afterMessageId, $limit);
    }

    /**
     * Add a chat message and persist (for HTTP clients).
     * @return array{messageId: int, chatEntry: array}|null
     */
    public function addChatMessage(string $lobbyId, string $playerId, string $message): ?array
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return null;
        }
        $chatEntry = $lobby->addChatMessage($playerId, $message);
        $this->persistLobby($lobby);
        return [
            'messageId' => $lobby->getLastMessageId(),
            'chatEntry' => $chatEntry,
        ];
    }

    /**
     * Add an NPC chat message and persist (for level events).
     * @return array{messageId: int, chatEntry: array}|null
     */
    public function addNpcChatMessage(string $lobbyId, string $npcId, string $message): ?array
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return null;
        }
        $chatEntry = $lobby->addNpcChatMessage($npcId, $message);
        $this->persistLobby($lobby);
        return [
            'messageId' => $lobby->getLastMessageId(),
            'chatEntry' => $chatEntry,
        ];
    }

    /**
     * Record a click and add to message log (for HTTP clients).
     */
    public function recordClick(string $lobbyId, string $playerId, float $x, float $y): ?int
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return null;
        }
        $player = $lobby->getPlayer($playerId);
        if ($player === null) {
            return null;
        }
        $player->setLastClick($x, $y);
        $messageId = $lobby->addMessage('click', [
            'playerId' => $player->getId(),
            'playerName' => $player->getName(),
            'color' => $player->getColor(),
            'x' => $x,
            'y' => $y,
        ]);
        $this->persistLobby($lobby);
        return $messageId;
    }

    /**
     * Verify a player is in the lobby (for message API auth).
     */
    public function isPlayerInLobby(string $lobbyId, string $playerId): bool
    {
        $lobby = $this->getLobby($lobbyId);
        return $lobby !== null && $lobby->getPlayer($playerId) !== null;
    }

    /**
     * Registry: game type id => class with static createInitialState(string $lobbyId, array $playerIds).
     * @var array<string, class-string<BaseGame>>
     */
    private const GAME_REGISTRY = [
        'minion_battles' => MinionBattlesGame::class,
    ];

    /**
     * Set lobby state (host only). state: 'home' | 'in_game'.
     * When in_game, $gameId is treated as game type id (e.g. minion_battles); a unique instance id is generated
     * and the game state file is created at storage/lobbies/<lobby_id>/game_<instance_id>.json.
     */
    public function setLobbyState(string $lobbyId, string $playerId, string $state, ?string $gameId = null): bool
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return false;
        }
        $player = $lobby->getPlayer($playerId);
        if ($player === null || !$player->isHost()) {
            return false;
        }
        if ($state === 'in_game') {
            if (empty($gameId) || !is_string($gameId)) {
                return false;
            }
            $gameTypeId = $gameId;
            $gameClass = self::GAME_REGISTRY[$gameTypeId] ?? null;
            if ($gameClass === null) {
                return false;
            }
            $instanceId = $this->generateGameInstanceId($lobbyId);
            $playerIds = array_keys($lobby->getPlayers());
            $initialState = $gameClass::createInitialState($lobbyId, $playerIds);
            $initialState['gameId'] = $instanceId;
            $initialState['gameType'] = $gameTypeId;
            $this->persistGameState($lobbyId, $instanceId, $initialState);
            $lobby->setLobbyState('in_game', $instanceId, $gameTypeId);
        } else {
            $lobby->setLobbyState($state, null, null);
        }
        $this->persistLobby($lobby);
        return true;
    }

    private function generateGameInstanceId(string $lobbyId): string
    {
        $dir = $this->getStoragePath() . '/' . $lobbyId;
        if (!is_dir($dir)) {
            return preg_replace('/[^a-zA-Z0-9_-]/', '_', str_replace('.', '_', uniqid('', true)));
        }
        do {
            $id = preg_replace('/[^a-zA-Z0-9_-]/', '_', str_replace('.', '_', uniqid('', true)));
        } while (is_file($dir . '/game_' . $id . '.json'));
        return $id;
    }

    private function persistGameState(string $lobbyId, string $gameId, array $state): void
    {
        $dir = $this->getStoragePath() . '/' . $lobbyId;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $path = $dir . '/game_' . $gameId . '.json';
        file_put_contents($path, json_encode($state, JSON_PRETTY_PRINT));
    }

    /**
     * Clean up inactive lobbies
     */
    public function cleanupInactiveLobbies(): int
    {
        $removed = 0;
        
        foreach ($this->lobbies as $id => $lobby) {
            if ($lobby->isInactive() || $lobby->isEmpty()) {
                unset($this->lobbies[$id]);
                $removed++;
            }
        }
        
        return $removed;
    }

    /**
     * Generate a unique lobby ID
     */
    private function generateLobbyId(): string
    {
        $storageDir = $this->getStoragePath();
        do {
            $id = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        } while (isset($this->lobbies[$id]) || (is_dir($storageDir) && file_exists($storageDir . '/' . $id . '.json')));
        
        return $id;
    }

    private function getStoragePath(): string
    {
        $path = dirname(__DIR__) . '/storage/lobbies';
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
        return $path;
    }

    /**
     * Persist lobby to shared storage (used for getLobby when not in memory)
     */
    public function persistLobby(Lobby $lobby): void
    {
        $path = $this->getStoragePath() . '/' . $lobby->getId() . '.json';
        file_put_contents($path, json_encode($lobby->toArrayForStorage(), JSON_PRETTY_PRINT));
    }

    /**
     * Load a lobby from shared storage (e.g. lobby created in another request)
     */
    private function loadLobbyFromStorage(string $lobbyId): ?Lobby
    {
        $path = $this->getStoragePath() . '/' . $lobbyId . '.json';
        if (!is_file($path)) {
            return null;
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }
        $lobby = Lobby::fromArray($data);
        $this->lobbies[$lobbyId] = $lobby;
        return $lobby;
    }

    /**
     * Load game state from storage (for inclusion in lobby state response when in game).
     * Returns the most recent checkpoint snapshot if any exist, otherwise falls back to game_<gameId>.json.
     */
    public function getGameStateData(string $lobbyId, string $gameId): ?array
    {
        $basePath = $this->getStoragePath() . '/' . $lobbyId;
        $checkpointDir = $basePath . '/game_' . $gameId;
        $prefix = 'game_' . $gameId . '_';
        $suffix = '.json';

        // Look for the latest checkpoint
        if (is_dir($checkpointDir)) {
            $latestTick = -1;
            $latestFile = null;
            foreach (scandir($checkpointDir) as $file) {
                if (strpos($file, $prefix) === 0 && substr($file, -strlen($suffix)) === $suffix) {
                    $tickStr = substr($file, strlen($prefix), -strlen($suffix));
                    if (ctype_digit($tickStr)) {
                        $t = (int) $tickStr;
                        if ($t > $latestTick) {
                            $latestTick = $t;
                            $latestFile = $file;
                        }
                    }
                }
            }
            if ($latestFile !== null) {
                $json = file_get_contents($checkpointDir . '/' . $latestFile);
                $checkpoint = json_decode($json, true);
                if (is_array($checkpoint)) {
                    $state = $checkpoint['state'] ?? [];
                    $result = array_merge($state, [
                        'gameTick' => $checkpoint['gameTick'] ?? $latestTick,
                        'orders' => $checkpoint['orders'] ?? [],
                    ]);
                    // Merge phase metadata from main game file (checkpoints only have engine state)
                    $basePathFile = $basePath . '/game_' . $gameId . '.json';
                    if (is_file($basePathFile)) {
                        $baseData = json_decode(file_get_contents($basePathFile), true);
                        if (is_array($baseData)) {
                            foreach (['gamePhase', 'game_phase', 'missionVotes', 'mission_votes', 'characterSelections', 'character_selections', 'characterPortraitIds', 'character_portrait_ids', 'characterSelectReadyPlayerIds', 'character_select_ready_player_ids', 'playerStoryChoices', 'playerEquippedItems', 'storyReadyPlayerIds', 'groupVoteVotes', 'groupVoteApplied'] as $key) {
                                if (array_key_exists($key, $baseData) && $baseData[$key] !== null) {
                                    $result[$key] = $baseData[$key];
                                }
                            }
                            // Also merge dotted keys like characterSelections.1
                            foreach (array_keys($baseData) as $key) {
                                if (strpos($key, 'characterSelections.') === 0 || strpos($key, 'character_selections.') === 0
                                    || strpos($key, 'characterPortraitIds.') === 0 || strpos($key, 'character_portrait_ids.') === 0) {
                                    $result[$key] = $baseData[$key];
                                }
                            }
                        }
                    }
                    return $this->mergePlayerEquipmentIntoState($result);
                }
            }
        }

        // Fall back to legacy game_<gameId>.json
        $path = $basePath . '/game_' . $gameId . '.json';
        if (!is_file($path)) {
            return null;
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }
        return $this->mergePlayerEquipmentIntoState($data);
    }

    /**
     * Merge each selected character's equipment into state as playerEquipmentByPlayer.
     *
     * This also layers in any story-granted equipment from storyGrantedEquipment so that
     * mission/story effects that equip items are reflected in the derived map.
     */
    private function mergePlayerEquipmentIntoState(array $state): array
    {
        $selections = $state['characterSelections'] ?? $state['character_selections'] ?? null;
        if (!is_array($selections) || $selections === []) {
            return $state;
        }
        $characterManager = CharacterManager::getInstance();
        $byPlayer = [];
        foreach ($selections as $playerId => $characterId) {
            $playerId = is_int($playerId) ? (string) $playerId : $playerId;
            if (!is_string($playerId) || !is_string($characterId)) {
                continue;
            }
            $character = $characterManager->getCharacter($characterId);
            if ($character !== null) {
                $byPlayer[$playerId] = $character->getEquipment();
            }
        }

        // Apply story-granted equipment (e.g. deterministic pre-mission grants).
        $granted = $state['storyGrantedEquipment'] ?? [];
        if (is_array($granted) && $granted !== []) {
            foreach ($granted as $playerId => $items) {
                if (!is_array($items)) {
                    continue;
                }
                $playerKey = is_int($playerId) ? (string) $playerId : $playerId;
                if (!isset($byPlayer[$playerKey])) {
                    $byPlayer[$playerKey] = [];
                }
                foreach ($items as $itemId) {
                    if (!is_string($itemId) || $itemId === '') {
                        continue;
                    }
                    if (!in_array($itemId, $byPlayer[$playerKey], true)) {
                        $byPlayer[$playerKey][] = $itemId;
                    }
                }
            }
        }

        if ($byPlayer !== []) {
            $state['playerEquipmentByPlayer'] = $byPlayer;
        }
        return $state;
    }

    /**
     * Update game state (host only). Merges provided data with existing state.
     */
    public function updateGameState(string $lobbyId, string $gameId, string $playerId, array $updates): bool
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return false;
        }
        $player = $lobby->getPlayer($playerId);
        if ($player === null || !$player->isHost()) {
            return false;
        }
        if ($lobby->getGameId() !== $gameId) {
            return false;
        }

        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }

        $newState = array_merge($currentState, $updates);
        $this->persistGameState($lobbyId, $gameId, $newState);
        return true;
    }

    /**
     * Mark a player as ready during character select (any player). Adds playerId to characterSelectReadyPlayerIds.
     */
    public function addCharacterSelectReadyPlayer(string $lobbyId, string $gameId, string $playerId): bool
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null || $lobby->getPlayer($playerId) === null) {
            return false;
        }
        if ($lobby->getGameId() !== $gameId) {
            return false;
        }
        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }
        $ready = $currentState['characterSelectReadyPlayerIds'] ?? $currentState['character_select_ready_player_ids'] ?? [];
        if (!is_array($ready)) {
            $ready = [];
        }
        if (in_array($playerId, $ready, true)) {
            return true;
        }
        $ready[] = $playerId;
        $currentState['characterSelectReadyPlayerIds'] = array_values($ready);
        $this->persistGameState($lobbyId, $gameId, $currentState);
        return true;
    }

    /**
     * Apply a story choice (any player). Merges choice into game state.
     * If itemId is provided, also equips that item on the player's selected character (and removes replaceItemIds).
     *
     * @param list<string> $replaceItemIds Item IDs to unequip when equipping itemId (e.g. same-slot items)
     */
    public function applyStoryChoice(
        string $lobbyId,
        string $gameId,
        string $playerId,
        string $choiceId,
        string $optionId,
        ?string $itemId = null,
        array $replaceItemIds = []
    ): bool {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return false;
        }
        if ($lobby->getPlayer($playerId) === null) {
            return false;
        }
        if ($lobby->getGameId() !== $gameId) {
            return false;
        }

        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }

        $choices = $currentState['playerStoryChoices'] ?? [];
        if (!isset($choices[$playerId]) || !is_array($choices[$playerId])) {
            $choices[$playerId] = [];
        }
        $choices[$playerId][$choiceId] = $optionId;
        $currentState['playerStoryChoices'] = $choices;

        if ($itemId !== null && $itemId !== '') {
            $selections = $currentState['characterSelections'] ?? $currentState['character_selections'] ?? [];
            $characterId = is_array($selections) ? ($selections[$playerId] ?? null) : null;
            if (is_string($characterId) && $characterId !== '') {
                CharacterManager::getInstance()->equipItem($characterId, $itemId, $replaceItemIds);
            }
        }

        $this->persistGameState($lobbyId, $gameId, $currentState);
        return true;
    }

    /**
     * Apply a deterministic "grant equipment to one random player" story effect.
     *
     * The randomness is serialized by deriving a seed from lobbyId, gameId, missionId,
     * phraseIndex, and optional seedSuffix so that all servers/clients agree.
     */
    public function applyStoryGrantEquipmentRandom(
        string $lobbyId,
        string $gameId,
        string $missionId,
        int $phraseIndex,
        string $itemId,
        ?string $seedSuffix = null,
    ): bool {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return false;
        }
        if ($lobby->getGameId() !== $gameId) {
            return false;
        }

        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }

        // Idempotency: only apply once per mission/phraseIndex.
        $applied = $currentState['storyGrantsApplied'] ?? [];
        if (!is_array($applied)) {
            $applied = [];
        }
        if (!isset($applied[$missionId]) || !is_array($applied[$missionId])) {
            $applied[$missionId] = [];
        }
        if (!empty($applied[$missionId][$phraseIndex])) {
            return true;
        }

        $selections = $currentState['characterSelections'] ?? $currentState['character_selections'] ?? [];
        if (!is_array($selections) || $selections === []) {
            return false;
        }

        // Build a stable, sorted list of player IDs.
        $playerIds = [];
        foreach ($selections as $pid => $_) {
            $playerIds[] = is_int($pid) ? (string) $pid : $pid;
        }
        $playerIds = array_values(array_filter($playerIds, static fn ($v): bool => is_string($v) && $v !== ''));
        if ($playerIds === []) {
            return false;
        }
        sort($playerIds, SORT_STRING);

        // Deterministic "random" index based on a hash.
        $seedParts = [$lobbyId, $gameId, $missionId, (string) $phraseIndex, $itemId];
        if ($seedSuffix !== null && $seedSuffix !== '') {
            $seedParts[] = $seedSuffix;
        }
        $hash = crc32(implode('|', $seedParts));
        $index = (int) ($hash % count($playerIds));
        $targetPlayerId = $playerIds[$index] ?? null;
        if (!is_string($targetPlayerId) || $targetPlayerId === '') {
            return false;
        }

        // Record the grant in storyGrantedEquipment so it can be merged into equipment.
        $granted = $currentState['storyGrantedEquipment'] ?? [];
        if (!is_array($granted)) {
            $granted = [];
        }
        if (!isset($granted[$targetPlayerId]) || !is_array($granted[$targetPlayerId])) {
            $granted[$targetPlayerId] = [];
        }
        if (!in_array($itemId, $granted[$targetPlayerId], true)) {
            $granted[$targetPlayerId][] = $itemId;
        }
        $currentState['storyGrantedEquipment'] = $granted;

        $applied[$missionId][$phraseIndex] = true;
        $currentState['storyGrantsApplied'] = $applied;

        $this->persistGameState($lobbyId, $gameId, $currentState);
        return true;
    }

    /**
     * Mark a player as ready at the end of pre-mission story (any player). Merges into game state.
     */
    public function applyStoryReady(string $lobbyId, string $gameId, string $playerId): bool
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return false;
        }
        if ($lobby->getPlayer($playerId) === null) {
            return false;
        }
        if ($lobby->getGameId() !== $gameId) {
            return false;
        }

        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }

        $ready = $currentState['storyReadyPlayerIds'] ?? [];
        if (!is_array($ready)) {
            $ready = [];
        }
        if (!in_array($playerId, $ready, true)) {
            $ready[] = $playerId;
            $currentState['storyReadyPlayerIds'] = $ready;
            $this->persistGameState($lobbyId, $gameId, $currentState);
        }
        return true;
    }

    /**
     * Record a player's vote for a group vote (any player).
     */
    public function applyStoryGroupVote(
        string $lobbyId,
        string $gameId,
        string $playerId,
        string $voteId,
        int $phraseIndex,
        string $optionId
    ): bool {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null || $lobby->getPlayer($playerId) === null || $lobby->getGameId() !== $gameId) {
            return false;
        }

        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }

        $votes = $currentState['groupVoteVotes'] ?? [];
        if (!is_array($votes)) {
            $votes = [];
        }
        if (!isset($votes[$voteId]) || !is_array($votes[$voteId])) {
            $votes[$voteId] = [];
        }
        $votes[$voteId][$playerId] = $optionId;
        $currentState['groupVoteVotes'] = $votes;
        $this->persistGameState($lobbyId, $gameId, $currentState);
        return true;
    }

    /**
     * Resolve a group vote and apply the effect (host only). All players must have voted.
     * Winner = majority; on tie, deterministic (serialized) choice from tied options.
     *
     * @param array{type: string, itemId?: string} $effect e.g. ['type' => 'grant_item_to_player', 'itemId' => '005']
     */
    public function applyStoryGroupVoteApply(
        string $lobbyId,
        string $gameId,
        string $playerId,
        string $voteId,
        int $phraseIndex,
        array $effect
    ): bool {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null || !$lobby->getPlayer($playerId)?->isHost() || $lobby->getGameId() !== $gameId) {
            return false;
        }

        $currentState = $this->getGameStateData($lobbyId, $gameId);
        if ($currentState === null) {
            return false;
        }

        $applied = $currentState['groupVoteApplied'] ?? [];
        if (!is_array($applied)) {
            $applied = [];
        }
        if (!empty($applied[$voteId])) {
            return true;
        }

        $selections = $currentState['characterSelections'] ?? $currentState['character_selections'] ?? [];
        if (!is_array($selections) || $selections === []) {
            return false;
        }
        $allPlayerIds = array_keys($selections);
        $allPlayerIds = array_values(array_filter(array_map(static fn ($p) => is_int($p) ? (string) $p : $p, $allPlayerIds), static fn ($v) => is_string($v) && $v !== ''));

        $votes = $currentState['groupVoteVotes'][$voteId] ?? [];
        if (!is_array($votes)) {
            $votes = [];
        }
        foreach ($allPlayerIds as $pid) {
            if (!isset($votes[$pid]) || !is_string($votes[$pid]) || $votes[$pid] === '') {
                return false;
            }
        }

        $counts = [];
        foreach ($votes as $optionId) {
            $counts[$optionId] = ($counts[$optionId] ?? 0) + 1;
        }
        $maxCount = $counts !== [] ? max($counts) : 0;
        $tied = array_keys(array_filter($counts, static fn ($c) => $c === $maxCount));
        sort($tied, SORT_STRING);
        $winner = $tied[0] ?? null;
        if (count($tied) > 1) {
            $seed = crc32(implode('|', [$lobbyId, $gameId, $voteId]));
            $idx = (int) (abs($seed) % count($tied));
            $winner = $tied[$idx];
        }
        
        $effectType = $effect['type'] ?? '';
        if ($effectType === 'grant_item_to_player' && isset($effect['itemId']) && is_string($effect['itemId']) && $effect['itemId'] !== '') {
            $granted = $currentState['storyGrantedEquipment'] ?? [];
            if (!is_array($granted)) {
                $granted = [];
            }
            if (!isset($granted[$winner]) || !is_array($granted[$winner])) {
                $granted[$winner] = [];
            }
            if (!in_array($effect['itemId'], $granted[$winner], true)) {
                $granted[$winner][] = $effect['itemId'];
            }
            $currentState['storyGrantedEquipment'] = $granted;

            $characterId = $selections[$winner] ?? null;
            if (is_string($characterId) && $characterId !== '') {
                CharacterManager::getInstance()->equipItem($characterId, $effect['itemId'], []);
            }
        }

        $applied[$voteId] = true;
        $currentState['groupVoteApplied'] = $applied;
        $this->persistGameState($lobbyId, $gameId, $currentState);
        return true;
    }

    /**
     * Get statistics
     */
    public function getStats(): array
    {
        $totalPlayers = 0;
        foreach ($this->lobbies as $lobby) {
            $totalPlayers += $lobby->getPlayerCount();
        }
        return [
            'totalLobbies' => count($this->lobbies),
            'totalPlayers' => $totalPlayers,
        ];
    }
}
