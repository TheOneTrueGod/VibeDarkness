import { describe, expect, it } from 'vitest';
import {
    GRAVITY_LIFT_ATTUNEMENT_COST,
    GRAVITY_LIFT_VIGOR_COST,
    GRAVITY_LOCUS_ATTUNEMENT_COST,
    GRAVITY_LOCUS_VIGOR_COST,
    GRAVITY_NODE_CORE,
    GRAVITY_NODE_GRAVITY_INVERSION,
    GRAVITY_NODE_GRAVITY_LOCUS,
    GRAVITY_LOCUS_METAL_COST,
    GRAVITY_LIFT_METAL_COST,
    gravityTree,
} from './trees/gravity';
import { GRAVITY_CORE_MISSION_START_AMOUNT } from '../games/minion_battles/card_defs/09_gravity_core/gravityConstants';

describe('Gravity Shield research', () => {
    it('is granted by Gravity Core alongside Force Push, with no node of its own', () => {
        const core = gravityTree.nodes.find((n) => n.id === GRAVITY_NODE_CORE);
        expect(core?.effects).toContainEqual({ type: 'addCard', cardId: '0902' });
        expect(core?.effects).toContainEqual({ type: 'addCard', cardId: '0904' });
        const grantingNodes = gravityTree.nodes.filter((n) =>
            n.effects.some((e) => e.type === 'addCard' && e.cardId === '0904'),
        );
        expect(grantingNodes.map((n) => n.id)).toEqual([GRAVITY_NODE_CORE]);
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
