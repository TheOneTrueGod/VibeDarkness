/**
 * Behaviour hooks of the swarm component (see `units/components/unitComponentHooks.ts`).
 * State and serialization live in `units/components/swarmComponent.ts`.
 */

import type { UnitComponentHooks } from '../units/components/unitComponentHooks';
import { processSwarmNests } from './swarmNestTick';

export const SWARM_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        processSwarmNests({
            gameTime: ctx.gameTime,
            dt: ctx.dt,
            units: ctx.units,
            mapPOIs: ctx.mapPOIs,
            mapNetwork: ctx.mapNetwork,
            eventBus: ctx.eventBus,
            // Everything a swarm nest spawns is tagged 'nestSpawn' (lanternite nests tag only their children).
            addUnit: (u) => ctx.addUnit(u, 'nestSpawn'),
            idSource: ctx.engine,
            generateRandomInteger: (min, max) => ctx.generateRandomInteger(min, max),
        });
    },
};
