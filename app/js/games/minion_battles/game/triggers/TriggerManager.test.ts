import { describe, it, expect, vi } from 'vitest';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { Unit } from '../units/Unit';
import { TriggerManager, type TriggerActionHost } from './TriggerManager';
import type { MissionConditionContext } from './missionConditions';
import type { TriggerDef } from './triggerTypes';

interface FakeUnit {
    id: string;
    x: number;
    y: number;
    teamId: string;
    characterId: string;
    ownerId: string;
    tags: string[];
    hp: number;
}

function fakeUnit(id: string, col: number, row: number, ownerId = 'p1'): FakeUnit {
    return {
        id,
        x: (col + 0.5) * CELL_SIZE,
        y: (row + 0.5) * CELL_SIZE,
        teamId: ownerId === 'ai' ? 'enemy' : 'player',
        characterId: ownerId === 'ai' ? 'dark_wolf' : 'player',
        ownerId,
        tags: [],
        hp: 10,
    };
}

function asUnit(u: FakeUnit): Unit {
    return Object.assign(u, {
        isAlive: () => u.hp > 0,
        isPlayerControlled: () => u.ownerId !== 'ai',
    }) as unknown as Unit;
}

function setup(triggers: TriggerDef[], units: FakeUnit[]) {
    const ctx = {
        units: units.map(asUnit),
        terrainManager: null,
        roundNumber: 1,
        isObjectiveCompleted: () => false,
    } as unknown as MissionConditionContext;
    const host: TriggerActionHost = {
        spawnWave: vi.fn(),
        emitMessage: vi.fn(),
        revealObjectives: vi.fn(),
    };
    const manager = new TriggerManager(ctx);
    manager.registerTriggers(triggers);
    return { manager, host, ctx };
}

const ROAD = { type: 'rect', col: 10, row: 0, width: 5, height: 5 } as const;

function enterRoad(overrides: Partial<TriggerDef> = {}): TriggerDef {
    return {
        id: 'left_cave',
        events: [{ type: 'unitEntersRegion', region: ROAD, unit: { owner: 'anyPlayer' } }],
        actions: [{ type: 'message', text: 'out' }],
        ...overrides,
    };
}

describe('TriggerManager', () => {
    it('fires when a matching unit enters the region, once by default', () => {
        const hero = fakeUnit('hero', 2, 2);
        const { manager, host } = setup([enterRoad()], [hero]);

        manager.process(host);
        expect(host.emitMessage).not.toHaveBeenCalled();

        hero.x = 11.5 * CELL_SIZE;
        manager.process(host);
        expect(host.emitMessage).toHaveBeenCalledTimes(1);
        expect(manager.hasFired('left_cave')).toBe(true);

        hero.x = 2.5 * CELL_SIZE;
        manager.process(host);
        hero.x = 11.5 * CELL_SIZE;
        manager.process(host);
        expect(host.emitMessage).toHaveBeenCalledTimes(1);
    });

    it('ignores units the filter excludes, and repeats on each entry when fireOnce is false', () => {
        const wolf = fakeUnit('wolf', 11, 1, 'ai');
        const hero = fakeUnit('hero', 2, 2);
        const { manager, host } = setup([enterRoad({ fireOnce: false })], [wolf, hero]);
        manager.process(host);
        expect(host.emitMessage).not.toHaveBeenCalled();

        hero.x = 11.5 * CELL_SIZE;
        manager.process(host);
        manager.process(host); // still inside: no new entry
        hero.x = 2.5 * CELL_SIZE;
        manager.process(host);
        hero.x = 12.5 * CELL_SIZE;
        manager.process(host);
        expect(host.emitMessage).toHaveBeenCalledTimes(2);
    });

    it('checks conditions with and / or / not and triggerFired', () => {
        const hero = fakeUnit('hero', 11, 1);
        const gated = enterRoad({
            id: 'gated',
            conditions: [{ type: 'and', conditions: [{ type: 'triggerFired', triggerId: 'other' }, { type: 'not', condition: { type: 'atLeastRound', round: 5 } }] }],
        });
        const { manager, host } = setup([gated], [hero]);
        manager.process(host);
        expect(host.emitMessage).not.toHaveBeenCalled();
        expect(manager.hasFired('gated')).toBe(false);
    });

    it('a disabled trigger waits for setTriggerEnabled, and units already inside do not count as entering', () => {
        const hero = fakeUnit('hero', 11, 1);
        const sleeper = enterRoad({ id: 'sleeper', enabled: false });
        const waker: TriggerDef = {
            id: 'waker',
            events: [{ type: 'unitEntersRegion', region: { type: 'rect', col: 0, row: 0, width: 5, height: 5 } }],
            actions: [{ type: 'setTriggerEnabled', triggerId: 'sleeper', enabled: true }],
        };
        const { manager, host } = setup([sleeper, waker], [hero]);
        manager.process(host);
        expect(host.emitMessage).not.toHaveBeenCalled();

        hero.x = 2.5 * CELL_SIZE; // wakes the sleeper
        manager.process(host);
        expect(manager.isEnabled(sleeper)).toBe(true);
        hero.x = 11.5 * CELL_SIZE;
        manager.process(host);
        expect(host.emitMessage).toHaveBeenCalledTimes(1);
    });

    it('spawnWave nearTriggeringUnit centres every entry on the unit that entered', () => {
        const hero = fakeUnit('hero', 12, 3);
        const trigger = enterRoad({
            actions: [
                {
                    type: 'spawnWave',
                    spawns: [{ characterId: 'dark_wolf', spawnBehaviour: 'edgeOfMap', inDarkness: true, spawnCount: 2, unitAITreeId: 'hunt' }],
                    nearTriggeringUnit: { radiusTiles: 6 },
                },
            ],
        });
        const { manager, host } = setup([trigger], [hero]);
        manager.process(host);
        expect(host.spawnWave).toHaveBeenCalledWith(
            [expect.objectContaining({ spawnBehaviour: 'anywhere', inDarkness: true, spawnTarget: { x: hero.x, y: hero.y, radius: 6 } })],
            undefined,
        );
    });

    it('round-trips its state through JSON', () => {
        const hero = fakeUnit('hero', 11, 1);
        const { manager, host, ctx } = setup([enterRoad({ fireOnce: false })], [hero]);
        manager.process(host);
        const restored = new TriggerManager(ctx);
        restored.setTriggers([enterRoad({ fireOnce: false })]);
        restored.restoreFromJSON(JSON.parse(JSON.stringify(manager.toJSON())));
        expect(restored.hasFired('left_cave')).toBe(true);
        restored.process(host); // hero still inside: no re-fire after restore
        expect(host.emitMessage).toHaveBeenCalledTimes(1);
    });
});
