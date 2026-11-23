/**
 * Displacement Strike card (0715): commands the nearest free spirit that owns 0716 to split at the picked point.
 * Clones (pets without 0716) are never the source, nor the anchor the aim is clamped round.
 */
import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { clampSelectTarget, getInteractiveTargetDefsFromTimings, petAnchorOptionsOf, resolveCasterPetAnchor } from '../../../abilities/targeting';
import { isSelectTargetDef, type SelectTargetDef } from '../../../abilities/timingTargetDef';
import { resolveAbilitySourceUnits } from '../../../abilities/abilitySourceUnits';
import { Unit } from '../../../game/units/Unit';
import { petStateOf } from '../../../game/units/components/petComponent';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import type { ActiveAbility, BattleOrder, ResolvedTarget } from '../../../game/types';
import { DISPLACEMENT_STRIKE_PET_ABILITY_ID } from '../0716_DisplacementStrikePet/0716Ability';
import { DISPLACEMENT_STRIKE_RANGE, DisplacementStrikeAbility } from './0715Ability';

const CARD_ID = DisplacementStrikeAbility.id;

function makeUnit(id: string, x: number, y: number, characterId: string): Unit {
    return new Unit({ id, x, y, hp: 100, maxHp: 100, speed: 100, teamId: 'player', ownerId: 'p1', characterId, name: id });
}

function petOf(owner: Unit, id: string, x: number, y: number, abilities: string[]): Unit {
    const pet = makeUnit(id, x, y, 'dog');
    pet.abilities.push(...abilities);
    petStateOf(pet).ownerUnitId = owner.id;
    petStateOf(pet).defId = 'dog';
    petStateOf(owner).unitIds.push(pet.id);
    return pet;
}

/** A commanded Displacement Strike split on the pet: Major, so the pet is busy. */
function makeBusy(pet: Unit): void {
    pet.activeAbilities.push({
        abilityId: DISPLACEMENT_STRIKE_PET_ABILITY_ID, startTime: 0, targets: [], castBehaviourPayloads: {},
        evadeFired: false, comboCount: 1, castPriority: CAST_PRIORITY.Major,
    } as ActiveAbility);
}

/** Owner + the given pets on a stub engine; `command(aim)` runs the card's instant at gameTime 0.1. */
function scene(pets: (owner: Unit) => Unit[]) {
    const owner = makeUnit('owner', 0, 0, 'hero');
    const units = [owner, ...pets(owner)];
    const queued: BattleOrder[] = [];
    const engine = {
        units,
        gameTick: 10,
        gameTime: 0.1,
        getUnit: (id: string) => units.find((u) => u.id === id),
        state: { orderMgr: { queueOrder: (_tick: number, order: BattleOrder) => { queued.push(order); } } },
    };
    const interval = DisplacementStrikeAbility.abilityTimings[0] as { castBehaviours: { behaviour: { onTick?: (c: CastBehaviourTickContext) => void } }[] };
    const command = (aim: ResolvedTarget) => interval.castBehaviours[0]!.behaviour.onTick?.({
        caster: owner, abilityId: CARD_ID, target: aim, allTargets: [aim], castPayload: {},
        behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
        windowProgress: 0, prevWindowProgress: 0, isFirstTick: true, isLastTick: true,
    } as unknown as CastBehaviourTickContext);
    return { owner, units, queued, engine, command };
}

const AIM: ResolvedTarget = { type: 'pixel', position: { x: 120, y: 40 } };

describe('Displacement Strike card 0715', () => {
    it('aims round the spirit and only sources pets that own 0716', () => {
        const ability = getAbility(CARD_ID)!;
        const defs = getInteractiveTargetDefsFromTimings(ability);
        expect(defs).toHaveLength(1);
        const def = defs[0]!;
        expect(isSelectTargetDef(def)).toBe(true);
        if (isSelectTargetDef(def)) {
            expect(def.anchorUnit).toBe('casterPet');
            expect(def.maxRangeFromAnchor).toBe(DISPLACEMENT_STRIKE_RANGE);
        }
        expect(ability.abilitySource).toEqual({
            type: 'pet', selector: 'nearest', requireFree: true, requiresAbilityId: DISPLACEMENT_STRIKE_PET_ABILITY_ID,
        });
    });

    it('queues 0716 on the free spirit at the target', () => {
        const s = scene((owner) => [petOf(owner, 'spirit', 60, 0, ['0701', DISPLACEMENT_STRIKE_PET_ABILITY_ID])]);
        s.command(AIM);
        expect(s.queued).toHaveLength(1);
        expect(s.queued[0]!.unitId).toBe('spirit');
        expect(s.queued[0]!.abilityId).toBe(DISPLACEMENT_STRIKE_PET_ABILITY_ID);
        expect(s.queued[0]!.targets).toEqual([AIM]);
        expect(s.queued[0]!.castPriority).toBe(CAST_PRIORITY.Major);
    });

    it('fizzles with no free spirit', () => {
        let spirit!: Unit;
        const s = scene((owner) => {
            spirit = petOf(owner, 'spirit', 60, 0, ['0701', DISPLACEMENT_STRIKE_PET_ABILITY_ID]);
            return [spirit];
        });
        makeBusy(spirit);
        s.command(AIM);
        expect(s.queued).toEqual([]);

        const alone = scene(() => []);
        alone.command(AIM);
        expect(alone.queued).toEqual([]);
    });

    it('skips a nearer free clone without 0716 in favour of the real spirit', () => {
        const s = scene((owner) => [
            // The clone is nearer both the aim point and the owner.
            petOf(owner, 'clone', 100, 30, ['0701', '0702']),
            petOf(owner, 'spirit', -200, 0, ['0701', '0702', DISPLACEMENT_STRIKE_PET_ABILITY_ID]),
        ]);
        const ability = getAbility(CARD_ID)!;
        expect(resolveAbilitySourceUnits(ability, s.owner, s.units, AIM.position, s.engine).map((u) => u.id)).toEqual(['spirit']);
        // Without the filter the clone would win.
        const unfiltered = { abilitySource: { type: 'pet' as const, selector: 'nearest' as const, requireFree: true as const } };
        expect(resolveAbilitySourceUnits(unfiltered, s.owner, s.units, AIM.position, s.engine).map((u) => u.id)).toEqual(['clone']);

        s.command(AIM);
        expect(s.queued.map((o) => o.unitId)).toEqual(['spirit']);

        // The aim is clamped round the real spirit too, not the clone.
        expect(resolveCasterPetAnchor(s.owner, s.engine, { ...petAnchorOptionsOf(ability), requireFree: true })?.id).toBe('spirit');
        const def = getInteractiveTargetDefsFromTimings(ability)[0] as SelectTargetDef;
        const clamped = clampSelectTarget(ability, s.owner, def, {}, [], { type: 'pixel', position: { x: 400, y: 0 } }, s.engine);
        expect(clamped.position).toEqual({ x: -200 + DISPLACEMENT_STRIKE_RANGE, y: 0 });
    });
});
