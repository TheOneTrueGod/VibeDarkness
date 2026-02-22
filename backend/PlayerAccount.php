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

    public function __construct(
        int $id,
        string $name,
        string $passwordHash,
        string $role,
        int $fire,
        int $water,
        int $earth,
        int $air
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->passwordHash = $passwordHash;
        $this->role = $role === self::ROLE_ADMIN ? self::ROLE_ADMIN : self::ROLE_USER;
        $this->fire = $fire;
        $this->water = $water;
        $this->earth = $earth;
        $this->air = $air;
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
        ];
    }

    /** Full array for storage (includes password hash) */
    public function toStorageArray(): array
    {
        return array_merge($this->toArray(), ['passwordHash' => $this->passwordHash]);
    }

    public static function fromArray(array $data): self
    {
        $passwordHash = $data['passwordHash'] ?? $data['password_hash'] ?? '';
        $role = $data['role'] ?? self::ROLE_USER;
        return new self(
            (int) $data['id'],
            $data['name'],
            $passwordHash,
            $role,
            (int) ($data['fire'] ?? 0),
            (int) ($data['water'] ?? 0),
            (int) ($data['earth'] ?? 0),
            (int) ($data['air'] ?? 0)
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
