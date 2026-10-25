import { describe, expect, it } from 'vitest';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { ThornStompAbility } from './0016Ability';
import { getEffectiveCastBehaviours, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { CastBehaviourTickContext } from '../../abilities/castBehaviourTypes';
import { ThornbinderBrambleAbility, THORNBINDER_ABILITY_ID } from '../0008_ThornbinderBramble/0008Ability';

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

/** Runs the strike window's one-shot behaviours in order, as the tick loop does on window entry. */
function fireStomp(engine: ReturnType<typeof makeEngine>, caster: Unit) {
    const strike = (ThornStompAbility.abilityTimings as AbilityTimingInterval[]).find((t) => t.id === 'strike')!;
    for (const entry of getEffectiveCastBehaviours(strike)!) {
        const ctx: CastBehaviourTickContext = {
            caster,
            abilityId: ThornStompAbility.id,
            target: { type: 'pixel', position: { x: caster.x, y: caster.y } },
            allTargets: [],
            castPayload: undefined,
            behaviourPayload: undefined,
            setBehaviourPayload: () => {},
            engine: engine as unknown as AbilityEngineContext,
            windowProgress: 0,
            prevWindowProgress: 0,
            isFirstTick: true,
            isLastTick: true,
        };
        entry.behaviour.onTick?.(ctx);
    }
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

describe('ThornStompAbility ground-thorn ownership', () => {
    it('does not remove its own previously-placed patch when it casts again', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);

        fireStomp(engine, caster);
        const firstCastEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(firstCastEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireStomp(engine, caster);

        for (const effect of firstCastEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });

    it('does not remove a patch placed by Thornbinder Bramble on the same unit', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);

        fireBramble(engine, caster, caster.x, caster.y);
        const brambleEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(brambleEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireStomp(engine, caster);

        for (const effect of brambleEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });
});
