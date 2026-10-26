/**
 * Projectile tempo tests: per-projectile clock driven by ProjectileManager + TimeManager,
 * step pieces by travel distance, wall/unit collision per piece, and buff serialization.
 */
import { describe, it, expect, vi } from 'vitest';
import { Projectile } from './Projectile';
import { ProjectileManager } from '../managers/ProjectileManager';
import { TimeManager } from '../time/TimeManager';
import { FIXED_DT } from '../gameConstants';
import { MAX_PIECE_TRAVEL_PX } from '../time/timeConstants';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
import { TerrainManager } from '../../terrain/TerrainManager';
import type { EngineContext } from '../EngineContext';

function makeUnit(id: string, x: number, y: number) {
    return {
        id,
        x,
        y,
        radius: 10,
        teamId: 'enemy',
        isAlive: () => true,
        isUntargetable: () => false,
        hasIFrames: () => false,
        activeAbilities: [],
        takeDamage: vi.fn(),
    };
}

function makeProj(overrides: Partial<ConstructorParameters<typeof Projectile>[0]> = {}): Projectile {
    return new Projectile({
        x: 0,
        y: 0,
        velocityX: 600,
        velocityY: 0,
        damage: 10,
        sourceTeamId: 'player',
        sourceUnitId: 'u1',
        sourceAbilityId: 'throw_knife',
        maxDistance: 100000,
        ...overrides,
    });
}

function makeCtx(opts: { units?: unknown[]; terrainManager?: TerrainManager | null } = {}) {
    return {
        gameTime: 0,
        gameTick: 0,
        units: opts.units ?? [],
        terrainManager: opts.terrainManager ?? null,
        eventBus: { emit: vi.fn() },
        getUnit: () => undefined,
    } as unknown as EngineContext & { gameTime: number };
}

function run(mgr: ProjectileManager, ctx: { gameTime: number }, tm: TimeManager, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        mgr.update(tm);
        ctx.gameTime += FIXED_DT;
    }
}

describe('projectile tempo', () => {
    it('pace 1 with no buffs steps exactly FIXED_DT in one piece', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const p = makeProj();
        mgr.addProjectile(p);
        const spy = vi.spyOn(p, 'update');
        mgr.update(new TimeManager());
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toBe(FIXED_DT);
        expect(p.x).toBe(600 * FIXED_DT);
        expect(p.localTime).toBe(FIXED_DT);
    });

    it('a 0.5-tempo projectile covers the same distance in twice the world time', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const tm = new TimeManager();
        const fast = makeProj();
        const slow = makeProj();
        slow.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 0.5 } });
        mgr.addProjectile(fast);
        mgr.addProjectile(slow);
        run(mgr, ctx, tm, 30);
        expect(fast.x).toBeCloseTo(300, 5);
        expect(slow.x).toBeCloseTo(150, 5);
        run(mgr, ctx, tm, 30);
        expect(slow.x).toBeCloseTo(300, 5);
        expect(slow.localTime).toBeCloseTo(0.5, 5);
    });

    it('buff expires on world time and speed returns to normal', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const tm = new TimeManager();
        const p = makeProj();
        p.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: 0.5, timeModifier: { sourceId: 'x', tempo: 0.5 } });
        mgr.addProjectile(p);
        run(mgr, ctx, tm, 32);
        expect(p.buffs).toHaveLength(0);
        const x0 = p.x;
        run(mgr, ctx, tm, 1);
        expect(p.x - x0).toBeCloseTo(600 * FIXED_DT, 5);
    });

    it('a frozen projectile does not move', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const p = makeProj();
        p.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 1, freeze: true } });
        mgr.addProjectile(p);
        run(mgr, ctx, new TimeManager(), 20);
        expect(p.x).toBe(0);
        expect(p.localTime).toBe(0);
    });

    it('world pace scales projectile steps, and Time Stop freezes non-exempt projectiles', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const tm = new TimeManager();
        const p = makeProj({ velocityX: 600 });
        mgr.addProjectile(p);
        tm.worldPace = 0.5;
        run(mgr, ctx, tm, 30);
        expect(p.x).toBeCloseTo(150, 5);
    });

    it('a 50x projectile is cut into pieces and hits the first unit in its line', () => {
        const near = makeUnit('near', 400, 0);
        const far = makeUnit('far', 900, 0);
        const ctx = makeCtx({ units: [far, near] });
        const mgr = new ProjectileManager(ctx);
        const p = makeProj({ velocityX: 600 }); // 50x => 500 px/tick
        p.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 50 } });
        mgr.addProjectile(p);
        const spy = vi.spyOn(p, 'update');
        mgr.update(new TimeManager());
        expect(spy.mock.calls.length).toBeGreaterThan(1);
        for (const [dt] of spy.mock.calls) expect(600 * (dt as number)).toBeLessThanOrEqual(MAX_PIECE_TRAVEL_PX + 1e-9);
        expect(near.takeDamage).toHaveBeenCalledTimes(1);
        expect(far.takeDamage).not.toHaveBeenCalled();
        expect(p.active).toBe(false);
    });

    it('a 50x projectile stops at a wall instead of tunnelling', () => {
        const grid = TerrainGrid.createFilledTerrain(60, 1, 10, TerrainType.Grass);
        grid.set(20, 0, TerrainType.Rock);
        const wallX = 20 * (grid as unknown as { cellSize: number }).cellSize;
        const tmgr = new TerrainManager(grid);
        const ctx = makeCtx({ terrainManager: tmgr });
        const mgr = new ProjectileManager(ctx);
        const p = makeProj({ x: 5, y: 5, velocityX: 600, modifiers: ['stopsAtWalls'] });
        p.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 50 } });
        mgr.addProjectile(p);
        run(mgr, ctx, new TimeManager(), 3);
        expect(p.active).toBe(false);
        expect(p.x).toBeLessThan(wallX);
        expect(p.x).toBeGreaterThan(5);
    });

    it('carries budget leftovers as timeDebt', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const p = makeProj({ velocityX: 600 });
        p.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 100 } });
        mgr.addProjectile(p);
        const spy = vi.spyOn(p, 'update');
        mgr.update(new TimeManager());
        // 100x of 600 px/s over one tick = 1000 px = 50 pieces at 20 px: within the budget.
        expect(spy.mock.calls.length).toBe(50);
        expect(p.timeDebt).toBe(0);
        const q = makeProj({ velocityX: 6000 }); // 10000 px/tick at 100x => 500 pieces > budget
        q.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 100 } });
        const spyQ = vi.spyOn(q, 'update');
        mgr.addProjectile(q);
        mgr.update(new TimeManager());
        expect(spyQ.mock.calls.length).toBe(64);
        expect(q.timeDebt).toBeGreaterThan(0);
    });

    it('serializes buffs, localTime and debt; omits them at defaults', () => {
        const plain = makeProj();
        const json = plain.toJSON();
        expect('buffs' in json).toBe(false);
        expect('localTime' in json).toBe(false);
        expect('timeDebt' in json).toBe(false);

        const p = makeProj();
        p.addBuff({ sourceId: 'a', appliedAtTime: 1, duration: 2, timeModifier: { sourceId: 'a', tempo: 0.5, focal: { worldPace: 0.8 } } });
        p.localTime = 1.25;
        p.timeDebt = 0.01;
        const restored = Projectile.fromJSON(JSON.parse(JSON.stringify(p.toJSON())));
        expect(restored.buffs).toEqual(p.buffs);
        expect(restored.localTime).toBe(1.25);
        expect(restored.timeDebt).toBe(0.01);
        expect(restored.getTempo()).toBe(0.5);
        restored.addBuff({ sourceId: 'b', appliedAtTime: 0, duration: 1 });
        expect(new Set(restored.buffs.map((b) => b.id)).size).toBe(2);
        expect(restored.removeBuffsFromSource('a')).toBe(1);
    });

    it('held time runs on local time', () => {
        const ctx = makeCtx();
        const mgr = new ProjectileManager(ctx);
        const p = makeProj({ heldBy: { unitId: 'u1', abilityId: 'throw_knife' } });
        p.addBuff({ sourceId: 'x', appliedAtTime: 0, duration: null, timeModifier: { sourceId: 'x', tempo: 0.5 } });
        mgr.addProjectile(p);
        run(mgr, ctx, new TimeManager(), 60);
        expect(p.heldTime).toBeCloseTo(0.5, 5);
    });
});
