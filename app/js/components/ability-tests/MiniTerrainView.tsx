import React from 'react';
import type { GameEngine } from '../../games/minion_battles/game/GameEngine';
import type { Effect } from '../../games/minion_battles/game/effects/Effect';
import type { Projectile } from '../../games/minion_battles/game/projectiles/Projectile';
import type { TerrainGrid } from '../../games/minion_battles/terrain/TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from '../../games/minion_battles/terrain/TerrainType';

/** HUD / non-world visuals — skip in the mini map overlay. */
const MINI_MAP_SKIP_EFFECT_TYPES = new Set(['CorruptionProgressBar']);

function miniEffectColor(effectType: string): string {
    const t = effectType.toLowerCase();
    if (t === 'damagenumber') return 'rgba(250, 220, 120, 0.95)';
    if (t === 'punch' || t === 'bite' || t === 'impact') return 'rgba(255, 140, 80, 0.88)';
    if (t === 'particleimage') return 'rgba(255, 255, 255, 0.85)';
    if (t === 'afterimage') return 'rgba(180, 120, 255, 0.55)';
    if (t === 'slashtrail' || t === 'coneflash') return 'rgba(120, 220, 255, 0.75)';
    if (t === 'torch' || t === 'torchprojectile') return 'rgba(255, 200, 80, 0.55)';
    if (t === 'pulse' || t === 'howlshockwave') return 'rgba(200, 140, 255, 0.7)';
    if (t === 'bullettrail') return 'rgba(200, 200, 255, 0.65)';
    if (t === 'chargedrockexplosion') return 'rgba(255, 100, 60, 0.8)';
    if (t === 'corruptionorb') return 'rgba(255, 80, 160, 0.75)';
    return 'rgba(180, 190, 255, 0.72)';
}

function miniEffectDiameterPx(effect: Effect, cellPx: number, gridCellSize: number): number {
    const scale = cellPx / gridCellSize;
    const base = Math.max(4, Math.min(cellPx, Math.round((effect.effectRadius ?? 10) * scale)));
    if (effect.effectType === 'Torch') {
        const r = (effect.effectData as { radius?: number }).radius ?? 5;
        return Math.min(cellPx * 3, Math.max(base, Math.round(r * scale * 2)));
    }
    if (effect.effectType === 'DamageNumber') return Math.max(6, Math.round(cellPx * 0.45));
    return base;
}

interface MiniTerrainViewProps {
    engine: GameEngine;
    /** Pixel size per grid cell in the preview (keep small for many panes). */
    cellPx?: number;
    /** Bump when the parent steps the engine so layout refreshes. */
    renderVersion: number;
}

/**
 * Read-only terrain, active effects, projectiles, and unit dots for ability test previews (no Pixi / controls).
 */
export default function MiniTerrainView({ engine, cellPx = 6, renderVersion: _rv }: MiniTerrainViewProps) {
    void _rv;
    const tm = engine.terrainManager;
    let snapshot: {
        g: TerrainGrid;
        cells: { key: string; bg: string }[];
        units: { id: string; col: number; row: number; team: string; label: string }[];
        effects: Effect[];
        projectiles: Projectile[];
    } | null = null;
    if (tm) {
        const g = tm.grid;
        const cells: { key: string; bg: string }[] = [];
        for (let row = 0; row < g.height; row++) {
            for (let col = 0; col < g.width; col++) {
                const t = g.get(col, row);
                cells.push({
                    key: `${col},${row}`,
                    bg: TERRAIN_PROPERTIES[t as TerrainType]?.color ?? '#333',
                });
            }
        }
        const units = engine.units
            .filter((u) => u.isAlive())
            .map((u) => {
                const { col, row } = g.worldToGrid(u.x, u.y);
                return { id: u.id, col, row, team: u.teamId, label: u.name?.slice(0, 1) ?? '?' };
            });
        const effects = engine.effects.filter(
            (e) => e.active && !MINI_MAP_SKIP_EFFECT_TYPES.has(e.effectType),
        );
        const projectiles = engine.projectiles.filter((p) => p.active);
        snapshot = { g, cells, units, effects, projectiles };
    }

    if (!snapshot) {
        return <div className="text-xs text-muted">No terrain</div>;
    }

    const { g, cells, units, effects, projectiles } = snapshot;
    const w = g.width * cellPx;
    const h = g.height * cellPx;

    return (
        <div
            className="relative mx-auto rounded border border-border-custom overflow-hidden bg-black/40"
            style={{ width: w, height: h }}
        >
            <div
                className="grid absolute inset-0"
                style={{
                    gridTemplateColumns: `repeat(${g.width}, ${cellPx}px)`,
                    gridTemplateRows: `repeat(${g.height}, ${cellPx}px)`,
                }}
            >
                {cells.map((c) => (
                    <div key={c.key} className="shrink-0" style={{ backgroundColor: c.bg }} title="" />
                ))}
            </div>
            {effects.map((e) => {
                const scale = cellPx / g.cellSize;
                const d = miniEffectDiameterPx(e, cellPx, g.cellSize);
                const opacity = Math.max(0.25, 1 - e.progress * 0.35);
                return (
                    <div
                        key={e.id}
                        className="pointer-events-none absolute z-10 rounded-full border border-white/25 shadow-sm"
                        style={{
                            left: e.x * scale,
                            top: e.y * scale,
                            width: d,
                            height: d,
                            transform: 'translate(-50%, -50%)',
                            backgroundColor: miniEffectColor(e.effectType),
                            opacity,
                        }}
                        title={e.effectType}
                    />
                );
            })}
            {projectiles.map((p) => {
                const scale = cellPx / g.cellSize;
                const sz = Math.max(4, Math.round((p.radius ?? 5) * scale * 2));
                return (
                    <div
                        key={p.id}
                        className="pointer-events-none absolute z-[15] border border-amber-200/90 bg-amber-400/85"
                        style={{
                            left: p.x * scale,
                            top: p.y * scale,
                            width: sz,
                            height: sz,
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                        }}
                        title="projectile"
                    />
                );
            })}
            {units.map((u) => (
                <div
                    key={u.id}
                    className={`absolute z-20 rounded-full border border-white/80 flex items-center justify-center text-[8px] font-bold ${
                        u.team === 'player' ? 'bg-primary/90 text-secondary' : 'bg-danger/90 text-white'
                    }`}
                    style={{
                        width: cellPx - 1,
                        height: cellPx - 1,
                        left: u.col * cellPx + 0.5,
                        top: u.row * cellPx + 0.5,
                    }}
                    title={u.id}
                >
                    {u.label}
                </div>
            ))}
        </div>
    );
}
