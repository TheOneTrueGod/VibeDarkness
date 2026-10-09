<?php

namespace App\SaveData;

/**
 * Character save migrations. See SaveMigrator for the "add a migration" recipe.
 *
 * v1: retire the legacy upgrade items (they became ability swaps) and make sure a character
 *     holds a base weapon if its research implies one.
 */
final class CharacterMigrations
{
    public const CURRENT_VERSION = 1;

    /** Frozen: retired upgrade item -> base weapon. */
    public const LEGACY_ITEM_TO_BASE = [
        '013' => '001', '016' => '001',
        '015' => '002', '021' => '002',
        '011' => '003', '012' => '003',
    ];

    /** Frozen: ids of weapon-slot items as of version 1 (hands/ and weapons/ item files). */
    public const WEAPON_ITEM_IDS = ['001', '002', '003', '007', '008', '009', '010'];

    /** Frozen: core item ids as of version 1. */
    public const CORE_ITEM_IDS = ['004', '006', '017', '018', '019', '020', '022'];

    /** Frozen: starting-weapon root nodes in priority order: [treeId, nodeId, weapon]. */
    public const ROOT_NODE_WEAPONS = [
        ['crystal_rocks', 'throw_rock', '001'],
        ['stick_sword', 'swing_stick', '002'],
        ['tech_shield', 'raise_shield', '003'],
    ];

    /** @return array<int, callable(array): array> */
    public static function migrations(): array
    {
        return [0 => [self::class, 'v0ToV1']];
    }

    /** @return array{data: array<string, mixed>, changed: bool} */
    public static function migrate(array $data): array
    {
        return SaveMigrator::migrate($data, self::CURRENT_VERSION, self::migrations());
    }

    /**
     * Map legacy items to base weapons, preserving order and removing duplicates.
     *
     * @param mixed $ids
     * @return list<string>
     */
    public static function mapLegacyItems(mixed $ids): array
    {
        $out = [];
        foreach (is_array($ids) ? $ids : [] as $id) {
            if (!is_string($id)) {
                continue;
            }
            $id = self::LEGACY_ITEM_TO_BASE[$id] ?? $id;
            if (!in_array($id, $out, true)) {
                $out[] = $id;
            }
        }
        return $out;
    }

    /** Base weapon implied by the first owned root node, or null. */
    public static function impliedWeaponFromResearch(mixed $researchTrees): ?string
    {
        if (!is_array($researchTrees)) {
            return null;
        }
        foreach (self::ROOT_NODE_WEAPONS as [$treeId, $nodeId, $weapon]) {
            $nodes = $researchTrees[$treeId] ?? null;
            if (is_array($nodes) && in_array($nodeId, $nodes, true)) {
                return $weapon;
            }
        }
        return null;
    }

    public static function v0ToV1(array $data): array
    {
        $equipment = self::mapLegacyItems($data['equipment'] ?? []);
        $hasWeapon = count(array_intersect($equipment, self::WEAPON_ITEM_IDS)) > 0;
        if (!$hasWeapon) {
            $implied = self::impliedWeaponFromResearch($data['researchTrees'] ?? []);
            if ($implied !== null) {
                $equipment[] = $implied;
            }
        }
        $data['equipment'] = $equipment;

        if (isset($data['activeQuestRun']) && is_array($data['activeQuestRun'])
            && isset($data['activeQuestRun']['questCharacter']) && is_array($data['activeQuestRun']['questCharacter'])
            && isset($data['activeQuestRun']['questCharacter']['equipment'])
        ) {
            $data['activeQuestRun']['questCharacter']['equipment'] =
                self::mapLegacyItems($data['activeQuestRun']['questCharacter']['equipment']);
        }
        return $data;
    }
}
