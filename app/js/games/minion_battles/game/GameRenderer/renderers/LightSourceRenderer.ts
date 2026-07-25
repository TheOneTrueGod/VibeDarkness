import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';
import { LIGHT_TYPE_TINT } from '../../lighting/lightTypes';

const Z_LIGHT_SOURCES = 5; // below special tiles (6), same level as darkness overlay

export class LightSourceRenderer {
    private lightSourceVisuals: Map<string, Graphics> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly _assets: AssetRegistry,
    ) {}

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        for (const visual of this.lightSourceVisuals.values()) {
            visual.visible = false;
        }
    }

    render(engine: GameEngine): void {
        const lsm = engine.state.lightSourceManager;
        for (const ls of lsm.lightSources) {
            let g = this.lightSourceVisuals.get(ls.id);
            if (!g) {
                g = new Graphics();
                g.zIndex = Z_LIGHT_SOURCES;
                this.lightSourceVisuals.set(ls.id, g);
                this.gameContainer.addChild(g);
            }
            g.x = ls.x;
            g.y = ls.y;
            g.visible = ls.active && ls.lightAmount > 0;
            if (!g.visible) continue;
            g.clear();
            const typeTint = LIGHT_TYPE_TINT[ls.lightType];
            if (ls.color != null) {
                const size = ls.radius * 3;
                g.circle(0, 0, size);
                g.fill({ color: ls.color, alpha: 0.35 + (ls.lightAmount / 15) * 0.3 });
                g.circle(0, 0, size * 0.5);
                g.fill({ color: 0xffffff, alpha: 0.4 });
                g.stroke({ color: ls.color, width: 1, alpha: 0.7 });
            } else {
                const size = Math.max(8, Math.min(20, ls.radius * 4));
                const core = ls.lightType === 'FireLight' ? 0xffdd00 : 0xffffff;
                const stroke = ls.lightType === 'FireLight' ? 0xff6600 : typeTint;
                g.circle(0, 0, size);
                g.fill({ color: typeTint, alpha: 0.4 + (ls.lightAmount / 15) * 0.4 });
                g.circle(0, 0, size * 0.6);
                g.fill({ color: core, alpha: 0.5 });
                g.stroke({ color: stroke, width: 1, alpha: 0.8 });
            }
        }

        const activeLightSourceIds = new Set(lsm.lightSources.map((ls) => ls.id));
        for (const [id, visual] of this.lightSourceVisuals) {
            if (!activeLightSourceIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.lightSourceVisuals.delete(id);
            }
        }
    }

    destroy(): void {
        for (const visual of this.lightSourceVisuals.values()) visual.destroy();
        this.lightSourceVisuals.clear();
    }
}
