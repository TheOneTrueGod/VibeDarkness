import { describe, it, expect } from 'vitest';
import { Unit } from '../game/units/Unit';
import type { Effect } from '../game/effects/Effect';
import type { ActiveAbility } from '../game/types';
import type { AbilityStatic } from './Ability';
import { AbilityPhase } from './abilityTimings';
import { defineMeleeStrike } from './archetypes/defineMeleeStrike';
import {
    detectAndFreezeTelegraphDistanceBreak,
    initTelegraphCastPayload,
    lockTelegraphOnTargetEvade,
    updateTelegraphTracking,
    type TelegraphCastPayload,
} from './telegraphTracking';
import { LOCK_ON_TETHER_EXTRA } from './targetLockTracking';

function createUnit(config: {
    id: string;
    x: number;
    y: number;
    teamId: 'player' | 'enemy';
    hp?: number;
    activeAbilities?: ActiveAbility[];
}): Unit {
    const unit = new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        hp: config.hp ?? 100,
        maxHp: config.hp ?? 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.id,
        abilities: [],
    });
    if (config.activeAbilities) {
        unit.activeAbilities.push(...config.activeAbilities);
    }
    return unit;
}

const biteAbility = defineMeleeStrike({
    id: 'test_bite',
    name: 'Test Bite',
    image: '',
    damage: 2,
    range: 30,
    thickness: 20,
    windupDuration: 0.6,
    telegraph: { kind: 'shrinkingCircle', startRadius: 18, color: 0xff0000 },
    getTooltipText: () => ['bite'],
});

// windupDuration 0.6 + default activeDuration 0.1 => 'strike' spans [0.6, 0.7); prefireTime is 0.6.
// A second Active-phase interval ('strike2') is appended so it survives applyCoopTailSplit
// intact (its own end defines the tail boundary) — a plain trailing Cooldown interval id would
// get renamed by the coop-tail split, so it isn't safe to reference from trackTargetUntilLabel.
const trackUntilStrikeFiresAbility: AbilityStatic = {
    ...defineMeleeStrike({
        id: 'test_bite_track_until_fire',
        name: 'Test Bite (track until fire)',
        image: '',
        damage: 2,
        range: 30,
        thickness: 20,
        windupDuration: 0.6,
        telegraph: { kind: 'shrinkingCircle', startRadius: 18, color: 0xff0000 },
        getTooltipText: () => ['bite'],
    }),
    trackTargetUntilLabel: 'strike2',
    abilityTimings: [
        { id: 'windup', start: 0, end: 0.6, abilityPhase: AbilityPhase.Windup },
        { id: 'strike', start: 0.6, end: 0.7, abilityPhase: AbilityPhase.Active },
        { id: 'strike2', start: 0.7, end: 0.8, abilityPhase: AbilityPhase.Active },
    ],
};

function makeEngine(units: Unit[]) {
    const spawnedEffects: Effect[] = [];
    return {
        units,
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: (e: Effect) => { spawnedEffects.push(e); },
        gameTime: 0,
        spawnedEffects,
    };
}

describe('telegraphTracking', () => {
    it('initTelegraphCastPayload stores unitId when trackTarget is enabled', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 10, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);

        const payload = initTelegraphCastPayload(
            biteAbility,
            [{ type: 'unit', unitId: 'target' }],
            engine as never,
        );

        expect(payload).toEqual({
            telegraphTargetX: 40,
            telegraphTargetY: 10,
            telegraphTargetUnitId: 'target',
            telegraphLockedPosition: null,
        });
    });

    it('initTelegraphCastPayload omits unitId for pixel targets', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const engine = makeEngine([caster]);

        const payload = initTelegraphCastPayload(
            biteAbility,
            [{ type: 'pixel', position: { x: 50, y: 20 } }],
            engine as never,
        );

        expect(payload).toEqual({
            telegraphTargetX: 50,
            telegraphTargetY: 20,
        });
        expect(payload?.telegraphTargetUnitId).toBeUndefined();
    });

    it('updateTelegraphTracking follows live target movement during windup', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);
        const active: ActiveAbility = {
            abilityId: biteAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'target' }],
            castPayload: {
                telegraphTargetX: 40,
                telegraphTargetY: 0,
                telegraphTargetUnitId: 'target',
                telegraphLockedPosition: null,
            },
            evadeFired: false,
        };

        target.x = 55;
        target.y = 12;
        updateTelegraphTracking(caster, active, biteAbility, 0.2, engine as never);

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphTargetX).toBe(55);
        expect(payload.telegraphTargetY).toBe(12);
        expect(payload.telegraphLockedPosition).toBeNull();
        expect(engine.spawnedEffects).toHaveLength(0);
    });

    it('detectAndFreezeTelegraphDistanceBreak locks and spawns Dodged when target exceeds tether', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);
        const active: ActiveAbility = {
            abilityId: biteAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'target' }],
            castPayload: {
                telegraphTargetX: 40,
                telegraphTargetY: 0,
                telegraphTargetUnitId: 'target',
                telegraphLockedPosition: null,
            },
            evadeFired: false,
        };

        target.x = 50 + LOCK_ON_TETHER_EXTRA + 1;
        detectAndFreezeTelegraphDistanceBreak(caster, active, biteAbility, 0.2, engine as never);

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphLockedPosition).toEqual({ x: target.x, y: target.y });
        expect(payload.telegraphTargetX).toBe(target.x);
        expect(engine.spawnedEffects).toHaveLength(1);
    });

    it('updateTelegraphTracking is idempotent after lock', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 200, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);
        const locked = { x: 131, y: 0 };
        const active: ActiveAbility = {
            abilityId: biteAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'target' }],
            castPayload: {
                telegraphTargetX: locked.x,
                telegraphTargetY: locked.y,
                telegraphTargetUnitId: 'target',
                telegraphLockedPosition: locked,
            },
            evadeFired: false,
        };

        target.x = 999;
        updateTelegraphTracking(caster, active, biteAbility, 0.2, engine as never);

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphTargetX).toBe(locked.x);
        expect(payload.telegraphTargetY).toBe(locked.y);
        expect(engine.spawnedEffects).toHaveLength(0);
    });

    it('lockTelegraphOnTargetEvade freezes telegraph at dodge snapshot', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const dodger = createUnit({ id: 'dodger', x: 40, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, dodger]);
        const active: ActiveAbility = {
            abilityId: biteAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'dodger' }],
            castPayload: {
                telegraphTargetX: 40,
                telegraphTargetY: 0,
                telegraphTargetUnitId: 'dodger',
                telegraphLockedPosition: null,
            },
            evadeFired: false,
        };

        lockTelegraphOnTargetEvade(
            caster,
            active,
            biteAbility,
            'dodger',
            { x: 42, y: 5 },
            0.1,
            engine as never,
        );

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphLockedPosition).toEqual({ x: 42, y: 5 });
        expect(engine.spawnedEffects).toHaveLength(1);
    });

    it('does not update after windup ends', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);
        const active: ActiveAbility = {
            abilityId: biteAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'target' }],
            castPayload: {
                telegraphTargetX: 40,
                telegraphTargetY: 0,
                telegraphTargetUnitId: 'target',
                telegraphLockedPosition: null,
            },
            evadeFired: false,
        };

        target.x = 99;
        updateTelegraphTracking(caster, active, biteAbility, biteAbility.prefireTime, engine as never);

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphTargetX).toBe(40);
    });

    it('trackTargetUntilLabel extends tracking past prefireTime up to the labelled interval', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);
        const active: ActiveAbility = {
            abilityId: trackUntilStrikeFiresAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'target' }],
            castPayload: {
                telegraphTargetX: 40,
                telegraphTargetY: 0,
                telegraphTargetUnitId: 'target',
                telegraphLockedPosition: null,
            },
            evadeFired: false,
        };

        // Past prefireTime (0.6, the default cutoff) but before 'cooldown' starts (0.7).
        target.x = 99;
        updateTelegraphTracking(caster, active, trackUntilStrikeFiresAbility, 0.65, engine as never);

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphTargetX).toBe(99);
    });

    it('trackTargetUntilLabel stops updating once the labelled interval starts', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 0, teamId: 'enemy' });
        const engine = makeEngine([caster, target]);
        const active: ActiveAbility = {
            abilityId: trackUntilStrikeFiresAbility.id,
            startTime: 0,
            targets: [{ type: 'unit', unitId: 'target' }],
            castPayload: {
                telegraphTargetX: 40,
                telegraphTargetY: 0,
                telegraphTargetUnitId: 'target',
                telegraphLockedPosition: null,
            },
            evadeFired: false,
        };

        target.x = 99;
        updateTelegraphTracking(caster, active, trackUntilStrikeFiresAbility, 0.7, engine as never);

        const payload = active.castPayload as TelegraphCastPayload;
        expect(payload.telegraphTargetX).toBe(40);
    });
});
