import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { MISSION_MAP } from '../../index';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import { WorldOfDarknessStoryline } from '../WorldOfDarkness';
import {
    COURT_CRYSTAL_COUNT,
    COURT_CRYSTAL_START_TILES,
    COURT_MAGICIAN_MISSION,
    COURT_MAGICIAN_MISSION_ID,
    COURT_MAGICIAN_PLAYER_SPAWN_POINTS,
} from './013_court_magician';
import { BOSS_ARENA_CENTER, BOSS_ARENA_SIZE } from '../MapSegments/0_0_boss_arena';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';

registerWorldOfDarknessSegments();

function initMission(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
    COURT_MAGICIAN_MISSION.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager: new TerrainManager(COURT_MAGICIAN_MISSION.createTerrain()),
    });
    return engine;
}

describe('CourtMagicianMission', () => {
    it('is registered, sits in admin Chapter 0 and uses the circle arena', () => {
        expect(MISSION_MAP[COURT_MAGICIAN_MISSION_ID]).toBe(COURT_MAGICIAN_MISSION);
        const ch0 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch0')!;
        expect(ch0.missionIds).toContain(COURT_MAGICIAN_MISSION_ID);
        const terrain = COURT_MAGICIAN_MISSION.createTerrain();
        expect(terrain.width).toBe(BOSS_ARENA_SIZE);
        expect(terrain.height).toBe(BOSS_ARENA_SIZE);
        for (const t of [...COURT_CRYSTAL_START_TILES, ...COURT_MAGICIAN_PLAYER_SPAWN_POINTS]) {
            expect(terrain.isPassable((t.col + 0.5) * CELL_SIZE, (t.row + 0.5) * CELL_SIZE)).toBe(true);
        }
    });

    it('spawns the magician at the centre between two untouchable crystals, with the party on the west road', () => {
        const engine = initMission();
        const mage = engine.units.find((u) => u.characterId === 'court_magician')!;
        expect(mage).toBeDefined();
        expect(Math.floor(mage.x / CELL_SIZE)).toBe(BOSS_ARENA_CENTER.col);
        expect(hasUnitTag(mage, UnitTag.Boss)).toBe(true);
        const crystals = engine.units.filter((u) => u.characterId === 'court_crystal');
        expect(crystals).toHaveLength(COURT_CRYSTAL_COUNT);
        for (const c of crystals) {
            expect(hasUnitTag(c, UnitTag.Invincible)).toBe(true);
            expect(c.teamId).toBe(mage.teamId);
        }
        const player = engine.units.find((u) => u.teamId === 'player')!;
        expect(player.x).toBeLessThan(mage.x);
        engine.destroy();
    });

    it('AI smoke: the magician works through his kit, moves his crystals and blinks away from a player in his face', () => {
        const engine = initMission();
        const mage = engine.units.find((u) => u.characterId === 'court_magician')!;
        const player = engine.units.find((u) => u.teamId === 'player')!;
        const crystals = engine.units.filter((u) => u.characterId === 'court_crystal');
        const start = crystals.map((c) => ({ x: c.x, y: c.y }));
        const used = new Set<string>();
        engine.eventBus.on('ability_used', (e) => {
            if (e.unitId === mage.id) used.add(e.abilityId);
        });
        let blinked = false;
        for (let i = 0; i < 40 * 60; i++) {
            // The "player" stands in his face (refreshed every tick so blinking away is the only escape).
            if (Math.hypot(player.x - mage.x, player.y - mage.y) > 60) {
                player.x = mage.x - 40;
                player.y = mage.y;
                player.hp = player.maxHp;
            }
            const before = { x: mage.x, y: mage.y };
            resolveParallelOrderPause(engine);
            engine.stepSimulationFixedTicks(1);
            if (Math.hypot(mage.x - before.x, mage.y - before.y) > 100) blinked = true;
        }
        expect([...used]).toEqual(expect.arrayContaining(['1401', '1402', '1403']));
        expect(blinked).toBe(true);
        expect(crystals.some((c, i) => Math.hypot(c.x - start[i]!.x, c.y - start[i]!.y) > CELL_SIZE)).toBe(true);
        engine.destroy();
    });

    it('AI rotation: each half round opens with Rearrange then Nova and Volley; first round fixed, later random', () => {
        const engine = initMission();
        const mage = engine.units.find((u) => u.characterId === 'court_magician')!;
        const player = engine.units.find((u) => u.teamId === 'player')!;
        const casts: { t: number; id: string }[] = [];
        const rotation = new Set(['1401', '1402', '1403']);
        engine.eventBus.on('ability_used', (e) => {
            if (e.unitId === mage.id && rotation.has(e.abilityId)) casts.push({ t: engine.gameTime, id: e.abilityId });
        });
        for (let i = 0; i < 80 * 60; i++) {
            // Hold the player at mid range (no Blinks) and alive.
            player.hp = player.maxHp;
            const d = Math.hypot(player.x - mage.x, player.y - mage.y);
            if (Math.abs(d - 230) > 30) {
                const a = Math.atan2(player.y - mage.y, player.x - mage.x);
                player.x = mage.x + Math.cos(a) * 230;
                player.y = mage.y + Math.sin(a) * 230;
            }
            resolveParallelOrderPause(engine);
            engine.stepSimulationFixedTicks(1);
        }
        const halves = new Map<number, string[]>();
        for (const c of casts) {
            const h = Math.floor(c.t / 5 + 1e-6);
            halves.set(h, [...(halves.get(h) ?? []), c.id]);
        }
        expect(halves.get(0)).toEqual(['1401', '1402', '1403']);
        expect(halves.get(1)).toEqual(['1401', '1402', '1403']);
        const orders = new Set<string>();
        for (let h = 2; h < 16; h++) {
            const seq = halves.get(h)!;
            expect(seq, `half ${h}`).toHaveLength(3);
            expect(seq[0]).toBe('1401');
            orders.add(seq.join(','));
        }
        expect(orders).toEqual(new Set(['1401,1402,1403', '1401,1403,1402']));
        engine.destroy();
    });

    it('AI smoke: enraged, he stops time for the Crystal Laser', () => {
        const engine = initMission();
        const mage = engine.units.find((u) => u.characterId === 'court_magician')!;
        const player = engine.units.find((u) => u.teamId === 'player')!;
        player.x = mage.x - 200;
        player.y = mage.y;
        const used = new Set<string>();
        let sawTimeStop = false;
        engine.eventBus.on('ability_used', (e) => {
            if (e.unitId === mage.id) used.add(e.abilityId);
        });
        engine.eventBus.on('time_stop_started', () => {
            sawTimeStop = true;
        });
        mage.takeDamage(Math.ceil(mage.maxHp * 0.6), player.id, engine.eventBus);
        for (let i = 0; i < 25 * 60; i++) {
            player.hp = player.maxHp;
            resolveParallelOrderPause(engine);
            engine.stepSimulationFixedTicks(1);
        }
        expect(hasUnitTag(mage, UnitTag.Enraged)).toBe(true);
        expect(used.has('1490')).toBe(true);
        expect(sawTimeStop).toBe(true);
        engine.destroy();
    });
});
