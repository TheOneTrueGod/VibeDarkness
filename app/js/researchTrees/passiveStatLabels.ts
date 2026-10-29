import { PassiveStatKey } from './types';

/** Player-facing names for passive research stats. Shared by the Stat Bonuses tab and research hover previews. */
export const PASSIVE_STAT_LABELS: Record<PassiveStatKey, string> = {
    [PassiveStatKey.MaxHealth]: 'Max Health',
    [PassiveStatKey.MaxHunger]: 'Max Hunger',
    [PassiveStatKey.AllDamage]: 'All Damage',
    [PassiveStatKey.EarthDamage]: 'Earth Damage',
    [PassiveStatKey.PetMaxHealth]: 'Pet Max Health',
    [PassiveStatKey.Ability0701Damage]: 'Dog Bite Damage',
    [PassiveStatKey.MaxMovementPoints]: 'Max Movement Points',
    [PassiveStatKey.MovementRegenPerRound]: 'Movement Regen / Round',
    [PassiveStatKey.LightRegenEnabled]: 'Light Regen',
    [PassiveStatKey.EnemyUnitSlimeMaxHealthBonus]: 'Enemy Slime Max Health',
    [PassiveStatKey.EnemyUnitSlimeExtraProjectiles]: 'Enemy Slime Extra Projectiles',
};
