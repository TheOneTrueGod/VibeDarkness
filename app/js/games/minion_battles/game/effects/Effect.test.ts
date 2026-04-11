/**
 * Effect serialization tests: toJSON round-trip restores all saveable properties.
 */
import { describe, it, expect } from 'vitest';
import { Effect } from './Effect';

describe('Effect', () => {
    it('serializes and restores to an equivalent object', () => {
        const effect = new Effect({
            id: 'fx_1',
            x: 150,
            y: 250,
            duration: 0.5,
            effectType: 'impact',
        });
        effect.active = true;
        effect.elapsed = 0.2;

        const json = effect.toJSON();
        const restored = Effect.fromJSON(json);

        expect(restored.id).toBe(effect.id);
        expect(restored.x).toBe(effect.x);
        expect(restored.y).toBe(effect.y);
        expect(restored.active).toBe(effect.active);
        expect(restored.duration).toBe(effect.duration);
        expect(restored.effectType).toBe(effect.effectType);
        expect(restored.elapsed).toBe(effect.elapsed);
    });
});
