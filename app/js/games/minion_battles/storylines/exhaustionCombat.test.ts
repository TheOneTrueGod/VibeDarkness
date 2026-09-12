import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import { DEFAULT_CHARACTER_ENDURANCE } from '../character_defs/characterEndurance';
import {
    EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION,
    computeExhaustionReservedHp,
} from '../character_defs/exhaustionHealth';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/001_dark_awakening';

describe('fight-start exhaustion', () => {
    it('starts the player at full pool when exhaustion is 0', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            playerExhaustionByPlayer: { p1: 0 },
        });
        const player = engine.units.find((u) => u.characterId === PLAYER_CHARACTER_ID);
        expect(player).toBeDefined();
        expect(player!.hpExhaustion).toBe(0);
        expect(player!.hp).toBe(player!.maxHp);
        engine.destroy();
    });

    it('reserves 70% of the pool at 100% exhaustion and starts current HP at the remainder', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            playerExhaustionByPlayer: { p1: DEFAULT_CHARACTER_ENDURANCE },
        });
        const player = engine.units.find((u) => u.characterId === PLAYER_CHARACTER_ID);
        expect(player).toBeDefined();
        const reserved = computeExhaustionReservedHp(
            player!.maxHp,
            DEFAULT_CHARACTER_ENDURANCE,
            DEFAULT_CHARACTER_ENDURANCE,
        );
        expect(player!.hpExhaustion).toBeCloseTo(reserved);
        expect(player!.hp).toBeCloseTo(player!.maxHp * EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION);
        expect(player!.getEffectiveMaxHp()).toBeCloseTo(
            player!.maxHp * EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION,
        );
        engine.destroy();
    });
});
