/**
 * CrowdSpacingManager contacts: each tick's overlapping pairs are recorded as "bumps" (both
 * directions) and reset on the next tick.
 */
import { describe, expect, it } from 'vitest';
import { Unit } from '../units/Unit';
import { CrowdSpacingManager } from './CrowdSpacingManager';
import { LegacyResolver } from './legacy/LegacyResolver';
import { createCrowdSpacingResolver } from './crowdSpacingMode';

const TICK_DT = 1 / 60;

function makeUnit(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'alpha_wolf',
        name: id,
        radius: 20,
        abilities: [],
    });
}

describe('CrowdSpacingManager contacts', () => {
    it('records overlapping units as contacts of each other, and nothing for loners', () => {
        const a = makeUnit('a', 100, 100);
        const b = makeUnit('b', 110, 100);
        const loner = makeUnit('loner', 900, 900);
        const manager = new CrowdSpacingManager();
        manager.tick([a, b, loner], null, TICK_DT, 0);

        expect(manager.getContacts('a')).toEqual(['b']);
        expect(manager.getContacts('b')).toEqual(['a']);
        expect(manager.getContacts('loner')).toEqual([]);
    });

    it('forgets last tick contacts once the units no longer overlap', () => {
        const a = makeUnit('a', 100, 100);
        const b = makeUnit('b', 110, 100);
        const manager = new CrowdSpacingManager();
        manager.tick([a, b], null, TICK_DT, 0);
        b.x = 600;
        manager.tick([a, b], null, TICK_DT, 0);
        expect(manager.getContacts('a')).toEqual([]);
    });
});

describe('CrowdSpacingManager resolver delegation', () => {
    it('defaults to the factory resolver and accepts setResolver at runtime', () => {
        const manager = new CrowdSpacingManager();
        expect(manager.getResolver().mode).toBe(createCrowdSpacingResolver().mode);
        const legacy = new LegacyResolver();
        manager.setResolver(legacy);
        expect(manager.getResolver()).toBe(legacy);
    });

    it('passes participants, dt and contacts through to the resolver', () => {
        const legacy = new LegacyResolver();
        const seen: { ids: string[]; dt: number }[] = [];
        const spy = {
            mode: legacy.mode,
            isParticipant: (u: Unit) => u.id !== 'skip',
            radius: (u: Unit) => legacy.radius(u),
            resolve: (args: Parameters<LegacyResolver['resolve']>[0]) => {
                seen.push({ ids: args.participants.map((p) => p.id), dt: args.dt });
                legacy.resolve(args);
            },
        };
        const manager = new CrowdSpacingManager(spy);
        manager.tick([makeUnit('a', 100, 100), makeUnit('b', 110, 100), makeUnit('skip', 105, 100)], null, TICK_DT, 0);
        expect(seen).toEqual([{ ids: ['a', 'b'], dt: TICK_DT }]);
        expect(manager.getContacts('a')).toEqual(['b']);
        expect(manager.getContacts('skip')).toEqual([]);
    });

    it('hands the beginTick snapshot to the resolver for one tick only', () => {
        const legacy = new LegacyResolver();
        const seen: Array<Record<string, { x: number; y: number }>> = [];
        const spy = {
            mode: legacy.mode,
            isParticipant: () => true,
            radius: (u: Unit) => legacy.radius(u),
            resolve: (args: Parameters<LegacyResolver['resolve']>[0]) => {
                seen.push(Object.fromEntries(args.tickStartPositions ?? new Map()));
            },
        };
        const manager = new CrowdSpacingManager(spy);
        const a = makeUnit('a', 100, 100);
        manager.beginTick([a]);
        a.x = 104;
        manager.tick([a], null, TICK_DT, 0);
        manager.tick([a], null, TICK_DT, 0);
        expect(seen).toEqual([{ a: { x: 100, y: 100 } }, {}]);
    });
});
