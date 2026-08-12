import { describe, expect, it } from 'vitest';
import { Unit } from '../units/Unit';
import { UnitTag, isUnitTag, parseUnitTagsFromJSON } from '../units/unitTag';
import { LiftedBuff } from '../../buffs/LiftedBuff';
import {
    CROWD_SPACING_FALLBACK_CELL_SIZE,
    CROWD_SPACING_OVERLAP_EPSILON,
    CROWD_SPACING_PASSES_PER_TICK,
    CROWD_SPACING_PLAYER_RADIUS_PADDING,
    crowdSpacingCellSizeFromMaxRadius,
} from './crowdSpacingConstants';
import {
    getCrowdSpacingRadius,
    getCrowdSpacingRole,
    getCrowdSpacingWeight,
} from './crowdSpacingRoles';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

const TEST_RADIUS = 18;
const KNOCKBACK_AIR_TIME = 0.5;
const KNOCKBACK_SLIDE_TIME = 0.2;
const LIFT_DURATION_SEC = 1;
const LIFT_SLAM_DAMAGE = 1;

function makeUnit(overrides: {
    id?: string;
    ownerId?: string;
    radius?: number;
    hp?: number;
    active?: boolean;
    spawnTimer?: number;
    tags?: UnitTag[];
} = {}): Unit {
    const unit = new Unit({
        id: overrides.id ?? 'u1',
        x: 0,
        y: 0,
        hp: overrides.hp ?? 100,
        speed: 40,
        teamId: 'enemy',
        ownerId: overrides.ownerId ?? 'ai',
        characterId: 'alpha_wolf',
        name: 'CrowdSpacing Test',
        radius: overrides.radius ?? TEST_RADIUS,
        abilities: [],
    });
    if (overrides.active !== undefined) unit.active = overrides.active;
    if (overrides.spawnTimer !== undefined) unit.spawnTimer = overrides.spawnTimer;
    if (overrides.tags) unit.tags = [...overrides.tags];
    return unit;
}

function withKnockback(unit: Unit, elapsed: number): Unit {
    unit.knockback = {
        knockbackVector: { x: CELL_SIZE, y: 0 },
        knockbackAirTime: KNOCKBACK_AIR_TIME,
        knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
        knockbackSource: { unitId: 'src', abilityId: 'test' },
        knockbackElapsed: elapsed,
    };
    return unit;
}

describe('UnitTag.CrowdSpacingAnchor parse/serialize', () => {
    it('is a known tag and survives parseUnitTagsFromJSON', () => {
        expect(isUnitTag(UnitTag.CrowdSpacingAnchor)).toBe(true);
        expect(parseUnitTagsFromJSON([UnitTag.CrowdSpacingAnchor, 'unknownTag'])).toEqual([
            UnitTag.CrowdSpacingAnchor,
        ]);
    });
});

describe('crowdSpacingConstants', () => {
    it('exports MVP overlap epsilon and one pass per tick', () => {
        expect(CROWD_SPACING_OVERLAP_EPSILON).toBe(0.5);
        expect(CROWD_SPACING_PASSES_PER_TICK).toBe(1);
        expect(CROWD_SPACING_FALLBACK_CELL_SIZE).toBe(CELL_SIZE * 2);
    });

    it('derives cell size from max radius with fallback', () => {
        expect(crowdSpacingCellSizeFromMaxRadius(TEST_RADIUS)).toBe(2 * TEST_RADIUS);
        expect(crowdSpacingCellSizeFromMaxRadius(0)).toBe(CROWD_SPACING_FALLBACK_CELL_SIZE);
        expect(crowdSpacingCellSizeFromMaxRadius(-1)).toBe(CROWD_SPACING_FALLBACK_CELL_SIZE);
    });
});

describe('getCrowdSpacingWeight', () => {
    it('returns unit radius for MVP', () => {
        const unit = makeUnit({ radius: TEST_RADIUS });
        expect(getCrowdSpacingWeight(unit)).toBe(TEST_RADIUS);
    });
});

describe('getCrowdSpacingRadius', () => {
    it('matches display radius for AI units', () => {
        const unit = makeUnit({ radius: TEST_RADIUS });
        expect(getCrowdSpacingRadius(unit)).toBe(TEST_RADIUS);
        expect(unit.radius).toBe(TEST_RADIUS);
    });

    it('adds player personal-space padding without changing display radius', () => {
        const unit = makeUnit({ ownerId: 'p1', radius: TEST_RADIUS });
        expect(unit.radius).toBe(TEST_RADIUS);
        expect(getCrowdSpacingRadius(unit)).toBe(TEST_RADIUS + CROWD_SPACING_PLAYER_RADIUS_PADDING);
    });
});

describe('getCrowdSpacingRole', () => {
    it('marks dead, inactive, and spawning units exempt', () => {
        expect(getCrowdSpacingRole(makeUnit({ hp: 0 }))).toBe('exempt');
        expect(getCrowdSpacingRole(makeUnit({ active: false }))).toBe('exempt');
        expect(getCrowdSpacingRole(makeUnit({ spawnTimer: 0.5 }))).toBe('exempt');
    });

    it('marks airborne units exempt (knockback air and lifted)', () => {
        const airKb = withKnockback(makeUnit(), 0.1);
        expect(getCrowdSpacingRole(airKb)).toBe('exempt');

        const lifted = makeUnit();
        lifted.buffs = [
            new LiftedBuff(
                LIFT_DURATION_SEC,
                { slamDamage: LIFT_SLAM_DAMAGE, sourceAbilityId: 'test' },
                'src',
            ),
        ];
        expect(getCrowdSpacingRole(lifted)).toBe('exempt');
    });

    it('marks player-controlled units as anchors', () => {
        expect(getCrowdSpacingRole(makeUnit({ ownerId: 'p1' }))).toBe('anchor');
    });

    it('marks CrowdSpacingAnchor-tagged enemies as anchors (Boss alone is soft)', () => {
        expect(
            getCrowdSpacingRole(makeUnit({ tags: [UnitTag.CrowdSpacingAnchor] })),
        ).toBe('anchor');
        expect(getCrowdSpacingRole(makeUnit({ tags: [UnitTag.Boss] }))).toBe('soft');
    });

    it('marks knockback slide and controlled as anchors (not air)', () => {
        const slide = withKnockback(makeUnit(), KNOCKBACK_AIR_TIME + 0.05);
        expect(getCrowdSpacingRole(slide)).toBe('anchor');

        const controlled = makeUnit();
        controlled.controlled = true;
        expect(getCrowdSpacingRole(controlled)).toBe('anchor');
    });

    it('defaults grounded AI enemies to soft', () => {
        expect(getCrowdSpacingRole(makeUnit())).toBe('soft');
    });

    it('does not treat ability nudge alone as forced move', () => {
        const nudged = makeUnit();
        nudged.nudge = {
            nudgeVector: { x: 10, y: 0 },
            nudgeDuration: 0.2,
            nudgeElapsed: 0,
        };
        expect(getCrowdSpacingRole(nudged)).toBe('soft');
    });
});
