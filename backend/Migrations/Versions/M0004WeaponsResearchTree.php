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
 * One Weapons research tree: bring every character and campaign to save version 4.
 *  - Characters: the per-weapon and weapon-family trees (crystal_rocks, knives_item, thrown_weapons, ...)
 *    merge into `weapons`, keeping node ids, levels and sources; also in the quest snapshot.
 *  - Characters and campaigns: mission-result `researchRewards` rows point at `weapons`.
 *
 * The per-entity logic lives in App\SaveData\*Migrations (it also runs lazily on load);
 * this migration sweeps all stored files once so nothing waits to be loaded.
 */
final class M0004WeaponsResearchTree extends Migration
{
    public function version(): int
    {
        return 4;
    }

    public function name(): string
    {
        return 'weapons_research_tree';
    }

    public function description(): string
    {
        return 'Merge the per-weapon research trees into a single Weapons tree.';
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
                $lines[] = sprintf('character %s (%s): weapon research -> weapons tree', $id, (string) ($data['name'] ?? ''));
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
                $lines[] = "campaign {$id}: research reward rows -> weapons tree";
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
