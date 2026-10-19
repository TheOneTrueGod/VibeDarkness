import { BLEED_BUFF_TYPE } from '../../buffs/BleedBuff';
import type { Unit } from '../../game/units/Unit';
import { damageEnemiesInCircle } from '../targetHelpers';
import type { KeywordDef } from './keywordTypes';

/** How far around the Rend centre (px) bleeding enemies are hit. */
export const REND_RADIUS = 70;

/**
 * Rend N: deals N damage to nearby bleeding enemies. Tooltip/glossary def only; the centre is
 * ability-specific (e.g. Blood Mend / Protect rend around the targeted ally), so abilities call
 * `applyRend` from their own cast timing.
 */
export const rendKeyword: KeywordDef = {
    id: 'rend',
    displayName: 'Rend',
    formatTooltip: (n) => `Rend ${n}`,
    describe: (n) => `Deals {${n}} damage to nearby bleeding enemies.`,
};

export function isBleeding(unit: Unit): boolean {
    return unit.hasBuff(BLEED_BUFF_TYPE);
}

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
