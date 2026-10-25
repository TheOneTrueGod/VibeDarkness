/**
 * Unit tests for the Charge cast behaviour: lunge movement, path hits with de-duplication, origin
 * capture, last-tick handling and note clearing. Driven with hand-built tick contexts.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../../game/units/Unit';
import type { TeamId } from '../../game/teams';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { ActiveAbility } from '../../game/types';
import { createCharge, type ChargeNoteLike } from './ChargeBehaviour';
import { DarkWolfBiteAbility } from '../../card_defs/dark_animals/0003_DarkWolfBite/0003Ability';
import { AlphaWolfTripleChargeAbility } from '../../card_defs/dark_animals/0011_AlphaWolfTripleCharge/0011Ability';
import { normalizeAbilityTimingsToIntervals } from '../abilityTimings';
import { ChargeAttack } from '../templates/ChargeAttack';
import { MultiChargeAttack } from '../templates/MultiChargeAttack';

const RANGE = 100;
const DURATION = 0.4;

function makeUnit(id: string, teamId: string, x: number, y = 0): Unit {
    return new Unit({
        id, x, y, hp: 100, maxHp: 100, speed: 100,
        teamId: teamId as TeamId, ownerId: teamId === 'enemy' ? 'ai' : 'p1', characterId: 'player', name: id,
    });
}

function makeEngine(units: Unit[]): AbilityEngineContext {
    return {
        units,
        gameTime: 5,
        roundNumber: 1,
        eventBus: { emit: () => {} },
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
        generateRandomInteger: () => 0,
    } as unknown as AbilityEngineContext;
}

function makeNote(): ChargeNoteLike {
    return {
        lungeStartX: 0, lungeStartY: 0, targetX: 500, targetY: 0, chargeDirX: 1, chargeDirY: 0, hitTargetIds: [],
    };
}

function tick(
    caster: Unit,
    engine: AbilityEngineContext,
    note: unknown,
    windowProgress: number,
    prevWindowProgress: number,
    extra: Partial<CastBehaviourTickContext> = {},
): CastBehaviourTickContext {
    return {
        caster,
        abilityId: 'test_charge',
        target: { type: 'pixel', position: { x: 500, y: 0 } },
        allTargets: [],
        castPayload: note,
        behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine,
        windowProgress,
        prevWindowProgress,
        isFirstTick: prevWindowProgress <= 0 && windowProgress > 0,
        isLastTick: windowProgress >= 1,
        ...extra,
    };
}

function baseConfig(note: ChargeNoteLike | null, damage = 3, capsule = 1) {
    return {
        maxRange: RANGE,
        lungeDuration: DURATION,
        capsuleRadiusMultiplier: capsule,
        damage,
        getNote: () => note,
    };
}

describe('ChargeBehaviour', () => {
    it('moves the caster along the lunge and captures the lunge origin once', () => {
        const caster = makeUnit('c', 'player', 10);
        const engine = makeEngine([caster]);
        const note = makeNote();
        const charge = createCharge(baseConfig(note));
        charge.onTick(tick(caster, engine, note, 0.5, 0.25));
        expect(note.lungeOriginX).toBe(10);
        expect(caster.x).toBeCloseTo(10 + RANGE * 0.5);
        charge.onTick(tick(caster, engine, note, 1, 0.5));
        expect(note.lungeOriginX).toBe(10);
        expect(caster.x).toBeCloseTo(10 + RANGE);
    });

    it('starts the first tick segment behind the origin when the tick straddled the windup end', () => {
        const caster = makeUnit('c', 'player', 0);
        const victim = makeUnit('v', 'enemy', -5);
        const engine = makeEngine([caster, victim]);
        const note = makeNote();
        const charge = createCharge(baseConfig(note, 3, 0.5));
        // dt = 0.2 of a 0.4 window: the tick began half a window before the lunge, 50px behind the origin.
        charge.onTick(tick(caster, engine, note, 0.1, 0, { localDt: 0.2 }));
        expect(note.hitTargetIds).toEqual(['v']);
    });

    it('damages each enemy on the path once, never allies or the caster', () => {
        const caster = makeUnit('c', 'player', 0);
        const enemy = makeUnit('e', 'enemy', 50);
        const ally = makeUnit('a', 'player', 60);
        const engine = makeEngine([caster, enemy, ally]);
        const note = makeNote();
        const hits: string[] = [];
        const charge = createCharge(baseConfig(note, 7)).withOnHit((u) => hits.push(u.id));
        charge.onTick(tick(caster, engine, note, 0.75, 0));
        charge.onTick(tick(caster, engine, note, 1, 0.75));
        expect(enemy.hp).toBe(93);
        expect(ally.hp).toBe(100);
        expect(note.hitTargetIds).toEqual(['e']);
        expect(hits).toEqual(['e']);
    });

    it('skips ticks with no note', () => {
        const caster = makeUnit('c', 'player', 0);
        const engine = makeEngine([caster]);
        const charge = createCharge(baseConfig(null));
        charge.onTick(tick(caster, engine, undefined, 0.5, 0.25));
        expect(caster.x).toBe(0);
    });

    it('can skip the last tick, then runs onEnd', () => {
        const caster = makeUnit('c', 'player', 0);
        const engine = makeEngine([caster]);
        const note = makeNote();
        let ended = 0;
        const charge = createCharge(baseConfig(note))
            .withAdvanceOnLastTick(false)
            .withOnEnd(() => { ended++; });
        charge.onTick(tick(caster, engine, note, 0.9, 0.8));
        const before = caster.x;
        charge.onTick(tick(caster, engine, note, 1, 0.9));
        expect(caster.x).toBe(before);
        expect(ended).toBe(1);
    });

    it('clears the ability note and castPayload on the last tick', () => {
        const caster = makeUnit('c', 'player', 0);
        const engine = makeEngine([caster]);
        const note = makeNote();
        const active = { abilityId: 'test_charge', startTime: 0, targets: [], castPayload: note } as ActiveAbility;
        caster.activeAbilities = [active];
        caster.setAbilityNote({ abilityId: 'test_charge', abilityNote: note });
        const charge = createCharge(baseConfig(note)).withClearNoteOnEnd();
        charge.onTick(tick(caster, engine, note, 0.5, 0.25));
        expect(active.castPayload).toBe(note);
        charge.onTick(tick(caster, engine, note, 1, 0.5));
        expect(active.castPayload).toBeUndefined();
        expect(caster.abilityNote).toBeNull();
    });
});

describe('charge templates compose Charge', () => {
    it('ChargeAttack attaches Charge to its lunge window', () => {
        expect(DarkWolfBiteAbility).toBeInstanceOf(ChargeAttack);
        const lunge = normalizeAbilityTimingsToIntervals(DarkWolfBiteAbility.abilityTimings).find((i) => i.id === 'lunge')!;
        expect(lunge.castBehaviours).toHaveLength(1);
        expect(lunge.castBehaviours![0]!.timingEnd).toBe('end');
    });

    it('MultiChargeAttack attaches Charge to every dash window', () => {
        expect(AlphaWolfTripleChargeAbility).toBeInstanceOf(MultiChargeAttack);
        const dashes = normalizeAbilityTimingsToIntervals(AlphaWolfTripleChargeAbility.abilityTimings)
            .filter((i) => i.id.startsWith('dash'));
        expect(dashes).toHaveLength(3);
        for (const d of dashes) expect(d.castBehaviours).toHaveLength(1);
    });
});
