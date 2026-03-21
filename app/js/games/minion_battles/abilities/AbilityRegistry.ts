/**
 * AbilityRegistry - Central map of all abilities keyed by ID.
 *
 * Import and register every ability here so that the rest of the
 * system can look them up by ID string.
 */

import type { AbilityStatic } from './Ability';
import { ThrowRock } from '../card_defs/0107_ThrowRock/0107Ability';
import { ThrowChargedRock } from '../card_defs/0108_ThrowChargedRock/0108Ability';
import { ThrowKnife } from '../card_defs/0109_ThrowKnife/0109Ability';
import { DodgeAbility } from '../card_defs/0101_Dodge/0101Ability';
import { EnemyArcherShotAbility } from '../card_defs/0001_EnemyArcherShot/0001Ability';
import { EnemyMeleeAttackAbility } from '../card_defs/0002_EnemyMeleeAttack/0002Ability';
import { PunchAbility } from '../card_defs/0102_Punch/0102Ability';
import { SwingBatAbility } from '../card_defs/0103_SwingBat/0103Ability';
import { LaserSwordAbility } from '../card_defs/0105_LaserSword/0105Ability';
import { DarkWolfBiteAbility } from '../card_defs/dark_animals/0003_DarkWolfBite/0003Ability';
import { AlphaWolfClawAbility } from '../card_defs/dark_animals/0004_AlphaWolfClaw/0004Ability';
import { AlphaWolfSummonAbility } from '../card_defs/dark_animals/0005_AlphaWolfSummon/0005Ability';
import { BoarChargeAbility } from '../card_defs/dark_animals/0006_BoarCharge/0006Ability';
import { RaiseShieldAbility } from '../card_defs/0104_RaiseShield/0104Ability';
import { LaserShieldAbility } from '../card_defs/0106_LaserShield/0106Ability';
import { ThrowTorchAbility } from '../card_defs/0501_ThrowTorch/0501Ability';
import { PistolAbility } from '../card_defs/0203_Pistol/0203Ability';
import { SMGAbility } from '../card_defs/0204_SMG/0204Ability';
import { ShotgunAbility } from '../card_defs/0205_Shotgun/0205Ability';
import { ShiningBlockAbility } from '../card_defs/0110_ShiningBlock/0110Ability';
import { BeastClawAbility } from '../card_defs/0511_BeastClaw/0511Ability';

const ABILITY_MAP: Map<string, AbilityStatic> = new Map();

function register(ability: AbilityStatic): void {
    if (!ability.getTargets) {
        ability.getTargets = () => ability.targets;
    }
    ABILITY_MAP.set(ability.id, ability);
}

// -- Register all abilities --
register(ThrowKnife);
register(ThrowRock);
register(ThrowChargedRock);
register(DodgeAbility);
register(EnemyArcherShotAbility);
register(EnemyMeleeAttackAbility);
register(PunchAbility);
register(SwingBatAbility);
register(LaserSwordAbility);
register(DarkWolfBiteAbility);
register(AlphaWolfClawAbility);
register(AlphaWolfSummonAbility);
register(BoarChargeAbility);
register(RaiseShieldAbility);
register(LaserShieldAbility);
register(ThrowTorchAbility);
register(PistolAbility);
register(SMGAbility);
register(ShotgunAbility);
register(ShiningBlockAbility);
register(BeastClawAbility);

/** Look up an ability by its ID. */
export function getAbility(id: string): AbilityStatic | undefined {
    return ABILITY_MAP.get(id);
}

/** Get all registered abilities. */
export function getAllAbilities(): AbilityStatic[] {
    return Array.from(ABILITY_MAP.values());
}

/** Check if an ability ID is registered. */
export function hasAbility(id: string): boolean {
    return ABILITY_MAP.has(id);
}
