<?php

namespace App;

/**
 * Floors for battle-sync lobby_log lines (client `global_constants.js`, server `global_constants.php`).
 *
 * Noise / verbosity (most → least): log, info, warn, error, critical. `off` disables.
 * Empty / invalid `LOBBY_LOG_BATTLE_SYNC` constant defaults to `info`.
 */
final class BattleSyncLogThreshold
{
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
        $floor = self::floorFromGlobalConstant();
        if ($floor === 'off') {
            return false;
        }
        $eventRank = self::RANK[$eventSeverity] ?? 2;
        $floorRank = self::RANK[$floor] ?? 99;

        return $eventRank >= $floorRank;
    }

    private static function floorFromGlobalConstant(): string
    {
        $raw = defined('LOBBY_LOG_BATTLE_SYNC') ? (string) constant('LOBBY_LOG_BATTLE_SYNC') : '';
        if ($raw === '') {
            return 'info';
        }
        $s = strtolower(trim($raw));
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
