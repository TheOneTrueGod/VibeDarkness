<?php

namespace App\Migrations;

use App\Migrations\Versions\M0001EquipmentUnlocksAndSaveVersions;
use App\Migrations\Versions\M0002ExhaustionToHunger;
use App\Migrations\Versions\M0003EquipmentUpgradeRewards;
use App\Migrations\Versions\M0004WeaponsResearchTree;

/**
 * Ordered list of every deploy-time migration. Append new migrations at the end with the
 * next version number; never reorder, renumber or remove a shipped entry.
 */
final class MigrationRegistry
{
    /** @return list<Migration> */
    public static function all(): array
    {
        return [
            new M0001EquipmentUnlocksAndSaveVersions(),
            new M0002ExhaustionToHunger(),
            new M0003EquipmentUpgradeRewards(),
            new M0004WeaponsResearchTree(),
        ];
    }

    /**
     * Throws if versions are not exactly 1..N in order with unique names.
     *
     * @param list<Migration> $migrations
     */
    public static function validate(array $migrations): void
    {
        $names = [];
        foreach ($migrations as $i => $m) {
            $expected = $i + 1;
            if ($m->version() !== $expected) {
                throw new \LogicException(sprintf(
                    'Migration %s has version %d; expected %d (versions must be consecutive from 1).',
                    get_class($m),
                    $m->version(),
                    $expected
                ));
            }
            if (!preg_match('/^[a-z0-9_]+$/', $m->name()) || isset($names[$m->name()])) {
                throw new \LogicException("Migration name '{$m->name()}' is invalid or duplicated.");
            }
            $names[$m->name()] = true;
        }
    }
}
