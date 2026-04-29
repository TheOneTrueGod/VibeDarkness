import React from 'react';
import type { GameEngine } from '../../games/minion_battles/game/GameEngine';
import type { TerrainGrid } from '../../games/minion_battles/terrain/TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from '../../games/minion_battles/terrain/TerrainType';

interface MiniTerrainViewProps {
    engine: GameEngine;
    /** Pixel size per grid cell in the preview (keep small for many panes). */
    cellPx?: number;
    /** Bump when the parent steps the engine so layout refreshes. */
    renderVersion: number;
}

/**
 * Read-only terrain + unit dots for ability test previews (no Pixi / controls).
 */
export default function MiniTerrainView({ engine, cellPx = 6, renderVersion: _rv }: MiniTerrainViewProps) {
    void _rv;
    const tm = engine.terrainManager;
    let snapshot: {
        g: TerrainGrid;
        cells: { key: string; bg: string }[];
        units: { id: string; col: number; row: number; team: string; label: string }[];
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
        snapshot = { g, cells, units };
    }

    if (!snapshot) {
        return <div className="text-xs text-muted">No terrain</div>;
    }

    const { g, cells, units } = snapshot;
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
            {units.map((u) => (
                <div
                    key={u.id}
                    className={`absolute rounded-full border border-white/80 flex items-center justify-center text-[8px] font-bold ${
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
