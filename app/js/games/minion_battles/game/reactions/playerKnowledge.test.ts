import { describe, expect, it } from 'vitest';
import battleKnowledgePhp from '../../../../../../backend/BattleKnowledge.php?raw';
import { BATTLE_ENGINE_KNOWLEDGE_KEYS, KNOWLEDGE_REACTIONS } from '../../../../accountKnowledge';
import { GameEngine } from '../GameEngine';
import { serializeEngine } from '../engineSerialization';
import { MISSION_MAP } from '../../storylines';
import {
    playerHasBattleKnowledge,
    playerKnowsReactions,
    resolvePlayerKnowledgeKeysByPlayer,
} from './playerKnowledge';

describe('resolvePlayerKnowledgeKeysByPlayer (battle bootstrap)', () => {
    it('without the key nobody knows Reactions', () => {
        const map = resolvePlayerKnowledgeKeysByPlayer({ playerIds: ['p1', 'p2'] });
        expect(map).toEqual({});
        expect(playerKnowsReactions({ playerKnowledgeKeysByPlayer: map }, 'p1')).toBe(false);
    });

    it('with the account key only that player knows Reactions', () => {
        const map = resolvePlayerKnowledgeKeysByPlayer({
            playerIds: ['p1', 'p2'],
            accountKeysByPlayer: { p1: [KNOWLEDGE_REACTIONS], p2: [] },
        });
        const source = { playerKnowledgeKeysByPlayer: map };
        expect(playerKnowsReactions(source, 'p1')).toBe(true);
        expect(playerKnowsReactions(source, 'p2')).toBe(false);
        expect(playerKnowsReactions(source, null)).toBe(false);
        expect(playerKnowsReactions(source, 'enemy')).toBe(false);
    });

    it('a mission start grant sets the flag on every player', () => {
        const map = resolvePlayerKnowledgeKeysByPlayer({
            playerIds: ['p1', 'p2', 'p3'],
            accountKeysByPlayer: { p1: [KNOWLEDGE_REACTIONS] },
            missionStartKeys: [KNOWLEDGE_REACTIONS],
        });
        const source = { playerKnowledgeKeysByPlayer: map };
        for (const id of ['p1', 'p2', 'p3']) expect(playerHasBattleKnowledge(source, id, KNOWLEDGE_REACTIONS)).toBe(true);
        expect(map.p1).toEqual([KNOWLEDGE_REACTIONS]);
    });

    it('drops keys the engine does not read and ignores players not in the battle', () => {
        const map = resolvePlayerKnowledgeKeysByPlayer({
            playerIds: ['p1'],
            accountKeysByPlayer: { p1: ['Research'], ghost: [KNOWLEDGE_REACTIONS] },
            missionStartKeys: ['CompletedChapter1'],
        });
        expect(map).toEqual({});
    });
});

describe('engine state', () => {
    it('serializes the per-player keys into the checkpoint', () => {
        const engine = new GameEngine();
        engine.playerKnowledgeKeysByPlayer = { p1: [KNOWLEDGE_REACTIONS] };
        const json = serializeEngine(engine);
        expect(json.playerKnowledgeKeysByPlayer).toEqual({ p1: [KNOWLEDGE_REACTIONS] });
    });

    it('omits the field when nobody has keys', () => {
        expect(serializeEngine(new GameEngine()).playerKnowledgeKeysByPlayer).toBeUndefined();
    });
});

describe('server sync', () => {
    it('BattleKnowledge.php lists the same engine keys', () => {
        const match = /ENGINE_KEYS\s*=\s*\[([^\]]*)\]/.exec(battleKnowledgePhp);
        const keys = [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect([...keys].sort()).toEqual([...BATTLE_ENGINE_KNOWLEDGE_KEYS].sort());
    });

    it('missions without startRewards grant nothing', () => {
        expect(MISSION_MAP.dark_awakening?.startRewards).toBeUndefined();
    });
});
