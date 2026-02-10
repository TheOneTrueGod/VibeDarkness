<?php

namespace App;

/**
 * Persistent player account with resources.
 * Keyed by auto-increment ID; name provided by user on first sign-in.
 */
class PlayerAccount
{
    private int $id;
    private string $name;
    private int $fire;
    private int $water;
    private int $earth;
    private int $air;

    public function __construct(
        int $id,
        string $name,
        int $fire,
        int $water,
        int $earth,
        int $air
    ) {
        $this->id = $id;
        $this->name = $name;
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

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'fire' => $this->fire,
            'water' => $this->water,
            'earth' => $this->earth,
            'air' => $this->air,
        ];
    }

    public static function fromArray(array $data): self
    {
        return new self(
            (int) $data['id'],
            $data['name'],
            (int) ($data['fire'] ?? 0),
            (int) ($data['water'] ?? 0),
            (int) ($data['earth'] ?? 0),
            (int) ($data['air'] ?? 0)
        );
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
