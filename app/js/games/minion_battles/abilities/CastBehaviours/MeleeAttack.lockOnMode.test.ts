import { describe, expect, it } from 'vitest';
import { Unit } from '../../game/units/Unit';
import { EventBus } from '../../game/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { MeleeAttackBehaviour } from './MeleeAttack';
import { perpendicularSwingHitbox } from '../../hitboxes';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';

const SWING = perpendicularSwingHitbox(40, 80, 26, 2);

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy' = 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: 'test',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function runImpact(
    behaviour: MeleeAttackBehaviour,
    caster: Unit,
    units: Unit[],
    lockedIds: string[],
    aim: { x: number; y: number },
): string[] {
    const hitIds: string[] = [];
    behaviour
        .withHitbox(SWING)
        .withImpactAt(0)
        .withDamage((_ctx, unit) => {
            hitIds.push(unit.id);
            return 0;
        });

    const allTargets = [
        ...lockedIds.map((unitId) => ({ type: 'unit' as const, unitId })),
        { type: 'pixel' as const, position: aim },
    ];
    const eventBus = new EventBus();
    const engine = {
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
        gameTime: 0,
        eventBus,
        addEffect: () => undefined,
        requestHitPause: () => undefined,
    };

    let payload: unknown;
    behaviour.onSetup({
        caster,
        target: allTargets[0]!,
        allTargets,
        engine: engine as never,
        abilityId: 'test_melee',
        setBehaviourPayload: (p: unknown) => {
            payload = p;
        },
        behaviourPayload: undefined,
    } as never);

    const ctx = {
        caster,
        target: allTargets[0]!,
        allTargets,
        engine,
        abilityId: 'test_melee',
        behaviourPayload: payload,
        setBehaviourPayload: (p: unknown) => {
            payload = p;
            (ctx as { behaviourPayload: unknown }).behaviourPayload = p;
        },
        isFirstTick: true,
        prevWindowProgress: 0,
        windowProgress: 1,
    } as unknown as CastBehaviourTickContext;

    behaviour.onTick(ctx);
    return hitIds;
}

describe('MeleeAttackBehaviour lockOnMode', () => {
    const caster = makeUnit('caster', 0, 0, 'player');
    // Aim east; bar centered near x=40.
    const aim = { x: 40, y: 0 };

    it('tether mode still hits a locked unit outside the swing shape but inside tether', () => {
        // Far enough to miss the perpendicular bar, still within hitbox.maxRange + tether.
        const lockedOutside = makeUnit('locked', 90, 80);
        const behaviour = new MeleeAttackBehaviour().withLockOnMode('tether');
        const hits = runImpact(behaviour, caster, [caster, lockedOutside], ['locked'], aim);
        expect(hits).toContain('locked');
    });

    it('strict mode drops a locked unit that left the shape and fills with an in-shape unit', () => {
        const lockedOutside = makeUnit('locked', 90, 80);
        const inShape = makeUnit('filler', 40, 0);
        const behaviour = new MeleeAttackBehaviour().withLockOnMode('strictHitbox');
        const hits = runImpact(
            behaviour,
            caster,
            [caster, lockedOutside, inShape],
            ['locked'],
            aim,
        );
        expect(hits).toEqual(['filler']);
    });
});
