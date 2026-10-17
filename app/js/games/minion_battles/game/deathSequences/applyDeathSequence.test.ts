import { describe, it, expect } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../units/index';
import { UnitTag } from '../units/unitTag';
import { SpriteFountainEmitter } from '../effects/SpriteFountainEmitter';
import { DISPLACER_SPIRIT_DEATH_SEQUENCE } from './deathSequencePresets';

const P = TINY_BATTLE_PLAYER_ID;

function buildWithSpirit() {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P });
    spawnTinyPlayerUnit(engine, { playerId: P, x: 60, y: 60, abilities: [] });
    const spirit = createUnitFromSpawnConfig(
        {
            id: 'spirit',
            characterId: 'displacer_spirit',
            name: 'Spirit',
            x: 200,
            y: 200,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            unitTags: [UnitTag.Boss],
        },
        engine.eventBus,
        engine,
    );
    engine.addUnit(spirit, 'initialGameSpawn');
    return { engine, spirit };
}

describe('Displacer Spirit death sequence', () => {
    it('pauses gameplay, leaves a fading remnant and starts the clone fountain', () => {
        const { engine, spirit } = buildWithSpirit();
        spirit.takeDamage(spirit.hp + 10, null, engine.eventBus);

        expect(engine.storyPauseActive).toBe(true);
        expect(engine.storyPauseReason).toBe('displacer_spirit_death');
        const remnant = engine.effects.find((e) => e.effectType === 'DeathRemnant');
        expect(remnant?.effectData).toMatchObject({ dissolve: 'fade', remnantCharacterKey: 'displacer_spirit' });
        // Replaces the default dark-creature icon flash.
        expect(engine.effects.some((e) => e.effectType === 'DarkCreatureIconDeath')).toBe(false);
        expect(engine.state.effectEmitterManager.emitters.some((e) => e instanceof SpriteFountainEmitter)).toBe(true);
    });

    it('resumes gameplay once the pause covering the animation ends', () => {
        const { engine, spirit } = buildWithSpirit();
        spirit.takeDamage(spirit.hp + 10, null, engine.eventBus);
        const endsAt = engine.storyPauseEndsAt!;
        expect(endsAt - engine.gameTime).toBeCloseTo(DISPLACER_SPIRIT_DEATH_SEQUENCE.pauseSeconds);
        for (let i = 0; i < 600 && engine.storyPauseActive; i++) engine.stepSimulationFixedTicks(1);
        expect(engine.storyPauseActive).toBe(false);
        expect(engine.gameTime).toBeGreaterThanOrEqual(endsAt);
    });
});

describe('SpriteFountainEmitter', () => {
    it('launches horizontally, then damps sideways speed while rising (flame shape)', () => {
        const { engine } = buildWithSpirit();
        const fountain = DISPLACER_SPIRIT_DEATH_SEQUENCE.emitters!.find((e) => e.type === 'spriteFountain')!;
        if (fountain.type !== 'spriteFountain') throw new Error('expected fountain');
        const emitter = new SpriteFountainEmitter({ x: 0, y: 0, config: fountain.config });
        const particles = emitter.update(1, engine);
        expect(particles.length).toBe(fountain.config.ratePerSecond);

        for (const p of particles) {
            const d = p.effectData as { vx: number; vy: number };
            expect(Math.abs(d.vy)).toBeLessThanOrEqual(25);
            const vx0 = d.vx;
            const y0 = p.y;
            for (let i = 0; i < 30; i++) p.renderUpdate(1 / 60);
            expect(Math.abs(d.vx)).toBeLessThan(Math.abs(vx0) + 1e-9);
            expect(d.vy).toBeLessThan(-50);
            expect(p.y).toBeLessThan(y0);
        }
    });
});
