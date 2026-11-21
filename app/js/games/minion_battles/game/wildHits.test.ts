/**
 * Wild hit rule (`allExceptKin`): a damaging source hits every unit except its own kin, on any team. The default
 * `hostile` rule is unchanged. Covers `canHit`, projectiles (and their serialization), circle area damage, the fused
 * body burst, the burrow eruption and the spawner's `childTags`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import { createGenericEnemy } from './units/GenericEnemy';
import { Projectile } from './projectiles/Projectile';
import { EventBus } from './EventBus';
import { canHit, parseHitRuleFromJSON, wildHitRule, type HitRule } from './hitRule';
import { UnitTag } from './units/unitTag';
import { damageEnemiesInCircle, damageUnitsInCircle } from '../abilities/targetHelpers';
import { getUnitDefEntry } from './units/unit_defs/unitDef';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { attachComponent, componentSpec } from './units/components/unitComponent';
import { FUSED_BODY_COMPONENT } from './units/components/fusedBodyComponent';
import { SPAWNER_COMPONENT } from './units/components/spawnerComponent';
import { registerSpawnerSpec } from './units/components/spawnerHooks';
import { burrowPreset, type UnitPhaseDef } from './units/components/phaseDef';
import type { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';

const P = TINY_BATTLE_PLAYER_ID;
const TICKS_PER_SEC = 60;
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;
const WILD: HitRule = wildHitRule(UnitTag.GardenKin);

function makeEngine(): { engine: GameEngine; player: Unit } {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, { playerId: P, x: cell(10), y: cell(8), abilities: [] });
    return { engine, player };
}

function enemy(engine: GameEngine, id: string, x: number, y: number, tags: UnitTag[] = []): Unit {
    const unit = createGenericEnemy(
        { id, x, y, hp: 100, speed: 0, teamId: 'enemy', characterId: 'slime', name: id, abilities: [] },
        engine.eventBus,
    );
    unit.tags = tags;
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.round(seconds * TICKS_PER_SEC);
    for (let i = 0; i < ticks; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const waiter of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: waiter.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

describe('canHit', () => {
    it('hostile (and no rule) needs a hostile team; allExceptKin spares only the kin tag', () => {
        const wolf = { teamId: 'enemy' as const, tags: [] as UnitTag[] };
        const kin = { teamId: 'enemy' as const, tags: [UnitTag.GardenKin] };
        const player = { teamId: 'player' as const, tags: [] as UnitTag[] };
        expect(canHit(undefined, 'enemy', wolf)).toBe(false);
        expect(canHit(undefined, 'enemy', player)).toBe(true);
        expect(canHit({ kind: 'hostile' }, 'enemy', wolf)).toBe(false);
        expect(canHit(WILD, 'enemy', wolf)).toBe(true);
        expect(canHit(WILD, 'enemy', kin)).toBe(false);
        expect(canHit(WILD, 'enemy', player)).toBe(true);
    });
});

describe('Wild projectile', () => {
    function fire(rule: HitRule | undefined, units: Unit[]): void {
        const proj = new Projectile({
            x: 100,
            y: 100,
            velocityX: 0,
            velocityY: 0,
            damage: 7,
            sourceTeamId: 'enemy',
            sourceUnitId: 'plant',
            sourceAbilityId: 'throw_knife',
            maxDistance: 500,
            hitPolicy: { damagingHits: 99, overflow: 'stop' } as never,
            ...(rule ? { hitRule: rule } : {}),
        });
        proj.radius = 20;
        proj.checkCollision(units, new EventBus(), 0);
    }

    function lineup(): { wolf: Unit; kin: Unit; player: Unit; all: Unit[] } {
        const { engine, player } = makeEngine();
        player.x = 100;
        player.y = 100;
        const wolf = enemy(engine, 'wolf', 100, 100);
        const kin = enemy(engine, 'node', 100, 100, [UnitTag.GardenKin]);
        return { wolf, kin, player, all: [wolf, kin, player] };
    }

    it('hits another enemy-team unit and a player, and skips kin', () => {
        const { wolf, kin, player, all } = lineup();
        fire(WILD, all);
        expect(wolf.hp).toBe(wolf.maxHp - 7);
        expect(kin.hp).toBe(kin.maxHp);
        expect(player.hp).toBe(player.maxHp - 7);
    });

    it('a default projectile is unchanged: only the hostile team is hit', () => {
        const { wolf, kin, player, all } = lineup();
        fire(undefined, all);
        expect(wolf.hp).toBe(wolf.maxHp);
        expect(kin.hp).toBe(kin.maxHp);
        expect(player.hp).toBe(player.maxHp - 7);
    });

    it('round-trips hitRule through toJSON / fromJSON, and a default projectile writes none', () => {
        const proj = new Projectile({
            x: 1, y: 2, velocityX: 3, velocityY: 4, damage: 5, sourceTeamId: 'enemy',
            sourceUnitId: 'plant', sourceAbilityId: 'a', maxDistance: 10, hitRule: WILD,
        });
        const json = JSON.parse(JSON.stringify(proj.toJSON())) as Record<string, unknown>;
        expect(json.hitRule).toEqual(WILD);
        expect(Projectile.fromJSON(json).hitRule).toEqual(WILD);
        const plain = new Projectile({
            x: 1, y: 2, velocityX: 3, velocityY: 4, damage: 5, sourceTeamId: 'enemy',
            sourceUnitId: 'plant', sourceAbilityId: 'a', maxDistance: 10,
        });
        expect('hitRule' in plain.toJSON()).toBe(false);
        expect(parseHitRuleFromJSON({ kind: 'allExceptKin', kinTag: 'notATag' })).toBeUndefined();
    });
});

describe('Wild area damage', () => {
    it('damageUnitsInCircle with a Wild rule hits the wolf and the player, not kin; the enemy wrapper stays hostile', () => {
        const { engine, player } = makeEngine();
        const source = enemy(engine, 'plant', cell(10), cell(8), [UnitTag.GardenKin]);
        const wolf = enemy(engine, 'wolf', cell(10), cell(8));
        const kin = enemy(engine, 'node', cell(10), cell(8), [UnitTag.GardenKin]);
        const base = {
            engine,
            caster: source,
            center: { x: cell(10), y: cell(8) },
            radius: 80,
            damage: 9,
            abilityId: 'test',
        };
        damageEnemiesInCircle(base);
        expect(player.hp).toBe(player.maxHp - 9);
        expect(wolf.hp).toBe(wolf.maxHp);

        damageUnitsInCircle({ ...base, hitRule: WILD });
        expect(wolf.hp).toBe(wolf.maxHp - 9);
        expect(kin.hp).toBe(kin.maxHp);
        expect(player.hp).toBe(player.maxHp - 18);
    });
});

describe('Wild fused body burst', () => {
    function burst(hitRule: HitRule | undefined): { wolf: Unit; kin: Unit; player: Unit } {
        const { engine, player } = makeEngine();
        const body = enemy(engine, 'seed', cell(10), cell(8), [UnitTag.GardenKin]);
        attachComponent(
            body,
            componentSpec(FUSED_BODY_COMPONENT, {
                fuseSeconds: 0.2,
                radiusPx: 100,
                onExpiry: { effectId: 'areaDamage', params: { damage: 11 }, ...(hitRule ? { hitRule } : {}) },
                onDeath: { effectId: 'none' },
            }),
        );
        const wolf = enemy(engine, 'wolf', cell(10), cell(8));
        const kin = enemy(engine, 'node', cell(10), cell(8), [UnitTag.GardenKin]);
        step(engine, 0.5);
        return { wolf, kin, player };
    }

    it('with a Wild rule it damages the wolf and the player and spares kin', () => {
        const { wolf, kin, player } = burst(WILD);
        expect(wolf.hp).toBe(wolf.maxHp - 11);
        expect(kin.hp).toBe(kin.maxHp);
        expect(player.hp).toBe(player.maxHp - 11);
    });

    it('without a rule only the player is hurt', () => {
        const { wolf, player } = burst(undefined);
        expect(wolf.hp).toBe(wolf.maxHp);
        expect(player.hp).toBe(player.maxHp - 11);
    });
});

describe('Wild burrow eruption', () => {
    const DUMMY_DEF = getUnitDefEntry('target_dummy')!;
    beforeEach(() => {
        DUMMY_DEF.phases = undefined;
    });
    afterEach(() => {
        DUMMY_DEF.phases = undefined;
    });

    function erupt(hitRule: HitRule | undefined): { wolf: Unit; kin: Unit; player: Unit } {
        const { engine, player } = makeEngine();
        const spot = { x: cell(4), y: cell(4) };
        const phase: UnitPhaseDef = {
            id: 'p2',
            enterWhen: { kind: 'health_below_percent', threshold: 0.75 },
            clampHitAtThreshold: true,
            transition: burrowPreset({
                closeSeconds: 0.1,
                sinkSeconds: 0.1,
                travelSeconds: 0.2,
                riseSeconds: 0.1,
                sproutPoints: [spot],
                eruption: { radiusPx: 90, damage: 13, reactable: false, ...(hitRule ? { hitRule } : {}) },
            }),
        };
        DUMMY_DEF.phases = [phase];
        const burrower = createTargetDummyAtWorld(engine, cell(12), cell(2), { id: 'burrower', hp: 100 });
        engine.addUnit(burrower, 'initialGameSpawn');
        const wolf = enemy(engine, 'wolf', spot.x, spot.y);
        const kin = enemy(engine, 'node', spot.x, spot.y, [UnitTag.GardenKin]);
        player.x = spot.x;
        player.y = spot.y;
        burrower.takeDamage(30, null, engine.eventBus);
        step(engine, 2);
        return { wolf, kin, player };
    }

    it('with a Wild rule the blast hits the wolf and the player and spares kin', () => {
        const { wolf, kin, player } = erupt(WILD);
        expect(wolf.hp).toBe(wolf.maxHp - 13);
        expect(kin.hp).toBe(kin.maxHp);
        expect(player.hp).toBe(player.maxHp - 13);
    });

    it('by default the blast only hits the hostile team', () => {
        const { wolf, player } = erupt(undefined);
        expect(wolf.hp).toBe(wolf.maxHp);
        expect(player.hp).toBe(player.maxHp - 13);
    });
});

describe('spawner childTags', () => {
    it('every unit the spawner births carries the tags', () => {
        registerSpawnerSpec('wildHitsTestSpawner', {
            child: {
                characterId: 'slime',
                name: 'Slimelet',
                abilities: [],
                team: 'inherit',
                aiSettings: null,
                spawnRadiusExtraPx: 40,
                inheritInvulnerability: false,
            },
            maxChildren: () => 2,
            intervalSec: () => 0.5,
            burstCount: () => 1,
            describeChild: (spawner, living) => ({
                unitAITreeId: 'hunt',
                aiHookup: { kind: 'swarm', orbitAngle: living, nestOwnerUnitId: spawner.id },
            }),
        });
        const { engine } = makeEngine();
        const nest = enemy(engine, 'nest', cell(4), cell(4));
        attachComponent(
            nest,
            componentSpec(SPAWNER_COMPONENT, {
                spawnerId: 'wildHitsTestSpawner',
                maxChildren: 2,
                intervalSec: 0.5,
                childTags: [UnitTag.GardenKin],
            }),
        );
        step(engine, 2);
        const children = engine.units.filter((u) => u.id !== 'nest' && u.characterId === 'slime');
        expect(children.length).toBeGreaterThan(0);
        for (const child of children) expect(child.tags).toContain(UnitTag.GardenKin);
        engine.destroy();
    });
});
