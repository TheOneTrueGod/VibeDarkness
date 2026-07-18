import { describe, expect, it } from 'vitest';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { ThornbinderBrambleAbility, THORNBINDER_ABILITY_ID } from './0008Ability';
import { ThornStompAbility } from '../0016_ThornStomp/0016Ability';

function makeCaster(): Unit {
    return new Unit({
        x: 200,
        y: 200,
        hp: 52,
        speed: 42,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'thornbinder',
        name: 'thornbinder',
    });
}

function makeEngine(caster: Unit) {
    return {
        units: [caster],
        gameTime: 0,
        eventBus: new EventBus(),
        terrainLayers: new TerrainLayerManager(),
        lightLevelEnabled: false,
        globalLightLevel: 0,
        terrainManager: null,
        addEffect: () => {},
        getAllLightSources: () => [],
        generateRandomInteger: () => 0,
    };
}

function fireBramble(engine: ReturnType<typeof makeEngine>, caster: Unit, x: number, y: number) {
    const projectile = new Projectile({
        x,
        y,
        velocityX: 0,
        velocityY: 0,
        damage: 0,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: THORNBINDER_ABILITY_ID,
        maxDistance: 0,
    });
    ThornbinderBrambleAbility.onProjectileExpired!(engine, caster, projectile);
}

describe('ThornbinderBrambleAbility ground-thorn ownership', () => {
    it('does not remove its own previously-placed patch when it casts again', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);

        fireBramble(engine, caster, 100, 100);
        const firstCastEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(firstCastEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireBramble(engine, caster, 400, 400);

        for (const effect of firstCastEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });

    it('does not remove a patch placed by Thorn Stomp on the same unit', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);

        ThornStompAbility.doCardEffect!(engine, caster, [], 0, 1);
        const stompEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(stompEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireBramble(engine, caster, 400, 400);

        for (const effect of stompEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });
});
