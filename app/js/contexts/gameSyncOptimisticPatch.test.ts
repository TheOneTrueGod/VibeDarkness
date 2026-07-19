import { describe, it, expect } from 'vitest';
import type { GameStatePayload } from '../types';
import {
    isUnifiedSlotLayoutPhase,
    mergeOptimisticGameIntoPayload,
} from './gameSyncOptimisticPatch';

function basePayload(gamePhase: string): GameStatePayload {
    return {
        lobbyState: 'in_game',
        gameId: 'g1',
        gameType: 'minion_battles',
        game: {
            gamePhase,
            selectedMissionId: 'm1',
            characterSelections: { '1': 'warrior' },
        },
        players: {},
        clicks: {},
        chatHistory: [],
    };
}

describe('gameSyncOptimisticPatch', () => {
    it('isUnifiedSlotLayoutPhase matches GameScreen unified gate', () => {
        expect(isUnifiedSlotLayoutPhase('character_select')).toBe(false);
        expect(isUnifiedSlotLayoutPhase('pre_mission_story')).toBe(true);
        expect(isUnifiedSlotLayoutPhase('post_mission_story')).toBe(true);
        expect(isUnifiedSlotLayoutPhase('battle')).toBe(true);
        expect(isUnifiedSlotLayoutPhase(null)).toBe(false);
    });

    it('mergeOptimisticGameIntoPayload returns null when sync has not loaded', () => {
        expect(mergeOptimisticGameIntoPayload(null, { gamePhase: 'pre_mission_story' })).toBeNull();
    });

    it('mergeOptimisticGameIntoPayload flips phase while keeping other game fields', () => {
        const prev = basePayload('character_select');
        const next = mergeOptimisticGameIntoPayload(prev, {
            gamePhase: 'pre_mission_story',
            storyReadyPlayerIds: [],
            characterSelectReadyPlayerIds: [],
        });
        expect(next).not.toBeNull();
        expect(next!.game).toMatchObject({
            gamePhase: 'pre_mission_story',
            selectedMissionId: 'm1',
            characterSelections: { '1': 'warrior' },
            storyReadyPlayerIds: [],
            characterSelectReadyPlayerIds: [],
        });
        expect(next!.gameId).toBe('g1');
        expect(next!.lobbyState).toBe('in_game');
    });
});
