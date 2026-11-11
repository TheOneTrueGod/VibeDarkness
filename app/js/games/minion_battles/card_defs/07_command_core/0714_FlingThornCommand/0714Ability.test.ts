import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../../../abilities/targeting';
import { isSelectTargetDef } from '../../../abilities/timingTargetDef';
import { Unit } from '../../../game/units/Unit';
import { petStateOf } from '../../../game/units/components/petComponent';
import { FLING_THORN_ABILITY_ID, FLING_THORN_MAX_DISTANCE } from '../0705_FlingThorn/0705Ability';
import { FLING_THORN_COMMAND_ID, FlingThornCommandAbility_0714 } from './0714Ability';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { ActiveAbility, BattleOrder, ResolvedTarget } from '../../../game/types';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import { OrderManager } from '../../../game/managers/OrderManager';
import type { EngineContext } from '../../../game/EngineContext';

/** Dog Bite (0701), the spirit's AI bite. */
const DOG_BITE_ID = '0701';

function makeUnit(id: string, x: number, y: number, characterId: string): Unit {
    return new Unit({ id, x, y, hp: 100, maxHp: 100, speed: 100, teamId: 'player', ownerId: 'p1', characterId, name: id });
}

describe('Fling Thorns command 0714', () => {
    it('aims round the spirit: an anchored select clamped to the thorn range', () => {
        const ability = getAbility(FLING_THORN_COMMAND_ID)!;
        const defs = getInteractiveTargetDefsFromTimings(ability);
        expect(defs).toHaveLength(1);
        const def = defs[0]!;
        expect(isSelectTargetDef(def)).toBe(true);
        if (isSelectTargetDef(def)) {
            expect(def.anchorUnit).toBe('casterPet');
            expect(def.maxRangeFromAnchor).toBe(FLING_THORN_MAX_DISTANCE);
        }
        expect(ability.abilitySource).toEqual({ type: 'pet', selector: 'nearest', requireFree: true });
    });

    it("orders the owner's spirit to fire Fling Thorns at the picked point", () => {
        const owner = makeUnit('owner', 0, 0, 'hero');
        const spirit = makeUnit('spirit', 60, 0, 'dog');
        petStateOf(spirit).ownerUnitId = owner.id;
        petStateOf(spirit).defId = 'dog';
        const queued: { tick: number; order: { unitId: string; abilityId: string; targets: ResolvedTarget[] } }[] = [];
        const engine = {
            units: [owner, spirit],
            gameTick: 10,
            gameTime: 0,
            getUnit: (id: string) => [owner, spirit].find((u) => u.id === id),
            state: {
                orderMgr: {
                    queueOrder: (tick: number, order: { unitId: string; abilityId: string; targets: ResolvedTarget[] }) => {
                        queued.push({ tick, order });
                    },
                },
            },
        };
        const aim: ResolvedTarget = { type: 'pixel', position: { x: 160, y: 40 } };
        const interval = FlingThornCommandAbility_0714.abilityTimings[0] as { castBehaviours: { behaviour: { onTick?: (c: CastBehaviourTickContext) => void } }[] };
        interval.castBehaviours[0]!.behaviour.onTick?.({
            caster: owner, abilityId: FLING_THORN_COMMAND_ID, target: aim, allTargets: [aim], castPayload: {},
            behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
            windowProgress: 0, prevWindowProgress: 0, isFirstTick: true, isLastTick: true,
        } as unknown as CastBehaviourTickContext);
        expect(queued).toHaveLength(1);
        expect(queued[0]!.tick).toBe(11);
        expect(queued[0]!.order.unitId).toBe('spirit');
        expect(queued[0]!.order.abilityId).toBe(FLING_THORN_ABILITY_ID);
        expect(queued[0]!.order.targets).toEqual([aim]);
        expect((queued[0]!.order as BattleOrder).castPriority).toBe(CAST_PRIORITY.Major);
    });

    it('preempts a bite: the spirit drops the bite and starts Fling Thorns', () => {
        const s = spiritScene();
        startCast(s.spirit, DOG_BITE_ID, 0);
        s.command();
        expect(s.queued).toHaveLength(1);

        s.orderMgr.applyOrderLogic(s.queued[0]!);

        expect(s.spirit.activeAbilities.map((a) => a.abilityId)).toEqual([FLING_THORN_ABILITY_ID]);
        expect(s.spirit.activeAbilities[0]!.castPriority).toBe(CAST_PRIORITY.Major);
        expect(s.emit).toHaveBeenCalledWith('cast_ended_early', expect.objectContaining({
            unitId: 'spirit', abilityId: DOG_BITE_ID, reason: 'preempted',
        }));
    });

    it('is dropped, with no charge granted, while the spirit is winding up a commanded Fling Thorns', () => {
        const s = spiritScene();
        startCast(s.spirit, FLING_THORN_ABILITY_ID, 0, CAST_PRIORITY.Major);
        const runtimeBefore = JSON.stringify(s.spirit.abilityRuntime);

        s.command();

        expect(s.queued).toEqual([]);
        expect(JSON.stringify(s.spirit.abilityRuntime)).toBe(runtimeBefore);
    });
});

function startCast(unit: Unit, abilityId: string, startTime: number, castPriority?: number): void {
    unit.activeAbilities.push({
        abilityId, startTime, targets: [], castBehaviourPayloads: {}, evadeFired: false, comboCount: 1,
        ...(castPriority !== undefined ? { castPriority } : {}),
    } as ActiveAbility);
}

/** Owner + spirit on a stub engine with a real OrderManager; `command()` runs the card's instant at gameTime 0.1. */
function spiritScene() {
    const owner = makeUnit('owner', 0, 0, 'hero');
    const spirit = makeUnit('spirit', 60, 0, 'dog');
    spirit.abilities.push(DOG_BITE_ID, FLING_THORN_ABILITY_ID);
    petStateOf(spirit).ownerUnitId = owner.id;
    petStateOf(spirit).defId = 'dog';
    const units = [owner, spirit];
    const queued: BattleOrder[] = [];
    const emit = vi.fn();
    const engine = {
        units,
        gameTick: 10,
        gameTime: 0.1,
        eventBus: { emit, on: vi.fn(), off: vi.fn() },
        getUnit: (id: string) => units.find((u) => u.id === id),
        mixOrderFingerprint: vi.fn(),
        trackAbilityUse: vi.fn(),
        addEffect: vi.fn(),
        state: { orderMgr: { queueOrder: (_tick: number, order: BattleOrder) => { queued.push(order); } } },
    };
    const orderMgr = new OrderManager(engine as unknown as EngineContext, () => {});
    const aim: ResolvedTarget = { type: 'pixel', position: { x: 160, y: 40 } };
    const interval = FlingThornCommandAbility_0714.abilityTimings[0] as { castBehaviours: { behaviour: { onTick?: (c: CastBehaviourTickContext) => void } }[] };
    const command = () => interval.castBehaviours[0]!.behaviour.onTick?.({
        caster: owner, abilityId: FLING_THORN_COMMAND_ID, target: aim, allTargets: [aim], castPayload: {},
        behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
        windowProgress: 0, prevWindowProgress: 0, isFirstTick: true, isLastTick: true,
    } as unknown as CastBehaviourTickContext);
    return { owner, spirit, queued, emit, orderMgr, command };
}
