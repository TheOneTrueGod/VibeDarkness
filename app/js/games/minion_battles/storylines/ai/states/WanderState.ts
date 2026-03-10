/**
 * WanderState – Pick a random walkable tile within 4 cells and move towards it.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext } from '../types';
import { queueWaitAndEndTurn } from '../utils';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';

const WANDER_RADIUS = 4;

export interface WanderStateParams {
    /** Optional: no serialized fields for base wander. */
}

export class WanderState extends AIState {
    readonly stateId = 'wander' as const;

    executeTurn(unit: Unit, context: AIContext): void {
        const terrainManager = context.terrainManager;
        if (!terrainManager?.grid) {
            queueWaitAndEndTurn(unit, context);
            return;
        }
        const grid = terrainManager.grid;
        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const dest = this.pickRandomWalkableWithinRadius(unitGrid, unit, context);
        if (!dest) {
            queueWaitAndEndTurn(unit, context);
            return;
        }
        const path = context.findGridPathForUnit(unit, unitGrid.col, unitGrid.row, dest.col, dest.row);
        if (path && path.length > 0) {
            unit.setMovement(path, undefined, context.gameTick);
        }
        queueWaitAndEndTurn(unit, context);
    }

    private pickRandomWalkableWithinRadius(
        from: { col: number; row: number },
        unit: Unit,
        context: AIContext,
    ): { col: number; row: number } | null {
        const candidates: { col: number; row: number }[] = [];
        for (let dc = -WANDER_RADIUS; dc <= WANDER_RADIUS; dc++) {
            for (let dr = -WANDER_RADIUS; dr <= WANDER_RADIUS; dr++) {
                if (dc === 0 && dr === 0) continue;
                const col = from.col + dc;
                const row = from.row + dr;
                candidates.push({ col, row });
            }
        }
        for (let tries = 0; tries < 20; tries++) {
            if (candidates.length === 0) return null;
            const idx = context.generateRandomInteger(0, candidates.length - 1);
            const c = candidates[idx]!;
            const path = context.findGridPathForUnit(unit, from.col, from.row, c.col, c.row);
            if (path && path.length > 0) return c;
        }
        return null;
    }

    toJSON(): SerializedAIState {
        return { stateId: 'wander' };
    }

    static fromJSON(_data: SerializedAIState): WanderState {
        return new WanderState({});
    }
}
