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
import { Movement } from '../../resources/Movement';
import { getAbilityResourceCosts } from '../../abilities/Ability';
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
    CHAIN_LIGHTNING_CONDUCTIVE_BONUS_DAMAGE,
    CHAIN_LIGHTNING_DAMAGE,
    CHAIN_LIGHTNING_JUMPS,
    CHAIN_LIGHTNING_MAX_USES,
    CHAIN_LIGHTNING_STATIC_COST,
    CONDUCTIVE_MARK_ID,
    CONDUCTIVE_MAX_STACKS,
    FORKED_LIGHTNING_EXTRA_JUMPS,
    STATIC_MAX,
    STATIC_MISSION_START,
    STATIC_STEP_ABILITY_ID,
    STATIC_STEP_DAMAGE,
    STATIC_STEP_DISTANCE,
    STATIC_STEP_DURATION,
    STATIC_STEP_HIT_RADIUS_SCALE,
    STATIC_STEP_MOVEMENT_COST,
    STATIC_STEP_STATIC_COST,
    THUNDERCLAP_ABILITY_ID,
    THUNDERCLAP_CONDUCTIVE_BONUS_DAMAGE,
    THUNDERCLAP_DAMAGE,
    THUNDERCLAP_RADIUS,
    THUNDERCLAP_STATIC_COST,
    THUNDERCLAP_STATIC_PER_CHARGE,
} from './stormConstants';
import { ArcBoltAbility_1301, ARC_BOLT_BOUNCE_DAMAGE, ARC_BOLT_PROFILE } from './1301_ArcBolt/1301Ability';
import { StaticStepAbility_1302 } from './1302_StaticStep/1302Ability';
import { ChainLightningAbility_1303 } from './1303_ChainLightning/1303Ability';
import { ThunderclapAbility_1304 } from './1304_Thunderclap/1304Ability';

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
    // Every mission player carries Movement Points (BaseMissionDef); the harness does not attach them.
    player.attachResource(new Movement(), engine.eventBus);
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

    function fidget(res: Static, unit: ReturnType<typeof mover>, ticks: number, engine: { roundNumber: number } = engineStub): void {
        for (let i = 0; i < ticks; i++) res.track(unit, engine, FIXED_DT);
    }

    it('does not build Static from travel', () => {
        const res = new Static();
        const unit = mover();
        res.track(unit, engineStub, FIXED_DT);
        // 2,000 px of walking in a second and a half: under one recovery interval.
        for (let i = 0; i < 90; i++) {
            unit.x += 22;
            res.track(unit, engineStub, FIXED_DT);
        }
        expect(res.current).toBe(0);
    });

    it('recovers one Static every half round on its own, capped at max', () => {
        const res = new Static();
        const unit = mover();
        res.track(unit, engineStub, FIXED_DT);
        fidget(res, unit, Math.round(STATIC_RECOVERY_SECONDS / FIXED_DT) - 2);
        expect(res.current).toBe(0);
        fidget(res, unit, 3);
        expect(res.current).toBe(STATIC_RECOVERY_PER_INTERVAL);
        expect(res.perSecondGain).toBeCloseTo(STATIC_RECOVERY_PER_INTERVAL / STATIC_RECOVERY_SECONDS);
        fidget(res, unit, Math.round((STATIC_RECOVERY_SECONDS * (STATIC_MAX + 2)) / FIXED_DT));
        expect(res.current).toBe(STATIC_MAX);
    });

    it('does not drain while standing still', () => {
        const res = new Static();
        res.add(3);
        const unit = mover();
        fidget(res, unit, Math.round((STATIC_RECOVERY_SECONDS - 0.5) / FIXED_DT));
        expect(res.current).toBe(3);
    });

    it('recovers faster under a world modifier that multiplies Static gain (Rainy Storm)', () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID });
        engine.state.worldModifierManager.install([rainyStormModifier()]);
        expect(engine.state.worldModifierManager.getResourceGainMultiplier('static', 1)).toBe(RAINY_STORM_STATIC_GAIN_MULT);
        expect(engine.state.worldModifierManager.getResourceGainMultiplier('gravity', 1)).toBe(1);
        const res = new Static();
        const unit = mover();
        res.track(unit, engine, FIXED_DT);
        fidget(res, unit, Math.round(STATIC_RECOVERY_SECONDS / FIXED_DT) + 2, engine);
        expect(res.current).toBe(RAINY_STORM_STATIC_GAIN_MULT);
    });

    it('round-trips the recovery timer', () => {
        const res = new Static();
        res.add(2);
        res.recoverySeconds = 1.5;
        const restored = createResourceFromId('static');
        expect(restored).toBeInstanceOf(Static);
        restored!.restoreFromJSON(res.toJSON());
        expect(restored!.current).toBe(2);
        expect((restored as Static).recoverySeconds).toBe(1.5);
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

    it('keeps Static (and its timers) across a checkpoint in a real battle', () => {
        const { engine, player } = stormBattle();
        const before = staticOf(player).current;
        player.setMovement([{ col: 20, row: 10 }], undefined, engine.gameTick);
        step(engine, 1.5);
        expect(player.x - PLAYER.x).toBeGreaterThan(100);
        expect(staticOf(player).current).toBe(before);

        const restored = GameEngine.fromJSON(engine.toJSON(), TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        const restoredStatic = restored.units.find((u) => u.id === player.id)!.getResource('static') as Static;
        expect(restoredStatic.current).toBe(staticOf(player).current);
        expect(restoredStatic.recoverySeconds).toBeCloseTo(staticOf(player).recoverySeconds);
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

    it('jumps once to the least Conductive enemy in reach, nearest on ties, and marks it', () => {
        const { engine, player } = stormBattle();
        const top = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y }, 'top');
        const sameRung = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y + 50 }, 'same');
        const rung1 = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y + 60 }, 'rung1');
        // Farthest of the three, but unmarked: the least Conductive wins over distance.
        const plain = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y - 100 }, 'plain');
        const beyond = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y - 190 }, 'beyond');
        applyMark(top, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        applyMark(sameRung, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        applyMark(rung1, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        const all = [top, sameRung, rung1, plain, beyond];
        const hp = new Map(all.map((u) => [u.id, u.hp]));

        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: top.x, y: top.y } }], engine);
        for (let i = 0; i < 60; i++) step(engine, FIXED_DT);

        const dealt = (u: Unit): number => hp.get(u.id)! - u.hp;
        expect(dealt(top)).toBe(ARC_BOLT_DAMAGE);
        expect(dealt(plain)).toBe(ARC_BOLT_BOUNCE_DAMAGE);
        expect(dealt(sameRung) + dealt(rung1) + dealt(beyond)).toBe(0);
        expect(getMarkStacks(top, CONDUCTIVE_MARK_ID)).toBe(2);
        expect(getMarkStacks(plain, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(ArcBoltAbility_1301.getTooltipText!().join(' ')).toContain('preferring less conductive ones');
    });

    it('still jumps when only equally or more Conductive enemies are near, without adding to their stacks', () => {
        const { engine, player } = stormBattle();
        const first = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y }, 'first');
        const more = placeTargetDummy(engine, { x: PLAYER.x + 200, y: PLAYER.y }, 'more');
        applyMark(first, CONDUCTIVE_MARK_ID, 1, engine.gameTime, 1);
        applyMark(more, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        const hp = new Map([first, more].map((u) => [u.id, u.hp]));

        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: first.x, y: first.y } }], engine);
        for (let i = 0; i < 60; i++) step(engine, FIXED_DT);

        expect(hp.get(more.id)! - more.hp).toBe(ARC_BOLT_BOUNCE_DAMAGE);
        expect(getMarkStacks(more, CONDUCTIVE_MARK_ID)).toBe(2);
        expect(getMarkStacks(first, CONDUCTIVE_MARK_ID)).toBe(1);
    });

    it('does not jump from an unmarked enemy; it marks it instead', () => {
        const { engine, player } = stormBattle();
        const first = placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y }, 'first');
        const near = placeTargetDummy(engine, { x: PLAYER.x + 160, y: PLAYER.y }, 'near');
        const hp = near.hp;

        executeUnitAbility(player, ArcBoltAbility_1301, [{ type: 'pixel', position: { x: first.x, y: first.y } }], engine);
        for (let i = 0; i < 60; i++) step(engine, FIXED_DT);

        expect(near.hp).toBe(hp);
        expect(getMarkStacks(first, CONDUCTIVE_MARK_ID)).toBe(1);
    });
});

describe('Static Step (1302)', () => {
    it('darts, zaps enemies passed through, marks them, and spends a Static and a Movement Point', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_STATIC_STEP]);
        const dummy = placeTargetDummy(engine, { x: PLAYER.x + 70, y: PLAYER.y });
        const hp = dummy.hp;
        const staticBefore = staticOf(player).current;
        expect(getAbilityResourceCosts(StaticStepAbility_1302)).toEqual([
            { resourceId: 'static', amount: STATIC_STEP_STATIC_COST },
            { resourceId: 'movement_points', amount: STATIC_STEP_MOVEMENT_COST },
        ]);
        const movementBefore = player.getResource('movement_points')!.current;
        executeUnitAbility(player, StaticStepAbility_1302, [{ type: 'pixel', position: { x: PLAYER.x + 400, y: PLAYER.y } }], engine);
        // Both costs are paid on cast. (Checked before ticking: the harness's first tick starts round 1, which refills Movement Points.)
        expect(staticOf(player).current).toBe(staticBefore - STATIC_STEP_STATIC_COST);
        expect(player.getResource('movement_points')!.current).toBe(movementBefore - STATIC_STEP_MOVEMENT_COST);
        step(engine, 0.5);
        expect(player.x - PLAYER.x).toBeCloseTo(STATIC_STEP_DISTANCE, -1);
        expect(hp - dummy.hp).toBe(STATIC_STEP_DAMAGE);
        expect(getMarkStacks(dummy, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(engine.state.effectManager.effects.some((e) => e.effectType === LIGHTNING_BOLT_EFFECT_TYPE)).toBe(true);
    });
});

describe('Static Step Dodge', () => {
    it('has iFrames for the step (the Dodge keyword) and none after', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_STATIC_STEP]);
        executeUnitAbility(player, StaticStepAbility_1302, [{ type: 'pixel', position: { x: PLAYER.x + 400, y: PLAYER.y } }], engine);
        step(engine, FIXED_DT * 3);
        expect(player.hasIFrames(engine.gameTime)).toBe(true);
        step(engine, 0.6);
        expect(player.hasIFrames(engine.gameTime)).toBe(false);
        const text = StaticStepAbility_1302.getTooltipText!().join(' ');
        expect(text).toContain('{Dodge} towards a point');
        expect(keywordGlossaryEntries(['Dodge']).map((e) => e.title)).toEqual(['Dodge']);
        expect(keywordGlossaryEntries(['Dodging']).map((e) => e.title)).toEqual(['Dodge']);
    });
});

describe('Static Step ends with its dash', () => {
    it('has no recovery phase: the cast finishes on the frame the dash does', () => {
        const intervals = StaticStepAbility_1302.abilityTimings as { end: number }[];
        expect(Math.max(...intervals.map((i) => i.end))).toBe(STATIC_STEP_DURATION);
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_STATIC_STEP]);
        executeUnitAbility(player, StaticStepAbility_1302, [{ type: 'pixel', position: { x: PLAYER.x + 400, y: PLAYER.y } }], engine);
        step(engine, STATIC_STEP_DURATION + FIXED_DT * 2);
        expect(player.activeAbilities).toHaveLength(0);
        expect(engine.state.effectManager.effects.filter((e) => e.effectType === STORM_SPARK_EFFECT_TYPE).length).toBeGreaterThanOrEqual(2);
    });
});

describe('Static Step touch area', () => {
    it('reaches 1.5x the body radius and fills it with arcs that ride the caster', () => {
        expect(STATIC_STEP_HIT_RADIUS_SCALE).toBe(1.5);
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_STATIC_STEP]);
        const dummy = placeTargetDummy(engine, { x: PLAYER.x + 80, y: PLAYER.y });
        // Out of reach of a body-sized touch, inside the scaled one.
        dummy.y = PLAYER.y + player.radius * (1 + STATIC_STEP_HIT_RADIUS_SCALE) / 2 + dummy.radius;
        const hp = dummy.hp;
        executeUnitAbility(player, StaticStepAbility_1302, [{ type: 'pixel', position: { x: PLAYER.x + 400, y: PLAYER.y } }], engine);
        step(engine, FIXED_DT * 2);
        const fieldArcs = engine.state.effectManager.effects.filter((e) => {
            const d = e.effectData as { fromUnitId?: string; toUnitId?: string; fromOffset?: unknown } | undefined;
            return e.effectType === LIGHTNING_BOLT_EFFECT_TYPE && d?.fromUnitId === player.id && d.toUnitId === player.id && d.fromOffset;
        });
        expect(fieldArcs.length).toBeGreaterThan(0);
        step(engine, 0.5);
        expect(hp - dummy.hp).toBe(STATIC_STEP_DAMAGE);
    });
});

describe('Chain Lightning (1303)', () => {
    function lineOfDummies(engine: GameEngine, count: number, gap = 90): Unit[] {
        return Array.from({ length: count }, (_, i) =>
            placeTargetDummy(engine, { x: PLAYER.x + 120 + i * gap, y: PLAYER.y }, `dummy_${i}`));
    }

    it('costs Static, leaps to more enemies and spends Conductive for a flat bonus', () => {
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
        // Flat bonus, not per stack.
        expect(dealt[1]).toBe(CHAIN_LIGHTNING_DAMAGE + CHAIN_LIGHTNING_CONDUCTIVE_BONUS_DAMAGE);
        expect([CHAIN_LIGHTNING_DAMAGE, CHAIN_LIGHTNING_CONDUCTIVE_BONUS_DAMAGE, CHAIN_LIGHTNING_JUMPS]).toEqual([6, 2, 4]);
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
    it('costs 1 Static, hits Conductive enemies harder for Static back, marks the rest, knocks back and lights the dark', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_THUNDERCLAP]);
        staticOf(player).current = 4;
        const plain = placeTargetDummy(engine, { x: PLAYER.x + THUNDERCLAP_RADIUS - 10, y: PLAYER.y }, 'plain');
        const marked = placeTargetDummy(engine, { x: PLAYER.x - THUNDERCLAP_RADIUS + 10, y: PLAYER.y }, 'marked');
        const outside = placeTargetDummy(engine, { x: PLAYER.x + THUNDERCLAP_RADIUS + 80, y: PLAYER.y }, 'outside');
        applyMark(marked, CONDUCTIVE_MARK_ID, 2, engine.gameTime, 1);
        const hp = new Map([plain, marked, outside].map((u) => [u.id, u.hp]));
        const startX = plain.x;
        const lightsBefore = engine.lightSources.length;

        executeUnitAbility(player, ThunderclapAbility_1304, [], engine);
        step(engine, ThunderclapAbility_1304.prefireTime! + 0.3);

        expect(THUNDERCLAP_STATIC_COST).toBe(1);
        expect(hp.get(plain.id)! - plain.hp).toBe(THUNDERCLAP_DAMAGE);
        expect(hp.get(marked.id)! - marked.hp).toBe(THUNDERCLAP_DAMAGE + THUNDERCLAP_CONDUCTIVE_BONUS_DAMAGE);
        expect(outside.hp).toBe(hp.get(outside.id));
        expect(getMarkStacks(marked, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(getMarkStacks(plain, CONDUCTIVE_MARK_ID)).toBe(1);
        expect(getMarkStacks(outside, CONDUCTIVE_MARK_ID)).toBe(0);
        expect(staticOf(player).current).toBe(4 - THUNDERCLAP_STATIC_COST + THUNDERCLAP_STATIC_PER_CHARGE);
        expect(plain.x).toBeGreaterThan(startX);
        expect(engine.lightSources.length).toBe(lightsBefore + 1);
    });

    it('shows a fixed Bright 1 in a short tooltip', () => {
        const lines = ThunderclapAbility_1304.getTooltipText!();
        expect(lines.join(' ')).toContain('{Bright 1}');
        expect(lines.join(' ')).not.toContain('Bright X');
        expect(lines.length).toBeLessThanOrEqual(4);
    });

    it('cannot be cast below its minimum Static', () => {
        const { engine, player } = stormBattle([STORM_NODE_CORE, STORM_NODE_THUNDERCLAP]);
        staticOf(player).current = 0;
        executeUnitAbility(player, ThunderclapAbility_1304, [], engine);
        expect(player.activeAbilities).toHaveLength(0);
        expect(staticOf(player).current).toBe(0);
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
