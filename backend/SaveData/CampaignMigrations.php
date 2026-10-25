<?php

namespace App\SaveData;

/**
 * Campaign save migrations. See SaveMigrator for the "add a migration" recipe.
 *
 * v1: initialise `unlockedItemIds` from mission-result items and what the owner characters
 *     hold (non-core equipment, quest snapshot equipment, and root-node implied weapons).
 * v2: Exhaustion -> Hunger. `resourceDelta.exhaustion: n` / `resources.exhaustion: n` become
 *     `hunger: -n` (key dropped when 0).
 * v3: Equipment upgrade rewards. Unlock the tier items of completed chapter-1 missions and every
 *     upgrade item the owner's (migrated) characters have equipped.
 * v4: One Weapons tree. Mission-result `researchRewards` rows from legacy weapon trees point at `weapons`.
 * v5: Resource rename. `food` -> `vigor`, `crystals` -> `attunement` in `resources` and every `resourceDelta`.
 *
 * Lookups are injected as closures so the migration stays testable:
 *  - $ownerCharacterIds(string $campaignId): list<string>  character ids of the campaign owner
 *  - $loadCharacter(string $characterId): ?array            raw character data, or null if missing
 */
final class CampaignMigrations
{
    public const CURRENT_VERSION = 5;

    /**
     * Frozen (v3): tier unlocks of the completed chapter-1 missions: missionId => item ids.
     * Mirrors `completionRewards.unlockItemTiers` in storylines/WorldOfDarkness/missions and the
     * tier/campaignIds of the item defs in app/js/games/minion_battles/character_defs/items.
     */
    public const MISSION_TIER_ITEMS = [
        'dark_awakening' => ['001', '002', '003'],
        'towards_the_light' => ['011', '012', '013', '014', '015'],
        'cave_respite' => ['016'],
    ];

    /** Frozen (v3): upgrade item => items it came from (also unlocked when it is equipped). */
    public const UPGRADE_ITEM_PREREQS = [
        '011' => ['001'], '012' => ['001'], '013' => ['002'], '014' => ['002'],
        '015' => ['003'], '016' => ['015', '003'],
    ];

    /**
     * @param callable(string): array $ownerCharacterIds
     * @param callable(string): ?array $loadCharacter
     * @return array<int, callable(array): array>
     */
    public static function migrations(callable $ownerCharacterIds, callable $loadCharacter): array
    {
        return [
            0 => static fn (array $d): array => self::v0ToV1($d, $ownerCharacterIds, $loadCharacter),
            1 => [self::class, 'v1ToV2'],
            2 => static fn (array $d): array => self::v2ToV3($d, $ownerCharacterIds, $loadCharacter),
            3 => [self::class, 'v3ToV4'],
            4 => [self::class, 'v4ToV5'],
        ];
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

    public static function v1ToV2(array $data): array
    {
        if (array_key_exists('missionResults', $data)) {
            $data['missionResults'] = CharacterMigrations::convertResultRows($data['missionResults']);
        }
        if (array_key_exists('resources', $data)) {
            $data['resources'] = CharacterMigrations::exhaustionToHunger($data['resources']);
        }
        return $data;
    }

    /**
     * @param callable(string): array $ownerCharacterIds
     * @param callable(string): ?array $loadCharacter
     */
    public static function v2ToV3(array $data, callable $ownerCharacterIds, callable $loadCharacter): array
    {
        $unlocked = is_array($data['unlockedItemIds'] ?? null) ? array_values($data['unlockedItemIds']) : [];
        $add = static function (array $ids) use (&$unlocked): void {
            foreach ($ids as $id) {
                if (is_string($id) && $id !== '' && !in_array($id, $unlocked, true)) {
                    $unlocked[] = $id;
                }
            }
        };

        foreach (is_array($data['missionResults'] ?? null) ? $data['missionResults'] : [] as $r) {
            if (is_array($r) && ($r['result'] ?? 'victory') === 'victory'
                && isset(self::MISSION_TIER_ITEMS[(string) ($r['missionId'] ?? '')])
            ) {
                $add(self::MISSION_TIER_ITEMS[(string) $r['missionId']]);
            }
        }

        foreach ($ownerCharacterIds((string) ($data['id'] ?? '')) as $characterId) {
            $char = $loadCharacter((string) $characterId);
            if (!is_array($char)) {
                continue;
            }
            // Raw lookups may be pre-migration: convert swap research to equipment first (idempotent).
            $char = CharacterMigrations::migrate($char)['data'];
            $equipment = array_merge(
                is_array($char['equipment'] ?? null) ? $char['equipment'] : [],
                is_array($char['activeQuestRun']['questCharacter']['equipment'] ?? null)
                    ? $char['activeQuestRun']['questCharacter']['equipment'] : []
            );
            foreach ($equipment as $item) {
                if (is_string($item) && isset(self::UPGRADE_ITEM_PREREQS[$item])) {
                    $add(array_merge([$item], self::UPGRADE_ITEM_PREREQS[$item]));
                }
            }
        }

        $data['unlockedItemIds'] = $unlocked;
        return $data;
    }

    public static function v3ToV4(array $data): array
    {
        if (array_key_exists('missionResults', $data)) {
            $data['missionResults'] = CharacterMigrations::remapResearchRewardTrees($data['missionResults']);
        }
        return $data;
    }

    public static function v4ToV5(array $data): array
    {
        if (array_key_exists('resources', $data)) {
            $data['resources'] = ResourceRenames::renameResourceMap($data['resources']);
        }
        // missionResults plus any queued / pending reward payloads carrying a resourceDelta.
        foreach (['missionResults', 'pendingRewards', 'queuedRewards'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = ResourceRenames::renameDeep($data[$key]);
            }
        }
        return $data;
    }
}
