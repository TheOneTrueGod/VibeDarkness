/**
 * The Last Holdout - Mission enemy definitions.
 *
 * 3 Raiders and 1 Raider Captain. A tougher encounter.
 */

import type { MissionBattleConfig } from './types';

export const LAST_HOLDOUT: MissionBattleConfig = {
    missionId: 'last_holdout',
    name: 'The Last Holdout',
    enemies: [
        {
            characterId: 'ranger',
            name: 'Raider Scout',
            hp: 40,
            speed: 50,
            position: { x: 950, y: 250 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 100, maxRange: 180 },
        },
        {
            characterId: 'warrior',
            name: 'Raider Brute',
            hp: 70,
            speed: 30,
            position: { x: 1050, y: 400 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 30, maxRange: 80 },
        },
        {
            characterId: 'ranger',
            name: 'Raider Archer',
            hp: 35,
            speed: 45,
            position: { x: 1000, y: 550 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 120, maxRange: 200 },
        },
        {
            characterId: 'warrior',
            name: 'Raider Captain',
            hp: 80,
            speed: 35,
            position: { x: 1100, y: 400 },
            teamId: 'enemy',
            abilities: ['throw_knife'],
            aiSettings: { minRange: 40, maxRange: 100 },
        },
    ],
};
