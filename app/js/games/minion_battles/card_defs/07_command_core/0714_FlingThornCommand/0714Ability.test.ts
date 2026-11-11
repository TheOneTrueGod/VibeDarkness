import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../../../abilities/targeting';
import { isSelectTargetDef } from '../../../abilities/timingTargetDef';
import { Unit } from '../../../game/units/Unit';
import { petStateOf } from '../../../game/units/components/petComponent';
import { FLING_THORN_ABILITY_ID, FLING_THORN_MAX_DISTANCE } from '../0705_FlingThorn/0705Ability';
import { FLING_THORN_COMMAND_ID, FlingThornCommandAbility_0714 } from './0714Ability';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { ResolvedTarget } from '../../../game/types';

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
        expect(ability.abilitySource).toEqual({ type: 'pet', selector: 'nearest' });
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
    });
});
