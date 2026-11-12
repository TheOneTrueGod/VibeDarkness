import { afterEach, describe, expect, it } from 'vitest';
import {
    computeTeamPerception,
    getTeamPerception,
    getUnitDetection,
    isDetectionVisible,
    type PerceivedUnit,
    type PerceptionEngine,
} from './teamPerception';
import {
    DARKVISION_GRANT,
    DEFAULT_UNIT_SENSES,
    PLAYER_SENSES,
    TREMORSENSE_GRANT,
    type SenseGrant,
    type SenseProfile,
} from './senses';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainLayerManager } from '../TerrainLayerManager';
import type { GameEngine } from '../GameEngine';
import type { TeamId } from '../teams';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';

// Compile-time check: the real engine satisfies the structural perception engine.
const _engineIsPerceptionEngine: (e: GameEngine) => PerceptionEngine = (e) => e;
void _engineIsPerceptionEngine;

const W = 24;
const H = 11;
const ROW = 5;
const VIEWER_COL = 2;
const LIT = 10;

interface WorldOpts {
    /** Rock tiles. */
    walls?: Array<[number, number]>;
    /** Tiles at light 0; everything else is at {@link LIT}. */
    dark?: (col: number, row: number) => boolean;
    lightLevelEnabled?: boolean;
}

function wallColumn(col: number): Array<[number, number]> {
    return Array.from({ length: H }, (_, row) => [col, row] as [number, number]);
}

function unitAt(
    id: string,
    teamId: TeamId,
    col: number,
    row = ROW,
    opts: { baseSenses?: Readonly<SenseProfile>; senseGrants?: SenseGrant[] } = {},
): PerceivedUnit {
    return {
        id,
        teamId,
        x: (col + 0.5) * CELL_SIZE,
        y: (row + 0.5) * CELL_SIZE,
        baseSenses: opts.baseSenses ?? DEFAULT_UNIT_SENSES,
        senseGrants: opts.senseGrants ?? [],
        buffs: [],
        isAlive: () => true,
    };
}

function player(opts: { baseSenses?: Readonly<SenseProfile>; senseGrants?: SenseGrant[] } = {}): PerceivedUnit {
    return unitAt('p1', 'player', VIEWER_COL, ROW, { baseSenses: PLAYER_SENSES, ...opts });
}

function world(units: PerceivedUnit[], opts: WorldOpts = {}): PerceptionEngine & { gameTick: number; terrainManager: TerrainManager } {
    const grid = TerrainGrid.createFilledTerrain(W, H, CELL_SIZE, TerrainType.Grass);
    for (const [c, r] of opts.walls ?? []) grid.set(c, r, TerrainType.Rock);
    const terrainManager = new TerrainManager(grid);
    terrainManager.setTerrainLayers(new TerrainLayerManager());
    const dark = opts.dark ?? (() => false);
    return {
        units,
        terrainManager,
        lightLevelEnabled: opts.lightLevelEnabled ?? true,
        gameTick: 0,
        getLightAt: (c, r) => (c < 0 || r < 0 || c >= W || r >= H ? null : dark(c, r) ? 0 : LIT),
    };
}

function detectionOf(engine: PerceptionEngine, unitId: string): string | undefined {
    return computeTeamPerception(engine, 'player').detections.get(unitId);
}

describe('computeTeamPerception', () => {
    it('sees a lit enemy at 5 tiles', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 5)]);
        expect(detectionOf(e, 'e')).toBe('seen');
    });

    it('glimpses a lit enemy 10 tiles away with a clear line', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 10)]);
        expect(detectionOf(e, 'e')).toBe('glimpsed');
    });

    it('does not glimpse the same enemy behind a wall', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 10)], { walls: wallColumn(VIEWER_COL + 6) });
        expect(detectionOf(e, 'e')).toBe('hidden');
    });

    it('sees a lit enemy past a single pillar that clips the centre line (forgiving sight line)', () => {
        // Centre line (2,5) → (6,7) steps through (3,6). 4.5 tiles: outside hearing, so only vision can find it.
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 4, ROW + 2)], {
            walls: [[VIEWER_COL + 1, ROW + 1]],
        });
        expect(detectionOf(e, 'e')).toBe('seen');
    });

    it('hides a dark enemy 10 tiles away', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 10)], { dark: (c) => c >= VIEWER_COL + 8 });
        expect(detectionOf(e, 'e')).toBe('hidden');
    });

    it('sees an enemy 2 tiles into full darkness but not 3', () => {
        const dark = (c: number) => c >= VIEWER_COL + 4;
        const twoDeep = world([player(), unitAt('e', 'enemy', VIEWER_COL + 5)], { dark });
        expect(detectionOf(twoDeep, 'e')).toBe('seen');
        const threeDeep = world([player(), unitAt('e', 'enemy', VIEWER_COL + 6)], { dark });
        expect(detectionOf(threeDeep, 'e')).not.toBe('seen');
        expect(detectionOf(threeDeep, 'e')).toBe('hidden');
    });

    it('lets darkvision see the 3-deep enemy', () => {
        const e = world([player({ senseGrants: [DARKVISION_GRANT] }), unitAt('e', 'enemy', VIEWER_COL + 6)], {
            dark: (c) => c >= VIEWER_COL + 4,
        });
        expect(detectionOf(e, 'e')).toBe('seen');
    });

    it('hears an enemy behind a wall at 3 tiles', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 3)], { walls: wallColumn(VIEWER_COL + 2) });
        expect(detectionOf(e, 'e')).toBe('heard');
    });

    it('feels an enemy behind a wall at 5 tiles with tremorsense 6 and no hearing', () => {
        const viewer = player({ baseSenses: DEFAULT_UNIT_SENSES, senseGrants: [TREMORSENSE_GRANT] });
        const e = world([viewer, unitAt('e', 'enemy', VIEWER_COL + 5)], { walls: wallColumn(VIEWER_COL + 2) });
        expect(detectionOf(e, 'e')).toBe('felt');
    });

    it('prefers hearing over tremorsense at 3 tiles', () => {
        const viewer = player({ senseGrants: [TREMORSENSE_GRANT] });
        const e = world([viewer, unitAt('e', 'enemy', VIEWER_COL + 3)], { walls: wallColumn(VIEWER_COL + 2) });
        expect(detectionOf(e, 'e')).toBe('heard');
    });

    it('puts the wall tile next to the viewer in visibleTiles but not the tile behind it', () => {
        const e = world([player()], { walls: wallColumn(VIEWER_COL + 1) });
        const p = computeTeamPerception(e, 'player');
        expect(p.visibleTiles[ROW * W + VIEWER_COL]).toBe(1);
        expect(p.visibleTiles[ROW * W + VIEWER_COL + 1]).toBe(1);
        expect(p.visibleTiles[ROW * W + VIEWER_COL + 2]).toBe(0);
    });

    it('sees everything with the light system disabled', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 12)], {
            dark: () => true,
            walls: wallColumn(VIEWER_COL + 2),
            lightLevelEnabled: false,
        });
        const p = computeTeamPerception(e, 'player');
        expect(p.detections.get('e')).toBe('seen');
        expect(p.visibleTiles.every((v) => v === 1)).toBe(true);
    });

    it('always sees friendly and neutral units, and pools vision across allies', () => {
        const ally = unitAt('a', 'allied', VIEWER_COL + 14);
        const e = world([player(), ally, unitAt('n', 'nature', VIEWER_COL + 20), unitAt('e', 'enemy', VIEWER_COL + 17)], {
            dark: () => true,
        });
        const p = computeTeamPerception(e, 'player');
        expect(p.detections.get('a')).toBe('seen');
        expect(p.detections.get('n')).toBe('seen');
        // The ally's vision reaches 2 dark tiles; the enemy is 3 deep and out of the player's hearing.
        expect(p.detections.get('e')).toBe('hidden');
        expect(p.visibleTiles[ROW * W + VIEWER_COL + 14]).toBe(1);
        expect(p.visibleTiles[ROW * W + VIEWER_COL + 16]).toBe(1);
    });

    it('ignores dead viewers', () => {
        const dead = { ...player(), isAlive: () => false };
        const e = world([dead, unitAt('e', 'enemy', VIEWER_COL + 3)]);
        expect(detectionOf(e, 'e')).toBe('hidden');
    });
});

describe('getTeamPerception / getUnitDetection', () => {
    afterEach(() => {
        debugSettingsSnapshot.darkOverlayEnabled = true;
        debugSettingsSnapshot.revealAllUnits = false;
    });

    it('caches per tick and bumps revision on recompute', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 5)]);
        const a = getTeamPerception(e, 'player');
        expect(getTeamPerception(e, 'player')).toBe(a);
        e.gameTick = 1;
        const b = getTeamPerception(e, 'player');
        expect(b).not.toBe(a);
        expect(b.revision).toBe(a.revision + 1);
    });

    it('recomputes when the terrain epoch changes (rock destroyed)', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 10)], { walls: [[VIEWER_COL + 6, ROW]] });
        const enemy = e.units[1]!;
        expect(getUnitDetection(e, 'player', enemy)).toBe('hidden');
        e.terrainManager.destroyRock(VIEWER_COL + 6, ROW);
        expect(getUnitDetection(e, 'player', enemy)).toBe('glimpsed');
    });

    it('detects a unit outside the engine list against the cached viewers', () => {
        const e = world([player()]);
        expect(getUnitDetection(e, 'player', unitAt('ghost', 'enemy', VIEWER_COL + 4))).toBe('seen');
        expect(getUnitDetection(e, 'player', unitAt('ghost2', 'enemy', VIEWER_COL + 10, ROW))).toBe('glimpsed');
    });

    it('reveals every unit when the dark overlay is off or "Reveal all units" is on', () => {
        const e = world([player(), unitAt('e', 'enemy', VIEWER_COL + 10)], { dark: () => true });
        const enemy = e.units[1]!;
        expect(getUnitDetection(e, 'player', enemy)).toBe('hidden');
        debugSettingsSnapshot.revealAllUnits = true;
        expect(getUnitDetection(e, 'player', enemy)).toBe('seen');
        debugSettingsSnapshot.revealAllUnits = false;
        debugSettingsSnapshot.darkOverlayEnabled = false;
        expect(getUnitDetection(e, 'player', enemy)).toBe('seen');
    });

    it('isDetectionVisible is true only for seen and glimpsed', () => {
        expect(isDetectionVisible('seen')).toBe(true);
        expect(isDetectionVisible('glimpsed')).toBe(true);
        expect(isDetectionVisible('heard')).toBe(false);
        expect(isDetectionVisible('felt')).toBe(false);
        expect(isDetectionVisible('hidden')).toBe(false);
    });
});
