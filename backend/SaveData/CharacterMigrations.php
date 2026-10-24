<?php

namespace App\SaveData;

/**
 * Character save migrations. See SaveMigrator for the "add a migration" recipe.
 *
 * v1: retire the legacy upgrade items (they became ability swaps) and make sure a character
 *     holds a base weapon if its research implies one.
 * v2: Exhaustion -> Hunger. `resourceDelta.exhaustion: n` becomes `hunger: -n` (key dropped when 0).
 * v3: Equipment upgrade rewards (docs/plans/equipment-upgrade-rewards.md). Swap research that replaced a
 *     card (charged_rocks, throwing_knives, ...) becomes an equipped item (011-016); follow-up nodes move
 *     to the per-item research trees, keeping node ids, levels and sources.
 * v4: One Weapons tree. Every per-weapon / weapon-family research tree merges into `weapons`
 *     (node ids, levels and sources kept); the retired family roots are dropped. Mission-result
 *     `researchRewards` rows are re-pointed too.
 */
final class CharacterMigrations
{
    public const CURRENT_VERSION = 4;

    /**
     * Frozen (v3): swap research node => [old tree, upgrade item, base item it replaces]. Within a base item
     * the first owned entry wins, so the shield line lists the highest tier first. Item ids mirror
     * app/js/games/minion_battles/character_defs/items.
     */
    public const SWAP_NODE_ITEMS = [
        'charged_rocks' => ['crystal_rocks', '011', '001'],
        'throwing_knives' => ['crystal_rocks', '012', '001'],
        'craft_sword' => ['stick_sword', '013', '002'],
        'pipe_bat' => ['stick_sword', '014', '002'],
        'throwing_crystal_shield' => ['tech_shield', '016', '003'],
        'crystal_embedded_shield' => ['tech_shield', '015', '003'],
    ];

    /**
     * Frozen (v3): follow-up nodes that keep their node id but change tree: node id => [old tree, new tree].
     * New tree ids mirror app/js/researchTrees/trees/weaponTreeIds.ts.
     */
    public const MOVED_NODES = [
        'more_power' => ['crystal_rocks', 'charged_rocks_item'],
        'piercing_knives' => ['crystal_rocks', 'knives_item'],
        'more_rock' => ['crystal_rocks', 'thrown_weapons'],
        'sword_jagged_edge' => ['stick_sword', 'sword_item'],
        'pipe_bat_damage' => ['stick_sword', 'mace_item'],
        'sword_extra_uses' => ['stick_sword', 'melee_weapons'],
        'extra_shields' => ['tech_shield', 'crystal_shield_item'],
    ];

    /** Frozen (v4): the single tree every weapon node lives in. Mirrors WEAPONS_TREE_ID in weaponTreeIds.ts. */
    public const WEAPONS_TREE_ID = 'weapons';

    /** Frozen (v4): research trees merged into the Weapons tree. */
    public const LEGACY_WEAPON_TREE_IDS = [
        'crystal_rocks', 'stick_sword', 'tech_shield',
        'charged_rocks_item', 'knives_item', 'sword_item', 'mace_item', 'crystal_shield_item', 'charged_shield_item',
        'thrown_weapons', 'melee_weapons',
    ];

    /** Frozen (v4): virtual roots of the retired family trees (no node in the Weapons tree). */
    public const RETIRED_WEAPON_NODE_IDS = ['thrown_weapons_root', 'melee_weapons_root'];

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
        return [
            0 => [self::class, 'v0ToV1'],
            1 => [self::class, 'v1ToV2'],
            2 => [self::class, 'v2ToV3'],
            3 => [self::class, 'v3ToV4'],
        ];
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

    /**
     * Convert a legacy `exhaustion` (positive = lost) resourceDelta/resources map to signed `hunger`.
     * Drops the key when the result is 0. Leaves maps without `exhaustion` untouched.
     *
     * @param mixed $map
     * @return mixed
     */
    public static function exhaustionToHunger(mixed $map): mixed
    {
        if (!is_array($map) || !array_key_exists('exhaustion', $map)) {
            return $map;
        }
        $n = is_numeric($map['exhaustion']) ? (int) $map['exhaustion'] : 0;
        unset($map['exhaustion']);
        if ($n !== 0 && !isset($map['hunger'])) {
            $map['hunger'] = -$n;
        }
        return $map;
    }

    /**
     * Apply exhaustionToHunger to the `resourceDelta` of every entry in a list of result rows.
     *
     * @param mixed $rows
     * @return mixed
     */
    public static function convertResultRows(mixed $rows): mixed
    {
        if (!is_array($rows)) {
            return $rows;
        }
        foreach ($rows as $k => $row) {
            if (is_array($row) && array_key_exists('resourceDelta', $row)) {
                $rows[$k]['resourceDelta'] = self::exhaustionToHunger($row['resourceDelta']);
            }
        }
        return $rows;
    }

    public static function v1ToV2(array $data): array
    {
        // missionResults[campaignId] = list of rows; questResults[campaignId][questId] = row.
        foreach (is_array($data['missionResults'] ?? null) ? $data['missionResults'] : [] as $cid => $rows) {
            $data['missionResults'][$cid] = self::convertResultRows($rows);
        }
        foreach (is_array($data['questResults'] ?? null) ? $data['questResults'] : [] as $cid => $quests) {
            if (!is_array($quests)) {
                continue;
            }
            foreach ($quests as $qid => $quest) {
                if (is_array($quest) && array_key_exists('resourceDelta', $quest)) {
                    $data['questResults'][$cid][$qid]['resourceDelta'] = self::exhaustionToHunger($quest['resourceDelta']);
                } elseif (is_array($quest) && array_is_list($quest)) {
                    $data['questResults'][$cid][$qid] = self::convertResultRows($quest);
                }
            }
        }
        return $data;
    }

    /**
     * Convert one character-shaped array (the character itself or its quest snapshot): swap research ->
     * equipped item, then move follow-up nodes to their new trees. Idempotent.
     *
     * @param array<string, mixed> $c
     * @return array<string, mixed>
     */
    public static function convertSwapResearch(array $c): array
    {
        $trees = is_array($c['researchTrees'] ?? null) ? $c['researchTrees'] : [];
        $levels = is_array($c['researchNodeLevels'] ?? null) ? $c['researchNodeLevels'] : [];
        $sources = is_array($c['researchSources'] ?? null) ? $c['researchSources'] : [];
        $equipment = is_array($c['equipment'] ?? null) ? array_values($c['equipment']) : null;

        // 1) Swap nodes -> items (first owned entry per base item wins), then drop the nodes.
        $chosen = [];
        foreach (self::SWAP_NODE_ITEMS as $nodeId => [$treeId, $item, $base]) {
            $owned = is_array($trees[$treeId] ?? null) && in_array($nodeId, $trees[$treeId], true);
            if ($owned && !isset($chosen[$base])) {
                $chosen[$base] = $item;
            }
        }
        foreach (self::SWAP_NODE_ITEMS as $nodeId => [$treeId]) {
            if (is_array($trees[$treeId] ?? null)) {
                $trees[$treeId] = array_values(array_diff($trees[$treeId], [$nodeId]));
            }
            unset($levels[$treeId][$nodeId], $sources[$treeId][$nodeId]);
        }
        if ($equipment !== null || $chosen !== []) {
            $equipment = $equipment ?? [];
            foreach ($chosen as $base => $item) {
                if (in_array($item, $equipment, true)) {
                    continue;
                }
                $at = array_search($base, $equipment, true);
                if ($at === false) {
                    $equipment[] = $item;
                } else {
                    $equipment[$at] = $item;
                }
            }
            $c['equipment'] = array_values(array_unique($equipment));
        }

        // 2) Follow-up nodes -> new trees, keeping levels and sources.
        foreach (self::MOVED_NODES as $nodeId => [$oldTree, $newTree]) {
            if (is_array($trees[$oldTree] ?? null) && in_array($nodeId, $trees[$oldTree], true)) {
                $trees[$oldTree] = array_values(array_diff($trees[$oldTree], [$nodeId]));
                $trees[$newTree] = array_values(array_unique(array_merge($trees[$newTree] ?? [], [$nodeId])));
            }
            if (isset($levels[$oldTree][$nodeId])) {
                $levels[$newTree][$nodeId] = max((int) ($levels[$newTree][$nodeId] ?? 0), (int) $levels[$oldTree][$nodeId]);
                unset($levels[$oldTree][$nodeId]);
            }
            if (isset($sources[$oldTree][$nodeId])) {
                $merged = array_merge((array) ($sources[$newTree][$nodeId] ?? []), (array) $sources[$oldTree][$nodeId]);
                $sources[$newTree][$nodeId] = array_values(array_unique($merged));
                unset($sources[$oldTree][$nodeId]);
            }
        }
        foreach ($levels as $treeId => $nodes) {
            if (!is_array($nodes) || $nodes === []) {
                unset($levels[$treeId]);
            }
        }
        foreach ($sources as $treeId => $nodes) {
            if (!is_array($nodes) || $nodes === []) {
                unset($sources[$treeId]);
            }
        }

        if (array_key_exists('researchTrees', $c) || $trees !== []) {
            $c['researchTrees'] = $trees;
        }
        if (array_key_exists('researchNodeLevels', $c) || $levels !== []) {
            $c['researchNodeLevels'] = $levels;
        }
        if (array_key_exists('researchSources', $c) || $sources !== []) {
            $c['researchSources'] = $sources;
        }
        return $c;
    }

    public static function v2ToV3(array $data): array
    {
        $data = self::convertSwapResearch($data);
        if (isset($data['activeQuestRun']['questCharacter']) && is_array($data['activeQuestRun']['questCharacter'])) {
            $data['activeQuestRun']['questCharacter'] = self::convertSwapResearch($data['activeQuestRun']['questCharacter']);
        }
        return $data;
    }

    /**
     * Merge every legacy weapon tree of one character-shaped array into the Weapons tree, keeping
     * node ids, levels (max wins) and sources (union). Idempotent.
     *
     * @param array<string, mixed> $c
     * @return array<string, mixed>
     */
    public static function mergeWeaponTrees(array $c): array
    {
        $to = self::WEAPONS_TREE_ID;
        $drop = self::RETIRED_WEAPON_NODE_IDS;
        if (is_array($c['researchTrees'] ?? null)) {
            $trees = $c['researchTrees'];
            $merged = is_array($trees[$to] ?? null) ? $trees[$to] : [];
            foreach (self::LEGACY_WEAPON_TREE_IDS as $from) {
                if (array_key_exists($from, $trees)) {
                    $merged = array_merge($merged, is_array($trees[$from]) ? $trees[$from] : []);
                    unset($trees[$from]);
                }
            }
            $merged = array_values(array_unique(array_diff($merged, $drop)));
            if ($merged !== [] || array_key_exists($to, $trees)) {
                $trees[$to] = $merged;
            }
            $c['researchTrees'] = $trees;
        }
        foreach (['researchNodeLevels', 'researchSources'] as $key) {
            if (!is_array($c[$key] ?? null)) {
                continue;
            }
            $byTree = $c[$key];
            $merged = is_array($byTree[$to] ?? null) ? $byTree[$to] : [];
            foreach (self::LEGACY_WEAPON_TREE_IDS as $from) {
                foreach (is_array($byTree[$from] ?? null) ? $byTree[$from] : [] as $nodeId => $value) {
                    $merged[$nodeId] = $key === 'researchNodeLevels'
                        ? max((int) ($merged[$nodeId] ?? 0), (int) $value)
                        : array_values(array_unique(array_merge((array) ($merged[$nodeId] ?? []), (array) $value)));
                }
                unset($byTree[$from]);
            }
            foreach ($drop as $nodeId) {
                unset($merged[$nodeId]);
            }
            if ($merged !== []) {
                $byTree[$to] = $merged;
            }
            $c[$key] = $byTree;
        }
        return $c;
    }

    /**
     * Re-point `researchRewards: [{treeId, nodeId}]` rows anywhere inside $value from legacy weapon
     * trees to the Weapons tree.
     */
    public static function remapResearchRewardTrees(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        foreach ($value as $k => $v) {
            if ($k === 'researchRewards' && is_array($v)) {
                foreach ($v as $i => $row) {
                    if (is_array($row) && in_array($row['treeId'] ?? null, self::LEGACY_WEAPON_TREE_IDS, true)) {
                        $value[$k][$i]['treeId'] = self::WEAPONS_TREE_ID;
                    }
                }
            } elseif (is_array($v)) {
                $value[$k] = self::remapResearchRewardTrees($v);
            }
        }
        return $value;
    }

    public static function v3ToV4(array $data): array
    {
        $data = self::mergeWeaponTrees($data);
        if (isset($data['activeQuestRun']['questCharacter']) && is_array($data['activeQuestRun']['questCharacter'])) {
            $data['activeQuestRun']['questCharacter'] = self::mergeWeaponTrees($data['activeQuestRun']['questCharacter']);
        }
        foreach (['missionResults', 'questResults'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = self::remapResearchRewardTrees($data[$key]);
            }
        }
        return $data;
    }
}
