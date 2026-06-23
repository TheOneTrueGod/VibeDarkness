import { Assets, AnimatedSprite, Container, Texture } from 'pixi.js';
import type { IProjectileDef, SpriteFramesDef, SpriteProjectileConfig } from './types';
import type { Projectile } from '../Projectile';

type TextureCacheEntry = Texture[] | 'loading' | 'failed';
const textureCache: Map<string, TextureCacheEntry> = new Map();

function getCacheKey(sprite: SpriteFramesDef): string {
    if ('frameFiles' in sprite) return sprite.frameFiles.join('|');
    if (sprite.frameDirection === 'grid') return `${sprite.file}|${sprite.frameDirection}|${sprite.frames}|${sprite.columns}`;
    return `${sprite.file}|${sprite.frameDirection}|${sprite.frames}`;
}

async function loadTextures(sprite: SpriteFramesDef, cacheKey: string): Promise<void> {
    textureCache.set(cacheKey, 'loading');
    try {
        let textures: Texture[];
        if ('frameFiles' in sprite) {
            textures = await Promise.all(sprite.frameFiles.map((url) => Assets.load(url) as Promise<Texture>));
        } else {
            const sheet = (await Assets.load(sprite.file)) as Texture;
            const { width, height } = sheet;
            textures = [];
            if (sprite.frameDirection === 'row') {
                const fw = width / sprite.frames;
                for (let i = 0; i < sprite.frames; i++) {
                    textures.push(new Texture({ source: sheet.source, frame: { x: i * fw, y: 0, width: fw, height } as never }));
                }
            } else if (sprite.frameDirection === 'column') {
                const fh = height / sprite.frames;
                for (let i = 0; i < sprite.frames; i++) {
                    textures.push(new Texture({ source: sheet.source, frame: { x: 0, y: i * fh, width, height: fh } as never }));
                }
            } else if (sprite.frameDirection === 'grid') {
                const cols = sprite.columns;
                const fw = width / cols;
                const rows = Math.ceil(sprite.frames / cols);
                const fh = height / rows;
                for (let i = 0; i < sprite.frames; i++) {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    textures.push(new Texture({ source: sheet.source, frame: { x: col * fw, y: row * fh, width: fw, height: fh } as never }));
                }
            }
        }
        textureCache.set(cacheKey, textures);
    } catch (err) {
        console.warn('[spriteProjectileDef] Failed to load textures:', cacheKey, err);
        textureCache.set(cacheKey, 'failed');
    }
}

function buildAnimatedSprite(textures: Texture[], config: SpriteProjectileConfig): AnimatedSprite {
    const anim = new AnimatedSprite(textures);
    anim.anchor.set(0.5, 0.5);
    anim.animationSpeed = (config.sprite.fps ?? 8) / 60;
    if (config.sprite.scale !== undefined) anim.scale.set(config.sprite.scale);
    if (config.loop === false) anim.loop = false;
    anim.play();
    return anim;
}

function ensureSprite(container: Container, config: SpriteProjectileConfig): void {
    const cacheKey = getCacheKey(config.sprite);
    const entry = textureCache.get(cacheKey);
    if (!entry) {
        void loadTextures(config.sprite, cacheKey);
        return;
    }
    if (entry === 'loading' || entry === 'failed') return;
    if (container.children.length === 0) {
        container.addChild(buildAnimatedSprite(entry, config));
    }
}

function applyAnimations(visual: Container, proj: Projectile, config: SpriteProjectileConfig, gameTime: number): void {
    visual.rotation = 0;
    visual.scale.set(1);
    visual.alpha = 1;
    if (!config.animations) return;
    for (const anim of config.animations) {
        if (anim.type === 'rotation') {
            if (anim.mode === 'velocity-facing') {
                visual.rotation = Math.atan2(proj.velocityY, proj.velocityX) + Math.PI / 2;
            } else if (anim.mode === 'constant') {
                visual.rotation = (gameTime * anim.degreesPerSecond * Math.PI / 180) % (Math.PI * 2);
            }
        }
    }
}

export const spriteProjectileDef: IProjectileDef = {
    createVisual(proj) {
        const container = new Container();
        ensureSprite(container, proj.spriteConfig!);
        return container;
    },
    updateVisual(visual, proj, gameTime) {
        const config = proj.spriteConfig!;
        ensureSprite(visual, config);
        applyAnimations(visual, proj, config, gameTime);
    },
};
