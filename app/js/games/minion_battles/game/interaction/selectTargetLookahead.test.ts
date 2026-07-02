import { describe, expect, it, vi } from 'vitest';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { EngineContext } from '../EngineContext';
import type { ActiveAbility } from '../types';
import type { Unit } from '../units/Unit';
import { findImpendingSelectTargetNeed } from './selectTargetLookahead';

const FIXED_DT = 1 / 60;

const LIGHT_BLAST_ID = '0801';
const LIGHT_BLAST_PREFIRE = 0.4;

const DOUBLE_PUNCH_ID = '0116';
const DOUBLE_PUNCH_FIRST_SELECT_AT = 0.2;
const DOUBLE_PUNCH_SECOND_SELECT_AT = 0.5;

const lightBlastAbility = {
    id: LIGHT_BLAST_ID,
    abilityTimings: [
        { id: 'windup', start: 0, end: LIGHT_BLAST_PREFIRE, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: LIGHT_BLAST_PREFIRE,
            end: LIGHT_BLAST_PREFIRE + 0.05,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select' as const, label: 'Target', hitbox: {}, filter: 'any' as const },
        },
        {
            id: 'cooldown',
            start: LIGHT_BLAST_PREFIRE + 0.05,
            end: LIGHT_BLAST_PREFIRE + 1.5,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
};

const doublePunchAbility = {
    id: DOUBLE_PUNCH_ID,
    abilityTimings: [
        { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
        {
            id: 'punch1',
            start: 0.2,
            end: 0.3,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select' as const, label: 'Target 1', hitbox: {}, filter: 'enemy' as const },
        },
        { id: 'gap', start: 0.3, end: 0.5, abilityPhase: AbilityPhase.Waiting },
        {
            id: 'punch2',
            start: 0.5,
            end: 0.6,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select' as const, label: 'Target 2', hitbox: {}, filter: 'enemy' as const },
        },
        { id: 'cooldown', start: 0.6, end: 1.0, abilityPhase: AbilityPhase.Cooldown },
    ],
};

vi.mock('../../abilities/AbilityRegistry', () => ({
    getAbility: (id: string) => {
        if (id === LIGHT_BLAST_ID) return lightBlastAbility;
        if (id === DOUBLE_PUNCH_ID) return doublePunchAbility;
        return undefined;
    },
}));

function makeEngine(
    units: Unit[],
    gameTime: number,
): EngineContext {
    const byId = new Map(units.map((u) => [u.id, u]));
    return {
        gameTime,
        units,
        getUnit: (id: string) => byId.get(id),
    } as EngineContext;
}

function makeUnit(
    id: string,
    activeAbilities: ActiveAbility[],
): Unit {
    return { id, activeAbilities } as Unit;
}

function makeActive(
    abilityId: string,
    startTime: number,
    targetsByLabel: ActiveAbility['targetsByLabel'],
    extras: Partial<ActiveAbility> = {},
): ActiveAbility {
    return {
        abilityId,
        startTime,
        targets: [],
        targetsByLabel,
        ...extras,
    };
}

describe('findImpendingSelectTargetNeed', () => {
    it('returns Target when Light Blast select interval would enter and label is missing', () => {
        const prevElapsed = LIGHT_BLAST_PREFIRE - FIXED_DT;
        const unit = makeUnit('player_1', [
            makeActive(LIGHT_BLAST_ID, 0, {}),
        ]);
        const engine = makeEngine([unit], prevElapsed);

        expect(findImpendingSelectTargetNeed(engine, FIXED_DT)).toEqual({
            label: 'Target',
            unitId: 'player_1',
            abilityId: LIGHT_BLAST_ID,
        });
    });

    it('returns null when Light Blast label is pre-filled', () => {
        const prevElapsed = LIGHT_BLAST_PREFIRE - FIXED_DT;
        const unit = makeUnit('player_1', [
            makeActive(LIGHT_BLAST_ID, 0, {
                Target: { type: 'pixel', position: { x: 100, y: 100 } },
            }),
        ]);
        const engine = makeEngine([unit], prevElapsed);

        expect(findImpendingSelectTargetNeed(engine, FIXED_DT)).toBeNull();
    });

    it('returns null when targetsByLabel is undefined (committed order path)', () => {
        const prevElapsed = LIGHT_BLAST_PREFIRE - FIXED_DT;
        const unit = makeUnit('player_1', [
            makeActive(LIGHT_BLAST_ID, 0, undefined),
        ]);
        const engine = makeEngine([unit], prevElapsed);

        expect(findImpendingSelectTargetNeed(engine, FIXED_DT)).toBeNull();
    });

    it('returns first missing label in document order for Double Punch', () => {
        const prevElapsedFirst = DOUBLE_PUNCH_FIRST_SELECT_AT - FIXED_DT;
        const unitFirst = makeUnit('player_1', [
            makeActive(DOUBLE_PUNCH_ID, 0, {}),
        ]);
        expect(
            findImpendingSelectTargetNeed(makeEngine([unitFirst], prevElapsedFirst), FIXED_DT),
        ).toEqual({
            label: 'Target 1',
            unitId: 'player_1',
            abilityId: DOUBLE_PUNCH_ID,
        });

        const prevElapsedSecond = DOUBLE_PUNCH_SECOND_SELECT_AT - FIXED_DT;
        const unitSecond = makeUnit('player_1', [
            makeActive(DOUBLE_PUNCH_ID, 0, {
                'Target 1': { type: 'unit', unitId: 'enemy_1' },
            }),
        ]);
        expect(
            findImpendingSelectTargetNeed(makeEngine([unitSecond], prevElapsedSecond), FIXED_DT),
        ).toEqual({
            label: 'Target 2',
            unitId: 'player_1',
            abilityId: DOUBLE_PUNCH_ID,
        });
    });

    it('returns null when setupFiredBehaviourKeys already contains the interval entry key', () => {
        const prevElapsed = LIGHT_BLAST_PREFIRE - FIXED_DT;
        const unit = makeUnit('player_1', [
            makeActive(LIGHT_BLAST_ID, 0, {}, {
                setupFiredBehaviourKeys: new Set(['active_0']),
            }),
        ]);
        const engine = makeEngine([unit], prevElapsed);

        expect(findImpendingSelectTargetNeed(engine, FIXED_DT)).toBeNull();
    });
});
