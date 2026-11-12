import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Unit } from '../units/Unit';
import type { TeamId } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    FROZEN_FIELD_DAMAGE,
    FROZEN_FIELD_EFFECT_TYPE,
    FROZEN_FIELD_INTERVAL_SEC,
    FROZEN_FIELD_STUN_SEC,
    getTerrainEffectDef,
    MIASMA_DAMAGE,
    MIASMA_EFFECT_TYPE,
    MIASMA_INTERVAL_SEC,
    STANDING_DAMAGE_PARAM,
} from './terrainEffectDefs';
import { tickStandingTerrainDamage } from './standingDamage';

function unitAt(id: string, characterId: string, teamId: TeamId): Unit {
    return new Unit({
        id,
        x: CELL_SIZE * 2.5,
        y: CELL_SIZE * 2.5,
        hp: 50,
        maxHp: 50,
        speed: 90,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId,
        name: id,
        radius: 16,
    });
}

function engineWithMiasma() {
    const terrainLayers = new TerrainLayerManager();
    terrainLayers.add({
        id: 'm',
        layer: 'air',
        effectType: MIASMA_EFFECT_TYPE,
        placedAtGameTime: 0,
        expiresAtGameTime: 100,
        ownerUnitId: 'husk1',
        area: { type: 'cell', col: 2, row: 2 },
        params: {},
    });
    return { terrainLayers, eventBus: new EventBus(), gameTime: 0, roundNumber: 1 };
}

describe('tickStandingTerrainDamage (miasma)', () => {
    it('hurts players but not darkness creatures standing in it', () => {
        const engine = engineWithMiasma();
        const player = unitAt('p', 'player', 'player');
        const wolf = unitAt('w', 'dark_wolf', 'enemy');
        engine.gameTime = MIASMA_INTERVAL_SEC;
        tickStandingTerrainDamage(player, 0.05, engine);
        tickStandingTerrainDamage(wolf, 0.05, engine);
        expect(player.hp).toBe(50 - MIASMA_DAMAGE);
        expect(wolf.hp).toBe(50);
    });

    it('pulses once per interval boundary, not every tick', () => {
        const engine = engineWithMiasma();
        const player = unitAt('p', 'player', 'player');
        const dt = 0.05;
        const ticks = Math.round((MIASMA_INTERVAL_SEC * 3) / dt);
        for (let i = 1; i <= ticks; i++) {
            engine.gameTime = i * dt;
            tickStandingTerrainDamage(player, dt, engine);
        }
        expect(player.hp).toBe(50 - MIASMA_DAMAGE * 3);
    });

    it('does nothing outside the cloud', () => {
        const engine = engineWithMiasma();
        const player = unitAt('p', 'player', 'player');
        player.x += CELL_SIZE;
        engine.gameTime = MIASMA_INTERVAL_SEC;
        tickStandingTerrainDamage(player, 0.05, engine);
        expect(player.hp).toBe(50);
    });
});

function engineWithFrozenField(params: Record<string, unknown> = {}) {
    const terrainLayers = new TerrainLayerManager();
    terrainLayers.add({
        id: 'ff',
        layer: 'ground',
        effectType: FROZEN_FIELD_EFFECT_TYPE,
        placedAtGameTime: 0,
        expiresAtGameTime: 3,
        ownerUnitId: 'caster',
        teamId: 'player',
        area: { type: 'cell', col: 2, row: 2 },
        params,
    });
    const interrupted: string[] = [];
    return {
        terrainLayers,
        eventBus: new EventBus(),
        gameTime: 0,
        roundNumber: 1,
        interrupted,
        interruptUnitAndRefundAbilities: (u: Unit) => { interrupted.push(u.id); },
    };
}

/** Advance the engine clock in fixed ticks, running the hazard for every unit; drops expired effects. */
function runTicks(engine: ReturnType<typeof engineWithFrozenField>, units: Unit[], untilSec: number, dt = 0.05): void {
    const ticks = Math.round((untilSec - engine.gameTime) / dt);
    for (let i = 0; i < ticks; i++) {
        engine.gameTime = Math.round((engine.gameTime + dt) * 1000) / 1000;
        engine.terrainLayers.cleanupExpired(engine.gameTime);
        for (const u of units) tickStandingTerrainDamage(u, dt, engine);
    }
}

describe('tickStandingTerrainDamage (frozen field)', () => {
    it('registers a team-aware, stunning, record-scalable hazard', () => {
        const standing = getTerrainEffectDef(FROZEN_FIELD_EFFECT_TYPE)?.standingDamage;
        expect(getTerrainEffectDef(FROZEN_FIELD_EFFECT_TYPE)?.layer).toBe('ground');
        expect(standing).toMatchObject({
            hurts: 'enemiesOfOwner',
            damage: 4,
            intervalSec: 0.5,
            stunSec: 0.6,
            damageFromRecord: true,
        });
    });

    it('hurts and stuns an enemy in the cell on every pulse', () => {
        const engine = engineWithFrozenField();
        const enemy = unitAt('e', 'dark_wolf', 'enemy');
        enemy.ccArmour.hardFloor = 0;
        const addBuff = vi.spyOn(enemy, 'addBuff');
        runTicks(engine, [enemy], FROZEN_FIELD_INTERVAL_SEC * 3);
        expect(enemy.hp).toBe(50 - FROZEN_FIELD_DAMAGE * 3);
        const stuns = addBuff.mock.calls.filter(([b]) => b._type === 'stunned');
        expect(stuns).toHaveLength(3);
        expect(stuns[0][0].duration.value).toBeCloseTo(FROZEN_FIELD_STUN_SEC);
        expect(enemy.hasBuff('stunned')).toBe(true);
        expect(engine.interrupted).toEqual(['e', 'e', 'e']);
    });

    it('stops pulsing once the field expires', () => {
        const engine = engineWithFrozenField();
        const enemy = unitAt('e', 'dark_wolf', 'enemy');
        enemy.hp = enemy.maxHp = 100;
        runTicks(engine, [enemy], 3.05);
        const hpAtExpiry = enemy.hp;
        expect(hpAtExpiry).toBeLessThanOrEqual(100 - FROZEN_FIELD_DAMAGE * 5);
        runTicks(engine, [enemy], 4);
        expect(enemy.hp).toBe(hpAtExpiry);
    });

    it('does not hurt or stun the owner, allies, or neutrals', () => {
        const engine = engineWithFrozenField();
        const owner = unitAt('caster', 'player', 'player');
        const ally = unitAt('a', 'player', 'allied');
        const neutral = unitAt('n', 'player', 'nature');
        runTicks(engine, [owner, ally, neutral], FROZEN_FIELD_INTERVAL_SEC * 3);
        for (const u of [owner, ally, neutral]) {
            expect(u.hp).toBe(50);
            expect(u.hasBuff('stunned')).toBe(false);
        }
    });

    it('hurts nobody when the record has no owner team', () => {
        const engine = engineWithFrozenField();
        const record = engine.terrainLayers.getEffectAt('ground', 2, 2)!;
        delete record.teamId;
        const enemy = unitAt('e', 'dark_wolf', 'enemy');
        runTicks(engine, [enemy], FROZEN_FIELD_INTERVAL_SEC);
        expect(enemy.hp).toBe(50);
    });

    it("uses the record's damage param over the def's", () => {
        const engine = engineWithFrozenField({ [STANDING_DAMAGE_PARAM]: 7 });
        const enemy = unitAt('e', 'dark_wolf', 'enemy');
        runTicks(engine, [enemy], FROZEN_FIELD_INTERVAL_SEC);
        expect(enemy.hp).toBe(50 - 7);
    });

    it('lets boss CC armour absorb the stun while the damage still lands', () => {
        const engine = engineWithFrozenField();
        const boss = unitAt('b', 'dark_wolf', 'enemy');
        boss.ccArmour.hardFloor = 2;
        boss.ccArmour.bonusHard = 0;
        boss.ccArmour.chainResist = 0;
        runTicks(engine, [boss], FROZEN_FIELD_INTERVAL_SEC);
        expect(boss.hp).toBe(50 - FROZEN_FIELD_DAMAGE);
        expect(boss.hasBuff('stunned')).toBe(false);
        expect(boss.ccArmour.hardConsumed).toBe(1);
        expect(engine.interrupted).toEqual([]);
    });

    it('stops at the cell edge', () => {
        const engine = engineWithFrozenField();
        const enemy = unitAt('e', 'dark_wolf', 'enemy');
        enemy.x += CELL_SIZE;
        runTicks(engine, [enemy], FROZEN_FIELD_INTERVAL_SEC * 2);
        expect(enemy.hp).toBe(50);
        expect(enemy.hasBuff('stunned')).toBe(false);
    });

    it('keeps the owner team through a checkpoint round trip', () => {
        const engine = engineWithFrozenField();
        const json = JSON.parse(JSON.stringify(engine.terrainLayers.toEffectsJSON()));
        engine.terrainLayers = TerrainLayerManager.fromJSON(json);
        expect(engine.terrainLayers.getEffectAt('ground', 2, 2)?.teamId).toBe('player');
        const enemy = unitAt('e', 'dark_wolf', 'enemy');
        const ally = unitAt('a', 'player', 'allied');
        runTicks(engine, [enemy, ally], FROZEN_FIELD_INTERVAL_SEC);
        expect(enemy.hp).toBe(50 - FROZEN_FIELD_DAMAGE);
        expect(ally.hp).toBe(50);
    });
});
