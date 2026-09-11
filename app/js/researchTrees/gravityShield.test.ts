import { describe, expect, it } from 'vitest';
import {
    GRAVITY_LIFT_CRYSTAL_COST,
    GRAVITY_LIFT_FOOD_COST,
    GRAVITY_LOCUS_CRYSTAL_COST,
    GRAVITY_LOCUS_FOOD_COST,
    GRAVITY_NODE_CORE,
    GRAVITY_NODE_GRAVITY_INVERSION,
    GRAVITY_NODE_GRAVITY_LOCUS,
    GRAVITY_NODE_GRAVITY_SHIELD,
    GRAVITY_LOCUS_METAL_COST,
    GRAVITY_LIFT_METAL_COST,
    GRAVITY_SHIELD_CRYSTAL_COST,
    GRAVITY_SHIELD_FOOD_COST,
    GRAVITY_SHIELD_METAL_COST,
    gravityTree,
} from './trees/gravity';

describe('Gravity Shield research', () => {
    it('is a tier-13 node that unlocks Gravity Shield after Gravity Core', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_SHIELD);
        expect(node?.tier).toBe(13);
        expect(node?.prereqNodeIds).toEqual([GRAVITY_NODE_CORE]);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: '0904' }]);
        expect(node?.cost).toEqual({
            crystals: GRAVITY_SHIELD_CRYSTAL_COST,
            food: GRAVITY_SHIELD_FOOD_COST,
            metal: GRAVITY_SHIELD_METAL_COST,
        });
    });
});

describe('Gravity research copy and costs', () => {
    it('shortens Gravity Core by dropping aimed Force Push', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_CORE);
        expect(node?.description).toBe(
            'Channel proximity to danger into gravitational force. Learn to fling enemies with Force Push.',
        );
        expect(node?.description.includes('aimed')).toBe(false);
    });

    it('describes Gravity Locus as a slow push or pull in the field', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_LOCUS);
        expect(node?.description).toBe(
            'Deploy a sustained gravity field at a point. Slowly pushes or pulls enemies in the gravity field.',
        );
        expect(node?.cost).toEqual({
            crystals: GRAVITY_LOCUS_CRYSTAL_COST,
            food: GRAVITY_LOCUS_FOOD_COST,
            metal: GRAVITY_LOCUS_METAL_COST,
        });
    });

    it('prices Lift in crystals and food', () => {
        const node = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_GRAVITY_INVERSION);
        expect(node?.cost).toEqual({
            crystals: GRAVITY_LIFT_CRYSTAL_COST,
            food: GRAVITY_LIFT_FOOD_COST,
            metal: GRAVITY_LIFT_METAL_COST,
        });
    });
});
