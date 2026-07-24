/**
 * Starter DarknessStrength packages (darkness lane).
 * Magnitude words use DescriptiveValue (Medium ≈ 30%, Small ≈ 20%).
 */

import { DescriptiveValue } from '../../researchTrees/descriptiveValue';
import { PassiveStatKey } from '../../researchTrees/types';
import type { DarknessStrengthDef } from '../types';

/** Enemy maxHealth mult for `ds_enemy_hardened` (Medium / ~30%). */
export const DS_ENEMY_HARDENED_MAX_HEALTH_MULT = 1 + 0.3;

/** Enemy all_damage mult for `ds_enemy_fierce` (Small / ~20%). */
export const DS_ENEMY_FIERCE_ALL_DAMAGE_MULT = 1 + 0.2;

export const DS_ENEMY_HARDENED_ID = 'ds_enemy_hardened';
export const DS_ENEMY_FIERCE_ID = 'ds_enemy_fierce';
export const DS_SWARM_REINFORCEMENTS_ID = 'ds_swarm_reinforcements';

export const DS_SWARM_REINFORCEMENTS_CHARACTER_ID = 'swarmling';
export const DS_SWARM_REINFORCEMENTS_COUNT = 1;
/** Round-start placement for swarm reinforcements (map border, not darkness-restricted). */
export const DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR = 'edgeOfMap' as const;

const HARDENED_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#1a1020"/><path d="M12 5 L18 9 V15 L12 19 L6 15 V9 Z" fill="#4b5563" stroke="#9ca3af" stroke-width="1"/></svg>';

const FIERCE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#1a1020"/><path d="M7 16 L12 5 L17 16 Z" fill="#b91c1c"/><path d="M9 16 L12 10 L15 16 Z" fill="#f97316"/></svg>';

const SWARM_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#0d0024"/><circle cx="8" cy="10" r="2.2" fill="#6b21a8"/><circle cx="14" cy="8" r="1.8" fill="#6b21a8"/><circle cx="16" cy="14" r="2" fill="#6b21a8"/><circle cx="10" cy="15" r="1.6" fill="#6b21a8"/></svg>';

export const dsEnemyHardened: DarknessStrengthDef = {
    packageId: DS_ENEMY_HARDENED_ID,
    name: 'Hardened Foes',
    description: `Enemy creatures gain {${DescriptiveValue.Medium}} max health.`,
    icon: HARDENED_ICON,
    lane: 'darkness',
    compile: [
        {
            type: 'statBag',
            target: 'enemy',
            bonuses: {
                [PassiveStatKey.MaxHealth]: { mult: DS_ENEMY_HARDENED_MAX_HEALTH_MULT },
            },
        },
    ],
};

export const dsEnemyFierce: DarknessStrengthDef = {
    packageId: DS_ENEMY_FIERCE_ID,
    name: 'Fierce Assault',
    description: `Enemy creatures deal {${DescriptiveValue.Small}} more damage.`,
    icon: FIERCE_ICON,
    lane: 'darkness',
    compile: [
        {
            type: 'statBag',
            target: 'enemy',
            bonuses: {
                [PassiveStatKey.AllDamage]: { mult: DS_ENEMY_FIERCE_ALL_DAMAGE_MULT },
            },
        },
    ],
};

/**
 * Each round start: spawn one swarmling at the map edge (`edgeOfMap`).
 * Chose edge placement over darkness-restricted `anywhere` so reinforcements
 * always appear even on well-lit maps.
 */
export const dsSwarmReinforcements: DarknessStrengthDef = {
    packageId: DS_SWARM_REINFORCEMENTS_ID,
    name: 'Swarm Reinforcements',
    description: 'At the start of each round, one Swarmling arrives at the edge of the map.',
    icon: SWARM_ICON,
    lane: 'darkness',
    compile: [
        {
            type: 'spawnTweak',
            everyRound: true,
            characterId: DS_SWARM_REINFORCEMENTS_CHARACTER_ID,
            count: DS_SWARM_REINFORCEMENTS_COUNT,
            spawnBehaviour: DS_SWARM_REINFORCEMENTS_SPAWN_BEHAVIOUR,
        },
    ],
};

export const STARTER_DARKNESS_STRENGTHS: DarknessStrengthDef[] = [
    dsEnemyHardened,
    dsEnemyFierce,
    dsSwarmReinforcements,
];
