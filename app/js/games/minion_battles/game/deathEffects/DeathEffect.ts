import type { GameEngine } from '../GameEngine';
import type { Unit } from '../../objects/Unit';

export abstract class DeathEffect {
    abstract doEffect(engine: GameEngine, unit: Unit): void;
}

