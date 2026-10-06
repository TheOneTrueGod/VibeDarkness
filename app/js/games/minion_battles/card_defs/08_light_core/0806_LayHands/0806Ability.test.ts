import { describe, expect, it } from 'vitest';
// Registry first: it owns the module-load order for the ability <-> CastBehaviours import cycle.
import { getAbility } from '../../../abilities/AbilityRegistry';
import { LayHandsAbility } from './0806Ability';
import {
    LAY_HANDS_ABILITY_ID,
    LAY_HANDS_EXPLOSION_DAMAGE,
    LAY_HANDS_LUNGE_DISTANCE,
    LAY_HANDS_PUNCH_DAMAGE,
} from './0806Constants';
import { PunchNEWAbility } from '../../0120_PunchNEW/0120Ability';
import { LightSource } from '../../../game/lightSources/LightSource';
import { LightSourceManager } from '../../../game/lightSources/LightSourceManager';
import {
    findNearestReachableLightEmitter,
    findReachableLightEmitters,
    LIGHT_EMITTER_REACH_HALF_EXTENT,
} from '../../../game/lightSources/lightEmitters';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    LIGHT_LAY_HANDS_TIER,
    LIGHT_NODE_CORE,
    LIGHT_NODE_LAY_HANDS,
    LIGHT_TREE_ID,
    lightTree,
} from '../../../../../researchTrees/trees/light';

describe('Lay Hands ability', () => {
    it('is registered under its id, and the typed note id matches', () => {
        expect(LAY_HANDS_ABILITY_ID).toBe('0806');
        expect(getAbility(LAY_HANDS_ABILITY_ID)).toBe(LayHandsAbility);
    });

    it('triples the Punch lunge and keeps Punch damage and reach', () => {
        expect(LayHandsAbility.lunge?.distance).toBe(LAY_HANDS_LUNGE_DISTANCE);
        expect(LayHandsAbility.lunge?.distance).toBe(3 * (PunchNEWAbility.lunge?.distance ?? 0));
        expect(LAY_HANDS_PUNCH_DAMAGE).toBe(8);
        expect(LAY_HANDS_EXPLOSION_DAMAGE).toBe(6);
    });

    it('adds the emitter lock at windup start and the detonation inside the strike window', () => {
        const timings = LayHandsAbility.abilityTimings as Array<{ id: string; castBehaviours?: unknown[] }>;
        expect(timings.find((t) => t.id === 'windup')?.castBehaviours).toHaveLength(1);
        expect(timings.find((t) => t.id === 'strike')?.castBehaviours).toHaveLength(2);
    });

    it('draws extra select-target preview for the locked emitter', () => {
        expect(typeof LayHandsAbility.renderSelectTargetPreviewExtras).toBe('function');
    });
});

describe('Lay Hands research node', () => {
    it('is a tier-14 Light Core follow-up that grants the Lay Hands card', () => {
        const node = lightTree.nodes.find((n) => n.id === LIGHT_NODE_LAY_HANDS);
        expect(node?.title).toBe('Lay Hands');
        expect(node?.tier).toBe(14);
        expect(LIGHT_LAY_HANDS_TIER).toBe(14);
        expect(node?.prereqNodeIds).toEqual([LIGHT_NODE_CORE]);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: LAY_HANDS_ABILITY_ID }]);
        expect(LIGHT_TREE_ID).toBe('light_core');
    });
});

describe('shared light-emitter reach', () => {
    function manager(sources: Array<[string, number, number]>): LightSourceManager {
        const mgr = new LightSourceManager({ getUnit: () => undefined } as never);
        for (const [id, x, y] of sources) {
            mgr.addLightSource(new LightSource({
                id,
                x,
                y,
                lightAmount: 4,
                radius: 2,
                decay: { roundCreated: 0, initialLightAmount: 4, initialRadius: 2, roundsTotal: 1000 },
            }));
        }
        return mgr;
    }

    it('reaches the 5x5 tile square (2 tiles each side)', () => {
        expect(LIGHT_EMITTER_REACH_HALF_EXTENT).toBe(2 * CELL_SIZE);
        const mgr = manager([
            ['edge', 2 * CELL_SIZE, 0],
            ['outside', 2 * CELL_SIZE + 1, 0],
        ]);
        expect(findReachableLightEmitters(mgr, 0, 0).map((l) => l.id)).toEqual(['edge']);
    });

    it('picks the nearest emitter with a stable id tie-break, and null when none', () => {
        const mgr = manager([['b', 10, 0], ['a', -10, 0], ['far', 60, 0]]);
        expect(findNearestReachableLightEmitter(mgr, 0, 0)?.id).toBe('a');
        expect(findNearestReachableLightEmitter(manager([]), 0, 0)).toBeNull();
        expect(findNearestReachableLightEmitter(undefined, 0, 0)).toBeNull();
    });
});
