import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../game/gameConstants';
import { GameEngine } from '../../game/GameEngine';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import '../../abilities/AbilityRegistry';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import {
    STORM_NODE_CORE,
    STORM_NODE_FORKED_LIGHTNING,
    STORM_NODE_STATIC_STEP,
    STORM_NODE_THUNDERCLAP,
    STORM_TREE_ID,
    stormTree,
} from '../../../../researchTrees/trees/storm';
import { RESEARCH_TREE_ICON_STORM, resolveResearchTreeChrome } from '../../../../researchTrees/researchTreeChrome';
import { listTier10RootCoreCandidates } from '../../storylines/WorldOfDarkness/missions/006_core_awakening';
import { Static, STATIC_RECOVERY_PER_INTERVAL, STATIC_RECOVERY_SECONDS } from '../../resources/Static';
import { createResourceFromId } from '../../resources/createResourceFromId';
import { applyMark, consumeMark, getMarkStacks, MarkBuff, spendMarkStacks } from '../../buffs/MarkBuff';
import { buffFromJSON } from '../../buffs/buffRegistry';
import { getAbilityTheme } from '../../themes/abilityTheme';
import { resolveChainHops } from '../../abilities/chainHops';
import { rainyStormModifier, RAINY_STORM_STATIC_GAIN_MULT } from '../../worldModifiers/presets/rainyStorm';
import { getAbility } from '../../abilities/AbilityRegistry';
import { abilityRefillsUsesEachRound } from '../../abilities/abilityUses';
import { keywordGlossaryEntries } from '../../abilities/keywords/keywordRegistry';
import { getCardDef } from '../index';
import { LIGHTNING_BOLT_EFFECT_TYPE, STORM_SPARK_EFFECT_TYPE } from '../../game/effect_defs/stormEffects';
import { ARC_BOLT_PROJECTILE_TYPE } from '../../game/projectiles/projectile_defs/arcBoltDef';
import {
    ARC_BOLT_ABILITY_ID,
    ARC_BOLT_DAMAGE,
    ARC_BOLT_MAX_USES,
    CHAIN_LIGHTNING_ABILITY_ID,
    CHAIN_LIGHTNING_DAMAGE,
    CHAIN_LIGHTNING_DAMAGE_PER_CONDUCTIVE,
    CHAIN_LIGHTNING_JUMPS,
    CHAIN_LIGHTNING_MAX_USES,
    CHAIN_LIGHTNING_STATIC_COST,
    CONDUCTIVE_MARK_ID,
    CONDUCTIVE_MAX_STACKS,
    FORKED_LIGHTNING_EXTRA_JUMPS,
    STATIC_GROUND_SECONDS,
    STATIC_MAX,
    STATIC_MISSION_START,
    STATIC_PX_PER_POINT,
    STATIC_STEP_ABILITY_ID,
    STATIC_STEP_DAMAGE,
    STATIC_STEP_DISTANCE,
    STATIC_STEP_STATIC_COST,
    THUNDERCLAP_ABILITY_ID,
    THUNDERCLAP_CHARGED_DAMAGE,
    THUNDERCLAP_DAMAGE,
    THUNDERCLAP_RADIUS,
    THUNDERCLAP_STATIC_COST,
    THUNDERCLAP_STATIC_PER_CHARGE,
} from './stormConstants';
import { ArcBoltAbility_1301, ARC_BOLT_BOUNCE_DAMAGE, ARC_BOLT_PROFILE } from './1301_ArcBolt/1301Ability';
import { StaticStepAbility_1302 } from './1302_StaticStep/1302Ability';
import { ChainLightningAbility_1303 } from './1303_ChainLightning/1303Ability';
import { getThunderclapBrightness, ThunderclapAbility_1304 } from './1304_Thunderclap/1304Ability';

const PLAYER = { x: 200, y: 400 };

function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.ceil(seconds / FIXED_DT) + 1;
    for (let i = 0; i < ticks; i++) {
        // Idle player units pause the sim for orders; clear that so time keeps passing.
        engine.waitingForOrders = null;
        engine.isPaused = false;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function stormBattle(nodes: string[] = [STORM_NODE_CORE]): { engine: GameEngine; player: Unit } {
    const engine = buildTinyBattleEngine({ gridW: 30, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.StormCore],
        researchTrees: { [STORM_TREE_ID]: nodes },
    });
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player };
}

function staticOf(unit: Unit): Static {
    const resource = unit.getResource('static');
    if (!(resource instanceof Static)) throw new Error('no Static');
    return resource;
}

function unitTarget(unit: Unit): ResolvedTarget {
    return { type: 'unit', unitId: unit.id };
}

/** A minimal unit for pure Static tests. */
function mover(): { x: number; y: number; isAlive(): boolean } {
    return { x: 0, y: 0, isAlive: () => true };
}

describe('Static (resource)', () => {
    const engineStub = { roundNumber: 1 };

    it('builds one Static per STATIC_PX_PER_POINT travelled, capped at max', () => {
        const res = new Static();
        const unit = mover();
        res.trackTravel(unit, engineStub, FIXED_DT);
        // Walk in 10px steps.
        for (let i = 0; i < (STATIC_PX_PER_POINT * 2.5) / 10; i++) {
            unit.x += 10;
            res.trackTravel(unit, engineStub, FIXED_DT);
        }
        expect(res.current).toBe(2);
        expect(res.progressPx).toBeCloseTo(STATIC_PX_PER_POINT / 2);
        for (let i = 0; i < 1000; i++) {
            unit.x += 10;
            res.trackTravel(unit, engineStub, FIXED_DT);
        }
        expect(res.current).toBe(STATIC_MAX);
        expect(res.progressPx).toBe(0);
    });

    it('grounds out one Static per interval of standing still', () => {
        const res = new Static();
        res.add(3);
        const unit = mover();
        res.trackTravel(unit, engineStub, FIXED_DT);
        const ticks = Math.ceil((STATIC_GROUND_SECONDS * 2) / FIXED_DT) + 1;
        for (let i = 0; i < ticks; i++) res.trackTravel(unit, engineStub, FIXED_DT);
        // Two grounded out; half a round also passed, which recovers one.
        expect(STATIC_GROUND_SECONDS * 2).toBe(STATIC_RECOVERY_SECONDS);
        expect(res.current).toBe(3 - 2 + STATIC_RECOVERY_PER_INTERVAL);
    });

    it('recovers one Static every half round on its own', () => {
        const res = new Static();
        const unit = mover();
        res.trackTravel(unit, engineStub, FIXED_DT);
        let x = 0;
        // Shuffle a pixel back and forth: not still (no grounding), too little travel to build Static.
        const tick = (): void => {
            x = x === 0 ? 0.1 : 0;
            unit.x = x;
            res.trackTravel(unit, engineStub, FIXED_DT);
        };
        for (let i = 0; i < Math.round(STATIC_RECOVERY_SECONDS / FIXED_DT) - 2; i++) tick();
        expect(res.current).toBe(0);
        for (let i = 0; i < 3; i++) tick();
        expect(res.current).toBe(STATIC_RECOVERY_PER_INTERVAL);
        expect(res.perSecondGain).toBeCloseTo(STATIC_RECOVERY_PER_INTERVAL / STATIC_RECOVERY_SECONDS);
        res.recoverySeconds = 1.5;
        const restored = createResourceFromId('static') as Static;
        restored.restoreFromJSON(res.toJSON());
        expect(restored.recoverySeconds).toBe(1.5);
    });

    it('ignores teleports and snaps', () => {
        const res = new Static();
        const unit = mover();
        res.trackTravel(unit, engineStub, FIXED_DT);
        unit.x += 500;
        res.trackTravel(unit, engineStub, FIXED_DT);
        expect(res.current).toBe(0);
        expect(res.progressPx).toBe(0);
    });

    it('builds faster under a world modifier that multiplies Static gain (Rainy Storm)', () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID });
        engine.state.worldModifierManager.install([rainyStormModifier()]);
        expect(engine.state.worldModifierManager.getResourceGainMultiplier('static', 1)).toBe(RAINY_STORM_STATIC_GAIN_MULT);
        expect(engine.state.worldModifierManager.getResourceGainMultiplier('gravity', 1)).toBe(1);
        const res = new Static();
        const unit = mover();
        res.trackTravel(unit, engine, FIXED_DT);
        for (let i = 0; i < STATIC_PX_PER_POINT / 10; i++) {
            unit.x += 10;
            res.trackTravel(unit, engine, FIXED_DT);
        }
        expect(res.current).toBe(RAINY_STORM_STATIC_GAIN_MULT);
    });

    it('round-trips progress and the stillness timer', () => {
        const res = new Static();
        res.add(2);
        res.progressPx = 37;
        res.stillSeconds = 1.25;
        const restored = createResourceFromId('static');
        expect(restored).toBeInstanceOf(Static);
        restored!.restoreFromJSON(res.toJSON());
        expect(restored!.current).toBe(2);
        expect((restored as Static).progressPx).toBe(37);
        expect((restored as Static).stillSeconds).toBe(1.25);
    });
});

describe('Conductive mark', () => {
    it('stacks to the cap, refreshes, consumes and round-trips', () => {
        const { engine } = stormBattle();
        const dummy = placeTargetDummy(engine, { x: 500, y: 400 });
        for (let i = 0; i < CONDUCTIVE_MAX_STACKS + 2; i++) applyMark(dummy, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        expect(getMarkStacks(dummy, CONDUCTIVE_MARK_ID)).toBe(CONDUCTIVE_MAX_STACKS);
        expect(dummy.buffs.filter((b) => b instanceof MarkBuff)).toHaveLength(1);

        const restored = buffFromJSON(dummy.buffs.find((b) => b instanceof MarkBuff)!.toJSON());
        expect(restored).toBeInstanceOf(MarkBuff);
        expect((restored as MarkBuff).stacks).toBe(CONDUCTIVE_MAX_STACKS);

        expect(spendMarkStacks(dummy, CONDUCTIVE_MARK_ID, 1)).toBe(1);
        expect(getMarkStacks(dummy, CONDUCTIVE_MARK_ID)).toBe(CONDUCTIVE_MAX_STACKS - 1);
        expect(consumeMark(dummy, CONDUCTIVE_MARK_ID)).toBe(CONDUCTIVE_MAX_STACKS - 1);
        expect(getMarkStacks(dummy, CONDUCTIVE_MARK_ID)).toBe(0);
        expect(spendMarkStacks(dummy, CONDUCTIVE_MARK_ID, 1)).toBe(0);
    });
});

describe('Storm Core research and loadout', () => {
    it('is a two-tone core tree offered in Core Awakening', () => {
        expect(listTier10RootCoreCandidates().some((c) => c.treeId === STORM_TREE_ID)).toBe(true);
        expect(resolveResearchTreeChrome(stormTree)).toEqual({
            colour: '#3b5bdb',
            icon: RESEARCH_TREE_ICON_STORM,
            secondaryColour: '#a5f3fc',
            fontColour: '#0b1a3a',
        });
        for (const id of [ARC_BOLT_ABILITY_ID, STATIC_STEP_ABILITY_ID, CHAIN_LIGHTNING_ABILITY_ID, THUNDERCLAP_ABILITY_ID]) {
            expect(getAbility(id), id).toBeDefined();
            expect(getCardDef(id), id).toBeDefined();
            expect(getAbilityTheme(id).id).toBe('storm');
        }
    });

    it('grants Static, Arc Bolt and Chain Lightning from the core node', () => {
        const { player } = stormBattle();
        expect(staticOf(player).current).toBe(STATIC_MISSION_START);
        expect(player.abilities).toContain(ARC_BOLT_ABILITY_ID);
        expect(player.abilities).toContain(CHAIN_LIGHTNING_ABILITY_ID);
        expect(player.abilities).not.toContain(STATIC_STEP_ABILITY_ID);
    });

    it('adds Static Step and Thunderclap from their nodes', () => {
        const { player } = stormBattle([STORM_NODE_CORE, STORM_NODE_STATIC_STEP, STORM_NODE_THUNDERCLAP]);
        expect(player.abilities).toContain(STATIC_STEP_ABILITY_ID);
        expect(player.abilities).toContain(THUNDERCLAP_ABILITY_ID);
    });

    it('every Storm ability recovers all its uses each round', () => {
        for (const id of [ARC_BOLT_ABILITY_ID, STATIC_STEP_ABILITY_ID, CHAIN_LIGHTNING_ABILITY_ID, THUNDERCLAP_ABILITY_ID]) {
            expect(abilityRefillsUsesEachRound(getAbility(id)), id).toBe(true);
        }
        expect(getAbility(ARC_BOLT_ABILITY_ID)!.maxUses).toBe(ARC_BOLT_MAX_USES);
        expect(ARC_BOLT_MAX_USES).toBe(3);
        expect(getAbility(CHAIN_LIGHTNING_ABILITY_ID)!.maxUses).toBe(CHAIN_LIGHTNING_MAX_USES);
        expect(CHAIN_LIGHTNING_MAX_USES).toBe(2);
    });

    it('builds Static by walking in a real battle and survives a checkpoint', () => {
        const { engine, player } = stormBattle();
        const before = staticOf(player).current;
        player.setMovement([{ col: 20, row: 10 }], undefined, engine.gameTick);
        step(engine, 1.5);
        expect(player.x - PLAYER.x).toBeGreaterThan(STATIC_PX_PER_POINT);
        expect(staticOf(player).current).toBeGreaterThan(before);

        const restored = GameEngine.fromJSON(engine.toJSON(), TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        const restoredStatic = restored.units.find((u) => u.id === player.id)!.getResource('static') as Static;
        expect(restoredStatic.current).toBe(staticOf(player).current);
        expect(restoredStatic.progressPx).toBeCloseTo(staticOf(player).progressPx);
    });
});

describe('Arc Bolt (1301)', () => {
    it('throws an arc_bolt that damages the first enemy and leaves it Conductive', () => {
        const { engine, player } = stormBattle();
        const dummy = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y });
        const hp = dummy.hp;
        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: dummy.x, y: dummy.y } }], engine);
        let sawBolt = false;
        for (let i = 0; i < 60; i++) {
            step(engine, FIXED_DT);
            if (engine.projectiles.some((p) => p.projectileType === ARC_BOLT_PROJECTILE_TYPE)) sawBolt = true;
        }
        expect(sawBolt).toBe(true);
        expect(hp - dummy.hp).toBe(ARC_BOLT_DAMAGE);
        expect(getMarkStacks(dummy, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(ARC_BOLT_PROFILE.prefireTime).toBeLessThan(0.3);
        expect(ArcBoltAbility_1301.resourceCost).toBeNull();
    });

    it('arcs down the Conductive ladder without spending stacks, and marks the last enemy reached', () => {
        const { engine, player } = stormBattle();
        const top = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y }, 'top');
        // Nearer than `rung1`, but a leap goes only one rung down: 2 -> 1, never 2 -> 2 or 2 -> 0.
        const sameRung = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y + 60 }, 'same');
        const plainNearTop = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y - 60 }, 'plainNearTop');
        const rung1 = placeTargetDummy(engine, { x: PLAYER.x + 210, y: PLAYER.y }, 'rung1');
        const foot = placeTargetDummy(engine, { x: PLAYER.x + 320, y: PLAYER.y }, 'foot');
        applyMark(top, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        applyMark(sameRung, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        applyMark(rung1, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        const all = [top, sameRung, plainNearTop, rung1, foot];
        const hp = new Map(all.map((u) => [u.id, u.hp]));

        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: top.x, y: top.y } }], engine);
        for (let i = 0; i < 60; i++) step(engine, FIXED_DT);

        const dealt = (u: Unit): number => hp.get(u.id)! - u.hp;
        expect(dealt(top)).toBe(ARC_BOLT_DAMAGE);
        expect(dealt(rung1)).toBe(ARC_BOLT_BOUNCE_DAMAGE);
        expect(dealt(foot)).toBe(ARC_BOLT_BOUNCE_DAMAGE);
        expect(dealt(sameRung)).toBe(0);
        expect(dealt(plainNearTop)).toBe(0);
        // Nothing spent; the foot of the ladder gains a rung.
        expect(getMarkStacks(top, CONDUCTIVE_MARK_ID)).toBe(2);
        expect(getMarkStacks(rung1, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(getMarkStacks(foot, CONDUCTIVE_MARK_ID)).toBe(1);
    });

    it('a Conductive 1 target leaps once, to an unmarked enemy, never to a marked one', () => {
        const { engine, player } = stormBattle();
        const first = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y }, 'first');
        const marked = placeTargetDummy(engine, { x: PLAYER.x + 160, y: PLAYER.y }, 'marked');
        const plain = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y + 90 }, 'plain');
        const beyond = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y + 180 }, 'beyond');
        applyMark(first, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        applyMark(marked, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        const hp = new Map([first, marked, plain, beyond].map((u) => [u.id, u.hp]));

        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: first.x, y: first.y } }], engine);
        for (let i = 0; i < 60; i++) step(engine, FIXED_DT);

        const dealt = (u: Unit): number => hp.get(u.id)! - u.hp;
        expect(dealt(first)).toBe(ARC_BOLT_DAMAGE);
        expect(dealt(plain)).toBe(ARC_BOLT_BOUNCE_DAMAGE);
        expect(dealt(marked)).toBe(0);
        expect(dealt(beyond)).toBe(0);
        expect(getMarkStacks(first, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(getMarkStacks(plain, CONDUCTIVE_MARK_ID)).toBe(1);
    });
});

describe('Static Step (1302)', () => {
    it('darts, zaps enemies passed through, marks them, and builds Static from the distance', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_STATIC_STEP]);
        const dummy = placeTargetDummy(engine, { x: PLAYER.x + 70, y: PLAYER.y });
        const hp = dummy.hp;
        const staticBefore = staticOf(player).current;
        expect(StaticStepAbility_1302.resourceCost).toEqual({ resourceId: 'static', amount: STATIC_STEP_STATIC_COST });
        executeUnitAbility(player, StaticStepAbility_1302, [{ type: 'pixel', position: { x: PLAYER.x + 400, y: PLAYER.y } }], engine);
        step(engine, 0.5);
        expect(player.x - PLAYER.x).toBeCloseTo(STATIC_STEP_DISTANCE, -1);
        expect(hp - dummy.hp).toBe(STATIC_STEP_DAMAGE);
        expect(getMarkStacks(dummy, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(staticOf(player).current)
            .toBe(staticBefore - STATIC_STEP_STATIC_COST + Math.floor(STATIC_STEP_DISTANCE / STATIC_PX_PER_POINT));
        expect(engine.state.effectManager.effects.some((e) => e.effectType === LIGHTNING_BOLT_EFFECT_TYPE)).toBe(true);
    });
});

describe('Chain Lightning (1303)', () => {
    function lineOfDummies(engine: GameEngine, count: number, gap = 90): Unit[] {
        return Array.from({ length: count }, (_, i) =>
            placeTargetDummy(engine, { x: PLAYER.x + 120 + i * gap, y: PLAYER.y }, `dummy_${i}`));
    }

    it('costs Static, leaps to more enemies and spends Conductive for bonus damage', () => {
        const { engine, player } = stormBattle();
        const dummies = lineOfDummies(engine, CHAIN_LIGHTNING_JUMPS + 2);
        applyMark(dummies[1]!, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        const hp = dummies.map((d) => d.hp);
        const staticBefore = staticOf(player).current;
        executeUnitAbility(player, ChainLightningAbility_1303, [unitTarget(dummies[0]!)], engine);
        step(engine, ChainLightningAbility_1303.prefireTime! + 0.1);

        expect(staticOf(player).current).toBe(staticBefore - CHAIN_LIGHTNING_STATIC_COST);
        const dealt = dummies.map((d, i) => hp[i]! - d.hp);
        expect(dealt[0]).toBe(CHAIN_LIGHTNING_DAMAGE);
        expect(dealt[1]).toBe(CHAIN_LIGHTNING_DAMAGE + 2 * CHAIN_LIGHTNING_DAMAGE_PER_CONDUCTIVE);
        expect(getMarkStacks(dummies[1]!, CONDUCTIVE_MARK_ID)).toBe(0);
        // First strike + JUMPS leaps; the last dummy is out of jumps.
        expect(dealt.filter((d) => d > 0)).toHaveLength(1 + CHAIN_LIGHTNING_JUMPS);
        expect(dealt[CHAIN_LIGHTNING_JUMPS + 1]).toBe(0);
        expect(engine.state.effectManager.effects.filter((e) => e.effectType === LIGHTNING_BOLT_EFFECT_TYPE).length)
            .toBeGreaterThanOrEqual(1 + CHAIN_LIGHTNING_JUMPS);
    });

    it('Forked Lightning adds jumps', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_FORKED_LIGHTNING]);
        const dummies = lineOfDummies(engine, CHAIN_LIGHTNING_JUMPS + FORKED_LIGHTNING_EXTRA_JUMPS + 2, 80);
        const hp = dummies.map((d) => d.hp);
        executeUnitAbility(player, ChainLightningAbility_1303, [unitTarget(dummies[0]!)], engine);
        step(engine, ChainLightningAbility_1303.prefireTime! + 0.1);
        const hit = dummies.filter((d, i) => d.hp < hp[i]!).length;
        expect(hit).toBe(1 + CHAIN_LIGHTNING_JUMPS + FORKED_LIGHTNING_EXTRA_JUMPS);
    });

    it('relays through a dropped weapon to reach an enemy out of leap range', () => {
        const { engine, player } = stormBattle();
        const near = placeTargetDummy(engine, { x: PLAYER.x + 120, y: PLAYER.y }, 'near');
        const far = placeTargetDummy(engine, { x: PLAYER.x + 340, y: PLAYER.y }, 'far');
        const farHp = far.hp;

        executeUnitAbility(player, ChainLightningAbility_1303, [unitTarget(near)], engine);
        step(engine, ChainLightningAbility_1303.prefireTime! + 0.1);
        expect(far.hp).toBe(farHp);

        // An Armory token halfway between carries the bolt across the gap.
        engine.state.fieldObjects.droppedWeapons.push({
            id: 'sword_token',
            x: PLAYER.x + 230,
            y: PLAYER.y,
            kind: 'sword',
            ownerUnitId: player.id,
            teamId: player.teamId,
            abilityId: '1002',
            spawnedAtGameTime: 0,
            facing: 0,
        });
        staticOf(player).add(CHAIN_LIGHTNING_STATIC_COST);
        player.abilityRuntime[CHAIN_LIGHTNING_ABILITY_ID]!.currentUses = 1;
        step(engine, 1.5);
        executeUnitAbility(player, ChainLightningAbility_1303, [unitTarget(near)], engine);
        step(engine, ChainLightningAbility_1303.prefireTime! + 0.1);
        expect(far.hp).toBe(farHp - CHAIN_LIGHTNING_DAMAGE);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        expect(engine.state.effectManager.effects.some((e) => e.effectType === STORM_SPARK_EFFECT_TYPE)).toBe(true);
    });
});

describe('Thunderclap (1304)', () => {
    it('spends one Conductive per enemy for heavier hits and Static back, knocks back and lights the dark', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_THUNDERCLAP]);
        staticOf(player).current = 4;
        const plain = placeTargetDummy(engine, { x: PLAYER.x + THUNDERCLAP_RADIUS - 10, y: PLAYER.y }, 'plain');
        const marked = placeTargetDummy(engine, { x: PLAYER.x - THUNDERCLAP_RADIUS + 10, y: PLAYER.y }, 'marked');
        const outside = placeTargetDummy(engine, { x: PLAYER.x + THUNDERCLAP_RADIUS + 80, y: PLAYER.y }, 'outside');
        applyMark(marked, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        applyMark(outside, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        const hp = new Map([plain, marked, outside].map((u) => [u.id, u.hp]));
        const startX = plain.x;
        const lightsBefore = engine.lightSources.length;

        executeUnitAbility(player, ThunderclapAbility_1304, [], engine);
        step(engine, ThunderclapAbility_1304.prefireTime! + 0.3);

        expect(hp.get(plain.id)! - plain.hp).toBe(THUNDERCLAP_DAMAGE);
        expect(hp.get(marked.id)! - marked.hp).toBe(THUNDERCLAP_CHARGED_DAMAGE);
        expect(outside.hp).toBe(hp.get(outside.id));
        expect(getMarkStacks(marked, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(getMarkStacks(plain, CONDUCTIVE_MARK_ID)).toBe(0);
        expect(getMarkStacks(outside, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(staticOf(player).current).toBe(4 - THUNDERCLAP_STATIC_COST + THUNDERCLAP_STATIC_PER_CHARGE);
        expect(plain.x).toBeGreaterThan(startX);
        expect(engine.lightSources.length).toBe(lightsBefore + 1);
        expect([0, 1, 2, 3, 4, 8].map(getThunderclapBrightness)).toEqual([1, 1, 2, 2, 3, 3]);
    });

    it('shows a single Bright X reminder', () => {
        const lines = ThunderclapAbility_1304.getTooltipText!().join(' ');
        expect(lines).toContain('{Bright X}');
        expect(lines).not.toMatch(/Bright [0-9]/);
        expect(keywordGlossaryEntries(['Bright X'])).toEqual([
            expect.objectContaining({ title: 'Bright X', description: expect.stringContaining('weak | medium | strong') }),
        ]);
    });

    it('cannot be cast below its minimum Static', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_THUNDERCLAP]);
        staticOf(player).current = 1;
        executeUnitAbility(player, ThunderclapAbility_1304, [], engine);
        expect(player.activeAbilities).toHaveLength(0);
        expect(staticOf(player).current).toBe(1);
    });
});

describe('resolveChainHops', () => {
    it('prefers higher priority, then nearest, and never revisits', () => {
        const { engine, player } = stormBattle();
        const a = placeTargetDummy(engine, { x: 500, y: 400 }, 'a');
        const nearPlain = placeTargetDummy(engine, { x: 560, y: 400 }, 'b');
        const farMarked = placeTargetDummy(engine, { x: 500, y: 500 }, 'c');
        const hops = resolveChainHops({
            engine,
            caster: player,
            first: a,
            maxJumps: 2,
            jumpRange: 120,
            priority: (u) => (u.id === farMarked.id ? 1 : 0),
        });
        expect(hops.map((h) => (h.kind === 'unit' ? h.unit.id : h.relay.id))).toEqual([a.id, farMarked.id, nearPlain.id]);
    });
});
