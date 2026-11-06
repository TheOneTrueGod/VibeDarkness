import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../game/gameConstants';
import type { GameEngine } from '../../game/GameEngine';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import '../../abilities/AbilityRegistry';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { STORM_NODE_CORE, STORM_TREE_ID } from '../../../../researchTrees/trees/storm';
import { ARC_BOLT_PROJECTILE_TYPE } from '../../game/projectiles/projectile_defs/arcBoltDef';
import { ArcBoltAbility_1301, ARC_BOLT_RANGE } from './1301_ArcBolt/1301Ability';
import { ARC_BOLT_RADIUS } from './stormConstants';

const PLAYER = { x: 200, y: 400 };

function step(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        engine.isPaused = false;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function setup() {
    const engine = buildTinyBattleEngine({ gridW: 40, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.StormCore],
        researchTrees: { [STORM_TREE_ID]: [STORM_NODE_CORE] },
    });
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player };
}

function fire(engine: GameEngine, player: Parameters<typeof executeUnitAbility>[0]): void {
    // Aim well short of the enemy: Arc Bolt flies its full range regardless.
    executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: PLAYER.x + 60, y: PLAYER.y } }], engine);
    step(engine, 240);
}

describe('Arc Bolt range', () => {
    it('hits an enemy whose body just touches the end of the forecast line', () => {
        const { engine, player } = setup();
        const dummy = placeTargetDummy(engine, { x: 0, y: PLAYER.y });
        // Body edge exactly at the line's end: only the final step of the flight can reach it.
        dummy.x = PLAYER.x + ARC_BOLT_RANGE + dummy.radius;
        const hp = dummy.hp;
        fire(engine, player);
        expect(hp - dummy.hp).toBeGreaterThan(0);
    });

    it('does not reach an enemy past the end of the forecast line', () => {
        const { engine, player } = setup();
        const dummy = placeTargetDummy(engine, { x: 0, y: PLAYER.y });
        const projectileRadius = ARC_BOLT_RADIUS;
        dummy.x = PLAYER.x + ARC_BOLT_RANGE + dummy.radius + projectileRadius + 2;
        const hp = dummy.hp;
        fire(engine, player);
        expect(dummy.hp).toBe(hp);
    });

    it('expires exactly at the end of its range', () => {
        const { engine, player } = setup();
        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: PLAYER.x + 60, y: PLAYER.y } }], engine);
        let lastX = 0;
        for (let i = 0; i < 240; i++) {
            step(engine, 1);
            for (const p of engine.projectiles) {
                if (p.projectileType === ARC_BOLT_PROJECTILE_TYPE) lastX = p.x;
            }
        }
        expect(lastX - PLAYER.x).toBeLessThanOrEqual(ARC_BOLT_RANGE + 0.01);
    });
});
