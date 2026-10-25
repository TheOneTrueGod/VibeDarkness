<?php

namespace App\SaveData;

/**
 * Frozen helpers for the food -> vigor / crystals -> attunement resource rename (save version 5 of
 * characters and campaigns, deploy migration M0005, lazy rename on account load).
 *
 * When a map holds both the old and the new key (it shouldn't) the values are summed.
 */
final class ResourceRenames
{
    /** Frozen: resource key renames. */
    public const RESOURCE_KEYS = ['food' => 'vigor', 'crystals' => 'attunement'];

    /** Frozen: account / character knowledge key renames. */
    public const KNOWLEDGE_KEYS = ['Crystals' => 'ResourceAttunement'];

    /**
     * Rename the resource keys of one resources / resourceDelta map. Non-arrays pass through.
     *
     * @return mixed
     */
    public static function renameResourceMap(mixed $map): mixed
    {
        if (!is_array($map)) {
            return $map;
        }
        foreach (self::RESOURCE_KEYS as $old => $new) {
            if (!array_key_exists($old, $map)) {
                continue;
            }
            $value = $map[$old];
            unset($map[$old]);
            if (array_key_exists($new, $map) && is_numeric($map[$new]) && is_numeric($value)) {
                $map[$new] = (int) $map[$new] + (int) $value;
            } elseif (!array_key_exists($new, $map)) {
                $map[$new] = $value;
            }
        }
        return $map;
    }

    /**
     * Rename every `resourceDelta` map anywhere inside $value (mission results, quest results,
     * nested victory rewards, queued rewards ...) and every `grantKnowledgeKeys` list entry.
     *
     * @return mixed
     */
    public static function renameDeep(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        foreach ($value as $k => $v) {
            if ($k === 'resourceDelta') {
                $value[$k] = self::renameResourceMap($v);
            } elseif ($k === 'grantKnowledgeKeys' && is_array($v)) {
                $value[$k] = array_values(array_unique(array_map(
                    static fn ($key) => is_string($key) ? (self::KNOWLEDGE_KEYS[$key] ?? $key) : $key,
                    $v
                ), SORT_REGULAR));
            } elseif (is_array($v)) {
                $value[$k] = self::renameDeep($v);
            }
        }
        return $value;
    }

    /**
     * Rename knowledge keys in a knowledge map, keeping the details value. If both keys exist the
     * details are merged (the new key's details win on conflict).
     *
     * @return mixed
     */
    public static function renameKnowledgeMap(mixed $map): mixed
    {
        if (!is_array($map)) {
            return $map;
        }
        foreach (self::KNOWLEDGE_KEYS as $old => $new) {
            if (!array_key_exists($old, $map)) {
                continue;
            }
            $details = $map[$old];
            unset($map[$old]);
            if (array_key_exists($new, $map) && is_array($map[$new]) && is_array($details)) {
                $map[$new] = array_merge($details, $map[$new]);
            } elseif (!array_key_exists($new, $map)) {
                $map[$new] = $details;
            }
        }
        return $map;
    }

    /** Apply the knowledge rename to a whole account-shaped array. */
    public static function renameAccountData(array $data): array
    {
        if (array_key_exists('knowledge', $data)) {
            $data['knowledge'] = self::renameKnowledgeMap($data['knowledge']);
        }
        return $data;
    }
}
