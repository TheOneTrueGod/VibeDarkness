/**
 * SpecialTileManager - Owns the special tile list (crystals, campfires, etc.).
 * Provides CRUD, crystal protection queries, light source generation, and
 * per-tick light decay processing.
 */

import type { SpecialTile } from '../specialTiles/SpecialTile';
import { specialTileToJSON, specialTileFromJSON } from '../specialTiles/SpecialTile';
import { getSpecialTileDef } from '../../storylines/specialTileDefs';
import type { EngineContext } from '../EngineContext';
import type { LightSource } from '../LightGrid';
import type { SerializedSpecialTile } from '../types';

const ROUND_DURATION = 10;

export class SpecialTileManager {
    specialTiles: SpecialTile[] = [];
    private ctx: EngineContext;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    addSpecialTile(tile: SpecialTile): void {
        this.specialTiles.push(tile);
    }

    /**
     * Reduce a special tile's HP by amount. Removes the tile when HP reaches 0.
     * Returns true if the tile was damaged (and possibly removed).
     */
    damageSpecialTile(tileId: string, amount: number): boolean {
        const idx = this.specialTiles.findIndex((t) => t.id === tileId);
        if (idx < 0) return false;
        const tile = this.specialTiles[idx]!;
        tile.hp = Math.max(0, tile.hp - amount);
        if (tile.hp <= 0) {
            this.specialTiles.splice(idx, 1);
        }
        return true;
    }

    getCrystalProtectionMap(): Map<string, number> {
        const map = new Map<string, number>();
        const grid = this.ctx.terrainManager?.grid;
        if (!grid) return map;
        const crystals = this.specialTiles.filter((t) => t.defId === 'Crystal' && t.hp > 0);
        for (const c of crystals) {
            const radius = c.protectRadius ?? 0;
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    if (Math.max(Math.abs(dc), Math.abs(dr)) > radius) continue;
                    const col = c.col + dc;
                    const row = c.row + dr;
                    if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) continue;
                    const key = `${col},${row}`;
                    map.set(key, (map.get(key) ?? 0) + 1);
                }
            }
        }
        return map;
    }

    getCrystalProtectedSet(): Set<string> {
        const map = this.getCrystalProtectionMap();
        return new Set(map.keys());
    }

    getCrystalProtectionCount(col: number, row: number): number {
        return this.getCrystalProtectionMap().get(`${col},${row}`) ?? 0;
    }

    getDarkCrystalFilterSet(): Set<string> {
        const set = new Set<string>();
        const grid = this.ctx.terrainManager?.grid;
        if (!grid) return set;
        const darkCrystals = this.specialTiles.filter(
            (t) => t.defId === 'DarkCrystal' && t.hp > 0 && t.colorFilter,
        );
        for (const c of darkCrystals) {
            const radius = c.colorFilter!.filterRadius;
            const rSq = radius * radius;
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    if (dc * dc + dr * dr > rSq) continue;
                    const col = c.col + dc;
                    const row = c.row + dr;
                    if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) continue;
                    set.add(`${col},${row}`);
                }
            }
        }
        return set;
    }

    buildLightSourcesFromSpecialTiles(): LightSource[] {
        const sources: LightSource[] = [];
        for (const tile of this.specialTiles) {
            if (tile.hp <= 0) continue;
            const light = tile.emitsLight;
            if (light != null && tile.maxHp > 0) {
                const scale = 0.5 + 0.5 * (tile.hp / tile.maxHp);
                sources.push({
                    col: tile.col,
                    row: tile.row,
                    emission: light.lightAmount * scale,
                    radius: light.radius,
                });
            }
        }
        return sources;
    }

    /** Decay special tiles' emitsLight using decayRate + decayInterval (both in rounds). */
    processSpecialTileLightDecays(): void {
        const totalRoundsElapsed = this.ctx.gameTime / ROUND_DURATION;
        const eps = 1e-9;
        const radiusLossPerLightLoss = 0.5;

        for (const tile of this.specialTiles) {
            const light = tile.emitsLight;
            if (!light) continue;

            const decayRate = light.decayRate;
            const decayInterval = light.decayInterval;
            if (decayRate === undefined || decayInterval === undefined) continue;
            if (decayRate <= 0 || decayInterval <= 0) continue;
            if (light.lightAmount <= 0 && light.radius <= 0) continue;

            if (tile.lightDecayNextAtRound === undefined || !Number.isFinite(tile.lightDecayNextAtRound)) {
                const stepsElapsed = Math.floor((totalRoundsElapsed + eps) / decayInterval);
                tile.lightDecayNextAtRound = (stepsElapsed + 1) * decayInterval;
            }

            while (totalRoundsElapsed + eps >= tile.lightDecayNextAtRound) {
                const radiusLoss = radiusLossPerLightLoss * decayRate;
                light.lightAmount = Math.max(0, light.lightAmount - decayRate);
                light.radius = Math.max(0, light.radius - radiusLoss);

                tile.lightDecayNextAtRound += decayInterval;

                if (light.lightAmount <= 0 && light.radius <= 0) {
                    light.lightAmount = Math.max(0, light.lightAmount);
                    light.radius = Math.max(0, light.radius);
                    tile.lightDecayNextAtRound = Number.POSITIVE_INFINITY;
                    break;
                }
            }
        }
    }

    toJSON(): Record<string, unknown>[] {
        return this.specialTiles.map((t) => specialTileToJSON(t));
    }

    restoreFromJSON(tileDataArray: SerializedSpecialTile[]): void {
        this.specialTiles = [];
        for (const tileData of tileDataArray ?? []) {
            const def = getSpecialTileDef(tileData.defId);
            if (def) {
                this.specialTiles.push(specialTileFromJSON(tileData as unknown as Record<string, unknown>, def));
            }
        }
    }
}
