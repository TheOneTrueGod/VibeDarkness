import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { updateUnit } from '../../../game/units/unitMovementTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getSelectTargetDefsFromTimings, resolveSelectTargetLockOnCandidates } from '../../../abilities/targeting';
import { TimeManager } from '../../../game/time/TimeManager';
import { collectUnitFocalRequests, getActorTempo } from '../../../game/time/actorClock';
import { buffFromJSON } from '../../../buffs/buffRegistry';
import {
    TIME_DILATION_BUFF_TYPE,
    TIME_DILATION_PRESETS,
    type TimeDilationBuff,
} from '../../../buffs/TimeDilationBuff';
import { Gravity } from '../../../resources/Gravity';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import { EASE_BURDENS_GRAVITY_COST, EASE_BURDENS_PREFIRE_TIME } from '../gravityConstants';
import { EaseBurdensAbility } from './0906Ability';

const CARD_ID = EaseBurdensAbility.id;
const TICK_DT = 0.01;
const ACTIVE_TICK_ADVANCE = EASE_BURDENS_PREFIRE_TIME + 0.02;

function makeCaster(): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 50,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
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
    const gravity = new Gravity();
    gravity.add(EASE_BURDENS_GRAVITY_COST + 5);
    gravity.attach(unit, new EventBus());
    unit.resources.push(gravity);
    return unit;
}

function makeAlly(id: string, teamId: TeamId = 'player'): Unit {
    return new Unit({
        id,
        x: 100,
        y: 100,
        hp: 80,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: 'player',
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

function advanceSimulation(units: Unit[], engine: EngineContext, totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        for (const unit of units) {
            tickUnitActiveAbilities(unit, TICK_DT, engine, vi.fn());
            updateUnit(unit, TICK_DT, engine);
        }
    }
}

function dilation(unit: Unit): TimeDilationBuff | undefined {
    return unit.buffs.find((b) => b._type === TIME_DILATION_BUFF_TYPE) as TimeDilationBuff | undefined;
}

/** World pace the engine would resolve this tick from the units' focal requests. */
function worldPaceFor(units: Unit[]): number {
    const tm = new TimeManager();
    tm.resolveWorldPace(collectUnitFocalRequests(units), 1);
    return tm.worldPace;
}

describe('EaseBurdensAbility', () => {
    it('casting on an ally applies a focal tempo-2 time dilation buff', () => {
        const caster = makeCaster();
        const ally = makeAlly('ally');
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, EaseBurdensAbility, targetsFor(ally), engine);
        advanceSimulation([caster, ally], engine, ACTIVE_TICK_ADVANCE);

        const buff = dilation(ally);
        expect(buff).toBeDefined();
        expect(buff?.timeModifier.tempo).toBe(TIME_DILATION_PRESETS.focalHaste2x.tempo);
        expect(buff?.timeModifier.focal).toBeDefined();
        expect(buff?.duration).toEqual({ value: 3, unit: 'seconds' });
        expect(dilation(caster)).toBeUndefined();
    });

    it('drops world pace to 0.5 and gives the ally tempo 2 while active', () => {
        const caster = makeCaster();
        const ally = makeAlly('ally');
        const engine = makeEngine([caster, ally]);
        expect(worldPaceFor([caster, ally])).toBe(1);

        executeUnitAbility(caster, EaseBurdensAbility, targetsFor(ally), engine);
        advanceSimulation([caster, ally], engine, ACTIVE_TICK_ADVANCE);

        expect(getActorTempo(ally)).toBe(2);
        expect(getActorTempo(caster)).toBe(1);
        expect(worldPaceFor([caster, ally])).toBe(0.5);
    });

    it('expires after 3 world seconds and pace returns to 1', () => {
        const caster = makeCaster();
        const ally = makeAlly('ally');
        const engine = makeEngine([caster, ally]);

        executeUnitAbility(caster, EaseBurdensAbility, targetsFor(ally), engine);
        advanceSimulation([caster, ally], engine, ACTIVE_TICK_ADVANCE);
        const appliedAt = dilation(ally)!.appliedAtTime;

        advanceSimulation([caster, ally], engine, 3 - (engine.gameTime - appliedAt) - 0.1);
        expect(dilation(ally)).toBeDefined();

        advanceSimulation([caster, ally], engine, 0.2);
        expect(dilation(ally)).toBeUndefined();
        expect(getActorTempo(ally)).toBe(1);
        expect(worldPaceFor([caster, ally])).toBe(1);
    });

    it('can target self, and re-casting from the same source refreshes instead of stacking', () => {
        const caster = makeCaster();
        const engine = makeEngine([caster]);

        executeUnitAbility(caster, EaseBurdensAbility, targetsFor(caster), engine);
        advanceSimulation([caster], engine, ACTIVE_TICK_ADVANCE);
        expect(getActorTempo(caster)).toBe(2);

        const firstAppliedAt = dilation(caster)!.appliedAtTime;
        caster.abilityRuntime[CARD_ID]!.currentUses = 1;
        executeUnitAbility(caster, EaseBurdensAbility, targetsFor(caster), engine);
        advanceSimulation([caster], engine, 1 + ACTIVE_TICK_ADVANCE);

        expect(caster.buffs.filter((b) => b._type === TIME_DILATION_BUFF_TYPE)).toHaveLength(1);
        expect(dilation(caster)!.appliedAtTime).toBeGreaterThan(firstAppliedAt);
        expect(getActorTempo(caster)).toBe(2);
    });

    it('buff round-trips through JSON', () => {
        const caster = makeCaster();
        const ally = makeAlly('ally');
        const engine = makeEngine([caster, ally]);
        executeUnitAbility(caster, EaseBurdensAbility, targetsFor(ally), engine);
        advanceSimulation([caster, ally], engine, ACTIVE_TICK_ADVANCE);

        const original = dilation(ally)!;
        const restored = buffFromJSON(JSON.parse(JSON.stringify(original.toJSON()))) as TimeDilationBuff;
        expect(restored.timeModifier).toEqual(original.timeModifier);
        expect(restored.duration).toEqual(original.duration);
        expect(restored.appliedAtTime).toBe(original.appliedAtTime);
    });

    it('click-based targeting selects self and allies, never enemies', () => {
        const caster = makeCaster();
        const ally = makeAlly('ally');
        const enemy = makeAlly('enemy', 'enemy' as TeamId);
        enemy.y = 250;
        const engine = makeEngine([caster, ally, enemy]);
        const selectDef = getSelectTargetDefsFromTimings(EaseBurdensAbility, caster, engine)[0]!;
        const pick = (u: Unit) => resolveSelectTargetLockOnCandidates(
            EaseBurdensAbility, caster, selectDef, { x: u.x, y: u.y }, engine,
        ).map((c) => c.id);

        expect(pick(caster)).toEqual([caster.id]);
        expect(pick(ally)).toEqual([ally.id]);
        expect(pick(enemy)).toEqual([]);
    });
});
