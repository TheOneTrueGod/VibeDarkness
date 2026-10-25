/**
 * Light queries and the light-tile grid driver for `GameEngine`, moved out of the class as a pure move.
 * The grid itself stays on `GameState.lightTileGrid` (serialized there); this class only reads and writes it.
 * `GameEngine` keeps the public methods as one-line delegates.
 */

import { computeLightChannelGrid, type LightSource as GridLightInput } from '../LightGrid';
import { LightTileGrid } from '../lightTileGrid/LightTileGrid';
import type { AILightSource } from '../units/unitAI';
import type { GameEngine } from '../GameEngine';
import { LIGHT_TYPES, type LightType } from './lightTypes';

export class LightingSystem {
    constructor(private readonly engine: GameEngine) {}

    getLightLevelAt(x: number, y: number): number | null {
        const grid = this.engine.state.lightTileGrid;
        if (!grid || !this.engine.lightLevelEnabled || !this.engine.terrainManager?.grid) return null;
        const { col, row } = this.engine.terrainManager.grid.worldToGrid(x, y);
        return grid.getVisibility(
            Math.max(0, Math.min(grid.gridHeight - 1, row)),
            Math.max(0, Math.min(grid.gridWidth - 1, col)),
            this.engine.globalLightLevel,
        );
    }

    getLightAt(col: number, row: number): number | null {
        if (!this.engine.state.lightLevelEnabled) return null;
        const grid = this.engine.state.lightTileGrid;
        if (!grid) return this.engine.state.globalLightLevel;
        if (row < 0 || row >= grid.gridHeight || col < 0 || col >= grid.gridWidth) return null;
        return grid.getVisibility(row, col, this.engine.globalLightLevel);
    }

    getLightIntensity(col: number, row: number, type: LightType): number | null {
        if (!this.engine.state.lightLevelEnabled) return null;
        const grid = this.engine.state.lightTileGrid;
        if (!grid) return type === 'FireLight' ? this.engine.state.globalLightLevel : 0;
        if (row < 0 || row >= grid.gridHeight || col < 0 || col >= grid.gridWidth) return null;
        return grid.getChannel(row, col, type);
    }

    getDominantLightType(col: number, row: number): LightType | null {
        if (!this.engine.state.lightLevelEnabled) return null;
        const grid = this.engine.state.lightTileGrid;
        if (!grid) return null;
        if (row < 0 || row >= grid.gridHeight || col < 0 || col >= grid.gridWidth) return null;
        return grid.getDominantType(row, col);
    }

    initLightGrid(): void {
        if (!this.engine.terrainManager?.grid) return;
        const { width, height } = this.engine.terrainManager.grid;
        const tileGrid = LightTileGrid.create(width, height);
        const target = computeLightChannelGrid(this.engine.globalLightLevel, width, height, this.getAllLightSources());
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                for (const type of LIGHT_TYPES) {
                    tileGrid.setChannel(row, col, type, target.channels[type][row]![col]!);
                }
                tileGrid.setVoid(row, col, target.voidDarkness[row]![col]!);
            }
        }
        this.engine.state.lightTileGrid = tileGrid;
    }

    runLightGameTick(): void {
        const grid = this.engine.state.lightTileGrid;
        if (!grid || !this.engine.terrainManager?.grid) return;
        const { width, height } = this.engine.terrainManager.grid;
        const target = computeLightChannelGrid(this.engine.globalLightLevel, width, height, this.getAllLightSources());
        const animateToward = (cur: number, rawTgt: number): number => {
            // Round target to integer — fractional emission/radius produces float targets
            // which would cause cur to oscillate between floor(tgt) and ceil(tgt) forever.
            const tgt = Math.round(rawTgt);
            // Proportional step: moves 10% of the remaining delta each tick.
            // Snap to target when the step is negligible to avoid asymptotic drift
            // (important for integer threshold checks like corruption at light <= 0).
            const delta = tgt - cur;
            const step = 0.1 * delta;
            if (Math.abs(step) < 0.01) return tgt;
            if (delta !== 0) return cur + step;
            return cur;
        };
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                for (const type of LIGHT_TYPES) {
                    const cur = grid.getChannel(row, col, type);
                    grid.setChannel(row, col, type, animateToward(cur, target.channels[type][row]![col]!));
                }
                const curVoid = grid.getVoid(row, col);
                grid.setVoid(row, col, animateToward(curVoid, target.voidDarkness[row]![col]!));
            }
        }
    }

    getAllLightSources(): GridLightInput[] {
        return [
            ...this.engine.state.specialTileManager.buildLightSourcesFromSpecialTiles(),
            ...this.engine.state.lightSourceManager.buildGridLightInputs(),
        ];
    }

    /** Light sources with id for AI (FindLight state). */
    getLightSourcesForAI(): AILightSource[] {
        const out: AILightSource[] = [];
        for (const tile of this.engine.specialTiles) {
            if (tile.hp <= 0) continue;
            const light = tile.emitsLight;
            if (light != null && tile.maxHp > 0) {
                const scale = 0.5 + 0.5 * (tile.hp / tile.maxHp);
                out.push({
                    id: tile.id,
                    col: tile.col,
                    row: tile.row,
                    emission: light.lightAmount * scale,
                    radius: light.radius,
                });
            }
        }
        const grid = this.engine.terrainManager?.grid;
        for (const ls of this.engine.state.lightSourceManager.lightSources) {
            if (!ls.active || ls.lightAmount <= 0 || ls.radius <= 0) continue;
            const col = grid ? grid.worldToGrid(ls.x, ls.y).col : 0;
            const row = grid ? grid.worldToGrid(ls.x, ls.y).row : 0;
            out.push({ id: ls.id, col, row, emission: ls.lightAmount, radius: ls.radius });
        }
        return out;
    }

    applyInstantLightingPass(): void {
        if (!this.engine.lightLevelEnabled || !this.engine.terrainManager?.grid) return;
        this.initLightGrid();
    }
}
