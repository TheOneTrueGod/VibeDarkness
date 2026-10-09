<?php

namespace App\Migrations;

/**
 * Persistent record of applied migrations: <storage>/_migrations/ledger.json.
 *
 * Shape:
 *   {
 *     "currentVersion": 1,
 *     "applied": [
 *       { "version": 1, "name": "...", "checksum": "sha256", "appliedAt": "ISO-8601",
 *         "durationMs": 123, "backupDir": "_migration_backup/..." }
 *     ]
 *   }
 *
 * Written atomically (temp file + rename) after each successful migration, so a crash
 * can never leave a half-written ledger.
 */
final class MigrationLedger
{
    public const DIR = '_migrations';
    public const FILE = 'ledger.json';

    /** @var list<array<string, mixed>> */
    private array $applied = [];
    private int $currentVersion = 0;

    private function __construct(private readonly string $path)
    {
    }

    public static function load(string $storageDir): self
    {
        $ledger = new self($storageDir . '/' . self::DIR . '/' . self::FILE);
        if (is_file($ledger->path)) {
            $data = json_decode((string) file_get_contents($ledger->path), true);
            if (!is_array($data)) {
                throw new \RuntimeException("Migration ledger is corrupt: {$ledger->path}");
            }
            $ledger->currentVersion = (int) ($data['currentVersion'] ?? 0);
            $ledger->applied = array_values(array_filter(
                is_array($data['applied'] ?? null) ? $data['applied'] : [],
                'is_array'
            ));
        }
        return $ledger;
    }

    public function currentVersion(): int
    {
        return $this->currentVersion;
    }

    /** @return list<array<string, mixed>> */
    public function applied(): array
    {
        return $this->applied;
    }

    /** @return array<string, mixed>|null */
    public function entryFor(int $version): ?array
    {
        foreach ($this->applied as $entry) {
            if ((int) ($entry['version'] ?? 0) === $version) {
                return $entry;
            }
        }
        return null;
    }

    /** @param array<string, mixed> $entry */
    public function record(array $entry): void
    {
        $this->applied[] = $entry;
        $this->currentVersion = (int) $entry['version'];
        $this->save();
    }

    private function save(): void
    {
        $dir = dirname($this->path);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException("Cannot create {$dir}");
        }
        $json = json_encode(
            ['currentVersion' => $this->currentVersion, 'applied' => $this->applied],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
        );
        $tmp = $this->path . '.tmp';
        if (file_put_contents($tmp, $json . "\n", LOCK_EX) === false || !rename($tmp, $this->path)) {
            throw new \RuntimeException("Cannot write migration ledger: {$this->path}");
        }
    }
}
