/**
 * Invariants every CrowdSpacing resolver must keep, run against each one through CrowdSpacingManager.
 */
import { describe, expect, it } from 'vitest';
import { Unit } from '../units/Unit';
import { UnitTag } from '../units/unitTag';
import { CrowdSpacingManager } from './CrowdSpacingManager';
import type { CrowdSpacingResolver } from './CrowdSpacingResolver';
import { LegacyResolver } from './legacy/LegacyResolver';
import { MassResolver } from './mass/MassResolver';

const DT = 1 / 60;
const RADIUS = 20;
const SPEED = 100;
const SPREAD_TICKS = 120;

function makeUnit(id: string, x: number, y: number, tags: UnitTag[] = []): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: SPEED,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'alpha_wolf',
        name: id,
        radius: RADIUS,
        abilities: [],
    });
    unit.tags = [...tags];
    return unit;
}

function maxOverlap(units: Unit[]): number {
    let worst = 0;
    for (let i = 0; i < units.length; i++) {
        for (let j = i + 1; j < units.length; j++) {
            const a = units[i]!;
            const b = units[j]!;
            const overlap = a.radius + b.radius - Math.hypot(b.x - a.x, b.y - a.y);
            if (overlap > worst) worst = overlap;
        }
    }
    return worst;
}

const RESOLVERS: Array<[string, () => CrowdSpacingResolver]> = [
    ['legacy', () => new LegacyResolver()],
    ['mass', () => new MassResolver()],
];

describe.each(RESOLVERS)('CrowdSpacing resolver invariants (%s)', (_name, makeResolver) => {
    it('structures never move', () => {
        const structure = makeUnit('a_structure', 0, 0, [UnitTag.Structure]);
        const softs = [makeUnit('b', 10, 0), makeUnit('c', -5, 8), makeUnit('d', 0, -12)];
        const manager = new CrowdSpacingManager(makeResolver());
        // Mass mode moves softs at most their push budget per tick, so give them time to clear.
        for (let t = 0; t < 60; t++) manager.tick([structure, ...softs], null, DT, t * DT);
        expect(structure.x).toBe(0);
        expect(structure.y).toBe(0);
        expect(softs.some((s) => Math.hypot(s.x, s.y) > 2 * RADIUS - 1)).toBe(true);
    });

    it('exempt units are ignored', () => {
        const resolver = makeResolver();
        const exempt = makeUnit('a_exempt', 0, 0, [UnitTag.CrowdSpacingExempt]);
        const soft = makeUnit('b_soft', 10, 0);
        expect(resolver.isParticipant(exempt)).toBe(false);
        const manager = new CrowdSpacingManager(resolver);
        manager.tick([exempt, soft], null, DT, 0);
        expect(exempt.x).toBe(0);
        expect(soft.x).toBe(10);
        expect(manager.getContacts('b_soft')).toEqual([]);
    });

    it('an overlapping soft pack spreads over N ticks', () => {
        const pack = [
            makeUnit('p0', 0, 0),
            makeUnit('p1', 4, 1),
            makeUnit('p2', -3, 5),
            makeUnit('p3', 2, -6),
            makeUnit('p4', -5, -2),
            makeUnit('p5', 6, 6),
        ];
        const before = maxOverlap(pack);
        const manager = new CrowdSpacingManager(makeResolver());
        for (let t = 0; t < SPREAD_TICKS; t++) manager.tick(pack, null, DT, t * DT);
        expect(maxOverlap(pack)).toBeLessThan(before * 0.25);
    });

    it('records contacts for overlapping pairs', () => {
        const a = makeUnit('a', 0, 0);
        const b = makeUnit('b', 10, 0);
        const loner = makeUnit('z', 500, 500);
        const manager = new CrowdSpacingManager(makeResolver());
        manager.tick([a, b, loner], null, DT, 0);
        expect(manager.getContacts('a')).toEqual(['b']);
        expect(manager.getContacts('b')).toEqual(['a']);
        expect(manager.getContacts('z')).toEqual([]);
    });
});
