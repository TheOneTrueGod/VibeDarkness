/**
 * Behaviour hooks of the lanternite component (see `units/components/unitComponentHooks.ts`).
 * State and serialization live in `units/components/lanterniteComponent.ts`.
 */

import type { UnitComponentHooks } from '../units/components/unitComponentHooks';
import { isLanterniteCreature, lanterniteStateOf } from '../units/components/lanterniteComponent';
import { processLanterniteNests } from './lanterniteNestTick';
import { processLanternitePulseMilestone, removeLanterniteLightSources } from './lanternitePulse';

export const LANTERNITE_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        processLanterniteNests({
            gameTime: ctx.gameTime,
            dt: ctx.dt,
            units: ctx.units,
            eventBus: ctx.eventBus,
            addUnit: (u, src) => ctx.addUnit(u, src),
            idSource: ctx.engine,
            mapPOIs: ctx.mapPOIs,
            mapNetwork: ctx.mapNetwork,
            lightLevelEnabled: ctx.lightLevelEnabled,
            addLightSource: (ls) => ctx.addLightSource(ls),
            lightSources: ctx.lightSources,
            addEffectEmitter: (em) => ctx.addEffectEmitter(em),
            generateRandomInteger: (min, max) => ctx.generateRandomInteger(min, max),
        });
    },

    // Spore Rebirth respawns must follow every nest spawn of the tick (this used to run after both nest ticks).
    lateTick(ctx) {
        ctx.state.lanterniteRespawnManager.gameTick(ctx.gameTime, ctx.engine, ctx.eventBus);
    },

    onRoundMilestone(milestone, ctx) {
        processLanternitePulseMilestone(milestone, {
            units: ctx.units,
            lightLevelEnabled: ctx.lightLevelEnabled,
            eventBus: ctx.eventBus,
            addLightSource: (ls) => ctx.addLightSource(ls),
            lightSources: ctx.lightSources,
        });
    },

    onDeath(unit, ctx) {
        // Nests carry the component too; only the creature drops a torch and is reborn.
        if (!isLanterniteCreature(unit)) return;
        removeLanterniteLightSources(unit.id, ctx.lightSources);
        // Nest-owned lanternites are replaced by their nest, not by Spore Rebirth.
        if (lanterniteStateOf(unit).nestOwnerUnitId == null) {
            ctx.state.lanterniteRespawnManager.onLanterniteUnitDied(unit.x, unit.y, ctx.gameTime);
        }
    },
};
