import { isBleeding } from '../../buffs/bleedRuntime';
import type { Unit } from '../../game/units/Unit';
import { damageEnemiesInCircle } from '../targetHelpers';
import { REND_RADIUS } from './rendKeyword';

/** Rend N around `center`: N damage to every bleeding enemy of `caster` within `REND_RADIUS`. */
export function applyRend(
    engine: Parameters<typeof damageEnemiesInCircle>[0]['engine'],
    caster: Unit,
    center: { x: number; y: number },
    n: number,
    abilityId: string,
): void {
    damageEnemiesInCircle({
        engine,
        caster,
        center,
        radius: REND_RADIUS,
        damage: n,
        abilityId,
        attackType: 'ranged',
        filter: isBleeding,
    });
}
