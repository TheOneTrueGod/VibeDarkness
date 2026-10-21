import { describe, expect, it, vi } from 'vitest';
import { applyBleedStack } from '../../../buffs/bleedRuntime';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { DEFAULT_HEAL_PENALTY_PCT } from '../../../game/units/unitHeal';
import { applyDamageToShields, getTotalShieldHp } from '../../../game/units/unitShield';
import { SHIELD_BUFF_TYPE, type ShieldBuff } from '../../../buffs/ShieldBuff';
import type { Effect } from '../../../game/effects/Effect';
import { bloodMistBurstEffectDef, bloodMistImpactEffectDef } from '../../../game/effect_defs/bloodMageEffects';
import type { IEffectDef } from '../../../game/effect_defs/types';
import { BLOOD_MIST_SUBDUED_REACH } from '../../../abilities/bloodMageVfx';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { getSelectTargetDefsFromTimings, resolveSelectTargetLockOnCandidates } from '../../../abilities/targeting';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import { BLOOD_MAGE_ALLY_SPLASH_RADIUS } from '../../../abilities/bloodMageAllySplash';
import {
    BLOOD_MEND_DECAY_HEAL_FRACTION,
    BLOOD_MEND_HP_COST,
    BLOOD_MEND_REND,
    BLOOD_MEND_SHIELD_DRAIN_PER_SECOND,
    BLOOD_MEND_SHIELD_HP,
    BLOOD_MEND_SHIELD_PER_REND_HIT,
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
        // The engine ticks buffs through the unit; do it directly so shields fade here too.
        for (const unit of engine.units) {
            for (const buff of unit.buffs) buff.onGameTick?.(unit, engine, TICK_DT);
        }
    }
}

function shieldOf(unit: Unit): ShieldBuff | undefined {
    return unit.buffs.find((b) => b._type === SHIELD_BUFF_TYPE) as ShieldBuff | undefined;
}

/** Furthest distance from the effect origin any circle drawn by `def` reaches, over its animation. */
function maxDrawnReach(def: IEffectDef, effectRadius: number): number {
    let reach = 0;
    for (let i = 0; i <= 100; i++) {
        const circles: { x: number; y: number; r: number }[] = [];
        const visual = {
            clear: () => undefined,
            fill: () => undefined,
            circle: (x: number, y: number, r: number) => circles.push({ x, y, r }),
        };
        const effect = { progress: i / 100, effectRadius, effectData: {} } as unknown as Effect;
        def.updateVisual!(visual as never, effect, {} as never);
        for (const c of circles) reach = Math.max(reach, Math.hypot(c.x, c.y) + c.r);
    }
    return reach;
}

describe('BloodMendAbility_0301', () => {
    it('grants a 30 HP blood shield with no bleeding enemies, and no direct heal', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        expect(caster.hp).toBe(100 - BLOOD_MEND_HP_COST);
        const shield = shieldOf(ally)!;
        expect(shield.theme).toBe('blood');
        expect(shield.remainingHp).toBeCloseTo(BLOOD_MEND_SHIELD_HP, 0);
        expect(shield.drainPerSecond).toBeCloseTo(BLOOD_MEND_SHIELD_DRAIN_PER_SECOND, 10);
        // Only the ~0.02s of decay since the active frame can have healed anything.
        expect(ally.hp).toBeLessThan(50.1);
    });

    it('self-cast pays the HP cost at the active frame and shields the caster', () => {
        const caster = makeCaster(50);
        const engine = makeEngine([caster]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(caster), engine);
        advanceSimulation(caster, engine, BLOOD_MEND_WINDUP_DURATION - 0.1);
        expect(shieldOf(caster)).toBeUndefined();
        expect(caster.hp).toBe(50);

        advanceSimulation(caster, engine, 0.12);
        expect(caster.hp).toBeGreaterThanOrEqual(50 - BLOOD_MEND_HP_COST);
        expect(caster.hp).toBeLessThan(50 - BLOOD_MEND_HP_COST + 0.2);
        expect(shieldOf(caster)).toBeDefined();
    });

    it('Rends around the ally: bleeding enemies in range take 4 and each adds 4 shield', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        // Ally at (100,100). Five bleeding enemies in the radius (no target cap), one healthy
        // enemy in the radius, and one bleeding enemy outside it.
        const bleedingNear = [
            makeEnemy('e1', 120, 100),
            makeEnemy('e2', 100, 130),
            makeEnemy('e3', 140, 100),
            makeEnemy('e4', 100, 150),
            makeEnemy('e5', 160, 100),
        ];
        const notBleeding = makeEnemy('clean', 80, 100);
        // Rend counts body overlap, so keep the far enemy's whole body outside the circle.
        const bleedingFar = makeEnemy('far', 100 + BLOOD_MAGE_ALLY_SPLASH_RADIUS + 60, 100);
        for (const enemy of [...bleedingNear, bleedingFar]) applyBleedStack(enemy, 0, 1, 1);
        const engine = makeEngine([caster, ally, ...bleedingNear, notBleeding, bleedingFar]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        for (const enemy of bleedingNear) {
            expect(enemy.hp).toBe(100 - BLOOD_MEND_REND);
        }
        expect(notBleeding.hp).toBe(100);
        expect(bleedingFar.hp).toBe(100);
        expect(getTotalShieldHp(ally)).toBeCloseTo(
            BLOOD_MEND_SHIELD_HP + BLOOD_MEND_SHIELD_PER_REND_HIT * bleedingNear.length,
            0,
        );
    });

    it('Rend resolves around the ally, not the caster', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const nearCasterOnly = makeEnemy('nearCaster', 50, 20);
        applyBleedStack(nearCasterOnly, 0, 1, 1);
        const engine = makeEngine([caster, ally, nearCasterOnly]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        expect(nearCasterOnly.hp).toBe(100);
        expect(getTotalShieldHp(ally)).toBeCloseTo(BLOOD_MEND_SHIELD_HP, 0);
    });

    it('the shield heals half of what fades, banking injury', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);
        const shield = shieldOf(ally)!;
        const shieldBefore = shield.remainingHp;
        const hpBefore = ally.hp;
        const injuryBefore = ally.hpInjury;

        advanceSimulation(caster, engine, 1);

        const decayed = shieldBefore - shield.remainingHp;
        expect(decayed).toBeGreaterThan(4);
        const healed = ally.hp - hpBefore;
        expect(healed).toBeCloseTo(decayed * BLOOD_MEND_DECAY_HEAL_FRACTION, 1);
        expect(ally.hpInjury - injuryBefore).toBeCloseTo(healed * DEFAULT_HEAL_PENALTY_PCT, 1);
    });

    it('damage absorbed by the shield heals nothing', () => {
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);
        const hpBefore = ally.hp;
        const injuryBefore = ally.hpInjury;

        const result = applyDamageToShields(ally, 10);

        expect(result.shieldAbsorbed).toBe(10);
        expect(ally.hp).toBe(hpBefore);
        expect(ally.hpInjury).toBe(injuryBefore);
    });

    it('shows Rend as a keyword line with its shield effect, and a brief tooltip', () => {
        const lines = BloodMendAbility_0301.getTooltipText();
        expect(lines).toContain(`{Rend ${BLOOD_MEND_REND}}: +{${BLOOD_MEND_SHIELD_PER_REND_HIT}} shield per enemy hit`);
        expect(lines.some((l) => l.includes(`{${BLOOD_MEND_SHIELD_HP}} blood shield`))).toBe(true);
        expect(lines.length).toBeLessThanOrEqual(4);
    });

    it('keeps its blood-mist circles within unit radius + 20 px', () => {
        const limit = DEFAULT_UNIT_RADIUS + BLOOD_MIST_SUBDUED_REACH + 1e-6;
        const caster = makeCaster(100);
        const ally = makeAlly('ally', 50);
        const engine = makeEngine([caster, ally]);
        executeUnitAbility(caster, BloodMendAbility_0301, targetsFor(ally), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        const spawned = (engine.addEffect as ReturnType<typeof vi.fn>).mock.calls.map(
            (c) => c[0] as Effect,
        );
        // windup burst, travel mist, impact flash
        expect(spawned).toHaveLength(3);
        for (const effect of spawned) {
            const def = effect.effectType === 'BloodMistImpact' ? bloodMistImpactEffectDef : bloodMistBurstEffectDef;
            expect(maxDrawnReach(def, effect.effectRadius ?? 0)).toBeLessThanOrEqual(limit);
        }
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
        expect(shieldOf(ally)).toBeDefined();
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
