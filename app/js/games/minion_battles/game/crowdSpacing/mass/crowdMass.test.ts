import { describe, expect, it } from 'vitest';
import { Unit } from '../../units/Unit';
import { UnitTag } from '../../units/unitTag';
import { UNIT_SIZE_MAP } from '../../units/unit_defs/unitConstants';
import { PLAYER_CHARACTER_ID, getUnitCrowdMassOverride } from '../../units/unit_defs/unitDef';
import { getCrowdMass, getCrowdSizeTier } from './crowdMass';
import {
    CROWD_MASS_BOSS_MULTIPLIER,
    CROWD_MASS_BY_SIZE,
    CROWD_MASS_PLAYER_SIZE_TIER_BONUS,
    crowdMassForRadius,
    nearestUnitSizeForRadius,
    shiftUnitSizeTier,
} from './massConstants';

const OVERRIDE_MASS = 7;

function makeUnit(characterId: string, radius: number, tags: UnitTag[] = []): Unit {
    const unit = new Unit({
        id: 'u1',
        x: 0,
        y: 0,
        hp: 10,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId,
        name: 'Mass Test',
        radius,
        abilities: [],
    });
    unit.tags = [...tags];
    return unit;
}

describe('massConstants', () => {
    it('mass grows faster than radius across tiers', () => {
        expect(CROWD_MASS_BY_SIZE.Large / CROWD_MASS_BY_SIZE.Medium).toBeGreaterThan(
            UNIT_SIZE_MAP.Large / UNIT_SIZE_MAP.Medium,
        );
    });

    it('nearest tier for an exact tier radius is that tier', () => {
        expect(nearestUnitSizeForRadius(UNIT_SIZE_MAP.Giant)).toBe('Giant');
        expect(crowdMassForRadius(UNIT_SIZE_MAP.Medium)).toBe(CROWD_MASS_BY_SIZE.Medium);
    });

    it('nearest tier for an off-tier radius picks the closest', () => {
        expect(nearestUnitSizeForRadius(UNIT_SIZE_MAP.Colossal + 50)).toBe('Colossal');
        expect(nearestUnitSizeForRadius(1)).toBe('Minuscule');
        expect(nearestUnitSizeForRadius(UNIT_SIZE_MAP.Giant + 1)).toBe('Giant');
    });
});

describe('getCrowdMass', () => {
    it('uses the def size tier when the radius matches it', () => {
        const boar = makeUnit('boar', UNIT_SIZE_MAP.Large);
        expect(getCrowdSizeTier(boar)).toBe('Large');
        expect(getCrowdMass(boar)).toBe(CROWD_MASS_BY_SIZE.Large);
    });

    it('falls back to the nearest tier from radius for unknown defs or overridden radii', () => {
        expect(getCrowdMass(makeUnit('no_such_def', UNIT_SIZE_MAP.Tiny))).toBe(CROWD_MASS_BY_SIZE.Tiny);
        expect(getCrowdMass(makeUnit('boar', UNIT_SIZE_MAP.Giant))).toBe(CROWD_MASS_BY_SIZE.Giant);
    });

    it('heavier size tiers are heavier', () => {
        const small = makeUnit('dark_wolf', UNIT_SIZE_MAP['Extra Small']);
        const large = makeUnit('boar', UNIT_SIZE_MAP.Large);
        expect(getCrowdMass(large)).toBeGreaterThan(getCrowdMass(small));
    });

    it('applies the boss multiplier', () => {
        const boss = makeUnit('boar', UNIT_SIZE_MAP.Large, [UnitTag.Boss]);
        expect(getCrowdMass(boss)).toBe(CROWD_MASS_BY_SIZE.Large * CROWD_MASS_BOSS_MULTIPLIER);
    });

    it('def crowdMass override replaces the size mass and still takes the boss multiplier', () => {
        expect(getUnitCrowdMassOverride('boar')).toBeUndefined();
        const unit = makeUnit('boar', UNIT_SIZE_MAP.Large);
        expect(unit.crowdMassOverride).toBeUndefined();
        Object.defineProperty(unit, 'crowdMassOverride', { get: () => OVERRIDE_MASS });
        expect(getCrowdMass(unit)).toBe(OVERRIDE_MASS);
        unit.tags = [UnitTag.Boss];
        expect(getCrowdMass(unit)).toBe(OVERRIDE_MASS * CROWD_MASS_BOSS_MULTIPLIER);
    });

    it("a player's own character weighs as one size larger; their summons do not", () => {
        expect(CROWD_MASS_PLAYER_SIZE_TIER_BONUS).toBe(1);
        const player = makeUnit(PLAYER_CHARACTER_ID, UNIT_SIZE_MAP.Medium);
        player.ownerId = 'p1';
        expect(getCrowdMass(player)).toBe(CROWD_MASS_BY_SIZE.Large);

        const summon = makeUnit('dark_wolf', UNIT_SIZE_MAP.Medium);
        summon.ownerId = 'p1';
        expect(getCrowdMass(summon)).toBe(CROWD_MASS_BY_SIZE.Medium);
    });

    it('size-tier shifts clamp at the ends of the scale', () => {
        expect(shiftUnitSizeTier('Medium', 1)).toBe('Large');
        expect(shiftUnitSizeTier('Colossal', 1)).toBe('Colossal');
        expect(shiftUnitSizeTier('Minuscule', -1)).toBe('Minuscule');
    });
});
