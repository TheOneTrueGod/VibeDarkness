<?php

namespace App;

/**
 * Helper for deterministic game state hashing (synchash) used for multiplayer sync verification.
 */
class GameStateSync
{
    /**
     * Compute a deterministic SHA-256 hash of the canonical subset of game state.
     * Excludes non-deterministic fields: gameTime, snapshotIndex, waitingForOrders, timestamps.
     */
    public static function computeSynchash(array $state): string
    {
        $canonical = [];
        $gameTick = $state['gameTick'] ?? $state['game_tick'] ?? null;
        if ($gameTick !== null) {
            $canonical['gameTick'] = (int) $gameTick;
        }
        foreach (['units', 'projectiles', 'effects', 'specialTiles', 'special_tiles', 'cards', 'orders'] as $key) {
            if (array_key_exists($key, $state)) {
                $val = $state[$key];
                if ($key === 'orders' && is_array($val)) {
                    $val = self::sortOrdersByGameTick($val);
                }
                $canonical[$key] = self::normalizeForHash($val);
            }
        }
        $canonical = self::sortKeysRecursive($canonical);
        $json = json_encode($canonical);
        if ($json === false) {
            throw new \RuntimeException('Failed to encode game state for synchash');
        }
        return hash('sha256', $json);
    }

    private static function sortOrdersByGameTick(array $orders): array
    {
        usort($orders, static fn ($a, $b) => (int) ($a['gameTick'] ?? 0) <=> (int) ($b['gameTick'] ?? 0));
        return $orders;
    }

    /**
     * Recursively sort array keys for deterministic JSON output (replaces JSON_SORT_KEYS for PHP compatibility).
     */
    private static function sortKeysRecursive(array $arr): array
    {
        ksort($arr, SORT_STRING);
        foreach ($arr as $k => $v) {
            if (is_array($v) && self::isAssocArray($v)) {
                $arr[$k] = self::sortKeysRecursive($v);
            }
        }
        return $arr;
    }

    private static function isAssocArray(array $arr): bool
    {
        if ($arr === []) {
            return false;
        }
        return array_keys($arr) !== range(0, count($arr) - 1);
    }

    /**
     * Recursively normalize nested structures for deterministic hashing.
     */
    private static function normalizeForHash(mixed $val): mixed
    {
        if (!is_array($val)) {
            return $val;
        }
        $result = [];
        foreach ($val as $k => $v) {
            $result[$k] = is_array($v) ? self::normalizeForHash($v) : $v;
        }
        return $result;
    }
}
