import { describe, it, expect } from 'vitest';
import {
    DARKVISION_GRANT,
    DEFAULT_UNIT_SENSES,
    PLAYER_SENSES,
    SENSE_DEFS,
    SENSE_IDS_BY_PRIORITY,
    TREMORSENSE_GRANT,
    darknessVisionCost,
    getDarknessPenetration,
    getUnitSenses,
    mergeSenseGrants,
    parseSenseGrantsFromJSON,
    type SenseGrant,
} from './senses';
import { Unit } from '../units/Unit';
import { EventBus } from '../EventBus';
import { Buff } from '../../buffs/Buff';
import { DarknessLevel } from '../darknessLevels';

class TremorsenseTestBuff extends Buff {
    readonly _type = 'test_tremorsense';
    readonly senseGrants: readonly SenseGrant[] = [TREMORSENSE_GRANT];
}

function makeUnit(characterId: string, teamId: 'player' | 'enemy' = 'enemy'): Unit {
    return new Unit({
        id: `u_${characterId}`,
        x: 0,
        y: 0,
        hp: 10,
        speed: 50,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId,
        name: characterId,
    });
}

describe('sense presets', () => {
    it('content units resolve to the default senses', () => {
        const senses = getUnitSenses(makeUnit('slime'));
        expect(senses).toEqual({ vision: { range: 8, darknessPenetration: 2, glimpseLit: true } });
        expect(senses).toEqual(DEFAULT_UNIT_SENSES);
    });

    it('player units resolve to the player senses (default + hearing 4)', () => {
        const senses = getUnitSenses(makeUnit('player', 'player'));
        expect(senses).toEqual(PLAYER_SENSES);
        expect(senses.hearing).toEqual({ range: 4 });
        expect(senses.vision).toEqual(DEFAULT_UNIT_SENSES.vision);
    });

    it('unknown characters fall back to the default senses', () => {
        expect(getUnitSenses(makeUnit('no_such_character'))).toEqual(DEFAULT_UNIT_SENSES);
    });

    it('grant presets have the planned values', () => {
        expect(DARKVISION_GRANT).toEqual({ kind: 'darkvision', amount: 3 });
        expect(TREMORSENSE_GRANT).toEqual({ kind: 'tremorsense', range: 6 });
    });

    it('SENSE_DEFS orders vision > hearing > tremorsense', () => {
        expect(SENSE_IDS_BY_PRIORITY).toEqual(['vision', 'hearing', 'tremorsense']);
        expect(SENSE_DEFS.vision.blockedByWalls).toBe(true);
        expect(SENSE_DEFS.vision.affectedByDarkness).toBe(true);
        expect(SENSE_DEFS.hearing.blockedByWalls).toBe(false);
        expect(SENSE_DEFS.tremorsense.indicatorStyle).toBe('tremorsense');
    });
});

describe('mergeSenseGrants', () => {
    it('ranges take the max', () => {
        const merged = mergeSenseGrants(PLAYER_SENSES, [
            { kind: 'hearing', range: 2 },
            { kind: 'tremorsense', range: 6 },
            { kind: 'tremorsense', range: 3 },
            { kind: 'vision', range: 12 },
            { kind: 'vision', range: 5 },
        ]);
        expect(merged.hearing).toEqual({ range: 4 });
        expect(merged.tremorsense).toEqual({ range: 6 });
        expect(merged.vision?.range).toBe(12);
    });

    it('darkvision and darknessPenetration add', () => {
        const merged = mergeSenseGrants(DEFAULT_UNIT_SENSES, [
            DARKVISION_GRANT,
            DARKVISION_GRANT,
            { kind: 'vision', darknessPenetration: 1 },
        ]);
        expect(merged.darkvision).toBe(6);
        expect(merged.vision?.darknessPenetration).toBe(3);
        expect(getDarknessPenetration(merged)).toBe(9);
    });

    it('glimpseLit is OR-ed', () => {
        const noGlimpse = { vision: { range: 8, darknessPenetration: 2, glimpseLit: false } };
        expect(mergeSenseGrants(noGlimpse, [{ kind: 'vision' }]).vision?.glimpseLit).toBe(false);
        expect(mergeSenseGrants(noGlimpse, [{ kind: 'vision', glimpseLit: true }]).vision?.glimpseLit).toBe(true);
        expect(mergeSenseGrants(DEFAULT_UNIT_SENSES, [{ kind: 'vision', glimpseLit: false }]).vision?.glimpseLit).toBe(true);
    });

    it('a vision grant gives vision to a blind profile', () => {
        expect(mergeSenseGrants({}, [{ kind: 'vision', range: 3 }]).vision).toEqual({
            range: 3,
            darknessPenetration: 0,
            glimpseLit: false,
        });
        expect(getDarknessPenetration({ darkvision: 3 })).toBe(0);
    });

    it('never mutates the base preset', () => {
        const before = JSON.stringify(PLAYER_SENSES);
        mergeSenseGrants(PLAYER_SENSES, [DARKVISION_GRANT, { kind: 'hearing', range: 9 }, { kind: 'vision', range: 20 }]);
        expect(JSON.stringify(PLAYER_SENSES)).toBe(before);
    });
});

describe('getUnitSenses sources', () => {
    it('instance grants merge over the def baseline', () => {
        const unit = makeUnit('player', 'player');
        unit.addSenseGrant(DARKVISION_GRANT);
        unit.addSenseGrant(TREMORSENSE_GRANT);
        const senses = getUnitSenses(unit);
        expect(senses.darkvision).toBe(3);
        expect(senses.tremorsense).toEqual({ range: 6 });
        expect(senses.hearing).toEqual({ range: 4 });
    });

    it('a buff grant appears and disappears with the buff', () => {
        const unit = makeUnit('slime');
        expect(getUnitSenses(unit).tremorsense).toBeUndefined();
        const buff = new TremorsenseTestBuff({ value: 1, unit: 'rounds' });
        unit.addBuff(buff, 0, 1);
        expect(getUnitSenses(unit).tremorsense).toEqual({ range: 6 });
        unit.buffs = unit.buffs.filter((b) => b !== buff);
        expect(getUnitSenses(unit).tremorsense).toBeUndefined();
    });
});

describe('Unit.senseGrants serialization', () => {
    it('round-trips through JSON', () => {
        const unit = makeUnit('player', 'player');
        unit.addSenseGrant(DARKVISION_GRANT);
        unit.addSenseGrant(TREMORSENSE_GRANT);
        unit.addSenseGrant({ kind: 'vision', range: 10, darknessPenetration: 1, glimpseLit: true });
        const json = JSON.parse(JSON.stringify(unit.toJSON())) as Record<string, unknown>;
        expect(json.senseGrants).toEqual([
            { kind: 'darkvision', amount: 3 },
            { kind: 'tremorsense', range: 6 },
            { kind: 'vision', range: 10, darknessPenetration: 1, glimpseLit: true },
        ]);
        const restored = Unit.fromJSON(json, new EventBus());
        expect(restored.senseGrants).toEqual(unit.senseGrants);
        expect(getUnitSenses(restored)).toEqual(getUnitSenses(unit));
    });

    it('omits senseGrants when empty, and old checkpoints load with none', () => {
        const unit = makeUnit('slime');
        const json = JSON.parse(JSON.stringify(unit.toJSON())) as Record<string, unknown>;
        expect('senseGrants' in json).toBe(false);
        expect(Unit.fromJSON(json, new EventBus()).senseGrants).toEqual([]);
    });

    it('drops malformed grants', () => {
        expect(parseSenseGrantsFromJSON(undefined)).toEqual([]);
        expect(parseSenseGrantsFromJSON([
            { kind: 'hearing', range: 4 },
            { kind: 'hearing' },
            { kind: 'telepathy', range: 3 },
            null,
            { kind: 'darkvision', amount: 2 },
        ])).toEqual([{ kind: 'hearing', range: 4 }, { kind: 'darkvision', amount: 2 }]);
    });
});

describe('darknessVisionCost', () => {
    it('is 1 at full darkness and 0 at medium light and above', () => {
        expect(darknessVisionCost(DarknessLevel.FULL_DARKNESS)).toBe(1);
        expect(darknessVisionCost(-3)).toBe(1);
        expect(darknessVisionCost(DarknessLevel.MEDIUM_LIGHT_MIN)).toBe(0);
        expect(darknessVisionCost(DarknessLevel.SUNLIGHT)).toBe(0);
    });

    it('is linear in between', () => {
        expect(darknessVisionCost(1)).toBeCloseTo(0.75);
        expect(darknessVisionCost(2)).toBeCloseTo(0.5);
        expect(darknessVisionCost(3)).toBeCloseTo(0.25);
    });
});
