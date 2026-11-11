<?php

namespace App;

/**
 * Knowledge keys a player may record on their own account: tutorial progress, stored under
 * `knowledge[key].tutorials[tutorialId] = { step, done }`. Every other knowledge key comes only from
 * mission rewards or an admin.
 *
 * Keep in sync with `PLAYER_RECORDABLE_KNOWLEDGE_KEYS` in `app/js/accountKnowledge.ts` (checked by
 * `app/js/tutorialKnowledgeSync.test.ts`).
 */
final class TutorialKnowledge
{
    /** @var list<string> */
    public const KEYS = [
        'TutorialBattleBasics',
        'TutorialLight',
        'TutorialStackedUnits',
        'TutorialCrystals',
    ];

    public static function isRecordable(string $key): bool
    {
        return in_array($key, self::KEYS, true);
    }
}
