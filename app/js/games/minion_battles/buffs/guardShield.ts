/**
 * Guard Shield preset: a refilling, timed shield linked to an exiled guardian spirit.
 * Every hit is reduced by `floor` (the shield refills to `floor` straight away), and several guard shields add.
 * When it expires, the linked spirit returns at the holder's position (`ShieldBuff.onBeforeExpire`).
 */

import { ShieldBuff, type ShieldBuffSource, type ShieldResourceTrickle } from './ShieldBuff';
import { BUFF_PARTICLE_AURA_PRESETS } from '../game/effects/buffParticleAura';

export interface GuardShieldParams {
    /** HP the shield refills to after every hit (the damage reduction per hit). */
    floor: number;
    /** How long the shield lasts, in world seconds. */
    seconds: number;
    /** Id of the exiled spirit returned when the shield ends. */
    guardianUnitId: string;
    /** Current `engine.gameTime`; the shield expires at `gameTime + seconds`. */
    gameTime: number;
    /** Who granted it, so blocks fire the granting ability's ON_BLOCK_SUCCESS rules. */
    source?: ShieldBuffSource | null;
    /** Resource paid out over the shield's duration (e.g. Kinship back to the Guard's caster). */
    resourceTrickle?: ShieldResourceTrickle | null;
}

export function createGuardShield(params: GuardShieldParams): ShieldBuff {
    return new ShieldBuff(params.floor, 0, 'command', 0, params.source ?? null, {
        refillFloor: params.floor,
        expiresAtGameTime: params.gameTime + params.seconds,
        linkedExiledUnitId: params.guardianUnitId,
        particleAura: BUFF_PARTICLE_AURA_PRESETS.spiritMotes(),
        resourceTrickle: params.resourceTrickle ?? null,
    });
}
