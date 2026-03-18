<?php

namespace App;

/**
 * Persistent player account with resources.
 * Keyed by auto-increment ID; name provided by user on first sign-in.
 */
class PlayerAccount
{
    public const ROLE_USER = 'user';
    public const ROLE_ADMIN = 'admin';

    private int $id;
    private string $name;
    private string $passwordHash;
    private string $role;
    private int $fire;
    private int $water;
    private int $earth;
    private int $air;
    /** @var string[] Most recent lobby IDs (newest first), max 10 */
    private array $recentLobbies;
    /** @var string[] Campaign IDs this account belongs to */
    private array $campaignIds;
    /** @var string[] Character IDs (campaign characters) owned by this account */
    private array $characterIds;
    /** @var string[] Item IDs owned by this account. */
    private array $inventoryItemIds;

    public function __construct(
        int $id,
        string $name,
        string $passwordHash,
        string $role,
        int $fire,
        int $water,
        int $earth,
        int $air,
        array $recentLobbies = [],
        array $campaignIds = [],
        array $characterIds = [],
        array $inventoryItemIds = []
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->passwordHash = $passwordHash;
        $this->role = $role === self::ROLE_ADMIN ? self::ROLE_ADMIN : self::ROLE_USER;
        $this->fire = $fire;
        $this->water = $water;
        $this->earth = $earth;
        $this->air = $air;
        $this->recentLobbies = $recentLobbies;
        $this->campaignIds = $campaignIds;
        $this->characterIds = $characterIds;
        $this->inventoryItemIds = array_values($inventoryItemIds);
    }

    public function getRecentLobbies(): array
    {
        return $this->recentLobbies;
    }

    /** Add lobby ID to recent list (newest first), limit to 10 */
    public function addRecentLobby(string $lobbyId): void
    {
        $id = strtoupper(trim($lobbyId));
        if ($id === '') {
            return;
        }
        $list = array_values(array_filter($this->recentLobbies, fn ($x) => strtoupper((string) $x) !== $id));
        array_unshift($list, $id);
        $this->recentLobbies = array_slice($list, 0, 10);
    }

    /** @return string[] */
    public function getCampaignIds(): array
    {
        return $this->campaignIds;
    }

    public function addCampaignId(string $campaignId): void
    {
        $id = trim($campaignId);
        if ($id === '') {
            return;
        }
        if (!in_array($id, $this->campaignIds, true)) {
            $this->campaignIds[] = $id;
        }
    }

    /** @return string[] */
    public function getCharacterIds(): array
    {
        return $this->characterIds;
    }

    /** @return string[] */
    public function getInventoryItemIds(): array
    {
        return $this->inventoryItemIds;
    }

    public function addCharacterId(string $characterId): void
    {
        $id = trim($characterId);
        if ($id === '') {
            return;
        }
        if (!in_array($id, $this->characterIds, true)) {
            $this->characterIds[] = $id;
        }
    }

    /** Remove a character ID from the account. */
    public function removeCharacterId(string $characterId): void
    {
        $id = trim($characterId);
        if ($id === '') {
            return;
        }
        $this->characterIds = array_values(array_filter(
            $this->characterIds,
            fn (string $cid) => $cid !== $id
        ));
    }

    public function addInventoryItemId(string $itemId): void
    {
        $id = trim($itemId);
        if ($id === '') {
            return;
        }
        $this->inventoryItemIds[] = $id;
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getRole(): string
    {
        return $this->role;
    }

    public function verifyPassword(string $password): bool
    {
        return password_verify($password, $this->passwordHash);
    }

    public function getFire(): int
    {
        return $this->fire;
    }

    public function getWater(): int
    {
        return $this->water;
    }

    public function getEarth(): int
    {
        return $this->earth;
    }

    public function getAir(): int
    {
        return $this->air;
    }

    /**
     * Resource values as array for API responses
     */
    public function getResources(): array
    {
        return [
            'fire' => $this->fire,
            'water' => $this->water,
            'earth' => $this->earth,
            'air' => $this->air,
        ];
    }

    /** API-safe array (no password) */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'role' => $this->role,
            'fire' => $this->fire,
            'water' => $this->water,
            'earth' => $this->earth,
            'air' => $this->air,
            'recentLobbies' => array_values($this->recentLobbies),
            'campaignIds' => array_values($this->campaignIds),
            'characterIds' => array_values($this->characterIds),
            'inventoryItemIds' => array_values($this->inventoryItemIds),
        ];
    }

    /** Full array for storage (includes password hash, recentLobbies, campaignIds, characterIds) */
    public function toStorageArray(): array
    {
        return array_merge($this->toArray(), [
            'passwordHash' => $this->passwordHash,
            'recentLobbies' => array_values($this->recentLobbies),
            'campaignIds' => array_values($this->campaignIds),
            'characterIds' => array_values($this->characterIds),
        ]);
    }

    public static function fromArray(array $data): self
    {
        $passwordHash = $data['passwordHash'] ?? $data['password_hash'] ?? '';
        $role = $data['role'] ?? self::ROLE_USER;
        $recent = $data['recentLobbies'] ?? [];
        $recent = is_array($recent) ? array_values(array_map('strval', $recent)) : [];
        $campaignIds = $data['campaignIds'] ?? [];
        $campaignIds = is_array($campaignIds) ? array_values(array_map('strval', $campaignIds)) : [];
        $characterIds = $data['characterIds'] ?? [];
        $characterIds = is_array($characterIds) ? array_values(array_map('strval', $characterIds)) : [];
        $inventoryItemIds = $data['inventoryItemIds'] ?? $data['inventoryItems'] ?? [];
        $inventoryItemIds = is_array($inventoryItemIds) ? array_values(array_map('strval', $inventoryItemIds)) : [];
        return new self(
            (int) $data['id'],
            $data['name'],
            $passwordHash,
            $role,
            (int) ($data['fire'] ?? 0),
            (int) ($data['water'] ?? 0),
            (int) ($data['earth'] ?? 0),
            (int) ($data['air'] ?? 0),
            $recent,
            $campaignIds,
            $characterIds,
            $inventoryItemIds
        );
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /**
     * Generate random resource values between 1 and 10
     */
    public static function randomResources(): array
    {
        return [
            'fire' => random_int(1, 10),
            'water' => random_int(1, 10),
            'earth' => random_int(1, 10),
            'air' => random_int(1, 10),
        ];
    }
}
