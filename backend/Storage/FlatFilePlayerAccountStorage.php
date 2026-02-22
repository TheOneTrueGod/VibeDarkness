<?php

namespace App\Storage;

use App\PlayerAccount;

/**
 * Flat-file implementation of player account storage.
 * Accounts stored as {id}.json; index file tracks nextId and name→id mapping.
 */
class FlatFilePlayerAccountStorage implements PlayerAccountStorageInterface
{
    private string $basePath;
    private string $indexPath;
    private const INDEX_FILENAME = 'accounts_index.json';

    public function __construct(?string $basePath = null)
    {
        $this->basePath = $basePath ?? $this->defaultStoragePath();
        $this->indexPath = $this->basePath . '/' . self::INDEX_FILENAME;
        $this->ensureDirectory();
    }

    private function defaultStoragePath(): string
    {
        $path = dirname(dirname(__DIR__)) . '/storage/accounts';
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
        return $path;
    }

    private function ensureDirectory(): void
    {
        if (!is_dir($this->basePath)) {
            mkdir($this->basePath, 0755, true);
        }
    }

    /**
     * @return array{nextId: int, byName: array<string, int>}
     */
    private function readIndex(): array
    {
        if (!is_file($this->indexPath)) {
            return ['nextId' => 1, 'byName' => []];
        }
        $json = file_get_contents($this->indexPath);
        $data = json_decode($json, true);
        return [
            'nextId' => (int) ($data['nextId'] ?? 1),
            'byName' => is_array($data['byName'] ?? null) ? $data['byName'] : [],
        ];
    }

    private function writeIndex(int $nextId, array $byName): void
    {
        file_put_contents(
            $this->indexPath,
            json_encode(['nextId' => $nextId, 'byName' => $byName], JSON_PRETTY_PRINT)
        );
    }

    public function findById(int $id): ?PlayerAccount
    {
        $path = $this->basePath . '/' . $id . '.json';
        if (!is_file($path)) {
            return null;
        }
        $data = json_decode(file_get_contents($path), true);
        return is_array($data) ? PlayerAccount::fromArray($data) : null;
    }

    public function findByName(string $name): ?PlayerAccount
    {
        $name = trim($name);
        if ($name === '') {
            return null;
        }
        $index = $this->readIndex();
        $id = $index['byName'][$name] ?? null;
        if ($id === null) {
            return null;
        }
        return $this->findById($id);
    }

    public function save(PlayerAccount $account): void
    {
        $index = $this->readIndex();
        $index['byName'][$account->getName()] = $account->getId();
        $path = $this->basePath . '/' . $account->getId() . '.json';
        $data = method_exists($account, 'toStorageArray') ? $account->toStorageArray() : $account->toArray();
        file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
        $this->writeIndex($index['nextId'], $index['byName']);
    }

    public function nextId(): int
    {
        $index = $this->readIndex();
        $id = $index['nextId'];
        $index['nextId'] = $id + 1;
        $this->writeIndex($index['nextId'], $index['byName']);
        return $id;
    }
}
