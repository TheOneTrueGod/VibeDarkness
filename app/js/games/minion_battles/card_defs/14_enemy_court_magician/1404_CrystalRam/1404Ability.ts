/**
 * Crystal Ram - a Court Magician crystal's own attack, only ever cast on his command (Crystal Volley).
 * The crystal shivers in place while a red lane grows toward its target, then rams down the lane,
 * hurting everyone it crosses, and stays wherever it stops. A plain ChargeAttack: same windup,
 * capsule telegraph and blocking rules as the boar's charge.
 */

import { ChargeAttack } from '../../../abilities/templates/ChargeAttack';
import { COURT_ORCHID, CRYSTAL_RAM_ABILITY_ID } from '../courtMagicianConstants';
import IMAGE from './crystalRam.svg?raw';

export const CRYSTAL_RAM_DAMAGE = 5;
export const CRYSTAL_RAM_WINDUP_SEC = 0.9;
export const CRYSTAL_RAM_LUNGE_SEC = 0.35;
export const CRYSTAL_RAM_RANGE = 260;

const crystalRam = new ChargeAttack({
    id: CRYSTAL_RAM_ABILITY_ID,
    name: 'Crystal Ram',
    image: IMAGE,
    damage: CRYSTAL_RAM_DAMAGE,
    windupTime: CRYSTAL_RAM_WINDUP_SEC,
    lungeDuration: CRYSTAL_RAM_LUNGE_SEC,
    cooldownDuration: 0.3,
    baseMaxRange: CRYSTAL_RAM_RANGE,
    // Never picked by AI on its own: crystals only ram when the magician orders it.
    aiMaxRange: 0,
    capsuleRadiusMultiplier: 1.4,
    preview: { color: COURT_ORCHID, width: 16 },
    effectType: 'CollisionClash',
    effectDuration: 0.25,
    tooltipText: `Ram toward a target, dealing {${CRYSTAL_RAM_DAMAGE}} damage to each enemy crossed`,
    maxUses: 1,
    aiNinjutsu: { ignore: true },
});

export const CrystalRamAbility_1404 = crystalRam;
export const CrystalRamCard_1404 = crystalRam.cardDef;
