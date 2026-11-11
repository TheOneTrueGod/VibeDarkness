/**
 * Pounce (0702) chains into Spirit Flurry (0711) as a follow-up: Flurry keeps Pounce's stamped cast priority
 * and replaces the Pounce cast (`BattleOrder.followUpOf`, see game/units/castPriority.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { Unit } from '../../../game/units/Unit';
import { petStateOf } from '../../../game/units/components/petComponent';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { BattleOrder, ResolvedTarget } from '../../../game/types';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import { OrderManager } from '../../../game/managers/OrderManager';
import type { EngineContext } from '../../../game/EngineContext';
import type { TeamId } from '../../../game/teams';
import { SicEmAbility } from '../0704_SicEm/0704Ability';
import { SPIRIT_FLURRY_ABILITY_ID } from '../0711_SpiritFlurry/0711Ability';
import { PounceAbility } from './0702Ability';

type HitCallback = (hitUnit: Unit, ctx: CastBehaviourTickContext) => void;

function makeUnit(id: string, x: number, y: number, characterId: string, teamId: TeamId = 'player'): Unit {
    return new Unit({ id, x, y, hp: 100, maxHp: 100, speed: 100, teamId, ownerId: 'p1', characterId, name: id });
}

function tickCtx(caster: Unit, abilityId: string, target: ResolvedTarget, engine: unknown): CastBehaviourTickContext {
    return {
        caster, abilityId, target, allTargets: [target], castPayload: {},
        behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
        windowProgress: 0, prevWindowProgress: 0, isFirstTick: true, isLastTick: true,
    } as unknown as CastBehaviourTickContext;
}

describe('Pounce 0702 → Spirit Flurry 0711', () => {
    it("Sic 'em → Pounce → Spirit Flurry: Flurry is stamped Major and Pounce is ended", () => {
        const owner = makeUnit('owner', 0, 0, 'hero');
        const spirit = makeUnit('spirit', 60, 0, 'dog');
        const enemy = makeUnit('enemy', 120, 0, 'target_dummy', 'enemy');
        spirit.abilities.push(PounceAbility.id, SPIRIT_FLURRY_ABILITY_ID);
        petStateOf(spirit).ownerUnitId = owner.id;
        petStateOf(spirit).defId = 'dog';
        const units = [owner, spirit, enemy];
        const queued: BattleOrder[] = [];
        const emit = vi.fn();
        const engine = {
            units,
            gameTick: 10,
            gameTime: 0.1,
            roundNumber: 1,
            eventBus: { emit, on: vi.fn(), off: vi.fn() },
            getUnit: (id: string) => units.find((u) => u.id === id),
            mixOrderFingerprint: vi.fn(),
            trackAbilityUse: vi.fn(),
            addEffect: vi.fn(),
            state: { orderMgr: { queueOrder: (_tick: number, order: BattleOrder) => { queued.push(order); } } },
        };
        const orderMgr = new OrderManager(engine as unknown as EngineContext, () => {});
        const aim: ResolvedTarget = { type: 'pixel', position: { x: 120, y: 0 } };

        // Sic 'em's instant queues a Major Pounce on the spirit.
        const sicEm = SicEmAbility.abilityTimings[0] as { castBehaviours: { behaviour: { onTick?: (c: CastBehaviourTickContext) => void } }[] };
        sicEm.castBehaviours[0]!.behaviour.onTick?.(tickCtx(owner, SicEmAbility.id, aim, engine));
        expect(queued).toHaveLength(1);
        orderMgr.applyOrderLogic(queued.shift()!);
        expect(spirit.activeAbilities.map((a) => a.abilityId)).toEqual([PounceAbility.id]);
        expect(spirit.activeAbilities[0]!.castPriority).toBe(CAST_PRIORITY.Major);

        // Mid-dash, the first hit locks on and queues Spirit Flurry as Pounce's follow-up.
        engine.gameTime = 0.4;
        const dash = PounceAbility.abilityTimings[1] as unknown as { behaviour: { _onHitCallback: HitCallback } };
        dash.behaviour._onHitCallback(enemy, tickCtx(spirit, PounceAbility.id, aim, engine));
        expect(queued).toHaveLength(1);
        expect(queued[0]).toMatchObject({
            unitId: 'spirit', abilityId: SPIRIT_FLURRY_ABILITY_ID, castPriority: CAST_PRIORITY.Major, followUpOf: PounceAbility.id,
        });

        engine.gameTick = 11;
        orderMgr.applyOrderLogic(queued.shift()!);

        expect(spirit.activeAbilities.map((a) => a.abilityId)).toEqual([SPIRIT_FLURRY_ABILITY_ID]);
        expect(spirit.activeAbilities[0]!.castPriority).toBe(CAST_PRIORITY.Major);
        expect(emit).toHaveBeenCalledWith('cast_ended_early', expect.objectContaining({
            unitId: 'spirit', abilityId: PounceAbility.id, reason: 'preempted',
        }));
    });
});
