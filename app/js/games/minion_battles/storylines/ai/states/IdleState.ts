/**
 * IdleState – Default state. Scans for enemies, defend points, or light; otherwise wanders.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext, AILightSource } from '../types';
import { findEnemies, getEnemiesInPerceptionAndLOS } from '../utils';
import { getPerceptionRange } from '../../../engine/unitDef';
import { distance } from '../utils';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';
import { AttackState } from './AttackState';
import { SiegeDefendPointState } from './SiegeDefendPointState';
import { FindLightState } from './FindLightState';
import { WanderState } from './WanderState';

export class IdleState extends AIState {
    readonly stateId = 'idle' as const;

    executeTurn(unit: Unit, context: AIContext): void {
        const didTransition =
            this.tryTransitionToAttack(unit, context) ||
            this.tryTransitionToSiegeDefendPoint(unit, context) ||
            this.tryTransitionToFindLight(unit, context) ||
            this.transitionToWander(unit);
        if (didTransition) context.emitTurnEnd(unit.id);
    }

    private tryTransitionToAttack(unit: Unit, context: AIContext): boolean {
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
            this.setState(unit, new AttackState({ targetUnitId: target.id }));
            return true;
        }
        return false;
    }

    private tryTransitionToSiegeDefendPoint(unit: Unit, context: AIContext): boolean {
        const defendPoints = context.getAliveDefendPoints();
        if (defendPoints.length === 0) return false;
        const grid = context.terrainManager?.grid;
        if (!grid) return false;
        let nearest = defendPoints[0]!;
        let nearestDist = Infinity;
        for (const dp of defendPoints) {
            const world = grid.gridToWorld(dp.col, dp.row);
            const d = distance(unit.x, unit.y, world.x, world.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = dp;
            }
        }
        this.setState(unit, new SiegeDefendPointState({ defendPointId: nearest.id }));
        return true;
    }

    private tryTransitionToFindLight(unit: Unit, context: AIContext): boolean {
        const sources = context.getLightSources();
        if (sources.length === 0) return false;
        const grid = context.terrainManager?.grid;
        if (!grid) return false;
        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        let nearest: AILightSource | null = null;
        let nearestDist = Infinity;
        for (const s of sources) {
            const d = distance(unitGrid.col, unitGrid.row, s.col, s.row);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = s;
            }
        }
        if (nearest) {
            this.setState(unit, new FindLightState({ lightSourceId: nearest.id }));
            return true;
        }
        return false;
    }

    private transitionToWander(unit: Unit): boolean {
        this.setState(unit, new WanderState({}));
        return true;
    }

    toJSON(): SerializedAIState {
        return { stateId: 'idle' };
    }

    static fromJSON(_data: SerializedAIState): IdleState {
        return new IdleState();
    }
}
