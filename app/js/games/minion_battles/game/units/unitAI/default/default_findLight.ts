/**
 * default_findLight - Move towards a light source.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AILightSource } from '../types';
import type { AINode } from '../types';
import type { DefaultAITreeContext, DefaultNodeId } from './context';
import { queueWaitAndEndTurn, findEnemies, getEnemiesInPerceptionAndLOS } from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';

const IDLE_AT_LIGHT_DURATION = 2.5;

export const default_findLight: AINode<'default', DefaultNodeId> = {
    nodeId: 'default_findLight',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DefaultAITreeContext;
            const lightId = ctx.findLightSourceId;
            const sources = context.getLightSources();
            const light = lightId ? sources.find((s) => s.id === lightId) : null;
            if (!light) {
                ctx.aiState = 'default_idle';
                ctx.findLightSourceId = undefined;
                context.emitTurnEnd(unit.id);
                return;
            }

            const idleUntil = ctx.findLightIdleUntil;
            if (idleUntil != null && context.gameTime < idleUntil) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const terrainManager = context.terrainManager;
            const grid = terrainManager?.grid;
            if (!grid || !terrainManager) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            if (context.nav.isWalking(unit)) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const unitGrid = grid.worldToGrid(unit.x, unit.y);

            const perceptionRange = getPerceptionRange(unit.characterId);
            const enemies = findEnemies(unit, context.getUnits());
            const inSight = getEnemiesInPerceptionAndLOS(
                unit,
                enemies,
                perceptionRange,
                context.hasLineOfSight.bind(context),
            );
            if (inSight.length > 0) {
                ctx.aiState = 'default_idle';
                ctx.findLightSourceId = undefined;
                context.emitTurnEnd(unit.id);
                return;
            }

            const atTarget = Math.max(Math.abs(unitGrid.col - light.col), Math.abs(unitGrid.row - light.row)) <= Math.ceil(light.radius);
            if (atTarget) {
                const idleUntilTime = context.gameTime + IDLE_AT_LIGHT_DURATION;
                const otherLights = sources.filter((s) => s.id !== lightId);
                const next = otherLights.length > 0 ? otherLights[context.generateRandomInteger(0, otherLights.length - 1)]! : light;
                ctx.findLightSourceId = next.id;
                ctx.findLightIdleUntil = idleUntilTime;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const dest = pickReachableTileInLightRadius(light, unitGrid, unit, context);
            if (dest) {
                context.nav.moveToCell(unit, dest.col, dest.row);
            }
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'default_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as DefaultAITreeContext;
                const lightId = ctx.findLightSourceId;
                return !context.getLightSources().some((s) => s.id === lightId);
            },
        },
    ],
};

function pickReachableTileInLightRadius(
    light: AILightSource,
    _unitGrid: { col: number; row: number },
    unit: Unit,
    context: AIContext,
): { col: number; row: number } | null {
    const r = Math.ceil(light.radius);
    const candidates: { col: number; row: number }[] = [];
    for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
            if (dc * dc + dr * dr > r * r) continue;
            candidates.push({ col: light.col + dc, row: light.row + dr });
        }
    }
    for (let tries = 0; tries < 15; tries++) {
        if (candidates.length === 0) return null;
        const idx = context.generateRandomInteger(0, candidates.length - 1);
        const c = candidates[idx]!;
        if (context.nav.isReachable(unit, c.col, c.row)) return c;
    }
    return null;
}
