import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { TeamId } from '../../teams';
import { getUnitDetection, isDetectionVisible } from '../../visibility/teamPerception';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { cssHexToNumber, darkenCssHex, mixCssHex } from '../../../themes/colorUtils';
import { drawMote } from '../../effects/motes';
import {
    SIPHON_DROPLETS_PER_TILE,
    siphonDrainedFraction,
    siphonDropletPose,
    siphonRipple,
    siphonTileSeed,
} from '../siphonVisual';

/** Above the darkness overlay (5) and daylight pulse (6), below sense pulses (8) and units (10). */
const Z_TERRAIN_SIPHON = 7;
/** Progress ring radius as a share of a cell. */
const RING_RADIUS = CELL_SIZE * 0.26;
const RING_WIDTH = 3;
const DROPLET_SIZE = 2.2;

/**
 * Shows a unit drawing a resource out of the ground (`terrainSiphon`). Each tile it is drawing on gets a
 * ripple and a small circular progress bar (how much of the tile's current level is gone), and a stream of
 * droplets runs from the tile into the unit. Driven by `Resource.siphonTiles`, so any siphon resource gets it,
 * painted in that resource's colours (`color` for the event, `barDeepColor` for the mass).
 *
 * Runs on wall time like `SenseIndicatorRenderer`, so the stream keeps flowing while the game is paused,
 * and hides with its unit when the local team cannot see that unit.
 */
export class TerrainSiphonRenderer {
    private readonly graphics: Graphics = new Graphics();

    constructor(private readonly gameContainer: Container) {
        this.graphics.zIndex = Z_TERRAIN_SIPHON;
        this.graphics.label = 'terrainSiphon';
        this.graphics.eventMode = 'none';
        this.gameContainer.addChild(this.graphics);
    }

    setLayerVisible(visible: boolean): void {
        if (!visible) this.graphics.visible = false;
    }

    render(engine: GameEngine, localTeamId: TeamId): void {
        const g = this.graphics;
        g.clear();
        g.visible = true;
        const terrain = engine.terrainManager;
        if (!terrain) return;
        const wallTimeSec = performance.now() / 1000;

        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            for (const resource of unit.resources) {
                if (resource.siphonTiles.length === 0) continue;
                if (!isDetectionVisible(getUnitDetection(engine, localTeamId, unit))) break;

                const light = cssHexToNumber(mixCssHex(resource.color, '#ffffff', 0.45));
                const event = cssHexToNumber(resource.color);
                const mass = cssHexToNumber(resource.barDeepColor ?? darkenCssHex(resource.color, 0.55));

                for (const tile of resource.siphonTiles) {
                    const cx = tile.col * CELL_SIZE + CELL_SIZE / 2;
                    const cy = tile.row * CELL_SIZE + CELL_SIZE / 2;
                    const seed = siphonTileSeed(tile.col, tile.row);

                    const ripple = siphonRipple(wallTimeSec, seed);
                    g.circle(cx, cy, RING_RADIUS * 1.35 * ripple.radiusScale);
                    g.stroke({ color: light, width: 1, alpha: ripple.alpha });

                    // Progress ring: dark track, then the drained share clockwise from the top.
                    const drained = siphonDrainedFraction(terrain.getFloorTile(tile.col, tile.row)?.destructible);
                    g.circle(cx, cy, RING_RADIUS);
                    g.stroke({ color: mass, width: RING_WIDTH + 1.5, alpha: 0.7 });
                    if (drained > 0.001) {
                        const start = -Math.PI / 2;
                        g.moveTo(cx + Math.cos(start) * RING_RADIUS, cy + Math.sin(start) * RING_RADIUS);
                        g.arc(cx, cy, RING_RADIUS, start, start + drained * Math.PI * 2);
                        g.stroke({ color: event, width: RING_WIDTH, alpha: 0.95, cap: 'round' });
                    }

                    for (let k = 0; k < SIPHON_DROPLETS_PER_TILE; k++) {
                        const pose = siphonDropletPose(cx, cy, unit.x, unit.y, wallTimeSec, k, seed);
                        drawMote(g, pose.x, pose.y, DROPLET_SIZE * pose.scale, light, mass, pose.alpha, {
                            shape: 'droplet',
                        });
                    }
                }
            }
        }
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
