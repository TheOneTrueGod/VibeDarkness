import { Container, Graphics, Sprite } from 'pixi.js';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { getSpecialTileDef } from '../../../storylines/specialTileDefs';
import type { SpecialTile } from '../../specialTiles/SpecialTile';
import type { AssetRegistry } from '../AssetRegistry';
import { strokeClockwiseArc } from './castStateRingVisual';

const Z_SPECIAL_TILES = 6;
/** Defs with `visibleInDarkness`: above the darkness (5) and fog tint (13) overlays. */
const Z_SPECIAL_TILES_ABOVE_DARKNESS = 13.5;

/** Proximity-activation ring (any def with `proximityActivation`): track + clockwise fill. */
const ACTIVATION_RING_LABEL = 'activationRing';
const ACTIVATION_RING_RADIUS = 14;
const ACTIVATION_RING_WIDTH = 3;
const ACTIVATION_RING_TRACK_COLOR = 0x3a3226;
const ACTIVATION_RING_FILL_COLOR = 0xffd27a;

/** Wall crystal look: dormant (unlit, cool grey) vs awake (bright amber with a glow). */
const WALL_CRYSTAL_LABEL = 'wallCrystal';
const WALL_CRYSTAL_GLOW_LABEL = 'wallCrystalGlow';
const WALL_CRYSTAL_DORMANT_ALPHA = 0.9;
const WALL_CRYSTAL_DORMANT_TINT = 0x9aa4b0;

export class SpecialTileRenderer {
    private specialTilesContainer: Container = new Container();
    private aboveDarknessContainer: Container = new Container();
    private specialTileVisuals: Map<string, Container> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {
        this.specialTilesContainer.zIndex = Z_SPECIAL_TILES;
        this.gameContainer.addChild(this.specialTilesContainer);
        this.aboveDarknessContainer.zIndex = Z_SPECIAL_TILES_ABOVE_DARKNESS;
        this.gameContainer.addChild(this.aboveDarknessContainer);
    }

    setLayerVisible(visible: boolean): void {
        this.specialTilesContainer.visible = visible;
        this.aboveDarknessContainer.visible = visible;
    }

    private layerFor(tile: SpecialTile): Container {
        return getSpecialTileDef(tile.defId)?.visibleInDarkness
            ? this.aboveDarknessContainer
            : this.specialTilesContainer;
    }

    render(specialTiles: SpecialTile[]): void {
        for (const tile of specialTiles) {
            if (tile.hp <= 0) continue;
            let visual = this.specialTileVisuals.get(tile.id);
            if (!visual) {
                visual = this.createSpecialTileVisual(tile);
                if (visual) {
                    this.specialTileVisuals.set(tile.id, visual);
                    this.layerFor(tile).addChild(visual);
                }
            }
            if (visual) {
                visual.x = tile.col * CELL_SIZE + CELL_SIZE / 2;
                visual.y = tile.row * CELL_SIZE + CELL_SIZE / 2;
                if (tile.defId === 'Campfire' && visual.children.length > 1) {
                    const hpBar = visual.getChildAt(1) as Graphics;
                    if (hpBar) {
                        hpBar.clear();
                        const w = 24;
                        const h = 4;
                        const pct = tile.maxHp > 0 ? tile.hp / tile.maxHp : 0;
                        hpBar.rect(-w / 2, -CELL_SIZE / 2 - 8, w, h);
                        hpBar.fill({ color: 0x333333 });
                        hpBar.rect(-w / 2, -CELL_SIZE / 2 - 8, w * pct, h);
                        hpBar.fill({ color: 0x44aa44 });
                    }
                }
                syncWallCrystalLook(visual, tile);
                syncActivationRing(visual, tile);
            }
        }

        const activeIds = new Set(specialTiles.filter((t) => t.hp > 0).map((t) => t.id));
        for (const [id, visual] of this.specialTileVisuals) {
            if (!activeIds.has(id)) {
                visual.parent?.removeChild(visual);
                visual.destroy();
                this.specialTileVisuals.delete(id);
            }
        }
    }

    private createSpecialTileVisual(tile: SpecialTile): Container | undefined {
        const def = getSpecialTileDef(tile.defId);
        if (!def) return undefined;
        const container = new Container();
        if (tile.defId === 'Campfire' && this.assets.getCampfireTexture()) {
            const sprite = new Sprite(this.assets.getCampfireTexture()!);
            sprite.anchor.set(0.5, 1);
            sprite.width = 32;
            sprite.height = 32;
            container.addChild(sprite);
            container.addChild(new Graphics()); // hp bar updated each frame
        } else if (tile.defId === 'Crystal') {
            const g = new Graphics();
            g.label = 'crystal';
            const halfSize = 8;
            g.moveTo(0, -halfSize);
            g.lineTo(halfSize, 0);
            g.lineTo(0, halfSize);
            g.lineTo(-halfSize, 0);
            g.closePath();
            g.fill({ color: 0x7dd3fc });
            g.stroke({ color: 0x38bdf8, width: 1.5 });
            container.addChild(g);
        } else if (tile.defId === 'WallCrystal') {
            const glow = new Graphics();
            glow.label = WALL_CRYSTAL_GLOW_LABEL;
            glow.circle(0, 0, 11);
            glow.fill({ color: 0xffd27a, alpha: 0.25 });
            container.addChild(glow);
            const g = new Graphics();
            g.label = WALL_CRYSTAL_LABEL;
            // Two-tone shard: outer body, pale inner facet.
            g.moveTo(0, -10);
            g.lineTo(6, -1);
            g.lineTo(0, 10);
            g.lineTo(-6, -1);
            g.closePath();
            g.fill({ color: 0xf5d08a });
            g.stroke({ color: 0xc99a3c, width: 1.5 });
            g.moveTo(0, -6);
            g.lineTo(3, -1);
            g.lineTo(0, 6);
            g.lineTo(-3, -1);
            g.closePath();
            g.fill({ color: 0xfff1c9, alpha: 0.8 });
            container.addChild(g);
        } else if (tile.defId === 'DarkCrystal') {
            const g = new Graphics();
            g.label = 'darkCrystal';
            const halfSize = 10;
            g.moveTo(0, -halfSize);
            g.lineTo(halfSize, 0);
            g.lineTo(0, halfSize);
            g.lineTo(-halfSize, 0);
            g.closePath();
            g.fill({ color: 0x8866cc });
            g.stroke({ color: 0x6633aa, width: 1.5 });
            container.addChild(g);
        } else {
            return undefined;
        }
        return container;
    }

    destroy(): void {
        for (const visual of this.specialTileVisuals.values()) visual.destroy();
        this.specialTileVisuals.clear();
        this.specialTilesContainer.destroy();
        this.aboveDarknessContainer.destroy();
    }
}

/** Dormant wall crystals are dim and unlit; awake ones are bright with a glow. */
function syncWallCrystalLook(visual: Container, tile: SpecialTile): void {
    const crystal = visual.children.find((c) => c.label === WALL_CRYSTAL_LABEL) as Graphics | undefined;
    if (!crystal) return;
    const dormant = tile.dormant === true;
    crystal.alpha = dormant ? WALL_CRYSTAL_DORMANT_ALPHA : 1;
    crystal.tint = dormant ? WALL_CRYSTAL_DORMANT_TINT : 0xffffff;
    const glow = visual.children.find((c) => c.label === WALL_CRYSTAL_GLOW_LABEL);
    if (glow) glow.visible = !dormant;
}

/** Circular progress ring around a dormant tile while its proximity activation fills. */
function syncActivationRing(visual: Container, tile: SpecialTile): void {
    let ring = visual.children.find((c) => c.label === ACTIVATION_RING_LABEL) as Graphics | undefined;
    const progress = tile.dormant ? (tile.activationProgress ?? 0) : 0;
    if (progress <= 0) {
        if (ring) ring.visible = false;
        return;
    }
    if (!ring) {
        ring = new Graphics();
        ring.label = ACTIVATION_RING_LABEL;
        ring.eventMode = 'none';
        visual.addChild(ring);
    }
    ring.visible = true;
    ring.clear();
    ring.circle(0, 0, ACTIVATION_RING_RADIUS);
    ring.stroke({ color: ACTIVATION_RING_TRACK_COLOR, width: ACTIVATION_RING_WIDTH, alpha: 0.7 });
    strokeClockwiseArc(ring, ACTIVATION_RING_RADIUS, progress, {
        color: ACTIVATION_RING_FILL_COLOR,
        width: ACTIVATION_RING_WIDTH,
    });
}
