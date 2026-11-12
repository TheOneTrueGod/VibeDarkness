import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { Projectile } from '../../../game/projectiles/Projectile';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getTotalAbilityDuration } from '../../../abilities/abilityTimings';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { applyBleedStack } from '../../../buffs/bleedRuntime';
import { Water } from '../../../resources/Water';
import { GameEngine } from '../../../game/GameEngine';
import { FIXED_DT } from '../../../game/gameConstants';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import { BLOOD_MAGE_NODE_SPLINTERS, BLOOD_MAGE_TREE_ID } from '../../../../../researchTrees/trees/blood_mage';
import { getCardDef } from '../../index';
import { BLOOD_SHARD_DAMAGE, BLOOD_SPLINTER_HOST_DAMAGE, BloodShardAbility_0304 } from '../../03_blood_mage/0304_BloodShard/0304Ability';
import {
    ICE_SHARDS_DAMAGE,
    ICE_SHARDS_MAX_USES,
    ICE_SHARDS_PACING,
    ICE_SHARDS_PROJECTILE_SPEED,
    ICE_SHARDS_RANGE,
    ICE_SHARDS_WATER_COST,
    IceShardsAbility_1502,
} from './1502Ability';

const ICE_ID = IceShardsAbility_1502.id;
const SHARD_ID = BloodShardAbility_0304.id;
const TICK_DT = 0.01;

const px = (x: number, y: number): ResolvedTarget => ({ type: 'pixel', position: { x, y } });

function makeUnit(id: string, x: number, y: number, team: 'player' | 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: team as TeamId,
        ownerId: team === 'player' ? 'p1' : 'enemy_ai',
        characterId: team === 'player' ? 'player' : 'enemy',
        name: id,
        abilities: team === 'player' ? [ICE_ID] : [],
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function setup(enemies: Unit[], opts: { water?: number; splinters?: boolean } = {}) {
    const caster = makeUnit('caster', 0, 0, 'player');
    caster.abilityRuntime[ICE_ID] = {
        currentUses: ICE_SHARDS_MAX_USES,
        maxUses: ICE_SHARDS_MAX_USES,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    const units = [caster, ...enemies];
    const projectiles: Projectile[] = [];
    const eventBus = new EventBus();
    const water = new Water();
    water.current = opts.water ?? 16;
    caster.attachResource(water, eventBus);
    const engine = {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
        addProjectile: (p: Projectile) => projectiles.push(p),
        getPlayerResearchNodes: (_ownerId: string, treeId: string) =>
            opts.splinters && treeId === BLOOD_MAGE_TREE_ID ? [BLOOD_MAGE_NODE_SPLINTERS] : [],
    } as unknown as EngineContext;
    return { caster, engine, projectiles, water };
}

function advanceTo(caster: Unit, engine: EngineContext, projectiles: Projectile[], seconds: number): void {
    while (engine.gameTime < seconds - 1e-9) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
        for (const proj of projectiles) {
            if (!proj.active) continue;
            proj.update(TICK_DT, engine);
            proj.checkCollision(engine.units, engine.eventBus, engine.gameTime, engine);
        }
    }
}

/**
 * Casts at `first`, then supplies `second` between the throws, the way the live game's lookahead
 * picks the second target just before its throw. Runs to the end of the cast plus flight time.
 */
function castTwice(ctx: ReturnType<typeof setup>, first: ResolvedTarget, second: ResolvedTarget): void {
    const { caster, engine, projectiles } = ctx;
    executeUnitAbility(caster, IceShardsAbility_1502, [first], engine);
    advanceTo(caster, engine, projectiles, ICE_SHARDS_PACING.firstThrow + 0.05);
    caster.activeAbilities.find((a) => a.abilityId === ICE_ID)!.targets.push(second);
    advanceTo(caster, engine, projectiles, ICE_SHARDS_PACING.totalDuration + 0.5);
}

const shardsOf = (projectiles: Projectile[]) => projectiles.filter((p) => p.damage === ICE_SHARDS_DAMAGE);

describe('IceShardsAbility_1502', () => {
    it('throws two shards at two targets, at Blood Shard pace', () => {
        const east = makeUnit('east', 120, 0, 'enemy');
        const south = makeUnit('south', 0, 120, 'enemy');
        const ctx = setup([east, south]);
        executeUnitAbility(ctx.caster, IceShardsAbility_1502, [px(120, 0)], ctx.engine);
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.firstThrow - 0.02);
        expect(ctx.projectiles).toHaveLength(0);
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.firstThrow + 0.05);
        expect(ctx.projectiles).toHaveLength(1);
        ctx.caster.activeAbilities.find((a) => a.abilityId === ICE_ID)!.targets.push(px(0, 120));
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.secondThrow + 0.05);
        expect(ctx.projectiles).toHaveLength(2);
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.totalDuration + 0.5);

        const [a, b] = ctx.projectiles;
        expect(a.velocityX).toBeCloseTo(ICE_SHARDS_PROJECTILE_SPEED);
        expect(b.velocityY).toBeCloseTo(ICE_SHARDS_PROJECTILE_SPEED);
        expect(east.hp).toBe(100 - ICE_SHARDS_DAMAGE);
        expect(south.hp).toBe(100 - ICE_SHARDS_DAMAGE);

        expect(ICE_SHARDS_PACING.firstThrow).toBeCloseTo(0.2);
        expect(ICE_SHARDS_PACING.secondThrow).toBeCloseTo(0.5);
        expect(getTotalAbilityDuration(IceShardsAbility_1502)).toBeCloseTo(1.5);
    });

    it('passes through the first enemy and stops on the second', () => {
        const first = makeUnit('first', 60, 0, 'enemy');
        const second = makeUnit('second', 100, 0, 'enemy');
        const third = makeUnit('third', 140, 0, 'enemy');
        const ctx = setup([first, second, third]);
        castTwice(ctx, px(ICE_SHARDS_RANGE, 0), px(0, -ICE_SHARDS_RANGE));

        expect(first.hp).toBe(100 - ICE_SHARDS_DAMAGE);
        expect(second.hp).toBe(100 - ICE_SHARDS_DAMAGE);
        expect(third.hp).toBe(100);
    });

    it('spends 4 Water once per cast and no HP', () => {
        const ctx = setup([], { water: 10 });
        executeUnitAbility(ctx.caster, IceShardsAbility_1502, [px(100, 0)], ctx.engine);
        expect(ctx.water.current).toBe(10 - ICE_SHARDS_WATER_COST);
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.firstThrow + 0.05);
        ctx.caster.activeAbilities.find((a) => a.abilityId === ICE_ID)!.targets.push(px(0, 100));
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.totalDuration + 0.1);
        expect(ctx.water.current).toBe(10 - ICE_SHARDS_WATER_COST);
        expect(ctx.caster.hp).toBe(100);
    });

    it('flies with the Tidewater sprite and a frost trail', () => {
        const ctx = setup([]);
        executeUnitAbility(ctx.caster, IceShardsAbility_1502, [px(100, 0)], ctx.engine);
        advanceTo(ctx.caster, ctx.engine, ctx.projectiles, ICE_SHARDS_PACING.firstThrow + 0.05);
        const [shard] = ctx.projectiles;
        expect(JSON.stringify(shard.spriteConfig?.sprite)).toContain('ice_shard');
        expect(shard.particleTrail?.spec.shape).toBe('frost');
        expect(shard.hitPolicy.damagingHits).toBe(2);
    });

    it('is registered with its card and replaces Blood Shard while castable', () => {
        expect(getAbility(ICE_ID)).toBe(IceShardsAbility_1502);
        expect(getCardDef(ICE_ID)?.abilityId).toBe(ICE_ID);
        expect(IceShardsAbility_1502.swapConfig).toEqual({
            activateTrigger: { type: 'whileCastable' },
            deactivateTrigger: { type: 'whileCastable' },
            replacesAbilityId: SHARD_ID,
        });
        expect(IceShardsAbility_1502.maxUses).toBe(3);
        expect(IceShardsAbility_1502.recoveries).toEqual(BloodShardAbility_0304.recoveries);
        expect(IceShardsAbility_1502.hpCost ?? 0).toBe(0);
        expect(ICE_SHARDS_DAMAGE).toBeGreaterThan(BLOOD_SHARD_DAMAGE);
    });
});

describe('Ice Shards with Blood Splinters', () => {
    // A bleeding enemy off to the side, inside range of the caster but off both throws' lines.
    const HOST = { x: -60, y: 60 };

    function runWithHost(splinters: boolean) {
        const host = makeUnit('host', HOST.x, HOST.y, 'enemy');
        applyBleedStack(host, 0, 1, 10);
        const ctx = setup([host], { splinters });
        castTwice(ctx, px(120, 0), px(0, -120));
        return { host, ctx };
    }

    it('bursts splinters out of bleeding enemies on each throw when researched', () => {
        const { host, ctx } = runWithHost(true);
        expect(shardsOf(ctx.projectiles)).toHaveLength(2);
        // One splinter per throw from the one host, each hurting it.
        expect(ctx.projectiles).toHaveLength(4);
        expect(host.hp).toBe(100 - 2 * BLOOD_SPLINTER_HOST_DAMAGE);
    });

    it('throws only the two shards without the research', () => {
        const { host, ctx } = runWithHost(false);
        expect(ctx.projectiles).toHaveLength(2);
        expect(host.hp).toBe(100);
    });

    it('adds the Blood Splinters line to the tooltip only when researched', () => {
        const without = IceShardsAbility_1502.getTooltipText!({ researchTrees: {} });
        const withIt = IceShardsAbility_1502.getTooltipText!({
            researchTrees: { [BLOOD_MAGE_TREE_ID]: [BLOOD_MAGE_NODE_SPLINTERS] },
        });
        expect(withIt.length).toBe(without.length + 1);
    });
});

// ---------------------------------------------------------------------------
// The swap: Ice Shards holds Blood Shard's slot while castable (real tiny engine)
// ---------------------------------------------------------------------------

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

function stepTicks(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        engine.isPaused = false;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function slotHolderWith(startWater: number): string {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: 3 * CELL + CELL / 2,
        y: 5 * CELL + CELL / 2,
        abilities: [SHARD_ID, ICE_ID],
    });
    const water = new Water();
    water.current = startWater;
    player.attachResource(water, engine.eventBus);
    stepTicks(engine, 1);
    return player.abilities[0];
}

describe('Ice Shards swap', () => {
    it('holds the slot with 4 Water and leaves Blood Shard there below 4', () => {
        expect(slotHolderWith(ICE_SHARDS_WATER_COST)).toBe(ICE_ID);
        expect(slotHolderWith(ICE_SHARDS_WATER_COST - 1)).toBe(SHARD_ID);
    });
});
