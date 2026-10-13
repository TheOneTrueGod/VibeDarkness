import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility, interruptUnitAbilities } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import type { TeamId } from '../../../game/teams';
import { STAGGERED_BUFF_TYPE } from '../../../buffs/StaggeredBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../../../buffs/ExposedBuff';
import { Gravity } from '../../../resources/Gravity';
import type { Effect } from '../../../game/effects/Effect';
import {
    COLLAPSE_ARC_SPACING,
    COLLAPSE_COOLDOWN_DURATION,
    COLLAPSE_DAMAGE,
    COLLAPSE_FLING_DURATION,
    COLLAPSE_FOLLOW_UP_OVERLAP,
    COLLAPSE_GRAVITY_COST,
    COLLAPSE_MAX_TARGETS,
    COLLAPSE_PREFIRE_TIME,
    COLLAPSE_RELEASE_DURATION,
} from '../gravityConstants';
import { CollapseAbility } from './0905Ability';

const CARD_ID = CollapseAbility.id;
const TICK_DT = 0.01;
const SHARED_Y = 100;
const CURSOR = { x: 130, y: SHARED_Y };
const START_GRAVITY = 100;

function makeUnit(id: string, x: number, y: number, teamId: TeamId): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'dark_wolf',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
        ...(teamId === 'player' ? { abilities: [CARD_ID] } : {}),
    });
}

function makeCaster(): Unit {
    const unit = makeUnit('caster', 50, SHARED_Y, 'player');
    unit.abilityRuntime[CARD_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    const gravity = new Gravity();
    gravity.add(START_GRAVITY);
    gravity.attach(unit, new EventBus());
    unit.resources.push(gravity);
    return unit;
}

function makeEngine(units: Unit[]): { engine: EngineContext; effects: Effect[] } {
    const eventBus = new EventBus();
    const effects: Effect[] = [];
    const engine = {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: (e: Effect) => { effects.push(e); },
        interruptUnitAndRefundAbilities: (u: Unit) => interruptUnitAbilities(u, engine as unknown as EngineContext),
    } as unknown as EngineContext;
    return { engine, effects };
}

function advance(units: Unit[], engine: EngineContext, seconds: number, tickers: Unit[]): void {
    const steps = Math.round(seconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        for (const u of tickers) tickUnitActiveAbilities(u, TICK_DT, engine, vi.fn());
        for (const u of units) updateUnit(u, TICK_DT, engine);
    }
}

function cast(caster: Unit, engine: EngineContext): void {
    executeUnitAbility(caster, CollapseAbility, [{ type: 'pixel', position: { ...CURSOR } }], engine);
}

/** Pre-landing: release has fired, flung enemies are airborne. */
const AFTER_RELEASE = COLLAPSE_PREFIRE_TIME + COLLAPSE_RELEASE_DURATION + 0.01;
const AFTER_LANDING = COLLAPSE_PREFIRE_TIME + COLLAPSE_FLING_DURATION + 0.1;

describe('CollapseAbility', () => {
    it('is named Collapse and costs gravity', () => {
        expect(CollapseAbility.name).toBe('Collapse');
        expect(CollapseAbility.resourceCost).toEqual({ resourceId: 'gravity', amount: COLLAPSE_GRAVITY_COST });
    });

    it('timing: the cast ends exactly the follow-up overlap before the fling lands', () => {
        const castEnd = COLLAPSE_PREFIRE_TIME + COLLAPSE_RELEASE_DURATION + COLLAPSE_COOLDOWN_DURATION;
        const landing = COLLAPSE_PREFIRE_TIME + COLLAPSE_FLING_DURATION;
        expect(landing - castEnd).toBeCloseTo(COLLAPSE_FOLLOW_UP_OVERLAP, 10);
    });

    it('pulls only the 3 enemies nearest the cursor, ignoring allies and out-of-cone enemies', () => {
        const caster = makeCaster();
        const a = makeUnit('a', 130, SHARED_Y, 'enemy');
        const b = makeUnit('b', 120, 112, 'enemy');
        const c = makeUnit('c', 140, 90, 'enemy');
        const far = makeUnit('far', 85, SHARED_Y, 'enemy'); // in cone, 4th nearest to the cursor
        const outOfCone = makeUnit('out', 50, 170, 'enemy'); // 70 away but ~90 degrees off axis
        const ally = makeUnit('ally', 128, SHARED_Y, 'player');
        const units = [caster, a, b, c, far, outOfCone, ally];
        const { engine } = makeEngine(units);
        const start = new Map(units.map((u) => [u.id, { x: u.x, y: u.y }]));

        cast(caster, engine);
        advance(units, engine, AFTER_LANDING, [caster]);

        const pulled = [a, b, c].filter((u) => Math.hypot(u.x - start.get(u.id)!.x, u.y - start.get(u.id)!.y) > 1);
        expect(pulled).toHaveLength(COLLAPSE_MAX_TARGETS);
        for (const u of [far, outOfCone, ally]) {
            expect(u.x).toBeCloseTo(start.get(u.id)!.x, 5);
            expect(u.y).toBeCloseTo(start.get(u.id)!.y, 5);
            expect(u.hp).toBe(100);
        }
    });

    it('lands pulled enemies in an arc in front of the caster, centre slot for the nearest, with damage and stagger', () => {
        const caster = makeCaster();
        const a = makeUnit('a', 130, SHARED_Y, 'enemy');
        const b = makeUnit('b', 120, 112, 'enemy');
        const c = makeUnit('c', 140, 88, 'enemy');
        const units = [caster, a, b, c];
        const { engine } = makeEngine(units);

        cast(caster, engine);
        advance(units, engine, AFTER_LANDING, [caster]);

        const radius = caster.radius + a.radius + COLLAPSE_ARC_SPACING;
        for (const u of [a, b, c]) {
            expect(Math.hypot(u.x - caster.x, u.y - caster.y)).toBeCloseTo(radius, 0);
            expect(u.hp).toBe(100 - COLLAPSE_DAMAGE);
            expect(u.x).toBeGreaterThan(caster.x);
        }
        // Nearest-to-cursor target takes the centre slot (on the aim line).
        expect(a.y).toBeCloseTo(SHARED_Y, 0);
        expect(a.x).toBeCloseTo(caster.x + radius, 0);
        // The others split to either side of the aim line.
        expect(Math.sign(b.y - SHARED_Y)).not.toBe(Math.sign(c.y - SHARED_Y));
    });

    it('staggers pulled enemies (cannot act) and the stagger outlasts the landing', () => {
        const caster = makeCaster();
        const a = makeUnit('a', 130, SHARED_Y, 'enemy');
        const units = [caster, a];
        const { engine } = makeEngine(units);

        cast(caster, engine);
        advance(units, engine, AFTER_RELEASE, [caster]);
        expect(a.hasBuff(STAGGERED_BUFF_TYPE)).toBe(true);
        expect(a.canAct()).toBe(false);

        advance(units, engine, COLLAPSE_FLING_DURATION + 0.1, [caster]);
        expect(a.knockback).toBeFalsy();
        expect(a.canAct()).toBe(false);
    });

    it('ends the cast before the pulled enemy lands', () => {
        const caster = makeCaster();
        const a = makeUnit('a', 130, SHARED_Y, 'enemy');
        const units = [caster, a];
        const { engine } = makeEngine(units);
        cast(caster, engine);

        const castEnd = COLLAPSE_PREFIRE_TIME + COLLAPSE_RELEASE_DURATION + COLLAPSE_COOLDOWN_DURATION;
        advance(units, engine, castEnd - 0.03, [caster]);
        expect(caster.activeAbilities).toHaveLength(1);

        advance(units, engine, 0.06, [caster]);
        expect(caster.activeAbilities).toHaveLength(0);
        // Landing is still ~0.1s away.
        expect(a.knockback).toBeTruthy();
    });

    it('spawns delayed arrival effects at each landing slot', () => {
        const caster = makeCaster();
        const a = makeUnit('a', 130, SHARED_Y, 'enemy');
        const units = [caster, a];
        const { engine, effects } = makeEngine(units);

        cast(caster, engine);
        advance(units, engine, AFTER_RELEASE, [caster]);

        const types = effects.map((e) => e.effectType);
        expect(types).toEqual(expect.arrayContaining(['ConeCollapse', 'TetherRibbon', 'HowlShockwave', 'TerrainImpact']));
        for (const e of effects.filter((x) => x.effectType === 'HowlShockwave' || x.effectType === 'TerrainImpact')) {
            expect(e.delay).toBe(COLLAPSE_FLING_DURATION);
        }
    });

    it('never staggers an armoured boss', () => {
        const caster = makeCaster();
        const boss = makeUnit('boss', 130, SHARED_Y, 'enemy');
        boss.ccArmour.hardFloor = 3;
        boss.ccArmour.bonusHard = 0;
        boss.ccArmour.chainResist = 0;
        const units = [caster, boss];
        const { engine } = makeEngine(units);

        cast(caster, engine);
        advance(units, engine, AFTER_LANDING, [caster]);

        expect(boss.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
        expect(boss.canAct()).toBe(true);
    });

    it('on an Exposed boss, extends Exposed (suppressed event) instead of staggering', () => {
        const caster = makeCaster();
        const boss = makeUnit('boss', 130, SHARED_Y, 'enemy');
        boss.ccArmour.hardFloor = 3;
        boss.ccArmour.bonusHard = 0;
        boss.ccArmour.chainResist = 0;
        boss.addBuff(new ExposedBuff(5), 0, 1);
        const units = [caster, boss];
        const { engine } = makeEngine(units);
        const suppressed = vi.fn();
        engine.eventBus.on('boss_exposed_cc_suppressed', suppressed);

        cast(caster, engine);
        advance(units, engine, AFTER_RELEASE, [caster]);

        expect(boss.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
        expect(boss.hasBuff(EXPOSED_BUFF_TYPE)).toBe(true);
        expect(suppressed).toHaveBeenCalled();
    });

    it('an interrupt during windup refunds gravity and has no effect', () => {
        const caster = makeCaster();
        const a = makeUnit('a', 130, SHARED_Y, 'enemy');
        const units = [caster, a];
        const { engine, effects } = makeEngine(units);
        const gravity = caster.resources.find((r) => r instanceof Gravity) as Gravity;

        cast(caster, engine);
        advance(units, engine, COLLAPSE_PREFIRE_TIME / 2, [caster]);
        interruptUnitAbilities(caster, engine);
        advance(units, engine, AFTER_LANDING, [caster]);

        expect(gravity.current).toBe(START_GRAVITY);
        expect(a.hp).toBe(100);
        expect(a.x).toBeCloseTo(130, 5);
        expect(a.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
        expect(effects).toHaveLength(0);
    });
});
