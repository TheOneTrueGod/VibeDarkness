import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import { DEFAULT_CHARACTER_MAX_HUNGER } from '../character_defs/characterHunger';
import { DARK_AWAKENING } from './WorldOfDarkness/missions/001_dark_awakening';

/** Spawn the Dark Awakening player with a given signed hunger delta and return the unit. */
function spawnPlayerWithHungerDelta(hungerDelta: number) {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
    DARK_AWAKENING.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        playerHungerDeltaByPlayer: { p1: hungerDelta },
    });
    const player = engine.units.find((u) => u.characterId === PLAYER_CHARACTER_ID);
    expect(player).toBeDefined();
    return { engine, player: player! };
}

describe('fight-start hunger', () => {
    it('starts a well-fed player at full max health', () => {
        const { engine, player } = spawnPlayerWithHungerDelta(0);
        expect(player.hungerPenalty).toBe(0);
        expect(player.hp).toBe(player.maxHp);
        engine.destroy();
    });

    it('does not penalise a player at exactly 15% hunger', () => {
        const { engine, player } = spawnPlayerWithHungerDelta(-(DEFAULT_CHARACTER_MAX_HUNGER * 0.85));
        expect(player.hungerPenalty).toBe(0);
        engine.destroy();
    });

    it('lowers max health by 25% below 15% hunger', () => {
        const baseline = spawnPlayerWithHungerDelta(0);
        const baseMax = baseline.player.maxHp;
        baseline.engine.destroy();

        const { engine, player } = spawnPlayerWithHungerDelta(-(DEFAULT_CHARACTER_MAX_HUNGER - 10));
        expect(player.hungerPenalty).toBe(0.25);
        expect(player.maxHp).toBe(Math.max(1, Math.round(baseMax * 0.75)));
        expect(player.hp).toBe(player.maxHp);
        engine.destroy();
    });

    it('lowers max health by 50% at 0 hunger, even when the delta overshoots', () => {
        const baseline = spawnPlayerWithHungerDelta(0);
        const baseMax = baseline.player.maxHp;
        baseline.engine.destroy();

        const { engine, player } = spawnPlayerWithHungerDelta(-(DEFAULT_CHARACTER_MAX_HUNGER + 40));
        expect(player.hungerPenalty).toBe(0.5);
        expect(player.maxHp).toBe(Math.max(1, Math.round(baseMax * 0.5)));
        expect(player.hp).toBe(player.maxHp);
        expect(player.getEffectiveMaxHp()).toBe(player.maxHp);
        engine.destroy();
    });
});
