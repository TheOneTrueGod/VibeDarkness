<?php

namespace App;

/**
 * Floors for battle-sync lobby_log lines (client `VITE_LOBBY_LOG_BATTLE_SYNC`, server `LOBBY_LOG_BATTLE_SYNC`).
 *
 * Noise / verbosity (most → least): log, info, warn, error, critical. `off` disables.
 * Unset env defaults to `info` (second most noisy).
 */
final class BattleSyncLogThreshold
{
    /**
     * Hard override for server battle-sync lobby logging.
     * Set to one of: log, info, warn, error, critical, off.
     * Keep as `log` while investigating sync/order issues.
     */
    private const OVERRIDE_FLOOR = 'log';

    /** @var array<string, int> */
    private const RANK = [
        'log' => 0,
        'info' => 1,
        'warn' => 2,
        'error' => 3,
        'critical' => 4,
    ];

    public static function shouldLogBattleSyncEvent(string $eventSeverity): bool
    {
        $floor = self::floorFromEnv();
        if ($floor === 'off') {
            return false;
        }
        $eventRank = self::RANK[$eventSeverity] ?? 2;
        $floorRank = self::RANK[$floor] ?? 99;

        return $eventRank >= $floorRank;
    }

    private static function floorFromEnv(): string
    {
        $override = strtolower(trim((string) self::OVERRIDE_FLOOR));
        if ($override === 'off' || isset(self::RANK[$override])) {
            return $override;
        }

        $raw = getenv('LOBBY_LOG_BATTLE_SYNC');
        if ($raw === false || $raw === '') {
            return 'info';
        }
        $s = strtolower(trim((string) $raw));
        if ($s === 'off') {
            return 'off';
        }
        if ($s === 'true' || $s === '1') {
            return 'log';
        }
        if (isset(self::RANK[$s])) {
            return $s;
        }

        return 'info';
    }
}
