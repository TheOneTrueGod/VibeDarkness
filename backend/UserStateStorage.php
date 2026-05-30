<?php

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * Per-user per-tick state logs: storage/lobbies/<lobbyId>/user_state/<userId>/user_state_NNN.md
 *
 * Each NNN file covers 100 ticks (file 1 = ticks 0-99, file 2 = ticks 100-199, …).
 * Files are JSONL: one JSON object per line. The object shape is open — callers set
 * { tick, game_state, orders, … } but future fields can be added without breaking readers.
 */
final class UserStateStorage
{
    private readonly string $storageRoot;

    public function __construct(?string $storageRoot = null)
    {
        $this->storageRoot = $storageRoot ?? dirname(__DIR__) . '/storage';
    }

    /**
     * Append a batch of entries. Entries may span multiple 100-tick file boundaries;
     * each entry is routed to the correct file automatically.
     *
     * @param array<int, array<string, mixed>> $entries Each must contain a 'tick' (int) key.
     */
    public function appendBatch(string $lobbyId, string $userId, array $entries): void
    {
        $this->assertSafeSegment($lobbyId, 'lobbyId');
        $this->assertSafeSegment($userId, 'userId');

        if (count($entries) === 0) {
            return;
        }

        $dir = $this->storageRoot . '/lobbies/' . $lobbyId . '/user_state/' . $userId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
            if (!is_dir($dir)) {
                throw new RuntimeException("UserStateStorage: failed to create {$dir}");
            }
        }

        // Group entries by file number so we only open each file once.
        $byFile = [];
        foreach ($entries as $entry) {
            $tick = isset($entry['tick']) ? (int) $entry['tick'] : 0;
            $fileNum = (int) floor($tick / 100) + 1;
            $byFile[$fileNum][] = $entry;
        }

        foreach ($byFile as $fileNum => $fileEntries) {
            $filename = sprintf('user_state_%03d.md', $fileNum);
            $path = $dir . '/' . $filename;

            $fh = fopen($path, 'a');
            if ($fh === false) {
                throw new RuntimeException("UserStateStorage: failed to open {$path}");
            }
            try {
                if (!flock($fh, LOCK_EX)) {
                    throw new RuntimeException("UserStateStorage: failed to LOCK_EX {$path}");
                }
                foreach ($fileEntries as $entry) {
                    if (!isset($entry['ts']) || (!is_int($entry['ts']) && !is_float($entry['ts']))) {
                        $entry['ts'] = time();
                    }
                    $encoded = json_encode($entry, JSON_UNESCAPED_SLASHES);
                    if ($encoded === false) {
                        continue;
                    }
                    fwrite($fh, $encoded . "\n");
                }
                fflush($fh);
                flock($fh, LOCK_UN);
            } finally {
                fclose($fh);
            }
        }
    }

    /**
     * Read entries in [fromTick, toTick], capped at 20 results, sorted by tick ascending.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getRange(string $lobbyId, string $userId, int $fromTick, int $toTick): array
    {
        $this->assertSafeSegment($lobbyId, 'lobbyId');
        $this->assertSafeSegment($userId, 'userId');

        $dir = $this->storageRoot . '/lobbies/' . $lobbyId . '/user_state/' . $userId;
        if (!is_dir($dir)) {
            return [];
        }

        $firstFile = (int) floor($fromTick / 100) + 1;
        $lastFile  = (int) floor($toTick  / 100) + 1;

        $results = [];
        for ($fileNum = $firstFile; $fileNum <= $lastFile; $fileNum++) {
            $path = $dir . '/' . sprintf('user_state_%03d.md', $fileNum);
            if (!file_exists($path)) {
                continue;
            }
            $fh = fopen($path, 'r');
            if ($fh === false) {
                continue;
            }
            try {
                flock($fh, LOCK_SH);
                while (!feof($fh)) {
                    $line = fgets($fh);
                    if ($line === false || trim($line) === '') {
                        continue;
                    }
                    $entry = json_decode($line, true);
                    if (!is_array($entry)) {
                        continue;
                    }
                    $tick = isset($entry['tick']) ? (int) $entry['tick'] : -1;
                    if ($tick >= $fromTick && $tick <= $toTick) {
                        $results[] = $entry;
                    }
                }
                flock($fh, LOCK_UN);
            } finally {
                fclose($fh);
            }
        }

        usort($results, fn($a, $b) => ($a['tick'] ?? 0) <=> ($b['tick'] ?? 0));

        return array_slice($results, 0, 20);
    }

    private function assertSafeSegment(string $value, string $label): void
    {
        if ($value === '') {
            throw new InvalidArgumentException("{$label} must not be empty");
        }
        if (
            strpos($value, '/') !== false
            || strpos($value, '\\') !== false
            || strpos($value, "\0") !== false
            || $value === '.'
            || $value === '..'
        ) {
            throw new InvalidArgumentException("{$label} contains illegal characters: {$value}");
        }
    }
}
