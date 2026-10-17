import { describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Unit } from '../units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../units/unit_defs/unitConstants';
import type { TeamId } from '../teams';
import { TERRAIN_EFFECT_DEFS, type ThornsDef } from './terrainEffectDefs';
import { triggerThorns, unitIsHurtByThorns } from './thorns';

function unit(characterId: string): Unit {
    return new Unit({
        id: 'u',
        x: 0,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'ai',
        characterId,
        name: 'u',
        radius: DEFAULT_UNIT_RADIUS,
    });
}

const base = { enterDamage: 1, landDamage: 2, consumeOnTrigger: false };
const engine = () => ({ terrainLayers: new TerrainLayerManager(), eventBus: new EventBus() });

describe('unitIsHurtByThorns', () => {
    it('honours only / except filters', () => {
        const only: ThornsDef = { ...base, hurts: { only: ['dark_creature'] } };
        const except: ThornsDef = { ...base, hurts: { except: ['dark_creature'] } };
        expect(unitIsHurtByThorns(only, unit('dark_wolf'))).toBe(true);
        expect(unitIsHurtByThorns(only, unit('player'))).toBe(false);
        expect(unitIsHurtByThorns(except, unit('dark_wolf'))).toBe(false);
        expect(unitIsHurtByThorns(except, unit('player'))).toBe(true);
    });
});

describe('triggerThorns', () => {
    it('returns false for effect types without a thorns def', () => {
        expect(triggerThorns({ id: 'x', effectType: 'not_thorns' }, unit('player'), 'enter', engine())).toBe(false);
    });

    it('does not damage dead units', () => {
        const u = unit('player');
        u.hp = 0;
        expect(triggerThorns({ id: 'x', effectType: 'dark_thorn' }, u, 'enter', engine())).toBe(false);
    });

    it('registers thorns defs for both shipped types', () => {
        expect(TERRAIN_EFFECT_DEFS.bramble_slow!.thorns).toBeDefined();
        expect(TERRAIN_EFFECT_DEFS.dark_thorn!.thorns).toBeDefined();
    });
});
