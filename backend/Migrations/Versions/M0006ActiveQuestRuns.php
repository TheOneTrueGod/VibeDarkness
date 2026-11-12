<?php

namespace App\Migrations\Versions;

use App\CharacterManager;
use App\Migrations\Migration;
use App\Migrations\MigrationContext;
use App\SaveData\CharacterMigrations;
use App\SaveData\StorageRoot;

/**
 * Character save v6: singular `activeQuestRun` becomes `activeQuestRuns` keyed by runId.
 */
final class M0006ActiveQuestRuns extends Migration
{
    public function version(): int
    {
        return 6;
    }

    public function name(): string
    {
        return 'active_quest_runs_map';
    }

    public function description(): string
    {
        return 'Wrap legacy activeQuestRun into activeQuestRuns[runId] on character saves.';
    }

    public function touchedDirs(): array
    {
        return ['characters'];
    }

    public function plan(MigrationContext $context): array
    {
        $storage = $context->storageDir;
        $lines = [];
        $nChars = 0;
        foreach (self::jsonIds($storage . '/characters') as $id) {
            $data = self::readJson($storage . '/characters/' . $id . '.json');
            if ($data === null) {
                continue;
            }
            $stored = isset($data['version']) && is_numeric($data['version']) ? (int) $data['version'] : 0;
            if ($stored < CharacterMigrations::CURRENT_VERSION) {
                $nChars++;
                $lines[] = sprintf('character %s (%s): activeQuestRun -> activeQuestRuns map', $id, (string) ($data['name'] ?? ''));
            }
        }
        $lines[] = "Would change {$nChars} character(s).";
        return $lines;
    }

    public function up(MigrationContext $context): void
    {
        $storage = $context->storageDir;
        StorageRoot::setOverride($storage);
        try {
            $chars = 0;
            foreach (self::jsonIds($storage . '/characters') as $id) {
                if (CharacterManager::getInstance()->getCharacter($id) !== null) {
                    $chars++;
                }
            }
            $context->log("Checked {$chars} character(s).");
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
