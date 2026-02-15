/**
 * Dark Awakening - Mission enemy definitions.
 *
 * 2 Skeleton Warriors and 1 Dark Mage. Placed on the right side of the arena.
 */

import type { MissionBattleConfig } from './types';

export const DARK_AWAKENING: MissionBattleConfig = {
    missionId: 'dark_awakening',
    name: 'A Dark Awakening',
    enemies: [
        {
            characterId: 'warrior',
            name: 'Skeleton Warrior',
            hp: 50,
            speed: 40,
            position: { x: 1000, y: 300 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 30, maxRange: 80 },
        },
        {
            characterId: 'warrior',
            name: 'Skeleton Guard',
            hp: 60,
            speed: 35,
            position: { x: 1050, y: 500 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 30, maxRange: 80 },
        },
        {
            characterId: 'mage',
            name: 'Dark Mage',
            hp: 30,
            speed: 25,
            position: { x: 1100, y: 400 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 150, maxRange: 250 },
        },
    ],
};
