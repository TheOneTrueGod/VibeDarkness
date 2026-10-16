import { describe, expect, it } from 'vitest';
import '../games/minion_battles/abilities/AbilityRegistry';
import { computePassiveBonuses } from './passiveBonuses';
import { computeAbilityModifiersFromResearch } from './evaluator';
import { PassiveStatKey, type AbilityModifier } from './types';
import {
    EARTH_ATTUNED_CLAW_USES_PER_RANK,
    EARTH_ATTUNED_LEVELS,
    EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK,
    EARTH_NODE_EARTH_ATTUNED,
    EARTH_NODE_EARTH_CORE,
    EARTH_TREE_ID,
    earthTree,
} from './trees/earth';
import { Unit } from '../games/minion_battles/game/units/Unit';
import {
    applyAbilityResearchModifiersToRuntime,
    getAbilityUseConfig,
    grantRoundChargesToEligibleAbilities,
    initializeAbilityRuntimeForUnit,
} from '../games/minion_battles/abilities/abilityUses';

const CLAW_IDS = ['0111', '0534'] as const;

function makeClawUnit(abilityId: string, modifiers: Record<string, AbilityModifier>): Unit {
    const unit = new Unit({
        id: 'u', x: 0, y: 0, hp: 50, speed: 100, teamId: 'player', ownerId: 'p1',
        characterId: 'player', name: 'U', abilities: [abilityId],
    });
    unit.abilityModifiers = modifiers;
    initializeAbilityRuntimeForUnit(unit);
    applyAbilityResearchModifiersToRuntime(unit, modifiers);
    return unit;
}

describe('Earth Attuned research', () => {
    it('is a tier-12 two-rank node', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_EARTH_ATTUNED);
        expect(node?.tier).toBe(12);
        expect(node?.levels).toBe(EARTH_ATTUNED_LEVELS);
        expect(node?.prereqNodeIds).toEqual([EARTH_NODE_EARTH_CORE]);
    });

    it('grants 1 max movement and 1 regen per rank', () => {
        const trees = { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_ATTUNED] };
        const rank1 = computePassiveBonuses(trees, {
            [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_ATTUNED]: 1 },
        });
        expect(rank1[PassiveStatKey.MaxMovementPoints]?.add).toBe(EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK);
        expect(rank1[PassiveStatKey.MovementRegenPerRound]?.add).toBe(EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK);

        const rankMax = computePassiveBonuses(trees, {
            [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_ATTUNED]: EARTH_ATTUNED_LEVELS },
        });
        expect(rankMax[PassiveStatKey.MaxMovementPoints]?.add).toBe(
            EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK * EARTH_ATTUNED_LEVELS,
        );
        expect(rankMax[PassiveStatKey.MovementRegenPerRound]?.add).toBe(
            EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK * EARTH_ATTUNED_LEVELS,
        );
    });

    it('gives Bone Claws and Digging Claws +1 max use and +1 use per round, per rank', () => {
        const trees = { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_ATTUNED] };
        for (const rank of [1, EARTH_ATTUNED_LEVELS]) {
            const mods = computeAbilityModifiersFromResearch(trees, undefined, undefined, {
                [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_ATTUNED]: rank },
            });
            for (const id of CLAW_IDS) {
                expect(mods[id]?.maxUsesFlat).toBe(rank * EARTH_ATTUNED_CLAW_USES_PER_RANK);
                expect(mods[id]?.roundRecoveryFlat).toBe(rank * EARTH_ATTUNED_CLAW_USES_PER_RANK);
            }
        }
    });

    it('describes the movement and claw bonuses', () => {
        const node = earthTree.nodes.find((n) => n.id === EARTH_NODE_EARTH_ATTUNED)!;
        expect(node.description).toBe('+{1} movement point per round, and +{1} uses to bone claws');
    });
});

describe('Bone Claws / Digging Claws recovery', () => {
    it('Bone Claws has no recovery of its own; Digging Claws recovers 2 uses per round', () => {
        expect(getAbilityUseConfig('0111').recoveries).toEqual([]);
        expect(getAbilityUseConfig('0534').recoveries).toEqual([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 2 },
        ]);
    });

    it('without Earth Attuned, Bone Claws recovers nothing and Digging Claws recovers 2 at round start', () => {
        const expected: Record<string, number> = { '0111': 0, '0534': 2 };
        for (const id of CLAW_IDS) {
            const unit = makeClawUnit(id, {});
            unit.abilityRuntime[id]!.currentUses = 0;
            grantRoundChargesToEligibleAbilities(unit);
            expect(unit.abilityRuntime[id]!.currentUses).toBe(expected[id]);
        }
    });

    it('with Earth Attuned, gain a max use and +1 use recovered each round, capped at max', () => {
        const expected: Record<string, number> = { '0111': 1, '0534': 3 };
        for (const id of CLAW_IDS) {
            const baseMax = getAbilityUseConfig(id).maxUses;
            const unit = makeClawUnit(id, { [id]: { maxUsesFlat: 1, roundRecoveryFlat: 1 } });
            const runtime = unit.abilityRuntime[id]!;
            expect(runtime.maxUses).toBe(baseMax + 1);

            runtime.currentUses = 0;
            grantRoundChargesToEligibleAbilities(unit);
            expect(runtime.currentUses).toBe(expected[id]);

            runtime.currentUses = runtime.maxUses;
            grantRoundChargesToEligibleAbilities(unit);
            expect(runtime.currentUses).toBe(runtime.maxUses);
        }
    });
});
