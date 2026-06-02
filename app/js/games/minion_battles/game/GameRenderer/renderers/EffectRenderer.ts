import type { Container } from 'pixi.js';
import type { Effect } from '../../effects/Effect';
import type { AssetRegistry } from '../AssetRegistry';

export class EffectRenderer {
    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {}

    render(effects: Effect[]): void {
        // TODO: migrate renderEffects() and syncParticleEffect() from GameRenderer.
        //       EffectRenderer owns: effectVisuals map, particleEffects map, and the
        //       ParticleContainer (currently managed directly by GameRenderer).
    }

    destroy(): void {
        // TODO: destroy effectVisuals, particleEffects, and the ParticleContainer
    }
}
