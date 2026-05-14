<?php

namespace App;

use InvalidArgumentException;
use RuntimeException;

/**
 * BattleStorage owns lobby-scoped battle file I/O (one active mission artifact set per lobby dir):
 *
 *   <storageRoot>/lobbies/<lobbyId>/
 *     pending_orders.jsonl
 *     applied_orders.jsonl
 *     initial_state.json
 *     fingerprints.jsonl
 *     snapshots/<tick>.json
 *
 * `$gameId` is validated for path safety; persisted battle files live directly under the lobby directory.
 * Legacy nested `games/<gameId>/` trees are deleted by {@see BattleStorage::clearBattleArtifacts} only.
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
     * Returns the lobby directory (<storage>/lobbies/<lobbyId>/) and ensures it exists.
     */
    public function getLobbyDir(string $lobbyId): string
    {
        $this->assertSafeId('lobbyId', $lobbyId);
        $dir = $this->storageRoot . '/lobbies/' . $lobbyId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
            if (!is_dir($dir)) {
                throw new RuntimeException("Failed to create lobby dir: {$dir}");
            }
        }
        return $dir;
    }

    /**
     * Battle artifacts live directly under the lobby directory. `$gameId` is asserted for path safety only.
     */
    public function getGameDir(string $lobbyId, string $gameId): string
    {
        $this->assertSafeId('gameId', $gameId);
        return $this->getLobbyDir($lobbyId);
    }

    // ------------------------------------------------------------------
    // Orders
    // ------------------------------------------------------------------

    /**
     * Append a record to `pending_orders.jsonl` (server-side pending queue).
     *
     * Record shape: pendingLineId, atTick, playerId, order, idHash, ts,
     * optional finalized (default true), optional basisFingerprint.
     * Uniqueness for replace: last line wins for (playerId, unitId, atTick).
     *
     * @return array{appended:bool,pendingLineId:?string,reusedExisting:bool}
     */
    public function appendOrder(string $lobbyId, string $gameId, array $orderRecord): array
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
        $unitId = isset($order['unitId']) ? (string) $order['unitId'] : '';
        if ($unitId === '') {
            throw new InvalidArgumentException('appendOrder: order.unitId is required');
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
        $pendingLineId = $orderRecord['pendingLineId'] ?? null;
        if (!is_string($pendingLineId) || $pendingLineId === '') {
            $pendingLineId = bin2hex(random_bytes(12));
        }
        $finalized = array_key_exists('finalized', $orderRecord) ? (bool) $orderRecord['finalized'] : true;
        $basisFingerprint = null;
        if (isset($orderRecord['basisFingerprint']) && is_string($orderRecord['basisFingerprint']) && $orderRecord['basisFingerprint'] !== '') {
            $basisFingerprint = $orderRecord['basisFingerprint'];
        }

        $path = $this->getGameDir($lobbyId, $gameId) . '/pending_orders.jsonl';

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

                    return [
                        'appended' => false,
                        'pendingLineId' => isset($existing['pendingLineId']) && is_string($existing['pendingLineId'])
                            ? $existing['pendingLineId']
                            : null,
                        'reusedExisting' => true,
                    ];
                }
            }

            $record = [
                'pendingLineId' => $pendingLineId,
                'atTick' => $atTick,
                'playerId' => $playerId,
                'order' => $order,
                'idHash' => $idHash,
                'ts' => $ts,
                'finalized' => $finalized,
            ];
            if ($basisFingerprint !== null) {
                $record['basisFingerprint'] = $basisFingerprint;
            }
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

            return ['appended' => true, 'pendingLineId' => $pendingLineId, 'reusedExisting' => false];
        } finally {
            fclose($fh);
        }
    }

    /**
     * Move all finalized pending rows matching `batchAtTick` into `applied_orders.jsonl`.
     *
     * @return array{merged:int,appendedHashes:list<string>}
     */
    public function mergeFinalizedPendingForBatch(string $lobbyId, string $gameId, int $batchAtTick): array
    {
        $dir = $this->getGameDir($lobbyId, $gameId);
        $pendingPath = $dir . '/pending_orders.jsonl';
        $appliedPath = $dir . '/applied_orders.jsonl';
        $pendingFh = fopen($pendingPath, 'c+');
        if ($pendingFh === false) {
            throw new RuntimeException("mergeFinalizedPendingForBatch: cannot open {$pendingPath}");
        }
        $merged = 0;
        $seenHashes = [];
        try {
            if (!flock($pendingFh, LOCK_EX)) {
                throw new RuntimeException("mergeFinalizedPendingForBatch: LOCK_EX failed {$pendingPath}");
            }
            rewind($pendingFh);
            $pendingLinesRaw = '';
            while (($line = fgets($pendingFh)) !== false) {
                $pendingLinesRaw .= $line;
            }

            /** @var list<string> $keptEncoded */
            $keptEncoded = [];
            /** @var list<string> $toAppendEncoded */
            $toAppendEncoded = [];
            foreach (explode("\n", trim($pendingLinesRaw, "\n")) as $rawLine) {
                $rawLine = trim($rawLine);
                if ($rawLine === '') {
                    continue;
                }
                $rec = json_decode($rawLine, true);
                if (!is_array($rec)) {
                    $keptEncoded[] = $rawLine;

                    continue;
                }
                $atTick = (int) ($rec['atTick'] ?? -1);
                $finalized = !array_key_exists('finalized', $rec) || (bool) $rec['finalized'];
                $order = $rec['order'] ?? null;
                if ($finalized && $atTick === $batchAtTick && is_array($order)) {
                    $rowHash = isset($rec['idHash']) && is_string($rec['idHash']) ? $rec['idHash'] : '';
                    if ($rowHash === '') {
                        continue;
                    }
                    $appliedRecord = [
                        'atTick' => $atTick,
                        'playerId' => (string) ($rec['playerId'] ?? ''),
                        'order' => $order,
                        'idHash' => $rowHash,
                        'ts' => isset($rec['ts']) ? (int) $rec['ts'] : time(),
                        'sourcePendingLineId' => $rec['pendingLineId'] ?? null,
                        'mergedAt' => time(),
                    ];
                    $enc = json_encode($appliedRecord, JSON_UNESCAPED_SLASHES);
                    if ($enc !== false) {
                        $toAppendEncoded[] = $enc;
                        $merged++;
                        $seenHashes[] = $rowHash;
                    }

                    continue;
                }
                $keptEncoded[] = $rawLine;
            }

            if (count($toAppendEncoded) > 0) {
                $appliedFh = fopen($appliedPath, 'c+');
                if ($appliedFh === false) {
                    flock($pendingFh, LOCK_UN);
                    throw new RuntimeException("mergeFinalizedPendingForBatch: cannot open {$appliedPath}");
                }
                if (!flock($appliedFh, LOCK_EX)) {
                    fclose($appliedFh);
                    flock($pendingFh, LOCK_UN);
                    throw new RuntimeException("mergeFinalizedPendingForBatch: LOCK_EX applied failed");
                }
                if (fseek($appliedFh, 0, SEEK_END) !== 0) {
                    flock($appliedFh, LOCK_UN);
                    fclose($appliedFh);
                    flock($pendingFh, LOCK_UN);
                    throw new RuntimeException('mergeFinalizedPendingForBatch: applied seek failed');
                }
                foreach ($toAppendEncoded as $chunk) {
                    fwrite($appliedFh, $chunk . "\n");
                }
                fflush($appliedFh);
                flock($appliedFh, LOCK_UN);
                fclose($appliedFh);
            }

            ftruncate($pendingFh, 0);
            rewind($pendingFh);
            foreach ($keptEncoded as $lineEnc) {
                fwrite($pendingFh, $lineEnc . "\n");
            }
            fflush($pendingFh);
            flock($pendingFh, LOCK_UN);
        } finally {
            fclose($pendingFh);
        }

        return ['merged' => $merged, 'appendedHashes' => $seenHashes];
    }

    /**
     * After snapshot for completed tick `$completedSnapshotTick`, prune pending orders:
     * keep only rows targeting tick `$completedSnapshotTick + 1` whose basisFingerprint matches
     * authoritative snapshot synchash for `$completedSnapshotTick` when both are present.
     */
    public function prunePendingOrdersAfterSnapshot(string $lobbyId, string $gameId, int $completedSnapshotTick): void
    {
        $expectedNext = $completedSnapshotTick + 1;
        $basis = $this->getSnapshotEnvelopeSynchash($lobbyId, $gameId, $completedSnapshotTick);
        $dir = $this->getGameDir($lobbyId, $gameId);
        $pendingPath = $dir . '/pending_orders.jsonl';
        if (!is_file($pendingPath)) {
            return;
        }

        $pendingFh = fopen($pendingPath, 'c+');
        if ($pendingFh === false) {
            return;
        }
        try {
            if (!flock($pendingFh, LOCK_EX)) {
                return;
            }
            rewind($pendingFh);
            $blob = '';
            while (($line = fgets($pendingFh)) !== false) {
                $blob .= $line;
            }

            /** @var list<string> $keptLines */
            $keptLines = [];
            foreach (explode("\n", trim($blob, "\n")) as $rawLine) {
                $rawLine = trim($rawLine);
                if ($rawLine === '') {
                    continue;
                }
                $rec = json_decode($rawLine, true);
                if (!is_array($rec)) {
                    continue;
                }
                $atTick = (int) ($rec['atTick'] ?? -1);
                if ($atTick !== $expectedNext) {
                    continue;
                }
                if (
                    $basis !== null
                    && isset($rec['basisFingerprint'])
                    && is_string($rec['basisFingerprint'])
                    && $rec['basisFingerprint'] !== ''
                    && $rec['basisFingerprint'] !== $basis
                ) {
                    continue;
                }
                $keptLines[] = $rawLine;
            }

            ftruncate($pendingFh, 0);
            rewind($pendingFh);
            foreach ($keptLines as $kl) {
                fwrite($pendingFh, $kl . "\n");
            }
            fflush($pendingFh);
            flock($pendingFh, LOCK_UN);
        } finally {
            fclose($pendingFh);
        }
    }

    /** Synchash / checkpoint fingerprint persisted on snapshot JSON for a tick (or null). */
    private function getSnapshotEnvelopeSynchash(string $lobbyId, string $gameId, int $tick): ?string
    {
        $decoded = $this->readSnapshotEnvelopeFromDisk($lobbyId, $gameId, $tick);
        if ($decoded === null) {
            return null;
        }
        foreach (['synchash', 'checkpointFingerprint'] as $k) {
            if (isset($decoded[$k]) && is_string($decoded[$k]) && $decoded[$k] !== '') {
                return $decoded[$k];
            }
        }
        $state = $decoded['state'] ?? null;
        if (!is_array($state)) {
            return null;
        }
        foreach (['synchash', 'initialFingerprint'] as $k) {
            if (isset($state[$k]) && is_string($state[$k]) && $state[$k] !== '') {
                return $state[$k];
            }
        }

        return null;
    }

    /**
     * @return array<string,mixed>|null
     */
    private function readSnapshotEnvelopeFromDisk(string $lobbyId, string $gameId, int $tick): ?array
    {
        $dir = $this->getGameDir($lobbyId, $gameId) . '/snapshots';
        $path = $dir . '/' . $tick . '.json';
        if (!is_file($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Read JSONL lines into tick-filtered indexed records.
     *
     * @return list<array{idx:int,rec:array<string,mixed>,source:string}>
     */
    private function readOrdersJsonlRange(
        string $path,
        ?int $sinceTick,
        ?int $untilTick,
        string $sourceTag,
        int $idxOffset
    ): array {
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
            $idx = $idxOffset;
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
                $items[] = ['idx' => $i, 'rec' => $rec, 'source' => $sourceTag];
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }

        return $items;
    }

    /**
     * Client-side overlay: applied first, then pending overwrites same
     * (playerId, unitId, atTick); higher file index breaks ties per source then pending wins over applied.
     *
     * @return list<array<string,mixed>>
     */
    private function dedupeOrderOverlay(array $indexedItems): array
    {
        /** @var array<string, array{idx:int,priority:int,rec:array<string,mixed>}> $bestByKey */
        $bestByKey = [];
        foreach ($indexedItems as $e) {
            $rec = $e['rec'];
            $tick = (int) ($rec['atTick'] ?? 0);
            $order = $rec['order'] ?? null;
            $unitId = is_array($order) && isset($order['unitId']) ? (string) $order['unitId'] : '';
            $playerId = (string) ($rec['playerId'] ?? '');
            $key = $tick . "\0" . $playerId . "\0" . $unitId;
            $priority = ($e['source'] === 'pending') ? 2 : 1;
            $score = [$priority, $e['idx']];
            $prev = $bestByKey[$key] ?? null;
            if (
                $prev === null
                || $score[0] > $prev['priority']
                || ($score[0] === $prev['priority'] && $score[1] > $prev['idx'])
            ) {
                $bestByKey[$key] = ['idx' => $e['idx'], 'priority' => $priority, 'rec' => $rec];
            }
        }
        $deduped = array_values($bestByKey);
        usort($deduped, static function (array $a, array $b): int {
            $ra = $a['rec'];
            $rb = $b['rec'];
            $at = (int) ($ra['atTick'] ?? 0);
            $bt = (int) ($rb['atTick'] ?? 0);
            if ($at !== $bt) {
                return $at <=> $bt;
            }
            $oa = $ra['order'] ?? null;
            $ob = $rb['order'] ?? null;
            $ua = is_array($oa) && isset($oa['unitId']) ? (string) $oa['unitId'] : '';
            $ub = is_array($ob) && isset($ob['unitId']) ? (string) $ob['unitId'] : '';
            if ($ua !== $ub) {
                return $ua <=> $ub;
            }
            $pa = (string) ($ra['playerId'] ?? '');
            $pb = (string) ($rb['playerId'] ?? '');

            return $pa <=> $pb;
        });

        return array_map(static fn(array $e): array => $e['rec'], $deduped);
    }

    /**
     * Orders for wire clients: merge `applied_orders.jsonl` with `pending_orders.jsonl`.
     *
     * @return array{applied:list<array<string,mixed>>,pending:list<array<string,mixed>>,orders:list<array<string,mixed>>}
     */
    public function getOrdersRangeSplit(string $lobbyId, string $gameId, ?int $sinceTick, ?int $untilTick): array
    {
        $dir = $this->getGameDir($lobbyId, $gameId);
        $appliedIndexed = $this->readOrdersJsonlRange($dir . '/applied_orders.jsonl', $sinceTick, $untilTick, 'applied', 0);
        $pendingIndexed = $this->readOrdersJsonlRange($dir . '/pending_orders.jsonl', $sinceTick, $untilTick, 'pending', 1_000_000);
        $applied = $this->dedupeOrderOverlay($appliedIndexed);
        $pending = $this->dedupeOrderOverlay($pendingIndexed);

        /** @var list<array{idx:int,rec:array<string,mixed>,source:string}> $combined */
        $combined = [...$appliedIndexed, ...$pendingIndexed];
        usort($combined, static fn(array $a, array $b): int => $a['idx'] <=> $b['idx']);

        return [
            'applied' => $applied,
            'pending' => $pending,
            'orders' => $this->dedupeOrderOverlay($combined),
        ];
    }

    /**
     * The `applied` slice of {@see getOrdersRangeSplit} — same records as `appliedOrders` on `GET …/orders`
     * for the given inclusive tick bounds (null bounds = unbounded on that side).
     *
     * @return list<array<string,mixed>>
     */
    public function getAppliedOrdersRangeForWire(
        string $lobbyId,
        string $gameId,
        ?int $sinceInclusiveTick,
        ?int $untilInclusiveTick,
    ): array {
        return $this->getOrdersRangeSplit($lobbyId, $gameId, $sinceInclusiveTick, $untilInclusiveTick)['applied'];
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function getOrdersRange(string $lobbyId, string $gameId, ?int $sinceTick, ?int $untilTick): array
    {
        return $this->getOrdersRangeSplit($lobbyId, $gameId, $sinceTick, $untilTick)['orders'];
    }

    /**
     * Maximum atTick currently present across pending + applied queues, or -1 when empty.
     */
    public function getOrdersTipTick(string $lobbyId, string $gameId): int
    {
        $max = -1;
        foreach (['/pending_orders.jsonl', '/applied_orders.jsonl'] as $suffix) {
            $path = $this->getGameDir($lobbyId, $gameId) . $suffix;
            if (!is_file($path)) {
                continue;
            }
            $fh = fopen($path, 'r');
            if ($fh === false) {
                continue;
            }
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
        }
        return $max;
    }

    /**
     * Line count across pending + applied JSONL streams (heartbeat revision counter).
     */
    public function countOrderRecords(string $lobbyId, string $gameId): int
    {
        $n = 0;
        foreach (['/pending_orders.jsonl', '/applied_orders.jsonl'] as $suffix) {
            $path = $this->getGameDir($lobbyId, $gameId) . $suffix;
            if (!is_file($path)) {
                continue;
            }
            $fh = fopen($path, 'r');
            if ($fh === false) {
                continue;
            }
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
        }
        return $n;
    }

    /**
     * Convenience helper for the heartbeat handler: read the latest
     * snapshot and derive checkpoint envelope `tick` (`pausedAtTick` in return; **not** the parallel
     * order batch tick) plus the unique list of owner IDs from `state.waitingForOrders.waiters`.
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
     * @return array{pausedAtTick:int,expectingFromPlayerIds:list<string>}|null `pausedAtTick` = snapshot envelope tick (last completed at save), not `waitingForOrders.atTick`.
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
     * Resolves which player owns a unit for append-order validation.
     * Prefer `waitingForOrders.waiters` (canonical while paused); otherwise
     * scan `state['units']` for a matching `id` and return its `ownerId`.
     */
    /**
     * @param int|null $requestedAtTick When set, `waitingForOrders.waiters` is only consulted if
     *                                   that block's `atTick` matches — otherwise the snapshot waiters
     *                                   may be from an older pause while the host has advanced.
     */
    public static function resolveUnitOwnerIdFromState(array $state, string $unitId, ?int $requestedAtTick = null): ?string
    {
        $wfo = $state['waitingForOrders'] ?? null;
        $wfoAtTick = null;
        if (is_array($wfo) && isset($wfo['atTick'])) {
            $raw = $wfo['atTick'];
            if (is_int($raw) || is_float($raw) || (is_string($raw) && is_numeric($raw))) {
                $wfoAtTick = (int) $raw;
            }
        }
        $waitersApply =
            is_array($wfo)
            && is_array($wfo['waiters'] ?? null)
            && ($requestedAtTick === null || $wfoAtTick === $requestedAtTick);
        if ($waitersApply) {
            $waiters = $wfo['waiters'];
            foreach ($waiters as $w) {
                if (!is_array($w)) {
                    continue;
                }
                $wid = $w['unitId'] ?? null;
                if (!is_string($wid) || $wid !== $unitId) {
                    continue;
                }
                $oid = $w['ownerId'] ?? null;
                return is_string($oid) && $oid !== '' ? $oid : null;
            }
        }

        $units = $state['units'] ?? null;
        if (!is_array($units)) {
            return null;
        }
        foreach ($units as $u) {
            if (!is_array($u)) {
                continue;
            }
            $id = $u['id'] ?? null;
            if (!is_string($id) || $id !== $unitId) {
                continue;
            }
            $oid = $u['ownerId'] ?? null;
            return is_string($oid) && $oid !== '' ? $oid : null;
        }

        return null;
    }

    /**
     * Atomically write `snapshots/<tick>.json` with payload
     * `{ tick, state }`. Atomicity is guaranteed by writing to a
     * sibling `.tmp` file and then renaming.
     *
     * Quiescence invariant: at engine pause the authoritative checkpoint
     * fingerprint tick is `pauseAtTick - 1` or `pauseAtTick`. Snapshot and
     * fingerprint streams may temporarily diverge by one tick while async
     * writes land (see {@see \App\Http\Handlers\Battle\AppendOrderHandler} `maxAllowedTick` slack).
     */
    /**
     * @param array<string,mixed> $state
     * @param null|string $synchash Persisted authoritative fingerprint for completed tick `$tick`.
     */
    public function saveSnapshot(string $lobbyId, string $gameId, int $tick, array $state, ?string $synchash = null): void
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
        if ($synchash !== null && $synchash !== '') {
            $payload['synchash'] = $synchash;
        }
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($encoded === false) {
            throw new RuntimeException('saveSnapshot: failed to encode payload');
        }
        $this->atomicWrite($path, $encoded);
        $this->pruneOldSnapshots($lobbyId, $gameId, 20);
    }

    /**
     * Keep only the newest `$keepLastN` snapshot files by numeric tick;
     * deletes older ticks under `snapshots/`.
     */
    public function pruneOldSnapshots(string $lobbyId, string $gameId, int $keepLastN = 20): void
    {
        if ($keepLastN < 0) {
            throw new InvalidArgumentException('pruneOldSnapshots: keepLastN must be >= 0');
        }
        $dir = $this->getGameDir($lobbyId, $gameId) . '/snapshots';
        if (!is_dir($dir)) {
            return;
        }
        $ticks = [];
        foreach (scandir($dir) ?: [] as $file) {
            if (!is_string($file)) {
                continue;
            }
            if (!str_ends_with($file, '.json')) {
                continue;
            }
            $name = substr($file, 0, -5);
            if ($name === '' || !ctype_digit($name)) {
                continue;
            }
            $ticks[] = (int) $name;
        }
        if (count($ticks) <= $keepLastN) {
            return;
        }
        rsort($ticks, SORT_NUMERIC);
        foreach (array_slice($ticks, $keepLastN) as $oldTick) {
            @unlink($dir . '/' . $oldTick . '.json');
        }
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
        $syn = isset($decoded['synchash']) && is_string($decoded['synchash']) ? $decoded['synchash'] : null;

        return ['tick' => $resultTick, 'state' => $state, 'synchash' => $syn];
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
        // Heartbeat relies on fingerprint stream for `hostTick` and `hostFingerprint`.
        // Seed tick 0 at initialization so heartbeat is immediately non-null after create.
        $this->appendFingerprints($lobbyId, $gameId, [
            ['tick' => 0, 'fp' => $initialFingerprint, 'paused' => false],
        ]);
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
     * Normalizes optional `paused` on fingerprint JSONL rows (legacy rows omit it → false).
     *
     * @param array<string, mixed> $rec
     */
    private function fingerprintRecordPaused(array $rec): bool
    {
        if (!array_key_exists('paused', $rec)) {
            return false;
        }
        $p = $rec['paused'];
        if (is_bool($p)) {
            return $p;
        }
        if (is_int($p) || is_float($p)) {
            return ((int) $p) !== 0;
        }
        if (is_string($p)) {
            $lower = strtolower($p);

            return $lower === '1' || $lower === 'true' || $lower === 'yes';
        }

        return false;
    }

    /**
     * Append a batch of `{ tick, fp, paused }` records to `fingerprints.jsonl`
     * under LOCK_EX with first-writer-wins semantics per tick.
     *
     * Rules:
     * - If tick is new: append.
     * - If tick exists with same fp and same paused: skip (idempotent duplicate).
     * - If tick exists with different fp or different paused: reject (conflict), keep existing canonical row.
     *
     * Snapshot vs fingerprint may race briefly; {@see AppendOrderHandler}/{@see BattleStorage::resolveLastCompletedTickAndFingerprint}
     * clamp last completed against `waitingForOrders.atTick`; `maxAllowedTick` covers late snapshot catch-up.
     *
     * @param list<array{tick:int|numeric-string,fp:string,paused?:bool}> $records
     * @return array{appended:int,duplicates:int,conflicts:int}
     */
    public function appendFingerprints(string $lobbyId, string $gameId, array $records): array
    {
        if (count($records) === 0) {
            return ['appended' => 0, 'duplicates' => 0, 'conflicts' => 0];
        }
        $path = $this->getGameDir($lobbyId, $gameId) . '/fingerprints.jsonl';
        $fh = fopen($path, 'c+');
        if ($fh === false) {
            throw new RuntimeException("appendFingerprints: failed to open {$path}");
        }
        $appended = 0;
        $duplicates = 0;
        $conflicts = 0;
        try {
            if (!flock($fh, LOCK_EX)) {
                throw new RuntimeException("appendFingerprints: failed to LOCK_EX {$path}");
            }
            /** @var array<int, array{fp:string,paused:bool}> $canonicalByTick */
            $canonicalByTick = [];
            rewind($fh);
            while (($line = fgets($fh)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }
                $rec = json_decode($line, true);
                if (!is_array($rec) || !isset($rec['tick']) || !isset($rec['fp'])) {
                    continue;
                }
                $tick = (int) $rec['tick'];
                $fp = $rec['fp'];
                if (!is_string($fp) || $fp === '') {
                    continue;
                }
                // First-writer wins for canonical (fp, paused) per tick.
                if (!isset($canonicalByTick[$tick])) {
                    $canonicalByTick[$tick] = [
                        'fp' => $fp,
                        'paused' => $this->fingerprintRecordPaused($rec),
                    ];
                }
            }
            fseek($fh, 0, SEEK_END);
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
                $paused = $this->fingerprintRecordPaused($rec);
                if (isset($canonicalByTick[$tick])) {
                    $canon = $canonicalByTick[$tick];
                    if ($canon['fp'] === $fp && $canon['paused'] === $paused) {
                        $duplicates++;
                    } else {
                        $conflicts++;
                        error_log(
                            sprintf(
                                '[BattleStorage] fingerprint conflict lobby=%s game=%s tick=%d existing=%s/%s incoming=%s/%s',
                                $lobbyId,
                                $gameId,
                                $tick,
                                $canon['fp'],
                                $canon['paused'] ? 'paused' : 'running',
                                $fp,
                                $paused ? 'paused' : 'running'
                            )
                        );
                    }
                    continue;
                }
                $encoded = json_encode(
                    ['tick' => $tick, 'fp' => $fp, 'paused' => $paused],
                    JSON_UNESCAPED_SLASHES
                );
                if ($encoded === false) {
                    continue;
                }
                if (fwrite($fh, $encoded . "\n") === false) {
                    flock($fh, LOCK_UN);
                    throw new RuntimeException("appendFingerprints: failed to write to {$path}");
                }
                $canonicalByTick[$tick] = ['fp' => $fp, 'paused' => $paused];
                $appended++;
            }
            fflush($fh);
            flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return ['appended' => $appended, 'duplicates' => $duplicates, 'conflicts' => $conflicts];
    }

    /**
     * Return `{tick, fp, paused}` records whose tick is in the inclusive
     * [fromTick, toTick] range. Either bound may be null to mean
     * unbounded.
     *
     * Canonicalization rule: if multiple lines share the same tick,
     * the first line in file order wins. Output is sorted by tick
     * ascending with one record per tick.
     *
     * @return list<array{tick:int,fp:string,paused:bool}>
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
        /** @var array<int, array{tick:int,fp:string,paused:bool}> $bestByTick */
        $bestByTick = [];
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
                if (!isset($bestByTick[$tick])) {
                    $bestByTick[$tick] = [
                        'tick' => $tick,
                        'fp' => $fp,
                        'paused' => $this->fingerprintRecordPaused($rec),
                    ];
                }
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        if (count($bestByTick) === 0) {
            return [];
        }
        ksort($bestByTick, SORT_NUMERIC);
        return array_values(array_map(
            static fn(array $rec): array => [
                'tick' => $rec['tick'],
                'fp' => $rec['fp'],
                'paused' => $rec['paused'],
            ],
            $bestByTick
        ));
    }

    /**
     * Return the `{tick, fp, paused}` record with the greatest tick in `fingerprints.jsonl`
     * (append order). When several lines share that tick, the first one in file order wins.
     * This ignores out-of-order checkpoint replays that re-append an older tick after
     * the stream has already advanced.
     *
     * @return array{tick:int,fp:string,paused:bool}|null
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
                    $latest = [
                        'tick' => $tick,
                        'fp' => $fp,
                        'paused' => $this->fingerprintRecordPaused($rec),
                    ];
                }
            }
            @flock($fh, LOCK_UN);
        } finally {
            fclose($fh);
        }
        return $latest;
    }

    /**
     * Single source of truth for last completed simulation tick vs fingerprint tail (same clamp as AppendOrderHandler).
     *
     * {@see AppendOrderHandler} and {@see GetHeartbeatHandler} must use this method so heartbeat and append cannot drift.
     *
     * - `lastCompleted`: greatest tick confirmed complete after clamp vs `waitingForOrders.atTick` when present,
     *   or null when there is no fingerprint yet.
     * - `orderBatchAtTick`: `waitingForOrders.atTick` from the latest snapshot when that block exists with an atTick field;
     *   callers that only want the batch tick while paused for parallel orders should combine with {@see getExpectingFromPlayerIdsAt}.
     * - `fingerprint`: canonical hash for `lastCompleted` after clamp (reloaded via range when clamp moves off the fp tail).
     *
     * @return array{
     *   lastCompleted:int|null,
     *   fingerprint:string|null,
     *   orderBatchAtTick:int|null
     * }
     */
    public function resolveLastCompletedTickAndFingerprint(string $lobbyId, string $gameId): array
    {
        $latestFingerprint = $this->getLatestFingerprint($lobbyId, $gameId);
        $fpTick = isset($latestFingerprint['tick']) ? (int) $latestFingerprint['tick'] : null;
        $fp = isset($latestFingerprint['fp']) && is_string($latestFingerprint['fp']) ? $latestFingerprint['fp'] : null;

        $latestSnapshot = $this->getSnapshotAtOrBefore($lobbyId, $gameId, null);
        $orderBatchAtTick = null;
        if (is_array($latestSnapshot)) {
            $state = $latestSnapshot['state'] ?? null;
            if (is_array($state)) {
                $waitingForOrders = $state['waitingForOrders'] ?? null;
                if (is_array($waitingForOrders) && isset($waitingForOrders['atTick'])) {
                    $raw = $waitingForOrders['atTick'];
                    if (is_int($raw) || is_float($raw) || (is_string($raw) && is_numeric($raw))) {
                        $orderBatchAtTick = (int) $raw;
                    }
                }
            }
        }

        if ($fpTick === null || $fp === null) {
            return ['lastCompleted' => null, 'fingerprint' => null, 'orderBatchAtTick' => $orderBatchAtTick];
        }

        $hostTick = $fpTick;
        if ($orderBatchAtTick !== null && $orderBatchAtTick > 0 && $hostTick >= 0) {
            $hostTick = min($hostTick, $orderBatchAtTick - 1);
            $range = $this->getFingerprintsRange($lobbyId, $gameId, $hostTick, $hostTick);
            if (count($range) > 0 && isset($range[0]['fp']) && is_string($range[0]['fp'])) {
                $fp = $range[0]['fp'];
            }
        }

        return [
            'lastCompleted' => $hostTick >= 0 ? $hostTick : null,
            'fingerprint' => $fp,
            'orderBatchAtTick' => $orderBatchAtTick,
        ];
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
        $lobbyDir = $this->storageRoot . '/lobbies/' . $lobbyId;
        if (!is_dir($lobbyDir)) {
            return;
        }

        foreach (['pending_orders.jsonl', 'applied_orders.jsonl', 'fingerprints.jsonl', 'initial_state.json'] as $file) {
            $path = $lobbyDir . '/' . $file;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        $snapDir = $lobbyDir . '/snapshots';
        if (is_dir($snapDir)) {
            $this->removeTreeRecursively($snapDir);
        }

        // Legacy nested layout cleanup (no backwards compatibility guarantee on disk layout).
        $legacyNested = $lobbyDir . '/games/' . $gameId;
        if (is_dir($legacyNested)) {
            $this->removeTreeRecursively($legacyNested);
        }
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
