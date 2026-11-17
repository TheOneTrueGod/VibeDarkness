/**
 * Per-player account knowledge inside a battle.
 *
 * Account knowledge lives on the account, but the engine must agree across clients, so the keys the
 * engine reads (`BATTLE_ENGINE_KNOWLEDGE_KEYS`) are resolved once at battle load into
 * `GameState.playerKnowledgeKeysByPlayer` (serialized in checkpoints). Gameplay code reads that map only
 * through the queries here, never from the account.
 */
import { BATTLE_ENGINE_KNOWLEDGE_KEYS, KNOWLEDGE_REACTIONS } from '../../../../accountKnowledge';

/** The slice of engine state the knowledge queries need (structural, so tests need no full engine). */
export interface PlayerKnowledgeSource {
    readonly playerKnowledgeKeysByPlayer: Readonly<Record<string, readonly string[]>>;
}

/** Whether `playerId` brought knowledge `key` into this battle. */
export function playerHasBattleKnowledge(source: PlayerKnowledgeSource, playerId: string, key: string): boolean {
    return source.playerKnowledgeKeysByPlayer[playerId]?.includes(key) ?? false;
}

/**
 * Does this player know Reactions in this battle? THE gate for Reflex (Step 9), reaction frames (Step 10)
 * and claims (Step 14). `ownerId` is the unit's `ownerId` (the player id); enemies and unowned units
 * never know it.
 */
export function playerKnowsReactions(source: PlayerKnowledgeSource, ownerId: string | null | undefined): boolean {
    if (!ownerId) return false;
    return playerHasBattleKnowledge(source, ownerId, KNOWLEDGE_REACTIONS);
}

export interface ResolvePlayerKnowledgeInput {
    /** Player ids that have a unit in the battle. */
    playerIds: readonly string[];
    /** Per-player keys from the server (account knowledge, already limited to engine keys); may be absent. */
    accountKeysByPlayer?: Readonly<Record<string, readonly string[]>> | null;
    /** The mission's `startRewards.knowledgeKeys`: granted to every player in the battle. */
    missionStartKeys?: readonly string[] | null;
}

/**
 * Build `playerKnowledgeKeysByPlayer`: account keys plus the mission's start grants, restricted to keys
 * the engine reads, deduplicated and sorted (so every client builds identical state). Players with no
 * keys are omitted.
 */
export function resolvePlayerKnowledgeKeysByPlayer({
    playerIds,
    accountKeysByPlayer,
    missionStartKeys,
}: ResolvePlayerKnowledgeInput): Record<string, string[]> {
    const relevant = new Set(BATTLE_ENGINE_KNOWLEDGE_KEYS);
    const out: Record<string, string[]> = {};
    for (const playerId of playerIds) {
        const keys = new Set<string>();
        for (const key of accountKeysByPlayer?.[playerId] ?? []) if (relevant.has(key)) keys.add(key);
        for (const key of missionStartKeys ?? []) if (relevant.has(key)) keys.add(key);
        if (keys.size > 0) out[playerId] = [...keys].sort();
    }
    return out;
}
