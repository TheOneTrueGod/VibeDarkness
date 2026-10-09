<?php

namespace App\SaveData;

/**
 * Versioned save-data migration runner.
 *
 * Each persisted entity (character, campaign) stores an integer `version` (missing = 0).
 * On load, every migration from the stored version up to the current version runs in order,
 * and the upgraded data is written back by the caller when `changed` is true.
 *
 * How to add a migration:
 *  1. In the entity migrations class (CharacterMigrations / CampaignMigrations), add a
 *     `public static function vNToNplus1(array $data): array` that returns the upgraded data.
 *     Keep it pure (no I/O) except for the injected lookup closures CampaignMigrations takes.
 *  2. Register it in that class `migrations()` map under the OLD version key
 *     (key 1 upgrades version 1 -> 2).
 *  3. Bump `CURRENT_VERSION` in that class.
 *  4. Add a fixture to `runSelfTest()` in backend/scripts/migrate.php.
 *  5. Add a deploy-time migration (backend/Migrations/Versions/) that sweeps all stored files
 *     through the managers (copy M0001's `up()`), so the upgrade does not wait for each
 *     entity to be loaded. Then `npm run migrate -- --dry-run` and `npm run migrate` locally.
 * Never edit a shipped migration; add a new one.
 */
final class SaveMigrator
{
    /**
     * @param array<string, mixed> $data Raw decoded entity.
     * @param int $currentVersion Latest schema version.
     * @param array<int, callable(array): array> $migrations Keyed by the version they upgrade FROM.
     * @return array{data: array<string, mixed>, changed: bool}
     */
    public static function migrate(array $data, int $currentVersion, array $migrations): array
    {
        $stored = isset($data['version']) && is_numeric($data['version']) ? (int) $data['version'] : 0;
        if ($stored >= $currentVersion) {
            return ['data' => $data, 'changed' => false];
        }
        for ($v = $stored; $v < $currentVersion; $v++) {
            if (isset($migrations[$v])) {
                $data = ($migrations[$v])($data);
            }
        }
        $data['version'] = $currentVersion;
        return ['data' => $data, 'changed' => true];
    }
}
