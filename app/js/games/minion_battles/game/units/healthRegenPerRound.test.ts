/**
 * `PassiveStatKey.HealthRegenPerRound`: units heal that much at each round start (no heal-penalty
 * injury), and the disabled Training "Playtest Vitality" node grants +1000 max HP and +100 regen.
 */
import { describe, expect, it, vi } from 'vitest';
import { Unit } from './Unit';
import type { TeamId } from '../teams';
import type { EngineContext } from '../EngineContext';
import { unitRoundStart } from './unitAbilityLifecycle';
import { PassiveStatKey } from '../../../../researchTrees/types';
import { computePassiveBonuses } from '../../../../researchTrees/passiveBonuses';
import {
    TRAINING_NODE_PLAYTEST_VITALITY,
    TRAINING_PLAYTEST_VITALITY_MAX_HEALTH_ADD,
    TRAINING_PLAYTEST_VITALITY_REGEN_PER_ROUND,
    TRAINING_TREE_ID,
    trainingTree,
} from '../../../../researchTrees/trees/training';

function makeUnit(hp: number, maxHp: number, regen?: number): Unit {
    return new Unit({
        id: 'u1', x: 0, y: 0, hp, maxHp, speed: 100,
        teamId: 'player' as TeamId, ownerId: 'p1', characterId: 'player', name: 'u1',
        passiveBonuses: regen === undefined ? undefined : { [PassiveStatKey.HealthRegenPerRound]: { add: regen, mult: 1 } },
    });
}

function makeEngine(): EngineContext & { emit: ReturnType<typeof vi.fn> } {
    const emit = vi.fn();
    return {
        eventBus: { emit },
        terrainLayers: { getGroundMovementRecoverySlowStacks: () => 0 },
        emit,
    } as unknown as EngineContext & { emit: ReturnType<typeof vi.fn> };
}

describe('health regen per round', () => {
    it('heals the regen amount at round start without heal-penalty injury', () => {
        const unit = makeUnit(10, 1050, 100);
        const engine = makeEngine();
        unitRoundStart(unit, engine);
        expect(unit.hp).toBe(110);
        expect(unit.hpInjury).toBe(0);
        expect(engine.emit).toHaveBeenCalledWith('unit_healed', expect.objectContaining({ unitId: 'u1', amount: 100 }));
    });

    it('never heals past max health', () => {
        const unit = makeUnit(1000, 1050, 100);
        unitRoundStart(unit, makeEngine());
        expect(unit.hp).toBe(1050);
    });

    it('does nothing without the passive', () => {
        const unit = makeUnit(10, 50);
        unitRoundStart(unit, makeEngine());
        expect(unit.hp).toBe(10);
    });

    it('Playtest Vitality is a disabled node granting +1000 max health and +100 regen', () => {
        const node = trainingTree.nodes.find((n) => n.id === TRAINING_NODE_PLAYTEST_VITALITY);
        expect(node?.disabled).toBe(true);
        const bonuses = computePassiveBonuses({ [TRAINING_TREE_ID]: [TRAINING_NODE_PLAYTEST_VITALITY] });
        expect(bonuses[PassiveStatKey.MaxHealth]?.add).toBe(TRAINING_PLAYTEST_VITALITY_MAX_HEALTH_ADD);
        expect(bonuses[PassiveStatKey.HealthRegenPerRound]?.add).toBe(TRAINING_PLAYTEST_VITALITY_REGEN_PER_ROUND);
    });
});
