/**
 * Guard card (0712): exiles the nearest free spirit and puts a Guard Shield on the picked ally (or the caster).
 * The spirit re-emerges at the shielded unit when the shield ends. With no free spirit nothing happens.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import '../../../abilities/AbilityRegistry';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../../../abilities/targeting';
import { isSelectTargetDef } from '../../../abilities/timingTargetDef';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { ShieldBuff } from '../../../buffs/ShieldBuff';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import { FIXED_DT } from '../../../game/gameConstants';
import type { GameEngine } from '../../../game/GameEngine';
import { getLivingPetsOfUnit } from '../../../game/units/petHelpers';
import { spawnPetForOwner } from '../../../game/units/petSpawn';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import {
    buildTinyBattleEngine,
    placeTargetDummy,
    placePlayerFromLoadout,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import { GUARD_RANGE, GUARD_SECONDS, GUARD_SHIELD_FLOOR, GuardAbility } from './0712Ability';

const CARD_ID = GuardAbility.id;

function step(engine: GameEngine, seconds: number): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function scene(withSpirit = true) {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    const spirit = withSpirit
        ? spawnPetForOwner(engine, player, {
            petDefId: 'spirit_clone',
            at: { x: 240, y: 200 },
            abilityIds: [],
            maxHp: 30,
            spawnSource: 'abilitySpawn',
        })
        : undefined;
    engine.waitingForOrders = null;
    engine.isPaused = false;
    step(engine, 0.3);

    const interval = GuardAbility.abilityTimings[0] as {
        castBehaviours: { behaviour: { onTick?: (c: CastBehaviourTickContext) => void } }[];
    };
    const cast = (target: Unit) => {
        const resolved: ResolvedTarget = { type: 'unit', unitId: target.id };
        interval.castBehaviours[0]!.behaviour.onTick?.({
            caster: player, abilityId: CARD_ID, target: resolved, allTargets: [resolved], castPayload: {},
            behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
            windowProgress: 0, prevWindowProgress: 0, isFirstTick: true, isLastTick: true,
        } as unknown as CastBehaviourTickContext);
    };
    return { engine, player, spirit, cast };
}

const guardShieldsOn = (unit: Unit) =>
    unit.buffs.filter((b): b is ShieldBuff => b instanceof ShieldBuff && b.refillFloor > 0);

describe('Guard card 0712', () => {
    it('picks an ally or the caster within range, from the nearest free spirit', () => {
        const ability = getAbility(CARD_ID)!;
        const defs = getInteractiveTargetDefsFromTimings(ability);
        expect(defs).toHaveLength(1);
        const def = defs[0]!;
        expect(isSelectTargetDef(def)).toBe(true);
        if (isSelectTargetDef(def)) {
            expect(def.filter).toBe('ally');
            expect(def.includeSelf).toBe(true);
        }
        expect(ability.getRange!(null as unknown as Unit)!.maxRange).toBe(GUARD_RANGE);
        expect(ability.abilitySource).toEqual({ type: 'pet', selector: 'nearest', requireFree: true });
        expect(ability.maxUses).toBe(1);
        expect(ability.recoveries).toEqual([{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }]);
    });

    it('exiles the free spirit and shields the caster when cast on self', () => {
        const { engine, player, spirit, cast } = scene();
        cast(player);

        expect(engine.units).not.toContain(spirit);
        expect(engine.getExiledUnit(spirit!.id)).toBe(spirit);
        expect(getLivingPetsOfUnit(player, engine.units)).not.toContain(spirit);
        const shields = guardShieldsOn(player);
        expect(shields).toHaveLength(1);
        expect(shields[0]!.refillFloor).toBe(GUARD_SHIELD_FLOOR);
        expect(shields[0]!.linkedExiledUnitId).toBe(spirit!.id);
    });

    it('a hit while guarded is reduced by the floor', () => {
        const { engine, player, cast } = scene();
        cast(player);
        const before = player.hp;
        player.takeDamage(5, 'enemy', engine.eventBus);
        expect(before - player.hp).toBe(3);
        player.takeDamage(5, 'enemy', engine.eventBus);
        expect(before - player.hp).toBe(6);
    });

    it('shields an ally; the spirit re-emerges at the ally when the shield ends, then guards its owner', () => {
        const { engine, player, spirit, cast } = scene();
        // A non-pet ally (a dummy moved to the caster's team): a pet would itself be the nearest free spirit.
        const ally = placeTargetDummy(engine, { x: 330, y: 200 }, 'ally');
        ally.teamId = player.teamId;
        const events: string[] = [];
        engine.eventBus.on('unit_returned', (e) => events.push(e.reason));
        engine.eventBus.on('unit_fade_in', (e) => events.push(`fade:${e.unitId}`));
        cast(ally);

        expect(guardShieldsOn(ally)).toHaveLength(1);
        expect(engine.getExiledUnit(spirit!.id)).toBe(spirit);

        step(engine, GUARD_SECONDS + 0.5);

        expect(engine.getExiledUnit(spirit!.id)).toBeUndefined();
        expect(engine.units).toContain(spirit);
        expect(Math.hypot(spirit!.x - ally.x, spirit!.y - ally.y)).toBeLessThan(80);
        expect(guardShieldsOn(ally)).toHaveLength(0);
        expect(events).toContain('guard');
        expect(events).toContain(`fade:${spirit!.id}`);
    });

    it('does nothing with no free spirit', () => {
        const { engine, player, cast } = scene(false);
        cast(player);
        expect(engine.getExiledUnits()).toHaveLength(0);
        expect(guardShieldsOn(player)).toHaveLength(0);
    });

    it('does nothing when the only spirit is busy', () => {
        const { engine, player, spirit, cast } = scene();
        spirit!.activeAbilities.push({
            abilityId: '0716', startTime: engine.gameTime, targets: [], castBehaviourPayloads: {},
            evadeFired: false, comboCount: 1, castPriority: CAST_PRIORITY.Major,
        } as ActiveAbility);
        cast(player);
        expect(engine.getExiledUnits()).toHaveLength(0);
        expect(guardShieldsOn(player)).toHaveLength(0);
    });

    it('a clone guards no longer than its despawn time', () => {
        const { engine, player, spirit, cast } = scene();
        spirit!.ephemeralDespawnAtGameTime = engine.gameTime + 3;
        cast(player);
        const shield = guardShieldsOn(player)[0]!;
        expect(shield.expiresAtGameTime).toBeCloseTo(engine.gameTime + 3, 5);
        expect(engine.getExiledUnit(spirit!.id)).toBe(spirit);
    });
});
