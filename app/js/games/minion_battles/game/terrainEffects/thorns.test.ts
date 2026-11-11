import { describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Unit } from '../units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../units/unit_defs/unitConstants';
import type { TeamId } from '../teams';
import { getThornWearStage, TERRAIN_EFFECT_DEFS, type ThornsDef } from './terrainEffectDefs';
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

const base = { enterDamage: 1, landDamage: 2 };
const engine = () => ({ gameTime: 0, terrainLayers: new TerrainLayerManager(), eventBus: new EventBus() });

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

describe('thorn uses', () => {
    function placeThorn(layers: TerrainLayerManager, effectType: string, params: Record<string, unknown> = {}) {
        layers.add({
            id: 't',
            layer: 'ground',
            effectType,
            placedAtGameTime: 0,
            area: { type: 'cell', col: 0, row: 0 },
            params,
        });
        return () => layers.allEffects.get('t');
    }

    it('dark thorns and lanternite thorns break on their first prick', () => {
        for (const [type, victim] of [['dark_thorn', 'player'], ['bramble_slow', 'dark_wolf']] as const) {
            const eng = engine();
            const current = placeThorn(eng.terrainLayers, type);
            expect(triggerThorns(current()!, unit(victim), 'enter', eng)).toBe(true);
            expect(current()).toBeUndefined();
        }
    });

    it('a placement with thornUses 5 survives four pricks and breaks on the fifth, wearing as it goes', () => {
        const eng = engine();
        const shared = { slowMult: 0.5, thornUses: 5 };
        const current = placeThorn(eng.terrainLayers, 'bramble_slow', shared);
        const stages: number[] = [];
        for (let i = 0; i < 4; i++) {
            expect(triggerThorns(current()!, unit('dark_wolf'), 'enter', eng)).toBe(true);
            stages.push(getThornWearStage(current()!, 4));
        }
        expect(stages).toEqual([1, 2, 3, 4]);
        expect(shared).toEqual({ slowMult: 0.5, thornUses: 5 }); // other cells sharing the params are untouched
        triggerThorns(current()!, unit('dark_wolf'), 'enter', eng);
        expect(current()).toBeUndefined();
    });

    it('units the thorns ignore do not wear them', () => {
        const eng = engine();
        const current = placeThorn(eng.terrainLayers, 'bramble_slow', { thornUses: 5 });
        expect(triggerThorns(current()!, unit('player'), 'enter', eng)).toBe(false);
        expect(getThornWearStage(current()!, 4)).toBe(0);
    });
});
