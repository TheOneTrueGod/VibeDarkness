/**
 * Shared cast pieces for the Armory's Create abilities.
 * `startConjureCast` drops any held weapon and starts the orbit of `weaponKind` pictures.
 * `equipConjuredWeaponAtEnd` swaps the weapon in when the conjure window closes.
 */
import type { Unit } from '../../game/units/Unit';
import { Effect } from '../../game/effects/Effect';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import type { CastBehaviour } from '../../abilities/castBehaviourTypes';
import { equipConjuredWeapon, releaseHeldConjuredWeapon } from '../../game/conjuredWeapons/runtime';
import { getConjuredWeaponDef } from '../../game/conjuredWeapons/registry';
import { CONJURE_SWORD_EFFECT_TYPE, CREATE_SWORD_CAST_DURATION } from './armoryConstants';

export function startConjureCast(engine: unknown, caster: Unit, weaponKind: string): void {
    const ctx = engine as AbilityEngineContext;
    if (caster.heldConjuredWeapon) {
        releaseHeldConjuredWeapon(caster, ctx, { leaveToken: true });
    }
    ctx.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: CREATE_SWORD_CAST_DURATION,
        effectType: CONJURE_SWORD_EFFECT_TYPE,
        timeDomain: 'owner',
        ownerActorId: caster.id,
        pauseBehaviour: 'hold',
        effectData: { followOwner: true, weaponKind },
    }));
}

export function equipConjuredWeaponAtEnd(weaponId: string): CastBehaviour {
    return CastBehaviours.Instant((ctx) => {
        const def = getConjuredWeaponDef(weaponId);
        if (!def) return;
        equipConjuredWeapon(ctx.caster, def, ctx.engine);
    }, { at: 'end' });
}
