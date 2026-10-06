import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { LightSourceManager } from '../../game/lightSources/LightSourceManager';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { KeywordDef } from './keywordTypes';

/** Devour reaches a 4x4-tile square centered on the caster (2 tiles each side). */
export const DEVOUR_LIGHT_HALF_EXTENT = 2 * CELL_SIZE;

type EngineWithLightManager = AbilityEngineContext & { state?: { lightSourceManager?: LightSourceManager } };

export const devourLightKeyword: KeywordDef = {
    id: 'devourLight',
    displayName: 'Devour Light',
    formatTooltip: (n) => `Devour Light ${n}`,
    resolve: (ctx, n) => {
        const mgr = (ctx.engine as EngineWithLightManager).state?.lightSourceManager;
        if (!mgr) return { triggered: false };
        const candidates = mgr.findDevourableLightSources(ctx.caster.x, ctx.caster.y, DEVOUR_LIGHT_HALF_EXTENT);
        if (candidates.length < n) return { triggered: false };
        for (let i = 0; i < n; i++) candidates[i].active = false;
        return { triggered: true };
    },
};
