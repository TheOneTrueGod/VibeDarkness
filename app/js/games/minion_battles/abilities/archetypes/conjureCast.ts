/**
 * Shared cast pieces for abilities that conjure a held weapon.
 * `startConjureCast` drops any held weapon and starts the orbit of `weaponKind` pictures.
 * `equipConjuredWeaponAtEnd` swaps the weapon in when the conjure window closes.
 * `defineConjure` uses both; other archetypes (e.g. a conjured shield on `defineDirectionalShield`)
 * call them as hooks.
 */
import type { Unit } from '../../game/units/Unit';
import { Effect } from '../../game/effects/Effect';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { CastBehaviours } from '../CastBehaviours';
import type { CastBehaviour } from '../castBehaviourTypes';
import { equipConjuredWeapon, releaseHeldConjuredWeapon } from '../../game/conjuredWeapons/runtime';
import { getConjuredWeaponDef } from '../../game/conjuredWeapons/registry';
import { WEAPON_ORBIT_EFFECT_TYPE } from '../../game/effect_defs/weaponEffects';

/** Shape of the conjure orbit. Omitted fields use the orbit effect's `DEFAULT_WEAPON_ORBIT_*`. */
export interface ConjureOrbitShape {
    count?: number;
    /** Pixels from the caster at the widest point. */
    radius?: number;
    turns?: number;
    /** Share of the effect spent fading in and out. */
    fadePortion?: number;
    /** Pixi scale of each picture. */
    scale?: number;
}

export interface ConjureOrbitConfig extends ConjureOrbitShape {
    /** Seconds the orbit lasts; normally the conjure window. */
    duration: number;
}

export function startConjureCast(engine: unknown, caster: Unit, weaponKind: string, orbit: ConjureOrbitConfig): void {
    const ctx = engine as AbilityEngineContext;
    if (caster.heldConjuredWeapon) {
        releaseHeldConjuredWeapon(caster, ctx, { leaveToken: true });
    }
    ctx.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: orbit.duration,
        effectType: WEAPON_ORBIT_EFFECT_TYPE,
        timeDomain: 'owner',
        ownerActorId: caster.id,
        pauseBehaviour: 'hold',
        effectData: {
            followOwner: true,
            weaponKind,
            ...(orbit.count !== undefined ? { count: orbit.count } : {}),
            ...(orbit.radius !== undefined ? { radius: orbit.radius } : {}),
            ...(orbit.turns !== undefined ? { turns: orbit.turns } : {}),
            ...(orbit.fadePortion !== undefined ? { fadePortion: orbit.fadePortion } : {}),
            ...(orbit.scale !== undefined ? { scale: orbit.scale } : {}),
        },
    }));
}

export function equipConjuredWeaponAtEnd(weaponId: string): CastBehaviour {
    return CastBehaviours.Instant((ctx) => {
        const def = getConjuredWeaponDef(weaponId);
        if (!def) return;
        equipConjuredWeapon(ctx.caster, def, ctx.engine);
    }, { at: 'end' });
}
