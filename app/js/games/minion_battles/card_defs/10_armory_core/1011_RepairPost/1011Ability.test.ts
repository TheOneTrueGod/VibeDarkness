import { beforeAll, describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { FIXED_DT, ROUND_DURATION } from '../../../game/gameConstants';
import type { GameEngine } from '../../../game/GameEngine';
import type { UnitHealedEvent } from '../../../game/EventBus';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { swordItem } from '../../../character_defs/items/weapons/013_sword';
import { DEPLOYABLE_DELIVERY_PROJECTILE_TYPE } from '../../../game/fieldObjects/deployableDefs';
import { HEAL_NUMBER_COLOR } from '../../../game/createDamageTakenEffect';
import { REPAIR_POST_FOLDED_PIP_ORBIT, repairPostShape } from '../../../game/effect_defs/repairPostPose';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import {
    ARMORY_NODE_CORE,
    ARMORY_NODE_REPAIR_POST,
    ARMORY_TREE_ID,
    armoryTree,
} from '../../../../../researchTrees/trees/armory';
import {
    ARMORY_DEPLOYABLE_WEAPON_COST,
    ARMORY_REPAIR_POST_DEF_ID,
    DROPPED_WEAPON_KIND_SWORD,
    REPAIR_POST_ABILITY_ID,
} from '../armoryConstants';
import { registerArmoryContent } from '../register';
import { RepairPostAbility_1011 } from './1011Ability';
import {
    REPAIR_POST_DEPLOY_WINDOW_END,
    REPAIR_POST_FIRST_PULSE_DELAY,
    REPAIR_POST_HEAL,
    REPAIR_POST_HEAL_RADIUS,
    REPAIR_POST_PLACE_RANGE,
    REPAIR_POST_PULSE_INTERVAL,
    REPAIR_POST_PULSES,
} from './1011Constants';

const PLAYER = { x: 200, y: 200 };
const PLACE = { x: PLAYER.x + 100, y: PLAYER.y };

function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.ceil(seconds / FIXED_DT) + 1;
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

/** Drop the weapons the post costs beside the player. */
function dropWeapons(engine: GameEngine, count = ARMORY_DEPLOYABLE_WEAPON_COST): void {
    const player = engine.units[0]!;
    for (let i = 0; i < count; i++) {
        engine.state.fieldObjects.droppedWeapons.push({
            id: `post_cost_${i}`,
            x: player.x - 10 - i * 5,
            y: player.y + 20,
            kind: DROPPED_WEAPON_KIND_SWORD,
            ownerUnitId: player.id,
            teamId: player.teamId,
            abilityId: 'test',
            spawnedAtGameTime: 0,
            facing: 0,
        });
    }
}

function repairBattle(): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.BasicCore, swordItem.id],
        researchTrees: { [ARMORY_TREE_ID]: [ARMORY_NODE_CORE, ARMORY_NODE_REPAIR_POST] },
    });
    engine.waitingForOrders = null;
    engine.isPaused = false;
    dropWeapons(engine);
    return engine;
}

/** Cast at PLACE and step until the post has landed. */
function castRepairPost(engine: GameEngine): void {
    const player = engine.units[0]!;
    executeUnitAbility(player, RepairPostAbility_1011, [{ type: 'pixel', position: PLACE }], engine);
    step(engine, REPAIR_POST_DEPLOY_WINDOW_END + 0.3);
}

describe('Repair Post (1011)', () => {
    beforeAll(() => {
        registerArmoryContent();
    });

    it('is unlocked by its own tier-15 Armory node, and the player gets the card', () => {
        const node = armoryTree.nodes.find((entry) => entry.id === ARMORY_NODE_REPAIR_POST)!;
        expect(node.tier).toBe(15);
        expect(node.prereqNodeIds).toEqual([ARMORY_NODE_CORE]);
        expect(node.effects).toContainEqual({ type: 'addCard', cardId: REPAIR_POST_ABILITY_ID });
        const total = (node.cost.attunement ?? 0) + (node.cost.vigor ?? 0) + (node.cost.metal ?? 0);
        expect(total).toBe(30);
        expect(repairBattle().units[0]!.abilities).toContain(REPAIR_POST_ABILITY_ID);
    });

    it('flies folded, lands as a deployable, and pulses once each quarter round for a round', () => {
        const engine = repairBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, RepairPostAbility_1011, [{ type: 'pixel', position: PLACE }], engine);
        step(engine, REPAIR_POST_DEPLOY_WINDOW_END);
        const delivery = engine.projectiles.find((p) => p.projectileType === DEPLOYABLE_DELIVERY_PROJECTILE_TYPE);
        expect(delivery?.expireData?.defId).toBe(ARMORY_REPAIR_POST_DEF_ID);

        step(engine, 0.3);
        const placed = engine.state.fieldObjects.placedDeployables;
        expect(placed).toHaveLength(1);
        expect(placed[0]!.defId).toBe(ARMORY_REPAIR_POST_DEF_ID);
        expect(placed[0]!.x).toBeCloseTo(PLACE.x);
        expect(placed[0]!.chargesRemaining).toBe(REPAIR_POST_PULSES);

        const pulses: number[] = [];
        const seen = new Set<string>();
        const ticks = Math.ceil((ROUND_DURATION + 0.5) / FIXED_DT);
        for (let i = 0; i < ticks; i++) {
            step(engine, 0);
            for (const effect of engine.effects) {
                if (effect.effectType !== 'Pulse' || seen.has(effect.id)) continue;
                seen.add(effect.id);
                pulses.push(engine.gameTime);
            }
        }
        expect(pulses).toHaveLength(REPAIR_POST_PULSES);
        expect(pulses[1]! - pulses[0]!).toBeCloseTo(REPAIR_POST_PULSE_INTERVAL, 1);
        expect(REPAIR_POST_PULSE_INTERVAL).toBeCloseTo(ROUND_DURATION / 4);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(0);
    });

    it('heals allies within the heal radius of the post, but not further allies or enemies, with green numbers', () => {
        const engine = repairBattle();
        const player = engine.units[0]!;
        const ally = spawnTinyPlayerUnit(engine, { playerId: 'tiny_p2', x: PLACE.x + REPAIR_POST_HEAL_RADIUS - 10, y: PLACE.y, abilities: [] });
        const farAlly = spawnTinyPlayerUnit(engine, { playerId: 'tiny_p3', x: PLACE.x, y: PLACE.y + REPAIR_POST_HEAL_RADIUS + 20, abilities: [] });
        const dummy = placeTargetDummy(engine, { x: PLACE.x - 40, y: PLACE.y + 40 });
        for (const unit of [player, ally, farAlly, dummy]) unit.hp = unit.maxHp - 10;
        const healed: UnitHealedEvent[] = [];
        engine.eventBus.on('unit_healed', (event) => healed.push(event));

        castRepairPost(engine);
        step(engine, REPAIR_POST_FIRST_PULSE_DELAY);

        expect(player.hp).toBe(player.maxHp - 10 + REPAIR_POST_HEAL);
        expect(ally.hp).toBe(ally.maxHp - 10 + REPAIR_POST_HEAL);
        expect(farAlly.hp).toBe(farAlly.maxHp - 10);
        expect(dummy.hp).toBe(dummy.maxHp - 10);
        expect(new Set(healed.map((event) => event.unitId))).toEqual(new Set([player.id, ally.id]));
        const numbers = engine.effects.filter((effect) => effect.effectType === 'DamageNumber');
        const greens = numbers.filter((effect) => (effect.effectData as { color?: number }).color === HEAL_NUMBER_COLOR);
        expect(greens).toHaveLength(2);
        expect(greens.every((effect) => (effect.effectData as { prefix?: string }).prefix === '+')).toBe(true);
    });

    it('rejects a tile beyond its placement range', () => {
        const engine = repairBattle();
        const player = engine.units[0]!;
        const select = RepairPostAbility_1011.abilityTimings[0] as { targetDef?: { validatePick?: (ctx: unknown) => boolean } };
        const validate = select.targetDef!.validatePick!;
        const inside = { type: 'pixel' as const, position: PLACE };
        const outside = { type: 'pixel' as const, position: { x: PLAYER.x + REPAIR_POST_PLACE_RANGE + 20, y: PLAYER.y } };
        expect(validate({ caster: player, engine, pick: inside })).toBe(true);
        expect(validate({ caster: player, engine, pick: outside })).toBe(false);
    });

    it('costs no Charge, needs the weapons in reach, and destroys them when the post is thrown', () => {
        expect(RepairPostAbility_1011.resourceCost).toBeNull();
        type Select = { targetDef?: { label?: string; validatePick?: (ctx: unknown) => boolean } };
        const select = RepairPostAbility_1011.abilityTimings[0] as Select;
        expect(select.targetDef!.label).toContain(String(ARMORY_DEPLOYABLE_WEAPON_COST));

        const short = repairBattle();
        short.state.fieldObjects.droppedWeapons.pop();
        expect(select.targetDef!.validatePick!({ caster: short.units[0]!, engine: short, pick: { type: 'pixel', position: PLACE } })).toBe(false);

        const engine = repairBattle();
        castRepairPost(engine);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(0);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(1);
    });

    it('folded, the arcs sit on the core and the pips are inside it; placed, the arcs open out', () => {
        const folded = repairPostShape(0);
        expect(folded.arcRadius).toBeCloseTo(folded.coreRadius);
        expect(REPAIR_POST_FOLDED_PIP_ORBIT + folded.pipRadius).toBeLessThan(folded.coreRadius);
        const placed = repairPostShape(1);
        expect(placed.coreRadius).toBeLessThan(10);
        expect(placed.arcRadius).toBeGreaterThan(placed.pipOrbit + placed.pipRadius);
        expect(repairPostShape(1, 1).arcRadius).toBeGreaterThan(placed.arcRadius);
    });

    it('survives a checkpoint round trip mid-life', async () => {
        const engine = repairBattle();
        castRepairPost(engine);
        step(engine, REPAIR_POST_FIRST_PULSE_DELAY + 0.1);
        const { GameEngine } = await import('../../../game/GameEngine');
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), TINY_BATTLE_PLAYER_ID);
        expect(restored.state.fieldObjects.placedDeployables).toEqual(engine.state.fieldObjects.placedDeployables);
    });
});
