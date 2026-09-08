<?php

namespace App;

/**
 * Reads portrait manifests from the frontend registry so eligibility stays in one place.
 * A portrait with no `allowedPlayerIds` is available to every account.
 */
class PortraitCatalog
{
    public const FALLBACK_PORTRAIT_ID = 'warrior';

    /**
     * Portrait IDs the given account may use.
     *
     * @return list<string>
     */
    public static function getAllowedPortraitIds(int $accountId): array
    {
        $ids = [];
        foreach (self::listManifests() as $manifest) {
            $id = isset($manifest['id']) ? (string) $manifest['id'] : '';
            if ($id === '') {
                continue;
            }
            $allowed = $manifest['allowedPlayerIds'] ?? null;
            if (!is_array($allowed) || $allowed === []) {
                $ids[] = $id;
                continue;
            }
            $allowedInts = [];
            foreach ($allowed as $pid) {
                $allowedInts[] = (int) $pid;
            }
            if (in_array($accountId, $allowedInts, true)) {
                $ids[] = $id;
            }
        }
        return $ids;
    }

    public static function pickRandomAllowedPortraitId(int $accountId): string
    {
        $ids = self::getAllowedPortraitIds($accountId);
        if ($ids === []) {
            return self::FALLBACK_PORTRAIT_ID;
        }
        return $ids[array_rand($ids)];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function listManifests(): array
    {
        $dir = dirname(__DIR__) . '/app/js/games/minion_battles/character_defs/portraits';
        if (!is_dir($dir)) {
            return [];
        }
        $paths = glob($dir . '/*/manifest.json') ?: [];
        $out = [];
        foreach ($paths as $path) {
            $json = file_get_contents($path);
            $data = json_decode((string) $json, true);
            if (!is_array($data)) {
                continue;
            }
            if (!isset($data['id']) || !is_string($data['id']) || $data['id'] === '') {
                $data['id'] = basename(dirname($path));
            }
            $out[] = $data;
        }
        return $out;
    }
}
