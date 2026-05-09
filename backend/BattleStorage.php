<?php

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * BattleStorage owns all per-battle file I/O for the new layout:
 *
 *   <storageRoot>/lobbies/<lobbyId>/games/<gameId>/
 *     initial_state.json
 *     orders.jsonl
 *     snapshots/<tick>.json
 *     fingerprints.jsonl
 *
 * Replaces backend/GameCheckpointFiles.php (which uses the legacy
 * `game_<gameId>/game_<gameId>_<tick>.json` layout). The new directory
 * name (`games/<gameId>`, no `game_` prefix) deliberately does not
 * collide with legacy paths so a one-shot migration script can clean
 * up the old layout without disturbing this one.
 *
 * All multi-step operations on JSONL files use `flock(LOCK_EX)` to
 * serialize concurrent writers, and reads use `flock(LOCK_SH)` so
 * range queries see consistent line boundaries. Single-file writes
 * (snapshots, initial state) are written to a sibling `.tmp` file
 * and then renamed into place for atomic publish.
 */
final class BattleStorage
{
    private readonly string $storageRoot;

    /**
     * @param string|null $storageRoot Defaults to `<project>/storage` to
     * match the convention used by `LobbyManager`, `CharacterManager`,
     * etc. Override for tests if needed.
     */
    public function __construct(?string $storageRoot = null)
    {
        $this->storageRoot = $storageRoot ?? dirname(__DIR__) . '/storage';
    }

    /**
     * Returns the absolute path of the per-game battle directory.
     * Ensures the directory tree exists (mkdir -p) so callers can
     * write into it directly. Cheap if the dir already exists.
     */
    public function getGameDir(string $lobbyId, string $gameId): string
    {
        $this->assertSafeId('lobbyId', $lobbyId);
        $this->assertSafeId('gameId', $gameId);
        $dir = $this->storageRoot
            . '/lobbies/' . $lobbyId
            . '/games/' . $gameId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
            if (!is_dir($dir)) {
                throw new RuntimeException("Failed to create game dir: {$dir}");
            }
        }
        return $dir;
    }

    // ------------------------------------------------------------------
    // Orders
    // ------------------------------------------------------------------

    /**
     * Append an order record to `orders.jsonl`.
     *
     * Record shape: ['atTick' => int, 'playerId' => string,
     *                'order' => array, 'idHash' => string, 'ts' => int].
     * If `idHash` is missing, computes
     *   sha1(json_encode(order) . '|' . atTick . '|' . playerId)
     * If `ts` is missing, uses time().
     *
     * Holds LOCK_EX over the whole read-then-append cycle to make the
     * duplicate check race-free. If a record with the same idHash is
     * already present, returns false and writes nothing. Returns true
     * if a new line was appended.
     */
    public function appendOrder(string $lobbyId, string $gameId, array $orderRecord): bool
    {
        $atTick = (int) ($orderRecord['atTick'] ?? 0);
        $playerId = (string) ($orderRecord['playerId'] ?? '');
        if ($playerId === '') {
            throw new InvalidArgumentException('appendOrder: playerId is required');
        }
        $order = $orderRecord['order'] ?? null;
        if (!is_array($order)) {
            throw new InvalidArgumentException('appendOrder: order must be an array');
        }
        $idHash = $orderRecord['idHash'] ?? null;
        if (!is_string($idHash) || $idHash === '') {
            $orderJson = json_encode($order, JSON_UNESCAPED_SLASHES);
            if ($orderJson === false) {
                throw new RuntimeException('appendOrder: failed to encode order for idHash');
            }
            $idHash = sha1($orderJson . '|' . $atTick . '|' . $playerId);
        }
        $ts = isset($orderRecord['ts']) ? (int) $orderRecord['ts'] : time();

        $path = $this->getGameDir($lobbyId, $gameId) . '/orders.jsonl';

        $fh = fopen($path, 'c+');
        if ($fh === false) {
            throw new RuntimeException("appendOrder: failed to open {$path}");
        }
        try {
            if (!flock($fh, LOCK_EX)) {
                throw new RuntimeException("appendOrder: failed to LOCK_EX {$path}");
            }
            rewind($fh);
            while (($line = fgets($fh)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $existing = json_decode($line, true);
                if (is_array($existing)
                    && isset($existing['idHash'])
                    && $existing['idHash'] === $idHash
                ) {
                    flock($fh, LOCK_UN);
                    return false;
                }
            }

            $record = [
                'atTick' => $atTick,
                'playerId' => $playerId,
                'order' => $order,
                'idHash' => $idHash,
                'ts' => $ts,
            ];
            $encoded = json_encode($record, JSON_UNESCAPED_SLASHES);
            if ($encoded === false) {
                flock($fh, LOCK_UN);
                throw new RuntimeException('appendOrder: failed to encode record');
            }

            if (fseek($fh, 0, SEEK_END) !== 0) {
                flock($fh, LOCK_UN);
                throw new RuntimeException("appendOrder: failed to seek to end of {$path}");
            }
            if (fwrite($fh, $encoded . "\n") === false) {
                flock($fh, LOCK_UN);
                throw new RuntimeException("appendOrder: failed to write to {$path}");
            }
            fflush($fh);
            flock($fh, LOCK_UN);
            return true;
        } finally {
            fclose($fh);
        }
    }

    /**
     * Returns order records whose atTick is within the inclusive
     * [sinceTick, untilTick] range. Either bound may be null to mean
     * unbounded. Result is sorted by atTick ascending; ties resolve to
     * file order (i.e. insertion order).
     *
     * @return list<array{atTick:int,playerId:string,order:array,idHash:string,ts:int}>
     */
    public function getOrdersRange(string $lobbyId, string $gameId, ?int $sinceTick, ?int $untilTick): array
    {
        $path = $this->getGameDir($lobbyId, $gameId) . '/orders.jsonl';
        if (!is_file($path)) {
            return [];
        }
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return [];
        }

        $items = [];
        try {
            @flock($fh, LOCK_SH);
            $idx = 0;
            while (($line = fgets($fh)) !== false) {
                $i = $idx++;
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $rec = json_decode($line, true);
                if (!is_array($rec)) {
                    continue;
                }
                $tick = (int) ($rec['atTick'] ?? -1);
                if ($sinceTick !== null && $tick < $sinceTick) {
                    continue;
                }
                if ($untilTick !== null && $tick > $untilTick) {
                    continue;
                }
                $items[] = ['idx' => $i, 'rec' => $rec];
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }

        usort($items, static function (array $a, array $b): int {
            $at = (int) ($a['rec']['atTick'] ?? 0);
            $bt = (int) ($b['rec']['atTick'] ?? 0);
            if ($at !== $bt) {
                return $at <=> $bt;
            }
            return $a['idx'] <=> $b['idx'];
        });

        return array_map(static fn(array $e): array => $e['rec'], $items);
    }

    /**
     * Maximum atTick currently present in `orders.jsonl`, or -1 if
     * the file is missing or empty.
     */
    public function getOrdersTipTick(string $lobbyId, string $gameId): int
    {
        $path = $this->getGameDir($lobbyId, $gameId) . '/orders.jsonl';
        if (!is_file($path)) {
            return -1;
        }
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return -1;
        }
        $max = -1;
        try {
            @flock($fh, LOCK_SH);
            while (($line = fgets($fh)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $rec = json_decode($line, true);
                if (!is_array($rec)) {
                    continue;
                }
                $tick = (int) ($rec['atTick'] ?? -1);
                if ($tick > $max) {
                    $max = $tick;
                }
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return $max;
    }

    /**
     * Returns the number of non-empty JSON order lines in orders.jsonl.
     * Increments strictly per append — used alongside max(atTick) so clients can
     * detect new peer orders even when multiple rows share the same atTick.
     */
    public function countOrderRecords(string $lobbyId, string $gameId): int
    {
        $path = $this->getGameDir($lobbyId, $gameId) . '/orders.jsonl';
        if (!is_file($path)) {
            return 0;
        }
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return 0;
        }
        $n = 0;
        try {
            @flock($fh, LOCK_SH);
            while (($line = fgets($fh)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $rec = json_decode($line, true);
                if (!is_array($rec)) {
                    continue;
                }
                $n++;
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return $n;
    }

    /**
     * Convenience helper for the heartbeat handler: read the latest
     * snapshot and derive `pausedAtTick` plus the unique list of
     * owner IDs the engine is waiting on (from
     * `state.waitingForOrders.waiters[].ownerId`).
     *
     * Returns null when there is no snapshot yet, or when the latest
     * snapshot's state has no `waitingForOrders.waiters` (engine is
     * not currently paused for orders). Snapshots are written only on
     * pause, so a present snapshot whose waiters list is empty also
     * yields null.
     *
     * The returned `expectingFromPlayerIds` are the unique waiter
     * ownerIds. Owner IDs that belong to AI controllers (rather than
     * remote human players) may appear here; the heartbeat handler in
     * Task 05 is responsible for filtering against the lobby's player
     * roster if a strict "human players only" list is required.
     *
     * @return array{pausedAtTick:int,expectingFromPlayerIds:list<string>}|null
     */
    public function getExpectingFromPlayerIdsAt(string $lobbyId, string $gameId): ?array
    {
        $snap = $this->getSnapshotAtOrBefore($lobbyId, $gameId, null);
        if ($snap === null) {
            return null;
        }
        $tick = (int) ($snap['tick'] ?? -1);
        $state = $snap['state'] ?? null;
        if (!is_array($state)) {
            return null;
        }
        $wfo = $state['waitingForOrders'] ?? null;
        if (!is_array($wfo)) {
            return null;
        }
        $waiters = $wfo['waiters'] ?? null;
        if (!is_array($waiters) || count($waiters) === 0) {
            return null;
        }

        $seen = [];
        $ownerIds = [];
        foreach ($waiters as $w) {
            if (!is_array($w)) {
                continue;
            }
            $oid = $w['ownerId'] ?? null;
            if (!is_string($oid) || $oid === '' || isset($seen[$oid])) {
                continue;
            }
            $seen[$oid] = true;
            $ownerIds[] = $oid;
        }

        if (count($ownerIds) === 0) {
            return null;
        }

        return [
            'pausedAtTick' => $tick,
            'expectingFromPlayerIds' => $ownerIds,
        ];
    }

    // ------------------------------------------------------------------
    // Snapshots
    // ------------------------------------------------------------------

    /**
     * Atomically write `snapshots/<tick>.json` with payload
     * `{ tick, state }`. Atomicity is guaranteed by writing to a
     * sibling `.tmp` file and then renaming.
     */
    public function saveSnapshot(string $lobbyId, string $gameId, int $tick, array $state): void
    {
        if ($tick < 0) {
            throw new InvalidArgumentException("saveSnapshot: tick must be >= 0, got {$tick}");
        }
        $dir = $this->getGameDir($lobbyId, $gameId) . '/snapshots';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
            if (!is_dir($dir)) {
                throw new RuntimeException("saveSnapshot: failed to create {$dir}");
            }
        }
        $path = $dir . '/' . $tick . '.json';
        $payload = ['tick' => $tick, 'state' => $state];
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($encoded === false) {
            throw new RuntimeException('saveSnapshot: failed to encode payload');
        }
        $this->atomicWrite($path, $encoded);
    }

    /**
     * Newest snapshot file whose tick is <= `$tick` (or absolute
     * newest if `$tick === null`). Returns the decoded payload
     * `{ tick, state }` or null when no snapshot qualifies.
     *
     * @return array{tick:int,state:array<string,mixed>}|null
     */
    public function getSnapshotAtOrBefore(string $lobbyId, string $gameId, ?int $tick): ?array
    {
        $dir = $this->getGameDir($lobbyId, $gameId) . '/snapshots';
        if (!is_dir($dir)) {
            return null;
        }

        $bestTick = -1;
        $bestPath = null;
        foreach (scandir($dir) ?: [] as $file) {
            if (!is_string($file)) {
                continue;
            }
            if (!str_ends_with($file, '.json')) {
                continue;
            }
            $name = substr($file, 0, -5);
            // Skip any leftover .tmp.json or other non-numeric names.
            if ($name === '' || !ctype_digit($name)) {
                continue;
            }
            $t = (int) $name;
            if ($tick !== null && $t > $tick) {
                continue;
            }
            if ($t > $bestTick) {
                $bestTick = $t;
                $bestPath = $dir . '/' . $file;
            }
        }

        if ($bestPath === null) {
            return null;
        }
        $raw = @file_get_contents($bestPath);
        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return null;
        }
        // Coerce the canonical shape; tolerate older payloads that
        // happened to omit `tick` by deriving it from the filename.
        $resultTick = isset($decoded['tick']) ? (int) $decoded['tick'] : $bestTick;
        $state = $decoded['state'] ?? null;
        if (!is_array($state)) {
            return null;
        }
        return ['tick' => $resultTick, 'state' => $state];
    }

    // ------------------------------------------------------------------
    // Initial state
    // ------------------------------------------------------------------

    /**
     * Atomically write `initial_state.json`. The file is one-time
     * write: subsequent calls throw a RuntimeException so callers
     * cannot accidentally clobber the deterministic init for a
     * battle that's already in progress. Use `clearGameStorage` to
     * legitimately reset.
     */
    public function saveInitialState(
        string $lobbyId,
        string $gameId,
        array $state,
        string $initialFingerprint
    ): void {
        $dir = $this->getGameDir($lobbyId, $gameId);
        $path = $dir . '/initial_state.json';
        if (is_file($path)) {
            throw new RuntimeException(
                "saveInitialState: {$path} already exists; initial state is one-time write"
            );
        }
        $payload = [
            'state' => $state,
            'initialFingerprint' => $initialFingerprint,
        ];
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($encoded === false) {
            throw new RuntimeException('saveInitialState: failed to encode payload');
        }
        $this->atomicWrite($path, $encoded);
    }

    /**
     * Returns `{ state, initialFingerprint }` from
     * `initial_state.json`, or null when the file is missing or
     * malformed.
     *
     * @return array{state:array<string,mixed>,initialFingerprint:string}|null
     */
    public function getInitialState(string $lobbyId, string $gameId): ?array
    {
        $path = $this->getGameDir($lobbyId, $gameId) . '/initial_state.json';
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return null;
        }
        $state = $decoded['state'] ?? null;
        $fp = $decoded['initialFingerprint'] ?? null;
        if (!is_array($state) || !is_string($fp)) {
            return null;
        }
        return ['state' => $state, 'initialFingerprint' => $fp];
    }

    // ------------------------------------------------------------------
    // Fingerprints
    // ------------------------------------------------------------------

    /**
     * Append a batch of `{ tick, fp }` records to `fingerprints.jsonl`
     * under LOCK_EX. Returns the number of records actually
     * appended (records with bad shape are skipped).
     *
     * @param list<array{tick:int|numeric-string,fp:string}> $records
     */
    public function appendFingerprints(string $lobbyId, string $gameId, array $records): int
    {
        if (count($records) === 0) {
            return 0;
        }
        $path = $this->getGameDir($lobbyId, $gameId) . '/fingerprints.jsonl';
        $fh = fopen($path, 'a');
        if ($fh === false) {
            throw new RuntimeException("appendFingerprints: failed to open {$path}");
        }
        $appended = 0;
        try {
            if (!flock($fh, LOCK_EX)) {
                throw new RuntimeException("appendFingerprints: failed to LOCK_EX {$path}");
            }
            foreach ($records as $rec) {
                if (!is_array($rec)) {
                    continue;
                }
                if (!isset($rec['tick']) || !isset($rec['fp'])) {
                    continue;
                }
                $tick = (int) $rec['tick'];
                $fp = $rec['fp'];
                if (!is_string($fp) || $fp === '') {
                    continue;
                }
                $encoded = json_encode(['tick' => $tick, 'fp' => $fp], JSON_UNESCAPED_SLASHES);
                if ($encoded === false) {
                    continue;
                }
                if (fwrite($fh, $encoded . "\n") === false) {
                    flock($fh, LOCK_UN);
                    throw new RuntimeException("appendFingerprints: failed to write to {$path}");
                }
                $appended++;
            }
            fflush($fh);
            flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return $appended;
    }

    /**
     * Return `{tick, fp}` records whose tick is in the inclusive
     * [fromTick, toTick] range. Either bound may be null to mean
     * unbounded. Records are returned in file order (which is
     * append order, i.e. tick-ascending under normal usage).
     *
     * @return list<array{tick:int,fp:string}>
     */
    public function getFingerprintsRange(
        string $lobbyId,
        string $gameId,
        ?int $fromTick,
        ?int $toTick
    ): array {
        $path = $this->getGameDir($lobbyId, $gameId) . '/fingerprints.jsonl';
        if (!is_file($path)) {
            return [];
        }
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return [];
        }
        $out = [];
        try {
            @flock($fh, LOCK_SH);
            while (($line = fgets($fh)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $rec = json_decode($line, true);
                if (!is_array($rec)) {
                    continue;
                }
                if (!isset($rec['tick']) || !isset($rec['fp'])) {
                    continue;
                }
                $tick = (int) $rec['tick'];
                $fp = $rec['fp'];
                if (!is_string($fp)) {
                    continue;
                }
                if ($fromTick !== null && $tick < $fromTick) {
                    continue;
                }
                if ($toTick !== null && $tick > $toTick) {
                    continue;
                }
                $out[] = ['tick' => $tick, 'fp' => $fp];
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return $out;
    }

    /**
     * Return the `{tick, fp}` record with the greatest tick in `fingerprints.jsonl`
     * (append order). When several lines share that tick, the last one in file order wins.
     * This ignores out-of-order checkpoint replays that re-append an older tick after
     * the stream has already advanced.
     *
     * @return array{tick:int,fp:string}|null
     */
    public function getLatestFingerprint(string $lobbyId, string $gameId): ?array
    {
        $path = $this->getGameDir($lobbyId, $gameId) . '/fingerprints.jsonl';
        if (!is_file($path)) {
            return null;
        }
        $fh = fopen($path, 'r');
        if ($fh === false) {
            return null;
        }
        $maxTick = null;
        $latest = null;
        try {
            @flock($fh, LOCK_SH);
            while (($line = fgets($fh)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $rec = json_decode($line, true);
                if (!is_array($rec)) {
                    continue;
                }
                if (!isset($rec['tick']) || !isset($rec['fp'])) {
                    continue;
                }
                $fp = $rec['fp'];
                if (!is_string($fp)) {
                    continue;
                }
                $tick = (int) $rec['tick'];
                if ($maxTick === null || $tick > $maxTick) {
                    $maxTick = $tick;
                    $latest = ['tick' => $tick, 'fp' => $fp];
                } elseif ($tick === $maxTick) {
                    $latest = ['tick' => $tick, 'fp' => $fp];
                }
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return $latest;
    }

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------

    /**
     * Recursively remove the per-game directory. Used by reset and
     * by the migration script. No-op if the directory doesn't exist.
     */
    public function clearGameStorage(string $lobbyId, string $gameId): void
    {
        $this->assertSafeId('lobbyId', $lobbyId);
        $this->assertSafeId('gameId', $gameId);
        $dir = $this->storageRoot
            . '/lobbies/' . $lobbyId
            . '/games/' . $gameId;
        if (!is_dir($dir)) {
            return;
        }
        $this->removeTreeRecursively($dir);
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /**
     * Atomically publish file contents. Writes to a sibling `.tmp`
     * file (with a unique random suffix to avoid collisions between
     * concurrent writers in the same dir) and `rename()`s into place.
     *
     * On POSIX, `rename()` is atomic and overwrites. On Windows,
     * `rename()` can fail when the target exists; we fall back to
     * unlinking the target and renaming again. This loses true
     * atomicity on Windows but the dev/Windows path is best-effort.
     */
    private function atomicWrite(string $path, string $contents): void
    {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
            if (!is_dir($dir)) {
                throw new RuntimeException("atomicWrite: failed to create dir {$dir}");
            }
        }
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
        $bytes = @file_put_contents($tmp, $contents, LOCK_EX);
        if ($bytes === false) {
            @unlink($tmp);
            throw new RuntimeException("atomicWrite: failed to write temp file {$tmp}");
        }
        if (@rename($tmp, $path)) {
            return;
        }
        // Windows fallback: rename can fail when target exists.
        @unlink($path);
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException("atomicWrite: failed to rename {$tmp} -> {$path}");
        }
    }

    private function removeTreeRecursively(string $dir): void
    {
        $entries = @scandir($dir);
        if ($entries === false) {
            return;
        }
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir . '/' . $entry;
            if (is_dir($path) && !is_link($path)) {
                $this->removeTreeRecursively($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }

    /**
     * Reject ids containing path separators or `..` segments so
     * they cannot escape the storage root or sit on system paths.
     * Lobby and game ids are otherwise alphanumeric in this codebase
     * (see `LobbyManager::generateLobbyId`).
     */
    private function assertSafeId(string $label, string $value): void
    {
        if ($value === '') {
            throw new InvalidArgumentException("{$label} must not be empty");
        }
        if (strpos($value, '/') !== false
            || strpos($value, '\\') !== false
            || strpos($value, "\0") !== false
            || $value === '.'
            || $value === '..'
        ) {
            throw new InvalidArgumentException("{$label} contains illegal characters: {$value}");
        }
    }
}
