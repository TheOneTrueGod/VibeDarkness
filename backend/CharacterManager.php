<?php

namespace App;

/**
 * Manages campaign character storage. One file per character at storage/characters/<id>.json.
 */
class CharacterManager
{
    private static ?CharacterManager $instance = null;

    /** @var array<string, Character> */
    private array $cache = [];

    private function __construct() {}

    public static function getInstance(): CharacterManager
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getCharacter(string $id): ?Character
    {
        if (isset($this->cache[$id])) {
            return $this->cache[$id];
        }
        return $this->loadFromStorage($id);
    }

    public function createCharacter(int $ownerAccountId, array $data): Character
    {
        $id = $this->generateId();
        $character = Character::fromArray(array_merge($data, [
            'id' => $id,
            'ownerAccountId' => $ownerAccountId,
        ]));
        $this->persist($character);
        $this->cache[$id] = $character;
        return $character;
    }

    private function getStoragePath(): string
    {
        $path = dirname(__DIR__) . '/storage/characters';
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
        return $path;
    }

    private function generateId(): string
    {
        $path = $this->getStoragePath();
        do {
            $id = 'char_' . strtolower(bin2hex(random_bytes(8)));
        } while (file_exists($path . '/' . $id . '.json'));
        return $id;
    }

    private function persist(Character $character): void
    {
        $path = $this->getStoragePath() . '/' . $character->getId() . '.json';
        file_put_contents($path, json_encode($character->toArray(), JSON_PRETTY_PRINT));
    }

    private function loadFromStorage(string $id): ?Character
    {
        $path = $this->getStoragePath() . '/' . $id . '.json';
        if (!is_file($path)) {
            return null;
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }
        $data['id'] = $id;
        $character = Character::fromArray($data);
        $this->cache[$id] = $character;
        return $character;
    }
}
