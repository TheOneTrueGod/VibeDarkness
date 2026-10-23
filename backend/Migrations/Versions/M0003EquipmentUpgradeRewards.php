<?php

namespace App\Migrations\Versions;

use App\CampaignManager;
use App\CharacterManager;
use App\Migrations\Migration;
use App\Migrations\MigrationContext;
use App\SaveData\CampaignMigrations;
use App\SaveData\CharacterMigrations;
use App\SaveData\MigrationLookups;
use App\SaveData\StorageRoot;

/**
 * Equipment upgrade rewards (docs/plans/equipment-upgrade-rewards.md):
 * bring every character and campaign to save version 3.
 *  - Characters: swap research (charged_rocks, throwing_knives, craft_sword, pipe_bat,
 *    crystal_embedded_shield, throwing_crystal_shield) becomes the matching equipped item (011-016),
 *    also in the quest snapshot; follow-up nodes move to their new research trees.
 *  - Campaigns: unlock the tier items of completed chapter-1 missions and every equipped upgrade item.
 *
 * The per-entity logic lives in App\SaveData\*Migrations (it also runs lazily on load);
 * this migration sweeps all stored files once so nothing waits to be loaded.
 */
final class M0003EquipmentUpgradeRewards extends Migration
{
    public function version(): int
    {
        return 3;
    }

    public function name(): string
    {
        return 'equipment_upgrade_rewards';
    }

    public function description(): string
    {
        return 'Convert swap research to equipped items, move follow-up research nodes, unlock tier items on campaigns.';
    }

    public function touchedDirs(): array
    {
        return ['characters', 'campaigns'];
    }

    public function plan(MigrationContext $context): array
    {
        $storage = $context->storageDir;
        $lookups = new MigrationLookups($storage);
        $lines = [];
        $nChars = 0;
        $nCamps = 0;
        foreach (self::jsonIds($storage . '/characters') as $id) {
            $data = self::readJson($storage . '/characters/' . $id . '.json');
            if ($data === null) {
                continue;
            }
            $res = CharacterMigrations::migrate($data);
            if ($res['changed']) {
                $nChars++;
                $lines[] = sprintf(
                    'character %s (%s): equipment %s -> %s',
                    $id,
                    (string) ($data['name'] ?? ''),
                    self::label($data['equipment'] ?? []),
                    self::label($res['data']['equipment'] ?? [])
                );
            }
        }
        foreach (self::jsonIds($storage . '/campaigns') as $id) {
            $data = self::readJson($storage . '/campaigns/' . $id . '.json');
            if ($data === null) {
                continue;
            }
            $data['id'] = $id;
            $res = CampaignMigrations::migrate(
                $data,
                static fn (string $cid): array => $lookups->ownerCharacterIds($cid),
                static fn (string $charId): ?array => $lookups->loadCharacter($charId)
            );
            if ($res['changed']) {
                $nCamps++;
                $lines[] = sprintf(
                    'campaign %s: unlockedItemIds %s -> %s',
                    $id,
                    self::label($data['unlockedItemIds'] ?? []),
                    self::label($res['data']['unlockedItemIds'] ?? [])
                );
            }
        }
        $lines[] = "Would change {$nChars} character(s), {$nCamps} campaign(s).";
        return $lines;
    }

    public function up(MigrationContext $context): void
    {
        $storage = $context->storageDir;
        // Loading through the managers runs the on-load migrations and persists changed files.
        // Characters first so campaigns read the converted equipment.
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

    private static function label(mixed $ids): string
    {
        return '[' . implode(', ', array_map('strval', is_array($ids) ? $ids : [])) . ']';
    }
}
