import { Assets, AnimatedSprite } from 'pixi.js';
import type { Container, Graphics, Texture } from 'pixi.js';
import { Projectile } from '../../projectiles/Projectile';
import type { AssetRegistry } from '../AssetRegistry';
import type { SpriteProjectileGraphicDef } from '../../projectiles/ProjectileGraphicDef';

const Z_PROJECTILES = 11;

type TextureCacheEntry = Texture[] | 'loading' | 'failed';

function getSpriteGraphicCacheKey(def: SpriteProjectileGraphicDef): string {
    if ('frameFiles' in def) return def.frameFiles.join('|');
    if (def.frameDirection === 'grid') return `${def.file}|${def.frameDirection}|${def.frames}|${def.columns}`;
    return `${def.file}|${def.frameDirection}|${def.frames}`;
}

export class ProjectileRenderer {
    private projectileVisuals: Map<string, Container | Graphics> = new Map();
    private spriteTextureCache: Map<string, TextureCacheEntry> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly _assets: AssetRegistry,
    ) {}

    private async loadSpriteTextures(def: SpriteProjectileGraphicDef, cacheKey: string): Promise<void> {
        this.spriteTextureCache.set(cacheKey, 'loading');
        try {
            let textures: Texture[];
            if ('frameFiles' in def) {
                textures = await Promise.all(def.frameFiles.map((url) => Assets.load(url) as Promise<Texture>));
            } else {
                const sheet = (await Assets.load(def.file)) as Texture;
                const { width, height } = sheet;
                const frameCount = def.frames;
                textures = [];
                if (def.frameDirection === 'row') {
                    const fw = width / frameCount;
                    for (let i = 0; i < frameCount; i++) {
                        textures.push(new Texture({ source: sheet.source, frame: { x: i * fw, y: 0, width: fw, height } as never }));
                    }
                } else if (def.frameDirection === 'column') {
                    const fh = height / frameCount;
                    for (let i = 0; i < frameCount; i++) {
                        textures.push(new Texture({ source: sheet.source, frame: { x: 0, y: i * fh, width, height: fh } as never }));
                    }
                } else {
                    const cols = def.columns;
                    const fw = width / cols;
                    const rows = Math.ceil(frameCount / cols);
                    const fh = height / rows;
                    for (let i = 0; i < frameCount; i++) {
                        const col = i % cols;
                        const row = Math.floor(i / cols);
                        textures.push(new Texture({ source: sheet.source, frame: { x: col * fw, y: row * fh, width: fw, height: fh } as never }));
                    }
                }
            }
            this.spriteTextureCache.set(cacheKey, textures);
        } catch (err) {
            console.warn('[ProjectileRenderer] Failed to load sprite textures:', cacheKey, err);
            this.spriteTextureCache.set(cacheKey, 'failed');
        }
    }

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        for (const visual of this.projectileVisuals.values()) {
            visual.visible = false;
        }
    }

    render(projectiles: Projectile[], gameTime: number): void {
        for (const proj of projectiles) {
            if (proj.graphicDef) {
                this.renderSpriteProjectile(proj);
            } else {
                this.renderProceduralProjectile(proj, gameTime);
            }
        }

        const activeProjIds = new Set(projectiles.map((p) => p.id));
        for (const [id, visual] of this.projectileVisuals) {
            if (!activeProjIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.projectileVisuals.delete(id);
            }
        }
    }

    private renderSpriteProjectile(proj: Projectile): void {
        const def = proj.graphicDef!;
        const cacheKey = getSpriteGraphicCacheKey(def);
        const entry = this.spriteTextureCache.get(cacheKey);

        if (!entry) {
            void this.loadSpriteTextures(def, cacheKey);
            return;
        }
        if (entry === 'loading' || entry === 'failed') return;

        let visual = this.projectileVisuals.get(proj.id);
        if (!visual) {
            const anim = new AnimatedSprite(entry);
            anim.anchor.set(0.5, 0.5);
            anim.animationSpeed = (def.fps ?? 8) / 60;
            anim.zIndex = Z_PROJECTILES;
            anim.play();
            this.projectileVisuals.set(proj.id, anim);
            this.gameContainer.addChild(anim);
            visual = anim;
        }

        visual.x = proj.x;
        visual.y = proj.y;
        visual.visible = proj.active;
    }

    private renderProceduralProjectile(proj: Projectile, gameTime: number): void {
        let visual = this.projectileVisuals.get(proj.id);
        if (!visual) {
            visual = Projectile.createVisual(proj);
            visual.zIndex = Z_PROJECTILES;
            this.projectileVisuals.set(proj.id, visual);
            this.gameContainer.addChild(visual);
        }
        visual.x = proj.x;
        visual.y = proj.y;
        if (proj.projectileType === 'bramble_spike' && proj.maxDistance > 0) {
            const t = Math.min(1, proj.distanceTraveled / proj.maxDistance);
            const arcH = Math.min(proj.maxDistance * 0.4, 100);
            visual.y = proj.y - 4 * t * (1 - t) * arcH;
        }
        visual.visible = proj.active;
        if (proj.projectileType === 'throwing_knife') {
            visual.rotation = Math.atan2(proj.velocityY, proj.velocityX) + Math.PI / 2;
        } else {
            visual.rotation = 0;
        }
        if (proj.projectileType === 'energy_blast') {
            const pulseTime = gameTime * 16;
            const pulse = (Math.sin(pulseTime) + 1) / 2;
            visual.scale.set(0.9 + pulse * 0.3);
            visual.alpha = 0.8 + pulse * 0.2;
        } else {
            visual.scale.set(1);
            visual.alpha = 1;
        }
    }

    destroy(): void {
        for (const visual of this.projectileVisuals.values()) visual.destroy();
        this.projectileVisuals.clear();
        this.spriteTextureCache.clear();
    }
}
