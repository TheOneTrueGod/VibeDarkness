<?php

namespace App\Migrations\Versions;

use App\CampaignManager;
use App\CharacterManager;
use App\Migrations\Migration;
use App\Migrations\MigrationContext;
use App\SaveData\CampaignMigrations;
use App\SaveData\CharacterMigrations;
use App\SaveData\StorageRoot;

/**
 * Exhaustion/Endurance -> Hunger (docs/plans/hunger-mechanic.md):
 * bring every character and campaign to save version 2, rewriting
 * `resourceDelta.exhaustion: n` (positive = lost) as `hunger: -n` (signed).
 *
 * The per-entity logic lives in App\SaveData\*Migrations (it also runs lazily on load);
 * this migration sweeps all stored files once so nothing waits to be loaded.
 */
final class M0002ExhaustionToHunger extends Migration
{
    public function version(): int
    {
        return 2;
    }

    public function name(): string
    {
        return 'exhaustion_to_hunger';
    }

    public function description(): string
    {
        return 'Rename the exhaustion resource to signed hunger in character and campaign saves.';
    }

    public function touchedDirs(): array
    {
        return ['characters', 'campaigns'];
    }

    public function plan(MigrationContext $context): array
    {
        $storage = $context->storageDir;
        $lines = [];
        $nChars = 0;
        $nCamps = 0;
        foreach (self::jsonIds($storage . '/characters') as $id) {
            $data = self::readJson($storage . '/characters/' . $id . '.json');
            if ($data !== null && CharacterMigrations::migrate($data)['changed']) {
                $nChars++;
                $lines[] = sprintf('character %s (%s): exhaustion -> hunger', $id, (string) ($data['name'] ?? ''));
            }
        }
        foreach (self::jsonIds($storage . '/campaigns') as $id) {
            $data = self::readJson($storage . '/campaigns/' . $id . '.json');
            if ($data === null) {
                continue;
            }
            $stored = isset($data['version']) && is_numeric($data['version']) ? (int) $data['version'] : 0;
            if ($stored < CampaignMigrations::CURRENT_VERSION) {
                $nCamps++;
                $lines[] = "campaign {$id}: exhaustion -> hunger";
            }
        }
        $lines[] = "Would change {$nChars} character(s), {$nCamps} campaign(s).";
        return $lines;
    }

    public function up(MigrationContext $context): void
    {
        $storage = $context->storageDir;
        // Loading through the managers runs the on-load migrations and persists changed files.
        StorageRoot::setOverride($storage);
        try {
            $chars = 0;
            foreach (self::jsonIds($storage . '/characters') as $id) {
                if (CharacterManager::getInstance()->getCharacter($id) !== null) {
                    $chars++;
                }
            }
            $camps = 0;
            foreach (self::jsonIds($storage . '/campaigns') as $id) {
                if (CampaignManager::getInstance()->getCampaign($id) !== null) {
                    $camps++;
                }
            }
            $context->log("Checked {$chars} character(s) and {$camps} campaign(s).");
        } finally {
            StorageRoot::setOverride(null);
        }
    }

    /** @return list<string> ids of *.json files in a directory */
    private static function jsonIds(string $dir): array
    {
        $out = [];
        foreach (is_dir($dir) ? (scandir($dir) ?: []) : [] as $f) {
            if (str_ends_with($f, '.json')) {
                $out[] = substr($f, 0, -5);
            }
        }
        return $out;
    }

    /** @return array<string, mixed>|null */
    private static function readJson(string $path): ?array
    {
        $d = json_decode((string) file_get_contents($path), true);
        return is_array($d) ? $d : null;
    }
}
