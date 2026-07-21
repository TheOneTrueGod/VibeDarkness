import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { DEFAULT_HEAL_PENALTY_PCT } from '../../../game/units/unitHeal';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { getSelectTargetDefsFromTimings, resolveSelectTargetLockOnCandidates } from '../../../abilities/targeting';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import {
    BLOOD_MAGE_ALLY_SPLASH_DAMAGE,
    BLOOD_MAGE_ALLY_SPLASH_MAX_TARGETS,
    BLOOD_MAGE_ALLY_SPLASH_RADIUS,
} from '../../../abilities/bloodMageAllySplash';
import {
    BLOOD_MEND_HEAL_AMOUNT,
    BLOOD_MEND_HP_COST,
    BLOOD_MEND_WINDUP_DURATION,
    BloodMendAbility_0301,
} from './0301Ability';

const CARD_ID = BloodMendAbility_0301.id;
const TICK_DT = 0.01;
// Just past the windup->active boundary, so the active-frame CastBehaviour fires exactly once.
const ACTIVE_TICK_ADVANCE = BLOOD_MEND_WINDUP_DURATION + 0.02;

function makeCaster(hp: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 50,
        y: 100,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.abilityRuntime[CARD_ID] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    return unit;
}

function makeAlly(id: string, hp: number): Unit {
    return new Unit({
        id,
        x: 100,
        y: 100,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeEnemy(id: string, x: number, y: number, hp = 100): Unit {
    return new Unit({
        id,
        x,
        y,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'ai',
        characterId: 'enemy',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeEngine(units: Unit[]): EngineContext {
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
    } as unknown as EngineContext;
}

function targetsFor(target: Unit): ResolvedTarget[] {
    return [{ type: 'unit', unitId: target.id }];
}

function advanceSimulation(caster: Unit, engine: EngineContext, totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
    }
}

describe('BloodMendAbility_0301', () => {
    it('self-cast nets +15 HP, with the HP cost paid before the heal lands (same tick)', () => {
        // Started well below max so the heal's own hpInjury max-HP clamp doesn't shave off
        // any of the healed amount (see unitHeal.test.ts) — isolates the cost/heal ordering.
        const caster = makeCaster(50);
        const engine = makeEngine([caster]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(caster), engine);

        // Nothing happens during windup — cost + heal are both deferred to the active frame.
        advanceSimulation(caster, engine, BLOOD_MEND_WINDUP_DURATION - 0.1);
        expect(caster.hp).toBe(50);

        advanceSimulation(caster, engine, 0.12);
        // -5 (hpCost) then +20 (heal), applied in the same active-frame tick.
        expect(caster.hp).toBe(50 + BLOOD_MEND_HEAL_AMOUNT - BLOOD_MEND_HP_COST);
    });

    it('ally-cast heals the ally for +20 (banking hpInjury) and costs the caster -5 HP', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        expect(caster.hp).toBe(100 - BLOOD_MEND_HP_COST);
        expect(ally.hp).toBe(50 + BLOOD_MEND_HEAL_AMOUNT);
        expect(ally.hpInjury).toBeCloseTo(BLOOD_MEND_HEAL_AMOUNT * DEFAULT_HEAL_PENALTY_PCT);
    });

    it('active frame deals splash damage to up to 4 nearest enemies around the ally', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        // Ally at (100,100). Four near enemies + one farther-in-circle + one outside radius.
        const near = [
            makeEnemy('e1', 120, 100), // 20px
            makeEnemy('e2', 100, 130), // 30px
            makeEnemy('e3', 140, 100), // 40px
            makeEnemy('e4', 100, 150), // 50px
        ];
        const fifthInCircle = makeEnemy('e5', 160, 100); // 60px — in radius but 5th-closest
        const outside = makeEnemy('far', 100 + BLOOD_MAGE_ALLY_SPLASH_RADIUS + 20, 100);
        const engine = makeEngine([caster, ally, ...near, fifthInCircle, outside]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        for (const enemy of near) {
            expect(enemy.hp).toBe(100 - BLOOD_MAGE_ALLY_SPLASH_DAMAGE);
        }
        expect(fifthInCircle.hp).toBe(100);
        expect(outside.hp).toBe(100);
        expect(ally.hp).toBe(50 + BLOOD_MEND_HEAL_AMOUNT);
        expect(BLOOD_MAGE_ALLY_SPLASH_MAX_TARGETS).toBe(4);
    });

    it("floorAtOne: casting at hp<=5 still succeeds and clamps the caster at exactly 1 HP", () => {
        const caster = makeCaster(3);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        // Cast was not blocked despite hp(3) <= hpCost(5) — floorAtOne only gates the UI, not the engine.
        expect(caster.activeAbilities.some((a) => a.abilityId === CARD_ID)).toBe(true);

        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        expect(caster.hp).toBe(1);
        expect(ally.hp).toBe(50 + BLOOD_MEND_HEAL_AMOUNT);
    });

    it('click-based targeting lets the caster select themselves and other allies, never enemies', () => {
        // Regression: UnitRangeHitboxSpec/filterSelectTargetCandidates used to hard-exclude
        // the caster from candidates, so a self-castable filter:'ally' step could never
        // resolve a click on the caster themselves through the real click-resolution path.
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 100);
        const enemy = new Unit({
            id: 'enemy', x: 50, y: 250, hp: 100, maxHp: 100, speed: 100,
            teamId: 'enemy' as TeamId, ownerId: 'ai', characterId: 'enemy', name: 'enemy',
            radius: DEFAULT_UNIT_RADIUS,
        });
        const engine = makeEngine([caster, ally, enemy]);
        const selectDef = getSelectTargetDefsFromTimings(BloodMendAbility_0301, caster, engine)[0]!;

        const clickOnSelf = resolveSelectTargetLockOnCandidates(
            BloodMendAbility_0301, caster, selectDef, { x: caster.x, y: caster.y }, engine,
        );
        expect(clickOnSelf.map((u) => u.id)).toEqual([caster.id]);

        const clickOnAlly = resolveSelectTargetLockOnCandidates(
            BloodMendAbility_0301, caster, selectDef, { x: ally.x, y: ally.y }, engine,
        );
        expect(clickOnAlly.map((u) => u.id)).toEqual([ally.id]);

        const clickOnEnemy = resolveSelectTargetLockOnCandidates(
            BloodMendAbility_0301, caster, selectDef, { x: enemy.x, y: enemy.y }, engine,
        );
        expect(clickOnEnemy).toEqual([]);
    });

    it('shows no_uses_remaining after one cast and recharges after a round boundary', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);

        const runtime = caster.abilityRuntime[CARD_ID]!;
        expect(runtime.currentUses).toBe(0);
        expect(getAbilityDisabledReason({
            playerUnit: caster,
            ability: BloodMendAbility_0301,
            abilityId: CARD_ID,
            currentUses: runtime.currentUses,
            isMyTurn: true,
            allUnits: [caster, ally],
            conditionalCancelContext: null,
        })).toEqual({ reason_id: 'no_uses_remaining' });

        caster.grantRoundCharges();
        expect(runtime.currentUses).toBe(1);
    });
});
