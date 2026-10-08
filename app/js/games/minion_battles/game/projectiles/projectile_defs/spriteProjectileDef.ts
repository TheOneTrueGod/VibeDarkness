import { Assets, AnimatedSprite, Container, Texture } from 'pixi.js';
import type { IProjectileDef, SpriteFramesDef, SpriteProjectileConfig } from './types';
import type { Projectile } from '../Projectile';
import { stepTrailBlob, type TrailBlobState } from './directionalOrb';

/** Per-visual blob bookkeeping (render-only, never serialized or synced). */
interface BlobRuntime extends TrailBlobState {
    lastMs: number;
    dirX: number;
    dirY: number;
    initialised: boolean;
}
const blobRuntime = new WeakMap<Container, BlobRuntime>();

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
    if (config.spriteAlpha !== undefined) anim.alpha = config.spriteAlpha;
    anim.play();
    return anim;
}

/** Smaller translucent twin of the main sprite; starts on a different frame so it pulses out of step. */
function buildDirectionBlob(textures: Texture[], config: SpriteProjectileConfig): AnimatedSprite {
    const def = config.directionBlob!;
    const blob = buildAnimatedSprite(textures, config);
    blob.label = 'directionBlob';
    blob.alpha = def.alpha;
    blob.scale.set((config.sprite.scale ?? 1) * def.scale);
    blob.gotoAndPlay(Math.floor(textures.length / 2) % textures.length);
    return blob;
}

/** Keep the rear-edge blob easing behind the projectile (visual position is already set). */
function updateDirectionBlob(visual: Container, proj: Projectile, config: SpriteProjectileConfig): void {
    const def = config.directionBlob;
    if (!def) return;
    const blob = visual.children.find((c) => c.label === 'directionBlob');
    const main = visual.children[visual.children.length - 1];
    if (!blob || !main || main === blob) return;

    let rt = blobRuntime.get(visual);
    if (!rt) {
        rt = { x: proj.x, y: proj.y, lastMs: performance.now(), dirX: 1, dirY: 0, initialised: false };
        blobRuntime.set(visual, rt);
    }
    const speed = Math.hypot(proj.velocityX, proj.velocityY);
    if (speed > 0) {
        rt.dirX = proj.velocityX / speed;
        rt.dirY = proj.velocityY / speed;
    }
    const offset = def.edgeFraction * (main.width / 2);
    const targetX = proj.x - rt.dirX * offset;
    const targetY = proj.y - rt.dirY * offset;
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - rt.lastMs) / 1000);
    rt.lastMs = nowMs;
    if (!rt.initialised) {
        rt.x = targetX;
        rt.y = targetY;
        rt.initialised = true;
    } else {
        stepTrailBlob(rt, targetX, targetY, dt, def.followRate);
    }
    blob.position.set(rt.x - visual.x, rt.y - visual.y);
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
        // Blob first so it draws underneath the main sprite.
        if (config.directionBlob) container.addChild(buildDirectionBlob(entry, config));
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
        updateDirectionBlob(visual, proj, config);
    },
};
