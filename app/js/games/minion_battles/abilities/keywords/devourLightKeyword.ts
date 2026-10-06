import { findReachableLightEmitters, LIGHT_EMITTER_REACH_HALF_EXTENT } from '../../game/lightSources/lightEmitters';
import type { LightSourceManager } from '../../game/lightSources/LightSourceManager';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { KeywordDef } from './keywordTypes';

/** Devour reaches the shared light-emitter reach: a 5x5-tile square centered on the caster. */
export const DEVOUR_LIGHT_HALF_EXTENT = LIGHT_EMITTER_REACH_HALF_EXTENT;

type EngineWithLightManager = AbilityEngineContext & { state?: { lightSourceManager?: LightSourceManager } };

export const devourLightKeyword: KeywordDef = {
    id: 'devourLight',
    displayName: 'Devour Light',
    formatTooltip: (n) => `Devour Light ${n}`,
    resolve: (ctx, n) => {
        const mgr = (ctx.engine as EngineWithLightManager).state?.lightSourceManager;
        if (!mgr) return { triggered: false };
        const candidates = findReachableLightEmitters(mgr, ctx.caster.x, ctx.caster.y);
        if (candidates.length < n) return { triggered: false };
        for (let i = 0; i < n; i++) candidates[i].active = false;
        return { triggered: true };
    },
};
