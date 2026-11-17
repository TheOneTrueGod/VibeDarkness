<?php

namespace App;

/**
 * Account knowledge keys the battle engine reads per player (copied into the lobby game state as
 * `playerKnowledgeKeysByPlayer`), and the subset a client may grant itself at battle start
 * (a mission's `startRewards.knowledgeKeys`).
 *
 * Keep ENGINE_KEYS in sync with `BATTLE_ENGINE_KNOWLEDGE_KEYS` in `app/js/accountKnowledge.ts`
 * (checked by `app/js/battleKnowledgeSync.test.ts`).
 */
final class BattleKnowledge
{
    /** @var list<string> */
    public const ENGINE_KEYS = ['Reactions'];

    /** @var list<string> Keys a signed-in player may grant their own account when a battle starts. */
    public const START_GRANTABLE_KEYS = ['Reactions'];

    public static function isStartGrantable(string $key): bool
    {
        return in_array($key, self::START_GRANTABLE_KEYS, true);
    }

    /**
     * Engine-relevant keys present in an account's knowledge map.
     *
     * @param array<string, mixed> $knowledge
     * @return list<string>
     */
    public static function engineKeysFrom(array $knowledge): array
    {
        $keys = [];
        foreach (self::ENGINE_KEYS as $key) {
            if (!empty($knowledge[$key])) {
                $keys[] = $key;
            }
        }
        return $keys;
    }
}
