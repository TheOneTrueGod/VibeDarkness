<?php

namespace App;

/**
 * Snapshot files use the host's actual engine tick in the filename (e.g. _1.json).
 * SaveGameOrders writes to the aligned checkpoint path (e.g. _0.json). When both exist,
 * order reads must use the aligned file first; minimal sync must use the latest full
 * checkpoint in the tick window (usually the higher tick), not the order-only bucket.
 */
final class GameCheckpointFiles
{
    /** Must match app/js/games/minion_battles/engine/GameEngine.ts CHECKPOINT_INTERVAL */
    public const INTERVAL = 10;

    /**
     * GET orders / host polling: aligned checkpoint file first (matches SaveGameOrders),
     * else newest file in that checkpoint window (early battle before _0.json exists).
     *
     * @return non-empty-string|null
     */
    public static function resolveSnapshotPathForOrders(string $dir, string $gameId, int $checkpointGameTick): ?string
    {
        if (!is_dir($dir)) {
            return null;
        }
        $prefix = 'game_' . $gameId . '_';
        $suffix = '.json';
        $exact = $dir . '/' . $prefix . $checkpointGameTick . $suffix;
        if (is_file($exact)) {
            return $exact;
        }

        return self::findLatestFileInCheckpointWindow($dir, $gameId, $checkpointGameTick);
    }

    /**
     * GET minimal (non-host synchash): always the newest file in the window — avoids
     * reading the aligned order bucket (_0.json) when a newer host snapshot (_1.json) exists.
     *
     * @return non-empty-string|null
     */
    public static function resolveSnapshotPathForMinimal(string $dir, string $gameId, int $checkpointGameTick): ?string
    {
        if (!is_dir($dir)) {
            return null;
        }

        return self::findLatestFileInCheckpointWindow($dir, $gameId, $checkpointGameTick);
    }

    /**
     * Union orders from every snapshot file in this checkpoint window (aligned bucket + host ticks).
     * Needed because SaveGameOrders writes to the aligned filename while host checkpoints use actual ticks.
     *
     * @return list<array{gameTick?: int, order?: mixed}>
     */
    public static function mergeOrdersInCheckpointWindow(string $dir, string $gameId, int $checkpointGameTick): array
    {
        if (!is_dir($dir)) {
            return [];
        }
        $prefix = 'game_' . $gameId . '_';
        $suffix = '.json';
        $windowStart = (int) (floor($checkpointGameTick / self::INTERVAL) * self::INTERVAL);
        $windowEnd = $windowStart + self::INTERVAL;

        $paths = [];
        foreach (scandir($dir) ?: [] as $file) {
            if (!is_string($file) || !str_starts_with($file, $prefix) || !str_ends_with($file, $suffix)) {
                continue;
            }
            $tickStr = substr($file, strlen($prefix), -strlen($suffix));
            if ($tickStr === '' || !ctype_digit($tickStr)) {
                continue;
            }
            $t = (int) $tickStr;
            if ($t >= $windowStart && $t < $windowEnd) {
                $paths[] = $dir . '/' . $file;
            }
        }

        $seen = [];
        $out = [];
        foreach ($paths as $path) {
            if (!is_file($path)) {
                continue;
            }
            $decoded = json_decode((string) file_get_contents($path), true);
            if (!is_array($decoded)) {
                continue;
            }
            $orders = $decoded['orders'] ?? [];
            if (!is_array($orders)) {
                continue;
            }
            foreach ($orders as $o) {
                if (!is_array($o)) {
                    continue;
                }
                $k = json_encode($o);
                if ($k === false || isset($seen[$k])) {
                    continue;
                }
                $seen[$k] = true;
                $out[] = $o;
            }
        }

        usort($out, static function ($a, $b): int {
            return ((int) ($a['gameTick'] ?? 0)) <=> ((int) ($b['gameTick'] ?? 0));
        });

        return $out;
    }

    private static function findLatestFileInCheckpointWindow(string $dir, string $gameId, int $checkpointGameTick): ?string
    {
        $prefix = 'game_' . $gameId . '_';
        $suffix = '.json';
        $windowStart = (int) (floor($checkpointGameTick / self::INTERVAL) * self::INTERVAL);
        $windowEnd = $windowStart + self::INTERVAL;

        $bestTick = -1;
        $bestPath = null;
        foreach (scandir($dir) ?: [] as $file) {
            if (!is_string($file) || !str_starts_with($file, $prefix) || !str_ends_with($file, $suffix)) {
                continue;
            }
            $tickStr = substr($file, strlen($prefix), -strlen($suffix));
            if ($tickStr === '' || !ctype_digit($tickStr)) {
                continue;
            }
            $t = (int) $tickStr;
            if ($t >= $windowStart && $t < $windowEnd && $t > $bestTick) {
                $bestTick = $t;
                $bestPath = $dir . '/' . $file;
            }
        }

        return $bestPath;
    }
}
