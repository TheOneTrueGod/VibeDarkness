<?php

namespace App\SaveData;

/**
 * Campaign save migrations. See SaveMigrator for the "add a migration" recipe.
 *
 * v1: initialise `unlockedItemIds` from mission-result items and what the owner characters
 *     hold (non-core equipment, quest snapshot equipment, and root-node implied weapons).
 *
 * Lookups are injected as closures so the migration stays testable:
 *  - $ownerCharacterIds(string $campaignId): list<string>  character ids of the campaign owner
 *  - $loadCharacter(string $characterId): ?array            raw character data, or null if missing
 */
final class CampaignMigrations
{
    public const CURRENT_VERSION = 1;

    /**
     * @param callable(string): array $ownerCharacterIds
     * @param callable(string): ?array $loadCharacter
     * @return array<int, callable(array): array>
     */
    public static function migrations(callable $ownerCharacterIds, callable $loadCharacter): array
    {
        return [0 => static fn (array $d): array => self::v0ToV1($d, $ownerCharacterIds, $loadCharacter)];
    }

    /**
     * @param callable(string): array $ownerCharacterIds
     * @param callable(string): ?array $loadCharacter
     * @return array{data: array<string, mixed>, changed: bool}
     */
    public static function migrate(array $data, callable $ownerCharacterIds, callable $loadCharacter): array
    {
        return SaveMigrator::migrate($data, self::CURRENT_VERSION, self::migrations($ownerCharacterIds, $loadCharacter));
    }

    /**
     * @param callable(string): array $ownerCharacterIds
     * @param callable(string): ?array $loadCharacter
     */
    public static function v0ToV1(array $data, callable $ownerCharacterIds, callable $loadCharacter): array
    {
        $unlocked = [];
        $add = static function (array $ids) use (&$unlocked): void {
            foreach ($ids as $id) {
                if (is_string($id) && trim($id) !== '' && !in_array(trim($id), $unlocked, true)) {
                    $unlocked[] = trim($id);
                }
            }
        };

        $add(CharacterMigrations::mapLegacyItems($data['unlockedItemIds'] ?? []));

        foreach (is_array($data['missionResults'] ?? null) ? $data['missionResults'] : [] as $result) {
            if (is_array($result) && isset($result['itemIds'])) {
                $add(CharacterMigrations::mapLegacyItems($result['itemIds']));
            }
        }

        $campaignId = (string) ($data['id'] ?? '');
        foreach ($ownerCharacterIds($campaignId) as $characterId) {
            $char = $loadCharacter((string) $characterId);
            if (!is_array($char)) {
                continue;
            }
            $equipment = CharacterMigrations::mapLegacyItems($char['equipment'] ?? []);
            $snapshot = $char['activeQuestRun']['questCharacter']['equipment'] ?? [];
            $equipment = array_merge($equipment, CharacterMigrations::mapLegacyItems($snapshot));
            $add(array_values(array_diff($equipment, CharacterMigrations::CORE_ITEM_IDS)));

            $researchTrees = is_array($char['researchTrees'] ?? null) ? $char['researchTrees'] : [];
            foreach (CharacterMigrations::ROOT_NODE_WEAPONS as [$treeId, $nodeId, $weapon]) {
                $nodes = $researchTrees[$treeId] ?? null;
                if (is_array($nodes) && in_array($nodeId, $nodes, true)) {
                    $add([$weapon]);
                }
            }
        }

        $data['unlockedItemIds'] = $unlocked;
        return $data;
    }
}
