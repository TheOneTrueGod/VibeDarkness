/**
 * Court Magician kit on a full engine tick: Rearrange glides the crystals onto their formation,
 * Shard Nova rings every crystal (denser when enraged), Crystal Volley sends 4 (6 enraged) crystals
 * ramming in turn, Blink teleports, and Crystal Laser stops time, walls the crystals and fires rays
 * that stop on the first body, are blocked by a facing shield and by rock. Also: AI blink rules and
 * crystals fading with their master.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../game/GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { createUnitFromSpawnConfig } from '../../game/units';
import type { Unit } from '../../game/units/Unit';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import { getAbility } from '../../abilities/AbilityRegistry';
import { resolveParallelOrderPause } from '../../testing/runner/SimulationRunner';
import { CARD_DEF_MAP } from '../index';
import { getBestiaryUnitIds, getUnitDefEntry } from '../../game/units/unit_defs/unitDef';
import { addUnitTag, hasUnitTag, UnitTag } from '../../game/units/unitTag';
import { despawnIfMasterGone } from '../../game/units/boundUnits';
import type { ResolvedTarget } from '../../game/types';
import { ENEMY_COURT_CRYSTAL, ENEMY_COURT_MAGICIAN } from '../../constants/enemyConstants';
import {
    BLINK_ABILITY_ID,
    COURT_CRYSTAL_ID,
    CRYSTAL_LANDING_PULSE_RADII,
    crystalLandingPulse,
    CRYSTAL_LASER_ABILITY_ID,
    CRYSTAL_RAM_ABILITY_ID,
    CRYSTAL_VOLLEY_ABILITY_ID,
    MIRROR_SWAP_ABILITY_ID,
    REARRANGE_ABILITY_ID,
    SHARD_NOVA_ABILITY_ID,
} from './courtMagicianConstants';
import { pickSwapCrystal } from './1406_MirrorSwap/1406Ability';
import { HP_STEP_COMPONENT, peekHpStepState } from '../../game/units/components/hpStepComponent';
import { assignUnitsToSlots } from '../../game/formations/formationDef';
import { readRearrangePayload } from './1401_Rearrange/1401Ability';
import {
    SHARD_NOVA_ENRAGED_RING_COUNT,
    SHARD_NOVA_RING_COUNT,
    SHARD_NOVA_ROCK_HITS_TO_BREAK,
    SHARD_NOVA_WINDUP_SEC,
    spawnDarkShard,
} from './1402_ShardNova/1402Ability';
import { CRYSTAL_VOLLEY_COUNT, CRYSTAL_VOLLEY_ENRAGED_COUNT, pickVolleyCrystals } from './1403_CrystalVolley/1403Ability';
import {
    CRYSTAL_LASER_AIM_SEC,
    CRYSTAL_LASER_FREEZE_SEC,
    CRYSTAL_LASER_PULSE_SEC,
    CRYSTAL_LASER_ROCK_HITS_TO_BREAK,
    CRYSTAL_LASER_TITLE,
    readCrystalLaserPayload,
} from './1490_CrystalLaser/1490Ability';
import { DARK_SHARD_PROJECTILE_TYPE } from '../../game/projectiles/projectile_defs/darkShardDef';
import {
    CONTACT_GRACE_SEC,
    CONTACT_HP_LOSS_FRACTION,
    shouldBlink,
    updateContact,
} from '../../game/units/unitAI/courtMagician/courtMagicianAI';
import { LitClippingPreviewGraphics } from '../../game/GameRenderer/renderers/LitClippingPreviewGraphics';
import type { PulseEffectData } from '../../game/effect_defs/aoeEffects';
import type { CourtMagicianAITreeContext } from '../../game/units/unitAI/courtMagician/context';

const GRID = 30;
const ROW = 15;
const PLAYER_ID = 'p1';
const TICKS_PER_SEC = 60;
const CRYSTALS = 6;

const centre = (cell: number) => (cell + 0.5) * CELL_SIZE;

function setupEngine(rockCells: Array<[number, number]> = []): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(GRID, GRID, CELL_SIZE, TerrainType.Grass);
    for (const [col, row] of rockCells) grid.set(col, row, TerrainType.Rock);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: PLAYER_ID, randomSeed: 1, terrainManager: new TerrainManager(grid), aiControllerId: null });
    engine.setMissionLightConfig(false, 0);
    return engine;
}

function addMagician(engine: GameEngine, x = centre(5), y = centre(ROW)): Unit {
    const u = createUnitFromSpawnConfig({ ...ENEMY_COURT_MAGICIAN, x, y, ownerId: 'ai', unitAITreeId: 'none' }, engine.eventBus, engine);
    engine.addUnit(u, 'initialGameSpawn');
    return u;
}

/** Six crystals on a ring of `radius` px around (x, y). */
function addCrystals(engine: GameEngine, x: number, y: number, radius = 3 * CELL_SIZE): Unit[] {
    return Array.from({ length: CRYSTALS }, (_, i) => {
        const a = (i / CRYSTALS) * Math.PI * 2;
        const c = createUnitFromSpawnConfig(
            { ...ENEMY_COURT_CRYSTAL, x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius, ownerId: 'ai', unitAITreeId: 'none' },
            engine.eventBus,
            engine,
        );
        engine.addUnit(c, 'initialGameSpawn');
        return c;
    });
}

function addPlayer(engine: GameEngine, x: number, y = centre(ROW), id = 'P'): Unit {
    const p = createUnitFromSpawnConfig(
        { characterId: 'player', name: id, x, y, teamId: 'player', ownerId: PLAYER_ID, abilities: ['0104'] },
        engine.eventBus,
        engine,
    );
    engine.addUnit(p, 'initialGameSpawn');
    return p;
}

function cast(engine: GameEngine, unit: Unit, abilityId: string, targets: ResolvedTarget[]): void {
    executeUnitAbility(unit, getAbility(abilityId)!, targets, engine);
}

const at = (u: { x: number; y: number }, trackUnitId?: string): ResolvedTarget[] => [
    { type: 'pixel', position: { x: u.x, y: u.y }, ...(trackUnitId ? { trackUnitId } : {}) },
];

function stepTicks(engine: GameEngine, ticks: number, each?: () => void): void {
    for (let i = 0; i < ticks; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
        each?.();
    }
}

const stepSeconds = (engine: GameEngine, seconds: number, each?: () => void) =>
    stepTicks(engine, Math.round(seconds * TICKS_PER_SEC), each);

const crystalsOf = (engine: GameEngine) => engine.units.filter((u) => u.characterId === COURT_CRYSTAL_ID && u.isAlive());

describe('Court Magician registration', () => {
    it('registers every ability and card, lists both units in the Bestiary, and makes crystals untouchable', () => {
        for (const id of [
            REARRANGE_ABILITY_ID,
            SHARD_NOVA_ABILITY_ID,
            CRYSTAL_VOLLEY_ABILITY_ID,
            CRYSTAL_RAM_ABILITY_ID,
            BLINK_ABILITY_ID,
            MIRROR_SWAP_ABILITY_ID,
            CRYSTAL_LASER_ABILITY_ID,
        ]) {
            expect(getAbility(id), id).toBeDefined();
            expect(CARD_DEF_MAP.get(id), id).toBeDefined();
        }
        expect(getBestiaryUnitIds()).toEqual(expect.arrayContaining(['court_magician', 'court_crystal']));
        const crystalDef = getUnitDefEntry('court_crystal')!;
        expect(crystalDef.tags).toEqual(expect.arrayContaining([UnitTag.Invincible, UnitTag.Structure]));
        expect(crystalDef.boundToCharacterId).toBe('court_magician');
        expect(getAbility(CRYSTAL_LASER_ABILITY_ID)!.requiredTags).toEqual([UnitTag.Enraged]);
    });
});

describe('Rearrange', () => {
    it('glides every crystal exactly onto the formation slots picked at cast start', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(15), centre(15));
        addCrystals(engine, mage.x, mage.y);
        const player = addPlayer(engine, centre(22));
        cast(engine, mage, REARRANGE_ABILITY_ID, at(player, player.id));
        stepTicks(engine, 1);
        const payload = readRearrangePayload(mage.activeAbilities.find((a) => a.abilityId === REARRANGE_ABILITY_ID))!;
        expect(payload.slots).toHaveLength(CRYSTALS);
        stepSeconds(engine, 1.6);
        for (const c of crystalsOf(engine)) {
            const onSlot = payload.slots.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 0.5);
            expect(onSlot, `${c.id} at ${c.x},${c.y}`).toBe(true);
        }
        engine.destroy();
    });

    it('leaves a crystal that is mid-ram alone and arranges the rest', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(8));
        addCrystals(engine, centre(12), centre(ROW), 2 * CELL_SIZE);
        const player = addPlayer(engine, centre(17));
        cast(engine, mage, CRYSTAL_VOLLEY_ABILITY_ID, at(player, player.id));
        stepSeconds(engine, 1.3, () => {
            player.hp = player.maxHp;
        });
        const ramming = crystalsOf(engine).filter((c) => c.activeAbilities.length > 0);
        expect(ramming.length).toBeGreaterThan(0);
        cast(engine, mage, REARRANGE_ABILITY_ID, at(player, player.id));
        stepTicks(engine, 1);
        const payload = readRearrangePayload(mage.activeAbilities.find((a) => a.abilityId === REARRANGE_ABILITY_ID))!;
        const ramPaths = ramming.map((c) => ({ c, from: { x: c.x, y: c.y } }));
        stepSeconds(engine, 1.6, () => {
            player.hp = player.maxHp;
        });
        const onSlot = (u: Unit) => payload.slots.some((sl) => Math.hypot(sl.x - u.x, sl.y - u.y) < 0.5);
        // A crystal ramming when the glide began is never dragged onto a slot.
        for (const { c } of ramPaths) expect(onSlot(c), c.id).toBe(false);
        // Crystals that stayed idle throughout land on their slots.
        const idle = crystalsOf(engine).filter((c) => !ramming.includes(c) && c.activeAbilities.length === 0 && onSlot(c));
        expect(idle.length).toBeGreaterThan(0);
        engine.destroy();
    });
});

describe('Rearrange over rock', () => {
    it('crystals float over rock on the way, and one landing on rock shatters it', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(15), centre(15));
        const crystals = addCrystals(engine, mage.x, mage.y);
        const player = addPlayer(engine, centre(22));
        const tm = engine.terrainManager!;
        cast(engine, mage, REARRANGE_ABILITY_ID, at(player, player.id));
        stepTicks(engine, 1);
        const payload = readRearrangePayload(mage.activeAbilities.find((a) => a.abilityId === REARRANGE_ABILITY_ID))!;
        const cellOf = (p: { x: number; y: number }) => ({ col: Math.floor(p.x / CELL_SIZE), row: Math.floor(p.y / CELL_SIZE) });
        const key = (c: { col: number; row: number }) => `${c.col},${c.row}`;
        // Same pairing Arrange makes when the glide starts (crystals have not moved yet).
        const pairs = assignUnitsToSlots(crystals, payload.slots).map(({ unitId, slot }) => ({
            from: { x: crystals.find((c) => c.id === unitId)!.x, y: crystals.find((c) => c.id === unitId)!.y },
            slot,
        }));
        const reserved = new Set<string>([mage, player, ...crystals, ...payload.slots].map((p) => key(cellOf(p))));
        const longest = pairs.reduce((a, b) =>
            Math.hypot(b.slot.x - b.from.x, b.slot.y - b.from.y) > Math.hypot(a.slot.x - a.from.x, a.slot.y - a.from.y) ? b : a,
        );
        const landing = cellOf(longest.slot);
        const midRocks: { col: number; row: number }[] = [];
        for (const { from, slot } of pairs) {
            if (Math.hypot(slot.x - from.x, slot.y - from.y) < 2 * CELL_SIZE) continue;
            const mid = cellOf({ x: (from.x + slot.x) / 2, y: (from.y + slot.y) / 2 });
            if (reserved.has(key(mid)) || midRocks.some((r) => key(r) === key(mid))) continue;
            midRocks.push(mid);
        }
        expect(midRocks.length).toBeGreaterThan(0);
        for (const r of [...midRocks, landing]) tm.createOrMarkRock(r.col, r.row);

        stepSeconds(engine, 1.6, () => {
            player.hp = player.maxHp;
        });
        for (const r of midRocks) expect(tm.isIntactRockAt(r.col, r.row), key(r)).toBe(true);
        expect(tm.isIntactRockAt(landing.col, landing.row)).toBe(false);
        engine.destroy();
    });
});

describe('Crystal Ram and rock', () => {
    it('stops at a rock wall: the crystal halts in front of it and the rock and anyone behind are untouched', () => {
        const wallCol = 10;
        const wall: Array<[number, number]> = Array.from({ length: 5 }, (_, i) => [wallCol, ROW - 2 + i] as [number, number]);
        const engine = setupEngine(wall);
        const mage = addMagician(engine, centre(3));
        const [crystal] = addCrystals(engine, centre(8), centre(ROW), 0);
        // Park the other crystals out of the lane.
        for (const c of crystalsOf(engine)) {
            if (c === crystal) continue;
            c.x = centre(3);
            c.y = centre(ROW - 6);
        }
        const player = addPlayer(engine, centre(13));
        const hp = player.hp;
        expect(mage.isAlive()).toBe(true);
        cast(engine, crystal!, CRYSTAL_RAM_ABILITY_ID, at(player));
        stepSeconds(engine, 2);
        expect(crystal!.x).toBeLessThan(wallCol * CELL_SIZE);
        expect(crystal!.x).toBeGreaterThan(centre(8));
        for (const [c, r] of wall) expect(engine.terrainManager!.isIntactRockAt(c, r)).toBe(true);
        expect(player.hp).toBe(hp);
        engine.destroy();
    });
});

describe('Shard Nova', () => {
    function shardsAfterNova(enraged: boolean): number {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(15), centre(15));
        if (enraged) addUnitTag(mage, UnitTag.Enraged);
        addCrystals(engine, mage.x, mage.y);
        addPlayer(engine, centre(26), centre(26));
        cast(engine, mage, SHARD_NOVA_ABILITY_ID, []);
        stepSeconds(engine, SHARD_NOVA_WINDUP_SEC + 0.1);
        const shards = engine.projectiles.filter((p) => p.sourceAbilityId === SHARD_NOVA_ABILITY_ID);
        expect(shards.every((p) => p.projectileType === DARK_SHARD_PROJECTILE_TYPE)).toBe(true);
        engine.destroy();
        return shards.length;
    }

    it('fires a ring from every crystal, denser when enraged', () => {
        expect(shardsAfterNova(false)).toBe(CRYSTALS * SHARD_NOVA_RING_COUNT);
        expect(shardsAfterNova(true)).toBe(CRYSTALS * SHARD_NOVA_ENRAGED_RING_COUNT);
    });

    it('telegraphs one spoke per shard along the direction that shard then flies, even through light clipping', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(15), centre(15));
        addCrystals(engine, mage.x, mage.y);
        addPlayer(engine, centre(26), centre(26));
        cast(engine, mage, SHARD_NOVA_ABILITY_ID, []);
        stepTicks(engine, 1);
        const active = mage.activeAbilities.find((a) => a.abilityId === SHARD_NOVA_ABILITY_ID)!;
        // Record each subpath the enemy-telegraph light clipper passes through (everything lit).
        const spokes: { x0: number; y0: number; x1: number; y1: number }[] = [];
        const recorder = {
            clear() {},
            moveTo(x: number, y: number) {
                spokes.push({ x0: x, y0: y, x1: x, y1: y });
            },
            lineTo(x: number, y: number) {
                const last = spokes[spokes.length - 1]!;
                last.x1 = x;
                last.y1 = y;
            },
            circle() {},
            fill() {},
            stroke() {},
        };
        const gr = new LitClippingPreviewGraphics(recorder, () => true);
        getAbility(SHARD_NOVA_ABILITY_ID)!.renderActivePreview!(gr, mage, active, active.startTime + SHARD_NOVA_WINDUP_SEC / 2);
        expect(spokes).toHaveLength(CRYSTALS * SHARD_NOVA_RING_COUNT);

        stepSeconds(engine, SHARD_NOVA_WINDUP_SEC + 0.05);
        const shards = engine.projectiles.filter((p) => p.sourceAbilityId === SHARD_NOVA_ABILITY_ID);
        expect(shards).toHaveLength(spokes.length);
        // Every shard sits on the extension of exactly one spoke, moving outward along it.
        for (const p of shards) {
            const onSpoke = spokes.filter((sp) => {
                const dx = sp.x1 - sp.x0;
                const dy = sp.y1 - sp.y0;
                const l = Math.hypot(dx, dy);
                const cross = Math.abs((p.x - sp.x0) * dy - (p.y - sp.y0) * dx) / l;
                const along = ((p.x - sp.x0) * dx + (p.y - sp.y0) * dy) / l;
                const sameWay = (p.velocityX * dx + p.velocityY * dy) / (l * Math.hypot(p.velocityX, p.velocityY));
                return cross < 0.5 && along > -20 && sameWay > 0.999;
            });
            expect(onSpoke, `shard at ${p.x},${p.y}`).toHaveLength(1);
        }
        engine.destroy();
    });

    it('telegraph spokes ride on a crystal that moves during the windup', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(15), centre(15));
        const crystals = addCrystals(engine, mage.x, mage.y);
        addPlayer(engine, centre(26), centre(26));
        cast(engine, mage, SHARD_NOVA_ABILITY_ID, []);
        stepTicks(engine, 1);
        const active = mage.activeAbilities.find((a) => a.abilityId === SHARD_NOVA_ABILITY_ID)!;
        const moved = crystals[0]!;
        moved.x += 100;
        const starts: { x: number; y: number }[] = [];
        const recorder = {
            clear() {},
            moveTo(x: number, y: number) {
                starts.push({ x, y });
            },
            lineTo() {},
            circle() {},
            fill() {},
            stroke() {},
        };
        getAbility(SHARD_NOVA_ABILITY_ID)!.renderActivePreview!(recorder, mage, active, active.startTime + 0.3, engine);
        const near = (p: { x: number; y: number }) => starts.filter((s) => Math.hypot(s.x - p.x, s.y - p.y) < 20).length;
        expect(near(moved)).toBe(SHARD_NOVA_RING_COUNT);
        expect(near({ x: moved.x - 100, y: moved.y })).toBe(0);
        engine.destroy();
    });
});

describe('Shard Nova and rock', () => {
    it('a shard stops on rock and chips it; ${SHARD_NOVA_ROCK_HITS_TO_BREAK} shards break it', () => {
        const rockCol = 12;
        const engine = setupEngine([[rockCol, ROW]]);
        const mage = addMagician(engine, centre(5), centre(ROW));
        const behind = addPlayer(engine, centre(15), centre(ROW));
        const tm = engine.terrainManager!;
        const hp = behind.hp;
        const from = { x: centre(9), y: centre(ROW) };
        const fire = () => {
            spawnDarkShard(engine, mage, from, 1, 0);
            stepSeconds(engine, 2);
        };
        for (let i = 0; i < SHARD_NOVA_ROCK_HITS_TO_BREAK - 1; i++) fire();
        expect(tm.isIntactRockAt(rockCol, ROW)).toBe(true);
        expect(behind.hp).toBe(hp);
        fire();
        expect(tm.isIntactRockAt(rockCol, ROW)).toBe(false);
        fire(); // the next shard flies through the rubble
        expect(behind.hp).toBeLessThan(hp);
        engine.destroy();
    });
});

describe('crystal landing puff', () => {
    it('reaches only twice the crystal radius', () => {
        const engine = setupEngine();
        const [crystal] = addCrystals(engine, centre(15), centre(15));
        const pulse = crystalLandingPulse(crystal!);
        expect((pulse.effectData as PulseEffectData).maxRadius).toBe(crystal!.radius * CRYSTAL_LANDING_PULSE_RADII);
        expect(CRYSTAL_LANDING_PULSE_RADII).toBe(2);
        engine.destroy();
    });
});

describe('Crystal Volley', () => {
    function rammers(enraged: boolean): { count: number; damaged: boolean } {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(8));
        if (enraged) addUnitTag(mage, UnitTag.Enraged);
        addCrystals(engine, centre(12), centre(ROW), 2 * CELL_SIZE);
        const player = addPlayer(engine, centre(17));
        const hp0 = player.hp;
        const seen = new Set<string>();
        cast(engine, mage, CRYSTAL_VOLLEY_ABILITY_ID, at(player, player.id));
        stepSeconds(engine, 6, () => {
            for (const c of crystalsOf(engine)) {
                if (c.activeAbilities.some((a) => a.abilityId === CRYSTAL_RAM_ABILITY_ID)) seen.add(c.id);
            }
        });
        const damaged = player.hp < hp0;
        engine.destroy();
        return { count: seen.size, damaged };
    }

    it('sends the nearest crystals ramming one after another, two more when enraged', () => {
        const calm = rammers(false);
        expect(calm.count).toBe(CRYSTAL_VOLLEY_COUNT);
        expect(calm.damaged).toBe(true);
        expect(rammers(true).count).toBe(CRYSTAL_VOLLEY_ENRAGED_COUNT);
    });

    it('a second volley right after the first only sends crystals that are not already ramming or queued', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(8));
        addCrystals(engine, centre(12), centre(ROW), 2 * CELL_SIZE);
        const player = addPlayer(engine, centre(17));
        const ramStarts = new Map<string, number>();
        engine.eventBus.on('ability_used', (e) => {
            if (e.abilityId === CRYSTAL_RAM_ABILITY_ID) ramStarts.set(e.unitId, (ramStarts.get(e.unitId) ?? 0) + 1);
        });
        cast(engine, mage, CRYSTAL_VOLLEY_ABILITY_ID, at(player, player.id));
        stepSeconds(engine, 1.3, () => {
            player.hp = player.maxHp;
        });
        expect(mage.activeAbilities).toHaveLength(0);
        cast(engine, mage, CRYSTAL_VOLLEY_ABILITY_ID, at(player, player.id));
        stepSeconds(engine, 8, () => {
            player.hp = player.maxHp;
        });
        expect([...ramStarts.values()].every((n) => n === 1)).toBe(true);
        expect(ramStarts.size).toBe(CRYSTALS);
        engine.destroy();
    });

    it('never picks a crystal that already has a ram queued', () => {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(8));
        const crystals = addCrystals(engine, centre(12), centre(ROW), 2 * CELL_SIZE);
        const queued = new Set([crystals[0]!.id, crystals[1]!.id]);
        const picked = pickVolleyCrystals(engine.units, mage, { x: centre(17), y: centre(ROW) }, CRYSTALS, (id) => queued.has(id));
        expect(picked).toHaveLength(CRYSTALS - 2);
        expect(picked.some((c) => queued.has(c.id))).toBe(false);
        engine.destroy();
    });
});

describe('Mirror Swap', () => {
    function setupSwap() {
        const engine = setupEngine();
        const mage = addMagician(engine, centre(15), centre(15));
        const crystals = addCrystals(engine, mage.x, mage.y);
        const player = addPlayer(engine, centre(19));
        const swaps: string[] = [];
        engine.eventBus.on('ability_used', (e) => {
            if (e.unitId === mage.id && e.abilityId === MIRROR_SWAP_ABILITY_ID) swaps.push(e.abilityId);
        });
        return { engine, mage, crystals, player, swaps };
    }

    it('trades places with the crystal farthest from the players each time he loses another 10% of max HP', () => {
        const { engine, mage, crystals, player, swaps } = setupSwap();
        const far = pickSwapCrystal(engine.units, mage)!;
        expect(far.x).toBeLessThan(mage.x); // the player stands east, so a western crystal
        const mageFrom = { x: mage.x, y: mage.y };
        const crystalFrom = { x: far.x, y: far.y };

        mage.takeDamage(Math.floor(mage.maxHp * 0.09), player.id, engine.eventBus);
        stepTicks(engine, 3);
        expect(swaps).toHaveLength(0);

        mage.takeDamage(Math.ceil(mage.maxHp * 0.02), player.id, engine.eventBus);
        stepTicks(engine, 3);
        expect(swaps).toHaveLength(1);
        expect(Math.hypot(mage.x - crystalFrom.x, mage.y - crystalFrom.y)).toBeLessThan(0.5);
        expect(Math.hypot(far.x - mageFrom.x, far.y - mageFrom.y)).toBeLessThan(0.5);
        expect(crystals.every((c) => c.isAlive())).toBe(true);

        // Healing back up never re-arms a step; the next swap is at 80%.
        mage.hp = mage.maxHp;
        mage.takeDamage(Math.ceil(mage.maxHp * 0.05), player.id, engine.eventBus);
        stepTicks(engine, 3);
        expect(swaps).toHaveLength(1);
        engine.destroy();
    });

    it('swaps once for a hit that crosses several steps', () => {
        const { engine, mage, player, swaps } = setupSwap();
        mage.takeDamage(Math.ceil(mage.maxHp * 0.25), player.id, engine.eventBus);
        stepTicks(engine, 10);
        expect(swaps).toHaveLength(1);
        expect(peekHpStepState(mage)!.reached.mirrorSwap).toBe(2);
        engine.destroy();
    });

    it('waits for the Crystal Laser to finish before swapping', () => {
        const { engine, mage, player, swaps } = setupSwap();
        addUnitTag(mage, UnitTag.Enraged);
        cast(engine, mage, CRYSTAL_LASER_ABILITY_ID, at(player, player.id));
        stepTicks(engine, 1);
        mage.takeDamage(Math.ceil(mage.maxHp * 0.12), player.id, engine.eventBus);
        stepSeconds(engine, 2, () => {
            player.hp = player.maxHp;
        });
        expect(swaps).toHaveLength(0);
        stepSeconds(engine, 10, () => {
            player.hp = player.maxHp;
        });
        expect(mage.activeAbilities.some((a) => a.abilityId === CRYSTAL_LASER_ABILITY_ID)).toBe(false);
        expect(swaps).toHaveLength(1);
        engine.destroy();
    });

    it('keeps step progress through serialization', () => {
        const state = { reached: { mirrorSwap: 3 }, pending: ['mirrorSwap'] };
        const json = HP_STEP_COMPONENT.toJSON(state);
        const back = HP_STEP_COMPONENT.create(undefined);
        HP_STEP_COMPONENT.fromJSON(back, json);
        expect(back).toEqual(state);
        expect(HP_STEP_COMPONENT.toJSON(HP_STEP_COMPONENT.create(undefined))).toEqual({});
    });
});

describe('Blink', () => {
    it('teleports the magician to the destination after a short shimmer', () => {
        const engine = setupEngine();
        const mage = addMagician(engine);
        addPlayer(engine, centre(8));
        const dest = { x: centre(24), y: centre(6) };
        cast(engine, mage, BLINK_ABILITY_ID, at(dest));
        stepSeconds(engine, 0.15);
        expect(mage.x).toBeCloseTo(centre(5));
        stepSeconds(engine, 0.3);
        expect(mage.x).toBeCloseTo(dest.x);
        expect(mage.y).toBeCloseTo(dest.y);
        engine.destroy();
    });
});

describe('Crystal Laser', () => {
    /** Magician west, front player 7 tiles east, back player 4 tiles behind on the same line. */
    function laserScene(rock: Array<[number, number]> = [], onEngine?: (engine: GameEngine) => void) {
        const engine = setupEngine(rock);
        onEngine?.(engine);
        const mage = addMagician(engine);
        addUnitTag(mage, UnitTag.Enraged);
        addCrystals(engine, mage.x, centre(ROW - 5));
        const front = addPlayer(engine, centre(12), centre(ROW), 'Front');
        const back = addPlayer(engine, centre(16), centre(ROW), 'Back');
        cast(engine, mage, CRYSTAL_LASER_ABILITY_ID, at(front, front.id));
        return { engine, mage, front, back };
    }

    it('stops time, walls the crystals in front of him, then burns and pushes only the first body in line', () => {
        const titles: { text: string; durationSec: number }[] = [];
        const { engine, mage, front, back } = laserScene([], (e) =>
            e.eventBus.on('action_title', (t) => {
                titles.push(t);
            }),
        );
        stepTicks(engine, 2);
        const timeStops = (engine.state.timeManager as unknown as { timeStops: unknown[] }).timeStops;
        expect(timeStops.length).toBe(1);
        // The action title plays for exactly the freeze.
        expect(titles).toEqual([expect.objectContaining({ text: CRYSTAL_LASER_TITLE, durationSec: CRYSTAL_LASER_FREEZE_SEC })]);
        const frozenX = front.x;

        stepSeconds(engine, CRYSTAL_LASER_FREEZE_SEC - 0.1);
        const payload = readCrystalLaserPayload(mage.activeAbilities.find((a) => a.abilityId === CRYSTAL_LASER_ABILITY_ID))!;
        for (const c of crystalsOf(engine)) {
            expect(payload.slots.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 0.5)).toBe(true);
            expect(c.x).toBeGreaterThan(mage.x);
        }
        expect(front.x).toBeCloseTo(frozenX); // still frozen
        stepSeconds(engine, 0.3);
        expect((engine.state.timeManager as unknown as { timeStops: unknown[] }).timeStops.length).toBe(0);

        const frontHp = front.hp;
        const backHp = back.hp;
        const xBefore = front.x;
        stepSeconds(engine, CRYSTAL_LASER_AIM_SEC + 1.5);
        expect(front.hp).toBeLessThan(frontHp);
        expect(front.x).toBeGreaterThan(xBefore);
        expect(back.hp).toBe(backHp);
        engine.destroy();
    });

    it('recalls crystals that are mid-ram or have a ram queued, so every one lands in the wall and stays', () => {
        const engine = setupEngine();
        const mage = addMagician(engine);
        addCrystals(engine, mage.x + 3 * CELL_SIZE, centre(ROW), 2 * CELL_SIZE);
        const player = addPlayer(engine, centre(14));
        cast(engine, mage, CRYSTAL_VOLLEY_ABILITY_ID, at(player, player.id));
        stepSeconds(engine, 1.4, () => {
            player.hp = player.maxHp;
        });
        expect(crystalsOf(engine).some((c) => c.activeAbilities.length > 0)).toBe(true);
        expect(crystalsOf(engine).some((c) => engine.state.orderMgr.hasAnyPendingOrderForUnit(c.id))).toBe(true);

        addUnitTag(mage, UnitTag.Enraged);
        cast(engine, mage, CRYSTAL_LASER_ABILITY_ID, at(player, player.id));
        stepTicks(engine, 1);
        const payload = readCrystalLaserPayload(mage.activeAbilities.find((a) => a.abilityId === CRYSTAL_LASER_ABILITY_ID))!;
        for (const c of crystalsOf(engine)) {
            expect(c.activeAbilities, c.id).toHaveLength(0);
            expect(engine.state.orderMgr.hasAnyPendingOrderForUnit(c.id), c.id).toBe(false);
        }
        const inWall = () => crystalsOf(engine).every((c) => payload.slots.some((sl) => Math.hypot(sl.x - c.x, sl.y - c.y) < 0.5));
        stepSeconds(engine, CRYSTAL_LASER_FREEZE_SEC, () => {
            player.hp = player.maxHp;
        });
        expect(inWall()).toBe(true);
        // After the freeze nothing resumes: the wall holds through the beam.
        stepSeconds(engine, CRYSTAL_LASER_AIM_SEC + 2, () => {
            player.hp = player.maxHp;
            expect(inWall()).toBe(true);
        });
        engine.destroy();
    });

    it('is blocked by a shield facing the beam, which also covers whoever is behind', () => {
        const { engine, mage, front, back } = laserScene();
        stepSeconds(engine, CRYSTAL_LASER_FREEZE_SEC + CRYSTAL_LASER_AIM_SEC - 0.2);
        const frontHp = front.hp;
        const backHp = back.hp;
        cast(engine, front, '0104', at(mage));
        stepSeconds(engine, 1.0);
        expect(front.hp).toBe(frontHp);
        expect(back.hp).toBe(backHp);
        engine.destroy();
    });

    it('stops at rock, chipping it until it breaks after ${CRYSTAL_LASER_ROCK_HITS_TO_BREAK} pulses', () => {
        const wall: Array<[number, number]> = Array.from({ length: 9 }, (_, i) => [9, ROW - 4 + i] as [number, number]);
        const { engine, front } = laserScene(wall);
        const tm = engine.terrainManager!;
        const hp = front.hp;
        const firing = CRYSTAL_LASER_FREEZE_SEC + CRYSTAL_LASER_AIM_SEC;
        const pulseSec = CRYSTAL_LASER_PULSE_SEC;
        const health = () => wall.map(([c, r]) => (tm.isIntactRockAt(c, r) ? (tm.getFloorTile(c, r)?.destructible?.health ?? 100) : 0));
        // Mid-way through the 9th pulse window: some rock chipped, none broken, nobody hurt behind it.
        stepSeconds(engine, firing + pulseSec * (CRYSTAL_LASER_ROCK_HITS_TO_BREAK - 1) - pulseSec / 2);
        expect(health().some((h) => h > 0 && h < 100)).toBe(true);
        expect(health().every((h) => h > 0)).toBe(true);
        expect(front.hp).toBe(hp);
        // A few pulses later the rock in the beam has crumbled.
        stepSeconds(engine, pulseSec * 3);
        expect(health().some((h) => h === 0)).toBe(true);
        engine.destroy();
    });
});

describe('Court Magician AI rules', () => {
    it('blinks after the grace period or after losing enough HP up close, not before', () => {
        const ctx = { aiTree: 'courtMagician' } as CourtMagicianAITreeContext;
        const unit = { hp: 100, maxHp: 100 };
        updateContact(ctx, unit, 50, 10);
        expect(shouldBlink(ctx, unit, 10.5)).toBe(false);
        expect(shouldBlink(ctx, unit, 10 + CONTACT_GRACE_SEC)).toBe(true);
        expect(shouldBlink(ctx, { hp: 100 - Math.ceil(100 * CONTACT_HP_LOSS_FRACTION), maxHp: 100 }, 10.5)).toBe(true);
        ctx.nextBlinkAt = 20;
        expect(shouldBlink(ctx, unit, 15)).toBe(false);
    });

    it('crystals fade once the magician is gone', () => {
        const engine = setupEngine();
        const mage = addMagician(engine);
        const [crystal] = addCrystals(engine, mage.x, mage.y);
        const ctx = { getUnits: () => engine.units, gameTime: engine.gameTime };
        expect(despawnIfMasterGone(crystal!, ctx, 'court_magician')).toBe(false);
        mage.hp = 0;
        expect(mage.isAlive()).toBe(false);
        expect(despawnIfMasterGone(crystal!, ctx, 'court_magician')).toBe(true);
        expect(hasUnitTag(crystal!, UnitTag.Invincible)).toBe(true);
        engine.destroy();
    });
});
