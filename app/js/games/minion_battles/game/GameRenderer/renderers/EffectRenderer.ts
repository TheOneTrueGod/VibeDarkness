import { Particle, ParticleContainer } from 'pixi.js';
import type { Container, Texture } from 'pixi.js';
import type { Effect } from '../../effects/Effect';
import { createEffectVisual, updateEffectVisual, type IEffectRenderContext } from '../../effect_defs/index';
import type { EffectImageKey } from '../../effectImages';
import type { AssetRegistry } from '../AssetRegistry';

const Z_EFFECTS = 12;
/** Max on-screen diameter (px) for batched particles — prevents one-frame full-viewport wash. */
const MAX_PARTICLE_PX = 28;

export class EffectRenderer {
    private effectVisuals: Map<string, Container> = new Map();
    private particleEffects: Map<string, Particle> = new Map();
    private particleContainer: ParticleContainer | null = null;

    private static readonly PARTICLE_EFFECT_TYPES = new Set(['ParticleImage']);

    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {
        this.particleContainer = new ParticleContainer({ dynamicProperties: { position: true, alpha: true, scale: true } });
        this.particleContainer.zIndex = Z_EFFECTS;
        this.gameContainer.addChild(this.particleContainer);
    }

    /** Called after assets load to bind the shared darkBlob texture to the particle container. */
    setParticleTexture(tex: Texture): void {
        if (this.particleContainer) {
            this.particleContainer.texture = tex;
        }
    }

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        if (this.particleContainer) this.particleContainer.visible = false;
        for (const visual of this.effectVisuals.values()) {
            visual.visible = false;
        }
    }

    render(effects: Effect[]): void {
        const context: IEffectRenderContext = {
            getEffectTexture: (imageKey: EffectImageKey) => this.assets.getEffectTexture(imageKey),
            getCharacterTexture: (characterId: string) => this.assets.getCharacterTexture(characterId),
        };

        for (const effect of effects) {
            if (EffectRenderer.PARTICLE_EFFECT_TYPES.has(effect.effectType)) {
                this.syncParticleEffect(effect);
                continue;
            }
            let visual = this.effectVisuals.get(effect.id);
            if (!visual) {
                visual = createEffectVisual(effect, context);
                visual.zIndex = Z_EFFECTS;
                this.effectVisuals.set(effect.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = effect.x;
            visual.y = effect.y;
            visual.visible = effect.active;
            updateEffectVisual(visual, effect, context);
        }

        if (this.particleEffects.size > 0) this.particleContainer?.update();

        const activeEffectIds = new Set(effects.map((e) => e.id));
        for (const [id, visual] of this.effectVisuals) {
            if (!activeEffectIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.effectVisuals.delete(id);
            }
        }
        for (const [id, particle] of this.particleEffects) {
            if (!activeEffectIds.has(id)) {
                this.particleContainer?.removeParticle(particle);
                this.particleEffects.delete(id);
            }
        }
    }

    private syncParticleEffect(effect: Effect): void {
        const pc = this.particleContainer;
        if (!pc?.texture) return;

        if (!effect.active) {
            const p = this.particleEffects.get(effect.id);
            if (p) {
                pc.removeParticle(p);
                this.particleEffects.delete(effect.id);
            }
            return;
        }

        let particle = this.particleEffects.get(effect.id);
        if (!particle) {
            particle = new Particle({ texture: pc.texture, anchorX: 0.5, anchorY: 0.5 });
            pc.addParticle(particle);
            this.particleEffects.set(effect.id, particle);
        }

        particle.x = effect.x;
        particle.y = effect.y;
        const texW = Math.max(pc.texture.width || 0, 1);
        const texH = Math.max(pc.texture.height || 0, 1);

        const data = effect.effectData as { scale?: number; tint?: number };
        particle.tint = data.tint ?? 0xffffff;
        const life = 1 - effect.progress;
        particle.alpha = life * life;
        const base = (data.scale ?? 1) * 18;
        const s = Math.min(base * (0.6 + 0.4 * life), MAX_PARTICLE_PX);
        particle.scaleX = s / texW;
        particle.scaleY = s / texH;
    }

    destroy(): void {
        for (const visual of this.effectVisuals.values()) visual.destroy();
        this.effectVisuals.clear();
        this.particleEffects.clear();
        if (this.particleContainer) {
            this.particleContainer.destroy();
            this.particleContainer = null;
        }
    }
}
