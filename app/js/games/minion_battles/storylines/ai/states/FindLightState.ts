/**
 * FindLightState – Move towards a light source; idle ~1/4 round at destination then pick another light.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext, AILightSource } from '../types';
import { queueWaitAndEndTurn, scanForAttackTarget } from '../utils';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';
import { IdleState } from './IdleState';

/** 1/4 round in seconds (round = 10s). */
const IDLE_AT_LIGHT_DURATION = 2.5;

export interface FindLightStateParams {
    lightSourceId: string;
    /** When set, we are idling at a light until this gameTime. */
    idleUntilTime?: number;
}

export class FindLightState extends AIState {
    readonly stateId = 'findLight' as const;
    readonly lightSourceId: string;
    readonly idleUntilTime?: number;

    constructor(params: FindLightStateParams) {
        super();
        this.lightSourceId = params.lightSourceId;
        this.idleUntilTime = params.idleUntilTime;
    }

    executeTurn(unit: Unit, context: AIContext): void {
        const sources = context.getLightSources();
        const light = sources.find((s) => s.id === this.lightSourceId);
        if (!light) {
            this.setState(unit, new IdleState());
            context.emitTurnEnd(unit.id);
            return;
        }

        if (this.idleUntilTime != null && context.gameTime < this.idleUntilTime) {
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const terrainManager = context.terrainManager;
        const grid = terrainManager?.grid;
        if (!grid || !terrainManager) {
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const hasPath = unit.movement?.path && unit.movement.path.length > 0;

        if (hasPath) {
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const attackTargetId = scanForAttackTarget(unit, context);
        if (attackTargetId) {
            this.setState(unit, new IdleState()); // IdleState will immediately transition into AttackState next turn
            context.emitTurnEnd(unit.id);
            return;
        }

        const atTarget = this.isUnitAtLight(unitGrid, light);
        if (atTarget) {
            const idleUntil = context.gameTime + IDLE_AT_LIGHT_DURATION;
            const otherLights = sources.filter((s) => s.id !== this.lightSourceId);
            if (otherLights.length > 0) {
                const next = otherLights[context.generateRandomInteger(0, otherLights.length - 1)]!;
                this.setState(unit, new FindLightState({ lightSourceId: next.id, idleUntilTime: idleUntil }));
            } else {
                this.setState(unit, new FindLightState({ lightSourceId: this.lightSourceId, idleUntilTime: idleUntil }));
            }
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const dest = this.pickReachableTileInLightRadius(light, unitGrid, unit, context);
        if (dest) {
            const path = context.findGridPathForUnit(unit, unitGrid.col, unitGrid.row, dest.col, dest.row);
            if (path && path.length > 0) {
                unit.setMovement(path, undefined, context.gameTick);
            }
        }
        queueWaitAndEndTurn(unit, context);
    }

    private isUnitAtLight(unitGrid: { col: number; row: number }, light: AILightSource): boolean {
        return (
            Math.max(Math.abs(unitGrid.col - light.col), Math.abs(unitGrid.row - light.row)) <=
            Math.ceil(light.radius)
        );
    }

    private pickReachableTileInLightRadius(
        light: AILightSource,
        unitGrid: { col: number; row: number },
        unit: Unit,
        context: AIContext,
    ): { col: number; row: number } | null {
        const r = Math.ceil(light.radius);
        const candidates: { col: number; row: number }[] = [];
        for (let dc = -r; dc <= r; dc++) {
            for (let dr = -r; dr <= r; dr++) {
                if (dc * dc + dr * dr > r * r) continue;
                const col = light.col + dc;
                const row = light.row + dr;
                candidates.push({ col, row });
            }
        }
        for (let tries = 0; tries < 15; tries++) {
            if (candidates.length === 0) return null;
            const idx = context.generateRandomInteger(0, candidates.length - 1);
            const c = candidates[idx]!;
            const path = context.findGridPathForUnit(unit, unitGrid.col, unitGrid.row, c.col, c.row);
            if (path && path.length > 0) return c;
        }
        return null;
    }

    toJSON(): SerializedAIState {
        const out: SerializedAIState = { stateId: 'findLight', lightSourceId: this.lightSourceId };
        if (this.idleUntilTime != null) out.idleUntilTime = this.idleUntilTime;
        return out;
    }

    static fromJSON(data: SerializedAIState): FindLightState {
        return new FindLightState({
            lightSourceId: (data.lightSourceId as string) ?? '',
            idleUntilTime: data.idleUntilTime as number | undefined,
        });
    }
}
