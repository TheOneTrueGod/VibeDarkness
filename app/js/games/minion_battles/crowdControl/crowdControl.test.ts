import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { resolveCcDuration } from './resolveCcDuration';
import { tryApplyHardCcStun } from './tryApplyHardCcStun';
import { STUNNED_BUFF_TYPE } from '../buffs/StunnedBuff';
import { createUnitFromSpawnConfig } from '../game/units/index';
import { UnitTag } from '../game/units/unitTag';
import { EventBus } from '../game/EventBus';

function baseDummyUnit(): Unit {
    return new Unit({
        id: 'u',
        x: 0,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 50,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'enemy_melee',
        name: 'Dummy',
    });
}

describe('resolveCcDuration', () => {
    it('uses STUN-specific resist then ALL', () => {
        const u = baseDummyUnit();
        u.ccDurationResistPct = { ALL: 0.1, STUN: 0.25 };
        expect(resolveCcDuration(u, 'STUN', 1)).toBeCloseTo(0.75);
        expect(resolveCcDuration(u, 'SLOW', 1)).toBeCloseTo(0.9);
    });

    it('applies flat after percent using ALL fallback', () => {
        const u = baseDummyUnit();
        u.ccDurationResistPct = { ALL: 0 };
        u.ccDurationFlatSec = { ALL: 0.2, STUN: 0.1 };
        expect(resolveCcDuration(u, 'STUN', 1)).toBeCloseTo(0.9);
    });
});

describe('tryApplyHardCcStun threshold', () => {
    it('absorbs until threshold then applies stun (floor 2 → 3 attempts)', () => {
        const u = baseDummyUnit();
        u.hardCcArmourFloor = 2;
        u.bonusHardCcArmour = 0;
        u.chainCcResist = 0;

        expect(tryApplyHardCcStun(u, 2, 0, 1).outcome).toBe('absorbed');
        expect(u.hardCcArmourConsumed).toBe(1);
        expect(tryApplyHardCcStun(u, 2, 0, 1).outcome).toBe('absorbed');
        expect(u.hardCcArmourConsumed).toBe(2);
        const r = tryApplyHardCcStun(u, 2, 0, 1);
        expect(r.outcome).toBe('applied');
        if (r.outcome !== 'applied') throw new Error('expected applied');
        expect(r.effectiveDuration).toBe(2);
        expect(u.hardCcArmourConsumed).toBe(0);
        expect(u.hasBuff(STUNNED_BUFF_TYPE)).toBe(true);
    });

    it('treats effective duration below potency as no_potency', () => {
        const u = baseDummyUnit();
        u.ccDurationResistPct = { ALL: 0.9 };
        const r = tryApplyHardCcStun(u, 2, 0, 1);
        expect(r.outcome).toBe('no_potency');
        expect(u.buffs.some((b) => b._type === STUNNED_BUFF_TYPE)).toBe(false);
    });
});

describe('chain CC golden scenario (stacking + decay)', () => {
    it('matches 3-hit then 4-hit cycles; bonus stacks to effective 5 after two lands', () => {
        const u = baseDummyUnit();
        u.hardCcArmourFloor = 2;
        u.chainCcResist = 2;
        u.chainCcDecayRounds = 1;

        const hit = () => tryApplyHardCcStun(u, 2, 0, 1);

        // Cycle 1 — effective 2: absorb ×2, land on 3rd
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
        expect(u.getEffectiveHardCcThreshold()).toBe(3);

        // Cycle 2 — effective 3: absorb ×3, land on 4th
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
        expect(u.getEffectiveHardCcThreshold()).toBe(5);
    });

    it('from effective 5 (6-hit cycle state), each round decays bonus by one step', () => {
        const u = baseDummyUnit();
        u.hardCcArmourFloor = 2;
        u.chainCcResist = 2;
        u.chainCcDecayRounds = 1;
        const hit = () => tryApplyHardCcStun(u, 2, 0, 1);
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
        expect(u.getEffectiveHardCcThreshold()).toBe(5);

        u.tickHardCcChainDecayAtRoundEnd();
        expect(u.getEffectiveHardCcThreshold()).toBe(4);
        u.tickHardCcChainDecayAtRoundEnd();
        expect(u.getEffectiveHardCcThreshold()).toBe(3);
    });

    it('at effective 5 the next cycle needs six attempts before a stun lands', () => {
        const u = baseDummyUnit();
        u.hardCcArmourFloor = 2;
        u.chainCcResist = 2;
        const hit = () => tryApplyHardCcStun(u, 2, 0, 1);
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
        expect(u.getEffectiveHardCcThreshold()).toBe(5);
        for (let i = 0; i < 5; i++) expect(hit().outcome).toBe('absorbed');
        expect(hit().outcome).toBe('applied');
    });
});

describe('Alpha Wolf ALL resist', () => {
    it('halves a 1.0s stun when threshold is 0', () => {
        const wolf = createUnitFromSpawnConfig(
            {
                characterId: 'alpha_wolf',
                name: 'Alpha',
                x: 0,
                y: 0,
                teamId: 'enemy',
                ownerId: 'ai',
                unitTags: [UnitTag.Boss],
            },
            new EventBus(),
        );
        wolf.hardCcArmourFloor = 0;
        wolf.bonusHardCcArmour = 0;

        const r = tryApplyHardCcStun(wolf, 1, 0, 1);
        expect(r.outcome).toBe('applied');
        if (r.outcome !== 'applied') throw new Error('expected applied');
        expect(r.effectiveDuration).toBeCloseTo(0.5);
    });
});
