/**
 * sentryPatrol tree: walks its waypoint loop until disturbed (hurt, or an enemy seen close by),
 * then turns hostile and wakes sleeping sentries on the same team and tree within the alert radius.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { SentryPatrolAITreeContext } from './context';
import { runUnitAI, SENTRY_PATROL_AI_TREE, createAINav } from '../index';
import { TerrainGrid, CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../../terrain/TerrainManager';
import { TerrainType } from '../../../../terrain/TerrainType';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../../GameEngine';
import { DEFAULT_SENTRY_ALERT_RADIUS_PX, DEFAULT_SENTRY_NOTICE_RANGE_PX } from './index';

function makeTerrain(): TerrainManager {
    return new TerrainManager(new TerrainGrid(40, 30, CELL_SIZE, TerrainType.Grass));
}

function sentry(id: string, x: number, y: number, waypoints: { x: number; y: number }[] = [], treeId = 'sentryPatrol'): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: 90,
        maxHp: 90,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        // Generic unit (no `sentryWakeOn`) so these tests exercise the tree's default triggers.
        characterId: 'alpha_wolf',
        name: 'Sentry',
        abilities: [],
        radius: 16,
        unitAITreeId: treeId,
    });
    if (treeId === 'sentryPatrol') {
        const ctx = unit.aiContext as SentryPatrolAITreeContext;
        ctx.aiTree = 'sentryPatrol';
        ctx.waypoints = waypoints;
        ctx.waypointIndex = 0;
    }
    return unit;
}

function player(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 50,
        maxHp: 50,
        speed: 90,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Hero',
        abilities: [],
        radius: 16,
    });
}

function makeContext(
    units: Unit[],
    opts: { gameTime?: number; los?: boolean; bumps?: Record<string, string[]> } = {},
): AIContext {
    const terrainManager = makeTerrain();
    return {
        gameTick: 100,
        gameTime: opts.gameTime ?? 0,
        getUnit: (id) => units.find((u) => u.id === id),
        getUnits: () => units,
        getSpecialTiles: () => [],
        getAliveDefendPoints: () => [],
        getLightSources: () => [],
        terrainManager,
        nav: createAINav(() => terrainManager),
        queueOrder: () => {},
        emitTurnEnd: () => {},
        generateRandomInteger: (min) => min,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        hasLineOfSight: () => opts.los ?? true,
        cancelActiveAbility: () => {},
        getAbilityUsesThisRound: () => 0,
        getBumpedUnitIds: (id) => opts.bumps?.[id] ?? [],
    };
}

const state = (u: Unit) => (u.aiContext as SentryPatrolAITreeContext).aiState;
const cellOf = (p: { x: number; y: number }) => ({ col: Math.floor(p.x / CELL_SIZE), row: Math.floor(p.y / CELL_SIZE) });

describe('sentryPatrol patrol', () => {
    it('walks to the next waypoint on arrival and back again', () => {
        const a = { x: 100, y: 100 };
        const b = { x: 500, y: 100 };
        const s = sentry('s1', a.x, a.y, [a, b]);
        const farHero = player('h', 1400, 1000);
        const units = [s, farHero];

        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units));
        expect(state(s)).toBe('sentryPatrol_patrol');
        expect(s.walkIntent?.dest).toEqual(cellOf(b));

        s.x = b.x;
        s.y = b.y;
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units, { gameTime: 10 }));
        expect(s.walkIntent?.dest).toEqual(cellOf(a));
    });

    it('ignores a nearby enemy it cannot see', () => {
        const s = sentry('s1', 100, 100);
        const units = [s, player('h', 150, 100)];
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units, { los: false }));
        expect(state(s)).toBe('sentryPatrol_patrol');
    });
});

describe('sentryPatrol disturbance', () => {
    it('wakes when a visible enemy comes within notice range', () => {
        const s = sentry('s1', 100, 100);
        const hero = player('h', 100 + DEFAULT_SENTRY_NOTICE_RANGE_PX - 10, 100);
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext([s, hero]));
        expect(state(s)).toBe('sentryPatrol_hostile');
        expect(s.aiContext.targetUnitId).toBe('h');
    });

    it('stays asleep with the enemy just outside notice range', () => {
        const s = sentry('s1', 100, 100);
        const hero = player('h', 100 + DEFAULT_SENTRY_NOTICE_RANGE_PX + 10, 100);
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext([s, hero]));
        expect(state(s)).toBe('sentryPatrol_patrol');
    });

    it('wakes when it loses HP, even with no enemy in sight', () => {
        const s = sentry('s1', 100, 100);
        const hero = player('h', 1400, 1000);
        const units = [s, hero];
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units));
        expect(state(s)).toBe('sentryPatrol_patrol');

        s.hp -= 5;
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units, { gameTime: 0.5 }));
        expect(state(s)).toBe('sentryPatrol_hostile');
        expect(s.aiContext.targetUnitId).toBe('h');
    });

    it('wakes sentries on the same tree within the alert radius, and only those', () => {
        const s = sentry('s1', 100, 100);
        const near = sentry('near', 100 + DEFAULT_SENTRY_ALERT_RADIUS_PX - 20, 100);
        const far = sentry('far', 100 + DEFAULT_SENTRY_ALERT_RADIUS_PX + 20, 100);
        const otherTree = sentry('other', 120, 100, [], 'hunt');
        const hero = player('h', 150, 100);
        const units = [s, near, far, otherTree, hero];

        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units));

        expect(state(s)).toBe('sentryPatrol_hostile');
        expect(state(near)).toBe('sentryPatrol_hostile');
        expect(near.aiContext.targetUnitId).toBe('h');
        expect(state(far)).toBeUndefined();
        expect(otherTree.aiContext.aiState).toBeUndefined();
    });
});

describe('sentryPatrol wake triggers', () => {
    const husk = (id: string, x: number, y: number) => {
        const u = sentry(id, x, y);
        u.characterId = 'husk';
        return u;
    };

    it('a Husk ignores an enemy in plain sight right next to it', () => {
        const s = husk('s1', 100, 100);
        const hero = player('h', 140, 100);
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext([s, hero]));
        expect(state(s)).toBe('sentryPatrol_patrol');
    });

    it('a Husk wakes and targets the enemy that bumps into it', () => {
        const s = husk('s1', 100, 100);
        const near = husk('near', 200, 100);
        const hero = player('h', 130, 100);
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext([s, near, hero], { bumps: { s1: ['h'] } }));
        expect(state(s)).toBe('sentryPatrol_hostile');
        expect(s.aiContext.targetUnitId).toBe('h');
        expect(state(near)).toBe('sentryPatrol_hostile');
    });

    it('a Husk is not woken by bumping into a fellow Husk', () => {
        const s = husk('s1', 100, 100);
        const other = husk('s2', 120, 100);
        const hero = player('h', 1400, 1000);
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext([s, other, hero], { bumps: { s1: ['s2'] } }));
        expect(state(s)).toBe('sentryPatrol_patrol');
    });

    it('a Husk still wakes when hurt', () => {
        const s = husk('s1', 100, 100);
        const units = [s, player('h', 1400, 1000)];
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units));
        s.hp -= 5;
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext(units, { gameTime: 0.5 }));
        expect(state(s)).toBe('sentryPatrol_hostile');
    });

    it('a spawn-level wakeOn overrides the unit def', () => {
        const s = husk('s1', 100, 100);
        (s.aiContext as SentryPatrolAITreeContext).wakeOn = ['sight'];
        const hero = player('h', 140, 100);
        runUnitAI(s, SENTRY_PATROL_AI_TREE, makeContext([s, hero]));
        expect(state(s)).toBe('sentryPatrol_hostile');
    });

    it('units without sentryWakeOn keep the default (sight wakes, bump does not)', () => {
        const sees = sentry('s1', 100, 100);
        runUnitAI(sees, SENTRY_PATROL_AI_TREE, makeContext([sees, player('h', 140, 100)]));
        expect(state(sees)).toBe('sentryPatrol_hostile');

        const bumped = sentry('s2', 100, 100);
        const hero = player('h', 1400, 1000);
        runUnitAI(bumped, SENTRY_PATROL_AI_TREE, makeContext([bumped, hero], { los: false, bumps: { s2: ['h'] } }));
        expect(state(bumped)).toBe('sentryPatrol_patrol');
    });
});
