import { describe, it, expect } from 'vitest';
import {
    buildMeleeTrackingEntries,
    getMeleeTrackingAimPoint,
    updateMeleeTrackingEntry,
} from './meleeTrackingHelpers';
import { Unit } from '../game/units/Unit';
import type { Effect } from '../game/effects/Effect';

function createUnit(config: {
    id: string;
    x: number;
    y: number;
    teamId: 'player' | 'enemy';
    hp?: number;
}): Unit {
    return new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        hp: config.hp ?? 100,
        maxHp: config.hp ?? 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.teamId === 'player' ? 'p1' : 'ai',
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.id,
        abilities: [],
    });
}

describe('meleeTrackingHelpers — tracked unit dies before ability fires', () => {
    it('updateMeleeTrackingEntry: does not lock or spawn Dodged when tracked unit dies in range', () => {
        const caster = createUnit({ id: 'caster', x: 0, y: 0, teamId: 'player' });
        const target = createUnit({ id: 'target', x: 40, y: 0, teamId: 'enemy' });

        const [entry] = buildMeleeTrackingEntries([target]);
        expect(entry.unitId).toBe('target');
        expect(entry.lockedPosition).toBeNull();

        // Target dies before the strike fires
        target.hp = 0;
        target.active = false;
        expect(target.isAlive()).toBe(false);

        const spawnedEffects: Effect[] = [];
        const engine = {
            getUnit: (id: string): Unit | undefined => (id === target.id ? target : undefined),
            addEffect: (e: Effect) => { spawnedEffects.push(e); },
            gameTime: 0,
        };

        // Dead unit is within tether range — no evade, no tether break
        const maxRange = 120;
        updateMeleeTrackingEntry(engine, caster, entry, maxRange);

        // Dead unit should not trigger a lockedPosition lock or a "Dodged" floating text
        expect(entry.lockedPosition).toBeNull();
        expect(spawnedEffects).toHaveLength(0);
    });

    it('getMeleeTrackingAimPoint: returns dead unit position so ability fires in correct direction', () => {
        const target = createUnit({ id: 'target', x: 50, y: 20, teamId: 'enemy' });
        const [entry] = buildMeleeTrackingEntries([target]);

        // Kill the target
        target.hp = 0;
        target.active = false;

        const engine = {
            getUnit: (id: string): Unit | undefined => (id === target.id ? target : undefined),
        };

        const fallback = { x: 0, y: 0 };
        const aimPoint = getMeleeTrackingAimPoint(engine, entry, fallback);

        // Dead units are still found by getUnit (they remain in the units array).
        // The aim point resolves to their last known position; the ability's doCardEffect
        // then checks isAlive() and skips damage — the hitbox just fires in the right direction.
        expect(aimPoint).toEqual({ x: 50, y: 20 });
    });

    it('getMeleeTrackingAimPoint: falls back to pixel target when unit is no longer in engine', () => {
        const target = createUnit({ id: 'target', x: 50, y: 20, teamId: 'enemy' });
        const [entry] = buildMeleeTrackingEntries([target]);

        // Engine has no knowledge of the unit (e.g. despawned)
        const engine = {
            getUnit: (_id: string): Unit | undefined => undefined,
        };

        const fallback = { x: 99, y: 77 };
        const aimPoint = getMeleeTrackingAimPoint(engine, entry, fallback);

        expect(aimPoint).toEqual(fallback);
    });
});
