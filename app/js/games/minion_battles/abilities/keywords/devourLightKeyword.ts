import { REACH_5X5_HALF_EXTENT } from '../../game/deployables/Deployable';
import type { KeywordDef } from './keywordTypes';

export const devourLightKeyword: KeywordDef = {
    id: 'devourLight',
    displayName: 'Devour Light',
    formatTooltip: (n) => `Devour Light ${n}`,
    resolve: (ctx, n) => {
        const engine = ctx.engine;
        if (!engine.findDeployables || !engine.consumeDeployable) return { triggered: false };
        // Only light emitters owned by the caster's team in the 5x5 around the caster (nearest-first).
        const candidates = engine.findDeployables({
            castingTeam: ctx.caster.teamId,
            near: { x: ctx.caster.x, y: ctx.caster.y },
            halfExtent: REACH_5X5_HALF_EXTENT,
            tags: ['lightEmitter'],
        });
        if (candidates.length < n) return { triggered: false };
        for (let i = 0; i < n; i++) engine.consumeDeployable(candidates[i]);
        return { triggered: true };
    },
};
