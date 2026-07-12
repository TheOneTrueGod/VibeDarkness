import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import {
    BURST_ACTIVE_DURATION,
    BURST_DAMAGE,
    BURST_HP_COST,
    BURST_MAX_TARGETS,
    BURST_WINDUP_DURATION,
    BurstAbility_0302,
} from './0302Ability';

const CARD_ID = BurstAbility_0302.id;
const TICK_DT = 0.01;
// MeleeAttack's impact fires at ~40% of the active window's progress (impactAt default), so
// advance past the whole active window (not just its start) to guarantee the hit lands.
const ACTIVE_TICK_ADVANCE = BURST_WINDUP_DURATION + BURST_ACTIVE_DURATION + 0.02;

function makeCaster(hp: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 0,
        y: 0,
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
        currentUses: 3,
        maxUses: 3,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    return unit;
}

function makeEnemy(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'enemy_ai',
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

// Aim straight along +x (angle 0) — dummies placed at angle 0 are dead-center in the cone.
function aimTarget(distance: number): ResolvedTarget[] {
    return [{ type: 'pixel', position: { x: distance, y: 0 } }];
}

function advanceSimulation(caster: Unit, engine: EngineContext, totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
    }
}

describe('BurstAbility_0302', () => {
    it('deals damage to dummies inside the cone/range and leaves dummies outside untouched', () => {
        const caster = makeCaster(100);
        // Inside cone (angle 0, in range).
        const inCone = makeEnemy('inCone', 150, 0);
        // Outside the arc: 90 degrees off-axis, well outside the 60-degree total arc.
        const outsideAngle = makeEnemy('outsideAngle', 0, 150);
        // Outside range: on-axis but beyond BURST_RANGE.
        const outsideRange = makeEnemy('outsideRange', 10000, 0);
        const engine = makeEngine([caster, inCone, outsideAngle, outsideRange]);

        executeUnitAbility(caster, BurstAbility_0302, aimTarget(150), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        expect(inCone.hp).toBe(100 - BURST_DAMAGE);
        expect(outsideAngle.hp).toBe(100);
        expect(outsideRange.hp).toBe(100);
    });

    it('hits at most BURST_MAX_TARGETS enemies when more are in the cone', () => {
        const caster = makeCaster(100);
        const enemies: Unit[] = [];
        for (let i = 0; i < BURST_MAX_TARGETS + 3; i++) {
            // Spread them along the aim axis at slightly different ranges, all well within the cone.
            enemies.push(makeEnemy(`e${i}`, 60 + i * 5, 0));
        }
        const engine = makeEngine([caster, ...enemies]);

        executeUnitAbility(caster, BurstAbility_0302, aimTarget(150), engine);
        advanceSimulation(caster, engine, ACTIVE_TICK_ADVANCE);

        const hitCount = enemies.filter((e) => e.hp < 100).length;
        expect(hitCount).toBe(BURST_MAX_TARGETS);
    });

    it('is disabled (cannot_afford / hp) at hp<=5 and castable at hp=6', () => {
        const lowHpCaster = makeCaster(5);
        const okCaster = makeCaster(6);

        expect(getAbilityDisabledReason({
            playerUnit: lowHpCaster,
            ability: BurstAbility_0302,
            abilityId: CARD_ID,
            currentUses: 3,
            isMyTurn: true,
            allUnits: [lowHpCaster, okCaster],
            conditionalCancelContext: null,
        })).toEqual({ reason_id: 'cannot_afford', resourceId: 'hp' });

        expect(getAbilityDisabledReason({
            playerUnit: okCaster,
            ability: BurstAbility_0302,
            abilityId: CARD_ID,
            currentUses: 3,
            isMyTurn: true,
            allUnits: [lowHpCaster, okCaster],
            conditionalCancelContext: null,
        })).toBeNull();
    });

    it('deducts BURST_HP_COST from the caster on cast', () => {
        const caster = makeCaster(100);
        const inCone = makeEnemy('inCone', 150, 0);
        const engine = makeEngine([caster, inCone]);

        executeUnitAbility(caster, BurstAbility_0302, aimTarget(150), engine);
        // Not paid yet during windup.
        advanceSimulation(caster, engine, BURST_WINDUP_DURATION - 0.1);
        expect(caster.hp).toBe(100);

        advanceSimulation(caster, engine, 0.12);
        expect(caster.hp).toBe(100 - BURST_HP_COST);
    });
});
