import { Container, Graphics, Sprite } from 'pixi.js';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { getSpecialTileDef } from '../../../storylines/specialTileDefs';
import type { SpecialTile } from '../../specialTiles/SpecialTile';
import type { AssetRegistry } from '../AssetRegistry';

const Z_SPECIAL_TILES = 6;

export class SpecialTileRenderer {
    private specialTilesContainer: Container = new Container();
    private specialTileVisuals: Map<string, Container> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {
        this.specialTilesContainer.zIndex = Z_SPECIAL_TILES;
        this.gameContainer.addChild(this.specialTilesContainer);
    }

    render(specialTiles: SpecialTile[]): void {
        for (const tile of specialTiles) {
            if (tile.hp <= 0) continue;
            let visual = this.specialTileVisuals.get(tile.id);
            if (!visual) {
                visual = this.createSpecialTileVisual(tile);
                if (visual) {
                    this.specialTileVisuals.set(tile.id, visual);
                    this.specialTilesContainer.addChild(visual);
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
            }
        }

        const activeIds = new Set(specialTiles.filter((t) => t.hp > 0).map((t) => t.id));
        for (const [id, visual] of this.specialTileVisuals) {
            if (!activeIds.has(id)) {
                this.specialTilesContainer.removeChild(visual);
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
    }
}
