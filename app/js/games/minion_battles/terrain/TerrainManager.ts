/**
 * TerrainManager - High-level interface for terrain queries and pathfinding.
 *
 * Wraps a TerrainGrid (bedrock) and a Pathfinder. Floor-layer effects from
 * TerrainLayerManager override bedrock passability and terrain type for cells
 * that have been modified at runtime (e.g. created rocks, destroyed rocks).
 */

import type { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import { Pathfinder } from './Pathfinding';
import {
    EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    EARTH_CORE_STONE_HEALTH,
} from '../card_defs/05_earth_core/earthCoreConstants';
import type {
    StoneTileState,
    StoneTileStateData,
    TerrainStoneDamagedTransition,
} from './TerrainGrid';
import type { TerrainLayerManager, TerrainEffectRecord } from '../game/TerrainLayerManager';

export interface TerrainStoneDamagedEvent extends TerrainStoneDamagedTransition {
    worldX: number;
    worldY: number;
}

export class TerrainManager {
    readonly grid: TerrainGrid;
    readonly pathfinder: Pathfinder;
    private terrainLayers: TerrainLayerManager | null = null;
    private onStoneDamaged?: (event: TerrainStoneDamagedEvent) => void;

    constructor(grid: TerrainGrid) {
        this.grid = grid;
        this.pathfinder = new Pathfinder(grid);
    }

    /** Attach the TerrainLayerManager so floor effects affect passability and rock queries. */
    setTerrainLayers(layers: TerrainLayerManager): void {
        this.terrainLayers = layers;
        this.pathfinder.setPassabilityFn((col, row) => this.isCellPassableWithFloor(col, row));
    }

    // -------------------------------------------------------------------------
    // Effective terrain (bedrock + floor layer)
    // -------------------------------------------------------------------------

    private getEffectiveTerrainType(col: number, row: number): TerrainType {
        if (this.terrainLayers) {
            const override = this.terrainLayers.getFloorTerrainOverride(col, row);
            if (override !== null) return override;
        }
        return this.grid.get(col, row);
    }

    private isCellPassableWithFloor(col: number, row: number): boolean {
        return TERRAIN_PROPERTIES[this.getEffectiveTerrainType(col, row)].passable;
    }

    /** Get the terrain type at a world position (respects floor layer). */
    getTerrainAt(worldX: number, worldY: number): TerrainType {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return this.getEffectiveTerrainType(col, row);
    }

    /** Check if a world position is passable for unit movement (respects floor layer). */
    isPassable(worldX: number, worldY: number): boolean {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return this.isCellPassableWithFloor(col, row);
    }

    /** Get the speed multiplier at a world position. Uses bedrock terrain only (floor layer rocks are impassable, not slow). */
    getSpeedMultiplier(worldX: number, worldY: number): number {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return TERRAIN_PROPERTIES[this.getEffectiveTerrainType(col, row)].speedMultiplier;
    }

    /** Check if a projectile can pass through a world position. */
    isProjectilePassable(worldX: number, worldY: number): boolean {
        return this.grid.isProjectilePassable(worldX, worldY);
    }

    findPath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] | null {
        return this.pathfinder.findPath(fromX, fromY, toX, toY);
    }

    findGridPath(fromCol: number, fromRow: number, toCol: number, toRow: number): { col: number; row: number }[] | null {
        return this.pathfinder.findGridPath(fromCol, fromRow, toCol, toRow);
    }

    findGridPathWithBlocked(
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
        blockedCells: Set<string>,
    ): { col: number; row: number }[] | null {
        return this.pathfinder.findGridPathWithBlocked(fromCol, fromRow, toCol, toRow, blockedCells);
    }

    clearPathCache(): void {
        this.pathfinder.clearCache();
    }

    // -------------------------------------------------------------------------
    // Rock / stone system — delegates to floor layer
    // -------------------------------------------------------------------------

    getStoneState(col: number, row: number): StoneTileState {
        if (!this.terrainLayers) return 'natural_stone';
        const effect = this.terrainLayers.getFloorEffectAt(col, row);
        if (!effect) {
            // Natural stone: bedrock is Rock, no floor override
            return this.grid.get(col, row) === TerrainType.Rock ? 'natural_stone' : 'spent_rubble';
        }
        const state = effect.params.state as StoneTileState | undefined;
        return state ?? 'natural_stone';
    }

    getStoneHealth(col: number, row: number): number {
        if (!this.terrainLayers) return EARTH_CORE_STONE_HEALTH;
        const effect = this.terrainLayers.getFloorEffectAt(col, row);
        if (!effect) {
            return this.grid.get(col, row) === TerrainType.Rock ? EARTH_CORE_STONE_HEALTH : 0;
        }
        const health = effect.params.health as number | undefined;
        return health ?? EARTH_CORE_STONE_HEALTH;
    }

    createOrMarkRock(col: number, row: number): StoneTileStateData | null {
        if (!this.terrainLayers) return null;
        if (col < 0 || col >= this.grid.width || row < 0 || row >= this.grid.height) return null;
        const entry: StoneTileStateData = { state: 'created_rock', health: EARTH_CORE_STONE_HEALTH };
        this.terrainLayers.add({
            id: `rock-${col}-${row}-${Date.now()}`,
            layer: 'floor',
            effectType: 'created_rock',
            placedAtGameTime: 0,
            area: { type: 'cell', col, row },
            params: { state: entry.state, health: entry.health },
        });
        this.clearPathCache();
        return { ...entry };
    }

    damageRock(
        col: number,
        row: number,
        damage: number = EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    ): TerrainStoneDamagedTransition | null {
        if (!this.terrainLayers) return null;

        const effectiveType = this.getEffectiveTerrainType(col, row);
        if (effectiveType !== TerrainType.Rock) return null;

        const previousState = this.getStoneState(col, row);
        const previousHealth = this.getStoneHealth(col, row);
        if (previousState === 'spent_rubble' || previousHealth <= 0) return null;

        const nextHealth = Math.max(0, previousHealth - Math.max(0, damage));
        const nextState: StoneTileState = nextHealth <= 0 ? 'spent_rubble'
            : nextHealth < EARTH_CORE_STONE_HEALTH ? 'cracked_rock'
            : previousState;

        const effect = this.terrainLayers.getFloorEffectAt(col, row);
        if (effect) {
            this.terrainLayers.updateEffectParams(effect.id, { state: nextState, health: nextHealth });
        } else {
            // Natural stone: create a floor effect to track its damaged state
            this.terrainLayers.add({
                id: `rock-state-${col}-${row}-${Date.now()}`,
                layer: 'floor',
                effectType: 'rock_state',
                placedAtGameTime: 0,
                area: { type: 'cell', col, row },
                params: { derivedFrom: 'natural_stone', state: nextState, health: nextHealth },
            });
        }

        this.clearPathCache();

        if ((previousState !== 'cracked_rock' && nextState === 'cracked_rock') || nextState === 'spent_rubble') {
            const transition: TerrainStoneDamagedTransition = { col, row, previousState, state: nextState, previousHealth, health: nextHealth };
            this.emitStoneDamagedIfNeeded(transition);
            return transition;
        }
        return null;
    }

    consumeRockInRadius(centerCol: number, centerRow: number, radius: number): TerrainStoneDamagedTransition | null {
        if (!this.terrainLayers) return null;

        interface Candidate {
            col: number;
            row: number;
            state: StoneTileState;
            effect: TerrainEffectRecord | null;
        }

        const candidates: Candidate[] = [];
        const radiusSq = Math.max(0, radius) * Math.max(0, radius);
        for (let row = 0; row < this.grid.height; row++) {
            for (let col = 0; col < this.grid.width; col++) {
                if (this.getEffectiveTerrainType(col, row) !== TerrainType.Rock) continue;
                const dx = col - centerCol;
                const dy = row - centerRow;
                if (dx * dx + dy * dy > radiusSq) continue;
                const state = this.getStoneState(col, row);
                if (state === 'spent_rubble') continue;
                candidates.push({ col, row, state, effect: this.terrainLayers.getFloorEffectAt(col, row) });
            }
        }

        if (candidates.length === 0) return null;

        const preference = (state: StoneTileState): number => {
            if (state === 'created_rock' || state === 'cracked_rock') return 0;
            if (state === 'natural_stone') return 1;
            return 2;
        };
        candidates.sort((a, b) => {
            const prefDiff = preference(a.state) - preference(b.state);
            if (prefDiff !== 0) return prefDiff;
            const da = (a.col - centerCol) ** 2 + (a.row - centerRow) ** 2;
            const db = (b.col - centerCol) ** 2 + (b.row - centerRow) ** 2;
            if (da !== db) return da - db;
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });

        const selected = candidates[0]!;
        const previousHealth = this.getStoneHealth(selected.col, selected.row);
        const previousState = selected.state;

        if (selected.effect) {
            this.terrainLayers.updateEffectParams(selected.effect.id, { state: 'spent_rubble', health: 0 });
        } else {
            this.terrainLayers.add({
                id: `rock-state-${selected.col}-${selected.row}-${Date.now()}`,
                layer: 'floor',
                effectType: 'rock_state',
                placedAtGameTime: 0,
                area: { type: 'cell', col: selected.col, row: selected.row },
                params: { derivedFrom: 'natural_stone', state: 'spent_rubble', health: 0 },
            });
        }

        this.clearPathCache();

        const transition: TerrainStoneDamagedTransition = {
            col: selected.col,
            row: selected.row,
            previousState,
            state: 'spent_rubble',
            previousHealth,
            health: 0,
        };
        this.emitStoneDamagedIfNeeded(transition);
        return transition;
    }

    setStoneDamagedEmitter(emitter: ((event: TerrainStoneDamagedEvent) => void) | undefined): void {
        this.onStoneDamaged = emitter;
    }

    private emitStoneDamagedIfNeeded(transition: TerrainStoneDamagedTransition): void {
        if (!this.onStoneDamaged) return;
        const world = this.grid.gridToWorld(transition.col, transition.row);
        this.onStoneDamaged({ ...transition, worldX: world.x, worldY: world.y });
    }
}
