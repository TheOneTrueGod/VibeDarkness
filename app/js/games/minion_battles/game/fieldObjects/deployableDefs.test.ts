import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../abilities/AbilityRegistry';
import { FIXED_DT } from '../gameConstants';
import type { GameEngine } from '../GameEngine';
import type { TeamId } from '../teams';
import type { UnitHealedEvent } from '../EventBus';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { upgradeSerializedGameState } from '../serializedGameStateUpgrade';
import { registerDeployableDef, type DeployableDef } from './deployableDefs';

const PLAYER = { x: 100, y: 200 };
const DUMMY = { x: 200, y: 200 };

/** A shooter with nothing in common with the Armory turret. */
const TEST_SHOOTER: DeployableDef = {
    id: 'test_deployable_two_shots',
    visual: 'turret',
    charges: 2,
    firstTriggerDelay: 0.1,
    triggerInterval: 0.5,
    lifetime: 5,
    action: {
        type: 'shoot',
        damage: 7,
        range: 300,
        coneHalfAngleRad: Math.PI / 4,
        hitRadius: 4,
        speed: 600,
    },
};

/** Same shots, but it leaves before the second one. */
const SHORT_LIVED_SHOOTER: DeployableDef = {
    ...TEST_SHOOTER,
    id: 'test_deployable_short_lived',
    lifetime: 0.3,
};

const TEST_HEALER: DeployableDef = {
    id: 'test_deployable_healer',
    visual: 'repair_post',
    charges: 3,
    firstTriggerDelay: 0.1,
    triggerInterval: 0.5,
    lifetime: 5,
    action: { type: 'healPulse', radius: 150, heal: 4, pulseColors: [0x22c55e], pulseDuration: 0.6 },
};

registerDeployableDef(TEST_SHOOTER);
registerDeployableDef(SHORT_LIVED_SHOOTER);
registerDeployableDef(TEST_HEALER);

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    const ticks = Math.ceil(seconds / FIXED_DT) + 1;
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

function battle(): { engine: GameEngine; playerId: string; teamId: TeamId; dummyHp: () => number } {
    const engine = buildTinyBattleEngine({ gridW: 12, gridH: 12, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player, dummy } = placePlayerAndDummy(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        playerWorld: PLAYER,
        dummyWorld: DUMMY,
        abilities: [],
    });
    return { engine, playerId: player.id, teamId: player.teamId, dummyHp: () => dummy.hp };
}

function spawnTestDeployable(engine: GameEngine, ownerUnitId: string, teamId: TeamId, defId: string): void {
    engine.state.fieldObjects.spawnDeployable(engine, {
        defId,
        x: PLAYER.x,
        y: PLAYER.y,
        facing: 0,
        teamId,
        ownerUnitId,
        // Not an Armory ability: the deployable must not need one.
        abilityId: 'test_deployable_ability',
    });
}

/** Count new projectiles as they appear; shots despawn when they hit. */
function countShots(engine: GameEngine, seconds: number): { count: number; damages: number[] } {
    const seen = new Set(engine.projectiles.map((projectile) => projectile.id));
    const damages: number[] = [];
    step(engine, seconds, () => {
        for (const projectile of engine.projectiles) {
            if (seen.has(projectile.id)) continue;
            seen.add(projectile.id);
            damages.push(projectile.damage);
        }
    });
    return { count: damages.length, damages };
}

describe('DeployableDef', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a shoot action fires exactly its charges and damage at a dummy, then leaves', () => {
        const { engine, playerId, teamId, dummyHp } = battle();
        const startHp = dummyHp();
        spawnTestDeployable(engine, playerId, teamId, TEST_SHOOTER.id);
        const placed = engine.state.fieldObjects.placedDeployables[0]!;
        expect(placed.defId).toBe(TEST_SHOOTER.id);
        expect(placed.chargesRemaining).toBe(TEST_SHOOTER.charges);
        expect(placed.expiresAt - placed.spawnedAtGameTime).toBeCloseTo(TEST_SHOOTER.lifetime);

        const shots = countShots(engine, TEST_SHOOTER.firstTriggerDelay + TEST_SHOOTER.triggerInterval + 0.5);
        expect(shots.count).toBe(TEST_SHOOTER.charges);
        expect(shots.damages).toEqual([7, 7]);
        expect(startHp - dummyHp()).toBe(14);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(0);
    });

    it('expires on its own lifetime even with charges left', () => {
        const { engine, playerId, teamId } = battle();
        spawnTestDeployable(engine, playerId, teamId, SHORT_LIVED_SHOOTER.id);
        const shots = countShots(engine, SHORT_LIVED_SHOOTER.lifetime + FIXED_DT);
        expect(shots.count).toBe(1);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(0);
        expect(countShots(engine, TEST_SHOOTER.triggerInterval * 2).count).toBe(0);
    });

    it('a heal pulse heals allies in its radius, not ones outside it or enemies, and reports each heal', () => {
        const { engine, playerId, teamId } = battle();
        const near = spawnTinyPlayerUnit(engine, { playerId: 'tiny_p2', x: PLAYER.x + 140, y: PLAYER.y, abilities: [] });
        const far = spawnTinyPlayerUnit(engine, { playerId: 'tiny_p3', x: PLAYER.x + 160, y: PLAYER.y + 60, abilities: [] });
        const owner = engine.getUnit(playerId)!;
        const dummy = engine.units.find((unit) => unit.id !== owner.id && unit.teamId !== teamId)!;
        for (const unit of [owner, near, far, dummy]) unit.hp = unit.maxHp - 20;
        const healed: UnitHealedEvent[] = [];
        engine.eventBus.on('unit_healed', (event) => healed.push(event));

        spawnTestDeployable(engine, playerId, teamId, TEST_HEALER.id);
        step(engine, TEST_HEALER.firstTriggerDelay + 0.05);

        expect(owner.hp).toBe(owner.maxHp - 16);
        expect(near.hp).toBe(near.maxHp - 16);
        expect(far.hp).toBe(far.maxHp - 20);
        expect(dummy.hp).toBe(dummy.maxHp - 20);
        expect(healed.map((event) => event.unitId).sort()).toEqual([near.id, owner.id].sort());
        expect(healed.every((event) => event.amount === 4 && event.sourceUnitId === playerId)).toBe(true);
        expect(engine.state.fieldObjects.placedDeployables[0]!.chargesRemaining).toBe(TEST_HEALER.charges - 1);
        expect(engine.effects.some((effect) => effect.effectType === 'Pulse')).toBe(true);
    });

    it('drops a restored deployable whose def is not registered, and logs once', () => {
        const { engine, playerId, teamId } = battle();
        spawnTestDeployable(engine, playerId, teamId, TEST_SHOOTER.id);
        const saved = engine.state.fieldObjects.toJSON();
        const missing = { ...saved.placedDeployables[0]!, id: 'ghost', defId: 'test_deployable_never_registered' };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        engine.state.fieldObjects.restoreFromJSON({
            droppedWeapons: [],
            placedDeployables: [...saved.placedDeployables, missing, { ...missing, id: 'ghost_2' }],
        });

        expect(engine.state.fieldObjects.placedDeployables.map((d) => d.defId)).toEqual([TEST_SHOOTER.id]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('refuses to spawn a deployable for an unregistered def', () => {
        const { engine, playerId, teamId } = battle();
        expect(() => spawnTestDeployable(engine, playerId, teamId, 'test_deployable_unknown')).toThrow(/Unknown deployable def/);
    });

    it('upgrades an old checkpoint`s sentries into placed deployables', () => {
        const sentry = { id: 'sentry_1', defId: TEST_SHOOTER.id, shotsRemaining: 3, nextShotAt: 4.5, x: 1 };
        const upgraded = upgradeSerializedGameState({ serializationVersion: 1, sentries: [sentry] } as never) as unknown as {
            sentries?: unknown;
            placedDeployables: Record<string, unknown>[];
        };
        expect(upgraded.sentries).toBeUndefined();
        expect(upgraded.placedDeployables).toEqual([
            { id: 'sentry_1', defId: TEST_SHOOTER.id, x: 1, chargesRemaining: 3, nextTriggerAt: 4.5 },
        ]);
    });
});
