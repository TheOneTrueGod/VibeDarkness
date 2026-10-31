/**
 * Placement check shared by abilities that put a deployable on a tile: the pick must be within
 * `range` of the caster and on an open landing (walkable, no unit standing there).
 */
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { isOpenLanding } from '../../game/fieldObjects/landing';

export interface DeployablePlacementContext {
    caster: Unit;
    engine: unknown;
    pick: ResolvedTarget;
}

export function deployablePlacementValidator(range: number): (ctx: DeployablePlacementContext) => boolean {
    return (ctx) => {
        const point = ctx.pick.position;
        if (!point) return false;
        const dx = point.x - ctx.caster.x;
        const dy = point.y - ctx.caster.y;
        if (dx * dx + dy * dy > range * range) return false;
        const engine = ctx.engine as {
            terrainManager?: Parameters<typeof isOpenLanding>[0]['terrainManager'];
            units?: Unit[];
        };
        return isOpenLanding(
            { terrainManager: engine.terrainManager ?? null, units: engine.units ?? [] },
            point.x,
            point.y,
        );
    };
}
