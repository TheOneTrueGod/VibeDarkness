<?php

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * Append-only lobby-wide debug log: storage/lobbies/<lobbyId>/lobby_log.jsonl
 */
final class LobbyLogStorage
{
    private readonly string $storageRoot;

    public function __construct(?string $storageRoot = null)
    {
        $this->storageRoot = $storageRoot ?? dirname(__DIR__) . '/storage';
    }

    /**
     * @param array<string, mixed> $record JSON-encodable; server adds unix ts when missing.
     */
    public function append(string $lobbyId, array $record): void
    {
        $this->assertSafeLobbyId($lobbyId);

        $dir = $this->storageRoot . '/lobbies/' . $lobbyId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
            if (!is_dir($dir)) {
                throw new RuntimeException("LobbyLogStorage: failed to create {$dir}");
            }
        }
        $path = $dir . '/lobby_log.jsonl';

        if (!isset($record['ts']) || (!is_int($record['ts']) && !is_float($record['ts']))) {
            $record['ts'] = time();
        }

        $encoded = json_encode($record, JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new RuntimeException('LobbyLogStorage: failed to encode record');
        }

        $fh = fopen($path, 'a');
        if ($fh === false) {
            throw new RuntimeException("LobbyLogStorage: failed to open {$path}");
        }
        try {
            if (!flock($fh, LOCK_EX)) {
                throw new RuntimeException("LobbyLogStorage: failed to LOCK_EX {$path}");
            }
            if (fwrite($fh, $encoded . "\n") === false) {
                flock($fh, LOCK_UN);
                throw new RuntimeException("LobbyLogStorage: failed to write {$path}");
            }
            fflush($fh);
            flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
    }

    private function assertSafeLobbyId(string $value): void
    {
        if ($value === '') {
            throw new InvalidArgumentException('lobbyId must not be empty');
        }
        if (
            strpos($value, '/') !== false
            || strpos($value, '\\') !== false
            || strpos($value, "\0") !== false
            || $value === '.'
            || $value === '..'
        ) {
            throw new InvalidArgumentException("lobbyId contains illegal characters: {$value}");
        }
    }
}
