import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../abilities/AbilityRegistry';
import { FIXED_DT } from '../gameConstants';
import type { GameEngine } from '../GameEngine';
import type { TeamId } from '../teams';
import {
    buildTinyBattleEngine,
    placePlayerAndDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { registerSentryDef, type SentryDef } from './sentryDefs';

const PLAYER = { x: 100, y: 200 };
const DUMMY = { x: 200, y: 200 };

/** A sentry with nothing in common with the Armory turret. */
const TEST_SENTRY: SentryDef = {
    id: 'test_sentry_two_shots',
    shotDamage: 7,
    shotInterval: 0.5,
    shotCount: 2,
    firstShotDelay: 0.1,
    range: 300,
    coneHalfAngleRad: Math.PI / 4,
    shotHitRadius: 4,
    shotSpeed: 600,
    lifetime: 5,
};

/** Same shots, but it leaves before the second one. */
const SHORT_LIVED_SENTRY: SentryDef = {
    ...TEST_SENTRY,
    id: 'test_sentry_short_lived',
    lifetime: 0.3,
};

registerSentryDef(TEST_SENTRY);
registerSentryDef(SHORT_LIVED_SENTRY);

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

function spawnTestSentry(engine: GameEngine, ownerUnitId: string, teamId: TeamId, defId: string): void {
    engine.state.fieldObjects.spawnSentry(engine, {
        defId,
        x: PLAYER.x,
        y: PLAYER.y,
        facing: 0,
        teamId,
        ownerUnitId,
        // Not an Armory ability: the sentry must not need one.
        abilityId: 'test_sentry_ability',
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

describe('SentryDef', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fires exactly its own shot count and damage at a dummy, then leaves', () => {
        const { engine, playerId, teamId, dummyHp } = battle();
        const startHp = dummyHp();
        spawnTestSentry(engine, playerId, teamId, TEST_SENTRY.id);
        const sentry = engine.state.fieldObjects.sentries[0]!;
        expect(sentry.defId).toBe(TEST_SENTRY.id);
        expect(sentry.shotsRemaining).toBe(TEST_SENTRY.shotCount);
        expect(sentry.expiresAt - sentry.spawnedAtGameTime).toBeCloseTo(TEST_SENTRY.lifetime);

        const shots = countShots(engine, TEST_SENTRY.firstShotDelay + TEST_SENTRY.shotInterval + 0.5);
        expect(shots.count).toBe(TEST_SENTRY.shotCount);
        expect(shots.damages).toEqual([TEST_SENTRY.shotDamage, TEST_SENTRY.shotDamage]);
        expect(startHp - dummyHp()).toBe(TEST_SENTRY.shotCount * TEST_SENTRY.shotDamage);
        expect(engine.state.fieldObjects.sentries).toHaveLength(0);
    });

    it('expires on its own lifetime even with shots left', () => {
        const { engine, playerId, teamId } = battle();
        spawnTestSentry(engine, playerId, teamId, SHORT_LIVED_SENTRY.id);
        const shots = countShots(engine, SHORT_LIVED_SENTRY.lifetime + FIXED_DT);
        expect(shots.count).toBe(1);
        expect(engine.state.fieldObjects.sentries).toHaveLength(0);
        // Nothing fires after it has gone.
        expect(countShots(engine, TEST_SENTRY.shotInterval * 2).count).toBe(0);
    });

    it('drops a restored sentry whose def is not registered, and logs once', () => {
        const { engine, playerId, teamId } = battle();
        spawnTestSentry(engine, playerId, teamId, TEST_SENTRY.id);
        const saved = engine.state.fieldObjects.toJSON();
        const missing = { ...saved.sentries[0]!, id: 'ghost', defId: 'test_sentry_never_registered' };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        engine.state.fieldObjects.restoreFromJSON({
            droppedWeapons: [],
            sentries: [...saved.sentries, missing, { ...missing, id: 'ghost_2' }],
        });

        expect(engine.state.fieldObjects.sentries.map((sentry) => sentry.defId)).toEqual([TEST_SENTRY.id]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('refuses to spawn a sentry for an unregistered def', () => {
        const { engine, playerId, teamId } = battle();
        expect(() => spawnTestSentry(engine, playerId, teamId, 'test_sentry_unknown')).toThrow(/Unknown sentry def/);
    });
});
