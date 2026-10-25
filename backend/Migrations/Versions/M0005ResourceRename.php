<?php

namespace App\Migrations\Versions;

use App\CampaignManager;
use App\CharacterManager;
use App\Migrations\Migration;
use App\Migrations\MigrationContext;
use App\SaveData\CampaignMigrations;
use App\SaveData\CharacterMigrations;
use App\SaveData\ResourceRenames;
use App\SaveData\StorageRoot;

/**
 * Resource rename: `food` -> `vigor`, `crystals` -> `attunement`, account/character knowledge
 * `Crystals` -> `ResourceAttunement`.
 *  - Characters and campaigns: save version 5 (resources, every resourceDelta, knowledge); the
 *    per-entity logic lives in App\SaveData\*Migrations and also runs lazily on load.
 *  - Accounts have no save version: this sweep renames `knowledge.Crystals` in place, and
 *    PlayerAccount::fromArray renames it lazily for any account the sweep missed.
 * Lobby files are ephemeral and deliberately not migrated.
 */
final class M0005ResourceRename extends Migration
{
    public function version(): int
    {
        return 5;
    }

    public function name(): string
    {
        return 'resource_rename';
    }

    public function description(): string
    {
        return 'Rename food -> vigor, crystals -> attunement and the Crystals knowledge key in saves.';
    }

    public function touchedDirs(): array
    {
        return ['characters', 'campaigns', 'accounts'];
    }

    public function plan(MigrationContext $context): array
    {
        $storage = $context->storageDir;
        $lines = [];
        $nChars = 0;
        $nCamps = 0;
        $nAccts = 0;
        foreach (self::jsonIds($storage . '/characters') as $id) {
            $data = self::readJson($storage . '/characters/' . $id . '.json');
            if ($data !== null && CharacterMigrations::migrate($data)['changed']) {
                $nChars++;
                $lines[] = sprintf('character %s (%s): food/crystals -> vigor/attunement', $id, (string) ($data['name'] ?? ''));
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
                $lines[] = "campaign {$id}: food/crystals -> vigor/attunement";
            }
        }
        foreach (self::accountIds($storage . '/accounts') as $id) {
            $data = self::readJson($storage . '/accounts/' . $id . '.json');
            if ($data !== null && ResourceRenames::renameAccountData($data) !== $data) {
                $nAccts++;
                $lines[] = "account {$id}: knowledge Crystals -> ResourceAttunement";
            }
        }
        $lines[] = "Would change {$nChars} character(s), {$nCamps} campaign(s), {$nAccts} account(s).";
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

        // Accounts: rewrite only the files whose knowledge map changes (idempotent).
        $renamed = 0;
        foreach (self::accountIds($storage . '/accounts') as $id) {
            $path = $storage . '/accounts/' . $id . '.json';
            $data = self::readJson($path);
            if ($data === null) {
                continue;
            }
            $new = ResourceRenames::renameAccountData($data);
            if ($new !== $data) {
                file_put_contents($path, json_encode($new, JSON_PRETTY_PRINT));
                $renamed++;
            }
        }
        $context->log("Renamed knowledge keys on {$renamed} account(s).");
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

    /** @return list<string> account ids (numeric *.json files; excludes accounts_index.json) */
    private static function accountIds(string $dir): array
    {
        return array_values(array_filter(self::jsonIds($dir), static fn (string $id): bool => ctype_digit($id)));
    }

    /** @return array<string, mixed>|null */
    private static function readJson(string $path): ?array
    {
        $d = json_decode((string) file_get_contents($path), true);
        return is_array($d) ? $d : null;
    }
}
