import { describe, expect, it } from 'vitest';
import {
    GRAVITY_LIFT_ATTUNEMENT_COST,
    GRAVITY_LIFT_VIGOR_COST,
    GRAVITY_LOCUS_ATTUNEMENT_COST,
    GRAVITY_LOCUS_VIGOR_COST,
    GRAVITY_NODE_CORE,
    GRAVITY_NODE_GRAVITY_INVERSION,
    GRAVITY_NODE_GRAVITY_LOCUS,
    GRAVITY_NODE_GRAVITY_SHIELD,
    GRAVITY_LOCUS_METAL_COST,
    GRAVITY_LIFT_METAL_COST,
    GRAVITY_SHIELD_ATTUNEMENT_COST,
    GRAVITY_SHIELD_VIGOR_COST,
    GRAVITY_SHIELD_METAL_COST,
    gravityTree,
} from './trees/gravity';
import { GRAVITY_CORE_MISSION_START_AMOUNT } from '../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

describe('Gravity Shield research', () => {
    it('is a tier-13 node that unlocks Gravity Shield after Gravity Core', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_SHIELD);
        expect(node?.tier).toBe(13);
        expect(node?.prereqNodeIds).toEqual([GRAVITY_NODE_CORE]);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: '0904' }]);
        expect(node?.cost).toEqual({
            attunement: GRAVITY_SHIELD_ATTUNEMENT_COST,
            vigor: GRAVITY_SHIELD_VIGOR_COST,
            metal: GRAVITY_SHIELD_METAL_COST,
        });
    });
});

describe('Gravity research copy and costs', () => {
    it('describes Gravity Core without aimed Force Push, and states the starting Gravity', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_CORE);
        expect(node?.description.includes('aimed')).toBe(false);
        expect(node?.description).toContain(`{${GRAVITY_CORE_MISSION_START_AMOUNT}} Gravity`);
    });

    it('describes Gravity Locus as a slow push or pull in the field', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_LOCUS);
        expect(node?.description).toMatch(/drawing enemies in or driving them away/);
        expect(node?.cost).toEqual({
            attunement: GRAVITY_LOCUS_ATTUNEMENT_COST,
            vigor: GRAVITY_LOCUS_VIGOR_COST,
            metal: GRAVITY_LOCUS_METAL_COST,
        });
    });

    it('prices Lift in Attunement and Vigor', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_INVERSION);
        expect(node?.cost).toEqual({
            attunement: GRAVITY_LIFT_ATTUNEMENT_COST,
            vigor: GRAVITY_LIFT_VIGOR_COST,
            metal: GRAVITY_LIFT_METAL_COST,
        });
    });
});
