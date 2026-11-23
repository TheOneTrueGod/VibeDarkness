/**
 * Ephemeral expiry policy (`ephemeralExpiry.ts`): `'immediate'` units die on time even mid-cast; `'finishCast'`
 * units past their time linger until their cast leaves its last non-cooldown window, then die. Lingering pets are
 * never picked by commands, clones are never revived, and dead clones leave their owner's pet list.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    AbilityPhase,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { resolveAbilitySourceUnits } from '../../abilities/abilitySourceUnits';
import { commandHeel } from '../../abilities/petCommands';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { FIXED_DT } from '../gameConstants';
import type { GameEngine } from '../GameEngine';
import { EventBus } from '../EventBus';
import { getCastElapsed } from '../time/actorClock';
import { peekPetState } from './components/petComponent';
import { isUnitLingering } from './ephemeralExpiry';
import { spawnPetForOwner } from './petSpawn';
import type { EphemeralExpiryPolicy } from './unitTypes';
import { Unit } from './Unit';
import { executeUnitAbility } from './unitAbilityLifecycle';

const BITE_ID = '0701';

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

/** A player at (200, 200) with one spirit clone of the given expiry policy beside it. */
function battle(policy?: EphemeralExpiryPolicy) {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    const clone = spawnPetForOwner(engine, player, {
        petDefId: 'spirit_clone',
        at: { x: 240, y: 200 },
        abilityIds: [BITE_ID],
        maxHp: 30,
        ...(policy ? { ephemeralExpiryPolicy: policy } : {}),
        spawnSource: 'abilitySpawn',
    })!;
    engine.waitingForOrders = null;
    engine.isPaused = false;
    // Let the spawn settle before timing anything.
    step(engine, 0.5);
    return { engine, player, clone };
}

/** End (cast-elapsed seconds) of the bite's last non-cooldown window. */
function biteActionEnd(clone: Unit, engine: GameEngine): number {
    const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(getAbility(BITE_ID)!, clone, engine));
    return Math.max(
        ...intervals
            .filter((it) => it.abilityPhase !== AbilityPhase.Cooldown && it.abilityPhase !== AbilityPhase.CoopCooldown)
            .map((it) => it.end),
    );
}

/** Start a bite on a dummy and set the clone to expire halfway through the bite's action. */
function biteAndExpireMidCast(engine: GameEngine, clone: Unit): { actionEnd: number } {
    const dummy = placeTargetDummy(engine, { x: 300, y: 200 }, 'dummy');
    executeUnitAbility(clone, getAbility(BITE_ID)!, [{ type: 'unit', unitId: dummy.id }], engine);
    const actionEnd = biteActionEnd(clone, engine);
    expect(actionEnd).toBeGreaterThan(4 * FIXED_DT);
    clone.ephemeralDespawnAtGameTime = engine.gameTime + actionEnd / 2;
    return { actionEnd };
}

describe('ephemeral expiry policy', () => {
    it("'immediate' (default): dies at its time even mid-cast", () => {
        const { engine, clone } = battle();
        expect(clone.ephemeralExpiryPolicy).toBe('immediate');
        biteAndExpireMidCast(engine, clone);
        const despawnAt = clone.ephemeralDespawnAtGameTime!;

        let diedAt: number | null = null;
        step(engine, 1, () => {
            if (diedAt === null && !clone.isAlive()) diedAt = engine.gameTime;
        });
        expect(diedAt).not.toBeNull();
        expect(diedAt!).toBeLessThan(despawnAt + 2 * FIXED_DT);
    });

    it("'finishCast': past its time mid-cast it lingers until the cast's action ends, then dies (no cooldown wait)", () => {
        const { engine, clone } = battle('finishCast');
        const { actionEnd } = biteAndExpireMidCast(engine, clone);
        const despawnAt = clone.ephemeralDespawnAtGameTime!;
        const active = clone.activeAbilities.find((a) => a.abilityId === BITE_ID)!;

        let lingered = false;
        let diedAtElapsed: number | null = null;
        step(engine, 1, () => {
            if (clone.isAlive() && engine.gameTime >= despawnAt) {
                lingered = true;
                expect(isUnitLingering(clone, engine.gameTime)).toBe(true);
            }
            if (diedAtElapsed === null && !clone.isAlive()) diedAtElapsed = getCastElapsed(clone, active, engine);
        });

        expect(lingered).toBe(true);
        expect(diedAtElapsed).not.toBeNull();
        expect(diedAtElapsed!).toBeGreaterThanOrEqual(actionEnd - 1e-9);
        expect(diedAtElapsed!).toBeLessThan(actionEnd + 2 * FIXED_DT);
    });

    it("'finishCast': an idle unit dies on time", () => {
        const { engine, clone } = battle('finishCast');
        expect(clone.activeAbilities).toHaveLength(0);
        const despawnAt = engine.gameTime + 0.2;
        clone.ephemeralDespawnAtGameTime = despawnAt;

        let diedAt: number | null = null;
        step(engine, 0.5, () => {
            if (diedAt === null && !clone.isAlive()) diedAt = engine.gameTime;
        });
        expect(diedAt).not.toBeNull();
        expect(diedAt!).toBeGreaterThanOrEqual(despawnAt - 1e-9);
        expect(diedAt!).toBeLessThan(despawnAt + 2 * FIXED_DT);
    });

    it('a lingering pet is not picked by resolveAbilitySourceUnits; a live one is', () => {
        const { engine, player, clone } = battle('finishCast');
        const ability = { abilitySource: { type: 'pet', selector: 'all' } as const };
        expect(resolveAbilitySourceUnits(ability, player, engine.units, undefined, engine)).toContain(clone);

        clone.ephemeralDespawnAtGameTime = engine.gameTime;
        expect(isUnitLingering(clone, engine.gameTime)).toBe(true);
        expect(resolveAbilitySourceUnits(ability, player, engine.units, undefined, engine)).not.toContain(clone);
    });

    it('a dead clone is not revived by a heel and leaves its owner\'s pet list', () => {
        const { engine, player, clone } = battle('finishCast');
        expect(peekPetState(player)?.unitIds).toContain(clone.id);
        clone.ephemeralDespawnAtGameTime = engine.gameTime + FIXED_DT;
        step(engine, 0.1);
        expect(clone.isAlive()).toBe(false);
        expect(peekPetState(player)?.unitIds ?? []).not.toContain(clone.id);

        commandHeel(player, [clone], engine, { healFraction: 1, tetherRange: 60, durationSeconds: 1 });
        expect(clone.isAlive()).toBe(false);
    });

    it('the policy round-trips toJSON / fromJSON (and is omitted when immediate)', () => {
        const unit = new Unit({
            id: 'clone_1',
            x: 0,
            y: 0,
            hp: 10,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'spirit_clone',
            name: 'Spirit Clone',
            ephemeralDespawnAtGameTime: 12,
            ephemeralExpiryPolicy: 'finishCast',
        });
        const json = unit.toJSON();
        expect(json.ephemeralExpiryPolicy).toBe('finishCast');
        const restored = Unit.fromJSON(json, new EventBus());
        expect(restored.ephemeralExpiryPolicy).toBe('finishCast');
        expect(restored.ephemeralDespawnAtGameTime).toBe(12);

        unit.ephemeralExpiryPolicy = 'immediate';
        const plain = unit.toJSON();
        expect('ephemeralExpiryPolicy' in plain).toBe(false);
        expect(Unit.fromJSON(plain, new EventBus()).ephemeralExpiryPolicy).toBe('immediate');
    });
});
