/**
 * A unit held by another unit's cast (`CastBehaviour.getHeldUnitIds`) is busy: pet reactions skip it.
 * Regression: an owner's weapon hit mid Spirit Storm sent the pinned spirit off on Spirit Strike, and the
 * spin kept yanking it back to its storm point.
 */
import { describe, expect, it } from 'vitest';
import '../../abilities/AbilityRegistry';
import { Unit } from './Unit';
import { petStateOf } from './components/petComponent';
import { isUnitHeldByCast } from './castHold';
import { handlePetReactionsOnAttackHit, isPetBusy } from './petReactions';
import { PetRelocateBehaviour, PetSpinBehaviour } from '../../abilities/CastBehaviours/PetBehaviours';
import type { CastBehaviour } from '../../abilities/castBehaviourTypes';
import type { ActiveAbility } from '../types';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { AttackHitEvent } from '../EventBus';

function makeUnit(id: string, x: number, teamId: 'player' | 'enemy', characterId = 'target_dummy'): Unit {
    return new Unit({ id, x, y: 0, hp: 100, maxHp: 100, speed: 100, teamId, ownerId: teamId === 'player' ? 'p1' : 'ai', characterId, name: id });
}

function scene() {
    const owner = makeUnit('owner', 0, 'player', 'hero');
    const spirit = makeUnit('spirit', 60, 'player', 'dog');
    petStateOf(spirit).ownerUnitId = owner.id;
    petStateOf(spirit).defId = 'dog';
    petStateOf(owner).unitIds.push(spirit.id);
    spirit.abilities.push('0710');
    const enemy = makeUnit('enemy', 120, 'enemy');
    return { owner, spirit, enemy, units: [owner, spirit, enemy] };
}

/** Put a running sustained behaviour on the owner, holding the spirit through its payload. */
function hold(owner: Unit, behaviour: CastBehaviour, payload: unknown): void {
    const key = 'storm_1';
    const active = { abilityId: '0713', castBehaviourPayloads: { [key]: payload } } as unknown as ActiveAbility;
    owner.activeCastBehaviours.set(key, {
        entry: { timingStart: 'start', timingEnd: 'end', behaviour },
        intervalStart: 0, intervalEnd: 1, caster: owner, active,
    });
}

describe('units held by a cast', () => {
    it('a spinning or relocating pet is held, and busy; a free pet is not', () => {
        const a = scene();
        expect(isUnitHeldByCast(a.spirit, a.units)).toBe(false);
        expect(isPetBusy(a.spirit, a.units)).toBe(false);

        hold(a.owner, new PetSpinBehaviour(), { petId: 'spirit', cx: 60, cy: 0, seconds: 1.6 });
        expect(isUnitHeldByCast(a.spirit, a.units)).toBe(true);
        expect(isPetBusy(a.spirit, a.units)).toBe(true);
        expect(isUnitHeldByCast(a.enemy, a.units)).toBe(false);

        const b = scene();
        hold(b.owner, new PetRelocateBehaviour(), { petId: 'spirit', sx: 60, sy: 0, tx: 140, ty: 0 });
        expect(isUnitHeldByCast(b.spirit, b.units)).toBe(true);
    });

    it("an owner's weapon hit does not order a held spirit into Spirit Strike", () => {
        const { owner, spirit, units } = scene();
        owner.weaponAbilityIds.push('weapon');
        const queued: unknown[] = [];
        const engine = {
            units, gameTick: 10, gameTime: 0,
            getUnit: (id: string) => units.find((u) => u.id === id),
            state: { orderMgr: { queueOrder: (_tick: number, order: unknown) => { queued.push(order); } } },
        } as unknown as AbilityEngineContext;
        const hit = { sourceUnitId: owner.id, targetUnitId: 'enemy', abilityId: 'weapon' } as AttackHitEvent;

        handlePetReactionsOnAttackHit(engine, hit);
        expect(queued).toHaveLength(1); // free: it reacts

        queued.length = 0;
        hold(owner, new PetSpinBehaviour(), { petId: spirit.id, cx: 60, cy: 0, seconds: 1.6 });
        handlePetReactionsOnAttackHit(engine, hit);
        expect(queued).toEqual([]);
    });
});
