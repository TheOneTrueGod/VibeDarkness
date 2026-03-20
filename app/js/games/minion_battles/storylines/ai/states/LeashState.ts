/**
 * LeashState – Move to random adjacent walkable square, favoring closer to start.
 * Transitions to LeashAttackState when enemies are in sight.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext } from '../types';
import { findEnemies, getEnemiesInPerceptionAndLOS, queueWaitAndEndTurn } from '../utils';
import { getPerceptionRange } from '../../../engine/unitDef';
import { distance } from '../utils';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';
import { LeashAttackState } from './LeashAttackState';

export interface LeashStateParams {
    startCol: number;
    startRow: number;
}

export class LeashState extends AIState {
    readonly stateId = 'leash' as const;
    readonly startCol: number;
    readonly startRow: number;

    constructor(params: LeashStateParams) {
        super();
        this.startCol = params.startCol;
        this.startRow = params.startRow;
    }

    executeTurn(unit: Unit, context: AIContext): void {
        const perceptionRange = getPerceptionRange(unit.characterId);
        const enemies = findEnemies(unit, context.getUnits());
        const inSight = getEnemiesInPerceptionAndLOS(
            unit,
            enemies,
            perceptionRange,
            context.hasLineOfSight.bind(context),
        );
        if (inSight.length > 0) {
            const target = inSight[context.generateRandomInteger(0, inSight.length - 1)]!;
            this.setState(unit, new LeashAttackState({
                targetUnitId: target.id,
                startCol: this.startCol,
                startRow: this.startRow,
            }));
            context.emitTurnEnd(unit.id);
            return;
        }

        const terrainManager = context.terrainManager;
        if (!terrainManager?.grid) {
            queueWaitAndEndTurn(unit, context);
            return;
        }
        const grid = terrainManager.grid;
        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const dest = this.pickAdjacentFavoringHome(unitGrid, unit, context);
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

    private pickAdjacentFavoringHome(
        from: { col: number; row: number },
        unit: Unit,
        context: AIContext,
    ): { col: number; row: number } | null {
        const candidates: { col: number; row: number }[] = [];
        for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (dc === 0 && dr === 0) continue;
                candidates.push({ col: from.col + dc, row: from.row + dr });
            }
        }
        const walkable: { col: number; row: number }[] = [];
        for (const c of candidates) {
            const path = context.findGridPathForUnit(unit, from.col, from.row, c.col, c.row);
            if (path && path.length > 0) walkable.push(c);
        }
        if (walkable.length === 0) return null;

        walkable.sort((a, b) => {
            const da = distance(a.col, a.row, this.startCol, this.startRow);
            const db = distance(b.col, b.row, this.startCol, this.startRow);
            return da - db;
        });
        const idx = Math.min(
            context.generateRandomInteger(0, Math.max(0, walkable.length - 1)),
            walkable.length - 1,
        );
        return walkable[idx] ?? null;
    }

    toJSON(): SerializedAIState {
        return { stateId: 'leash', startCol: this.startCol, startRow: this.startRow };
    }

    static fromJSON(data: SerializedAIState): LeashState {
        return new LeashState({
            startCol: (data.startCol as number) ?? 0,
            startRow: (data.startRow as number) ?? 0,
        });
    }
}
