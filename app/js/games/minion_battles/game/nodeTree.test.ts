/**
 * Node trees: parent/child links, `onLastChildDied` only for the last child, `hasLivingChildren` as a flat-reduction
 * condition, linking by spawn, and a serialization round-trip.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnemyHealthMultiplier } from '../constants/enemyConstants';
import { getUnitDefEntry } from './units/unit_defs/unitDef';
import { dismissGardenTree } from './gardenHeart/growGardenTree';
import { STEM_WITHER_EFFECT_TYPE } from './tethers/tether';
import { buildTinyBattleEngine, placeTargetDummy, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import type { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { serializeUnit } from './units/unitToJSON';
import { applySerializedUnitState } from './units/unitFromJSON';
import { createUnitFromSpawnConfig } from './units/index';
import { componentSpec, attachComponent } from './units/components/unitComponent';
import {
    NODE_REGROWTH_COMPONENT_ID,
    NODE_TREE_COMPONENT,
    NODE_TREE_HAS_LIVING_CHILDREN,
    type NodeTreeOptions,
    getNodeChildIds,
    getNodeParentId,
    hasLivingChildren,
    linkNodeChild,
    unlinkNodeChild,
} from './units/components/nodeTree';
import { registerNodeTreeCallback } from './units/components/nodeTreeHooks';
import { spawnNodeChild } from './units/components/nodeTreeSpawn';
import { applyUnitFlatReductions } from './units/flatDamageReduction';

const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

let engine: GameEngine;
const offs: Array<() => void> = [];

afterEach(() => {
    for (const off of offs.splice(0)) off();
    engine?.destroy();
});

function makeEngine(): GameEngine {
    engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
    return engine;
}

function node(id: string, col: number, row: number, options?: NodeTreeOptions): Unit {
    const unit = placeTargetDummy(engine, { x: cell(col), y: cell(row) }, id);
    if (options) attachComponent(unit, componentSpec(NODE_TREE_COMPONENT, options));
    return unit;
}

function kill(unit: Unit): void {
    unit.takeDamage(unit.maxHp * 10, null, engine.eventBus);
}

describe('node tree', () => {
    it('links children to a parent and reports living children', () => {
        makeEngine();
        const parent = node('parent', 5, 5);
        const a = node('a', 7, 5);
        const b = node('b', 7, 7);
        expect(hasLivingChildren(parent)).toBe(false);
        linkNodeChild(parent, a);
        linkNodeChild(parent, b, { tetherMaxLength: 200 });
        expect(getNodeParentId(a)).toBe('parent');
        expect(getNodeChildIds(parent)).toEqual(['a', 'b']);
        expect(hasLivingChildren(parent)).toBe(true);
        unlinkNodeChild(parent, a);
        expect(getNodeChildIds(parent)).toEqual(['b']);
        expect(getNodeParentId(a)).toBeNull();
    });

    it('fires onLastChildDied on the parent only when the last child dies', () => {
        makeEngine();
        const fired: string[] = [];
        offs.push(
            registerNodeTreeCallback('test_last', (unit, _ctx, event, child) => {
                fired.push(`${event}:${unit.id}:${child?.id}`);
            }),
        );
        const parent = node('parent', 5, 5, { onLastChildDied: 'test_last' });
        const a = node('a', 7, 5);
        const b = node('b', 7, 7);
        linkNodeChild(parent, a);
        linkNodeChild(parent, b);

        kill(a);
        expect(fired).toEqual([]);
        expect(hasLivingChildren(parent)).toBe(true);
        kill(b);
        expect(fired).toEqual(['onLastChildDied:parent:b']);
        expect(hasLivingChildren(parent)).toBe(false);
    });

    it('fires a unit\'s own onDeath callback once', () => {
        makeEngine();
        const fired: string[] = [];
        offs.push(registerNodeTreeCallback('test_death', (unit, _ctx, event) => fired.push(`${event}:${unit.id}`)));
        const parent = node('parent', 5, 5);
        const child = node('child', 7, 5, { onDeath: 'test_death' });
        linkNodeChild(parent, child);
        kill(child);
        expect(fired).toEqual(['onDeath:child']);
    });

    it('a parent dying does not kill its children or fire onLastChildDied', () => {
        makeEngine();
        const fired: string[] = [];
        offs.push(registerNodeTreeCallback('test_last2', () => fired.push('last')));
        const parent = node('parent', 5, 5, { onLastChildDied: 'test_last2' });
        const child = node('child', 7, 5);
        linkNodeChild(parent, child);
        kill(parent);
        expect(child.isAlive()).toBe(true);
        expect(fired).toEqual([]);
    });

    it('hasLivingChildren drives a flat reduction: armoured while a child lives, plain after', () => {
        makeEngine();
        const parent = node('parent', 5, 5);
        parent.flatDamageReductions = [{ amount: 10, floor: 10, condition: NODE_TREE_HAS_LIVING_CHILDREN }];
        const child = node('child', 7, 5);
        linkNodeChild(parent, child);
        expect(applyUnitFlatReductions(parent, 25).damage).toBe(15);
        kill(child);
        expect(applyUnitFlatReductions(parent, 25).damage).toBe(25);
    });

    it('spawnNodeChild spawns a unit already linked, with a leash', () => {
        makeEngine();
        const parent = node('parent', 5, 5);
        const child = spawnNodeChild(
            engine,
            parent,
            {
                characterId: 'swarmling',
                unitId: 'bud',
                abilities: [],
                teamId: 'enemy',
                placement: { kind: 'fixedWorld', x: cell(8), y: cell(5) },
            },
            { tetherMaxLength: 150 },
        );
        expect(child?.id).toBe('bud');
        expect(getNodeParentId(child!)).toBe('parent');
        expect(getNodeChildIds(parent)).toEqual(['bud']);
    });

    describe('Severance and withering Stems', () => {
        /** A stub standing in for the regrowth component (Step 4): `rootHasRegrowth` only checks the id. */
        const REGROWTH_STUB = {
            type: { id: NODE_REGROWTH_COMPONENT_ID, create: () => ({}), toJSON: () => ({}), fromJSON: () => {} },
        };

        function treeRoot(options: NodeTreeOptions): Unit {
            const root = node('root', 5, 5, options);
            root.hp = root.maxHp = 100;
            return root;
        }

        function tetheredChild(root: Unit, id: string, col: number, row: number): Unit {
            const child = node(id, col, row);
            linkNodeChild(root, child, { tetherMaxLength: 400 });
            return child;
        }

        it('killing a node damages the root by the severance amount, credited to the killer', () => {
            makeEngine();
            const root = treeRoot({ severance: { damage: 10 } });
            const bud = tetheredChild(root, 'bud', 7, 5);
            const sources: Array<string | null> = [];
            engine.eventBus.on('damage_taken', (e) => {
                if (e.unitId === 'root') sources.push(e.sourceUnitId);
            });
            bud.takeDamage(bud.maxHp * 10, 'player', engine.eventBus);
            expect(root.hp).toBe(90);
            expect(sources).toEqual(['player']);
        });

        it('severance ignores the root\'s Shell (flat reduction) and damage-taken multipliers', () => {
            makeEngine();
            const root = treeRoot({ severance: { damage: 10 } });
            root.flatDamageReductions = [{ amount: 8, floor: 1, condition: NODE_TREE_HAS_LIVING_CHILDREN }];
            root.damageTakenMultipliers = [{ multiplier: 2 }];
            const a = tetheredChild(root, 'a', 7, 5);
            tetheredChild(root, 'b', 7, 7);
            kill(a);
            expect(root.hp).toBe(90);
        });

        it('scaleWithEnemyHealth multiplies by the enemy health multiplier', () => {
            makeEngine();
            const root = treeRoot({ severance: { damage: 10, scaleWithEnemyHealth: true } });
            const bud = tetheredChild(root, 'bud', 7, 5);
            kill(bud);
            const expected = Math.round(10 * getEnemyHealthMultiplier(engine.enemyScalingPlayerCount));
            expect(root.hp).toBe(100 - expected);
        });

        it('severance does not skip a phase: the hit is clamped at the threshold', () => {
            makeEngine();
            const def = getUnitDefEntry('target_dummy')!;
            const bud = node('bud', 7, 5); // before the phase is installed, so only the root is clamped
            def.phases = [{ id: 'p2', enterWhen: { kind: 'health_below_percent', threshold: 0.95 }, clampHitAtThreshold: true }];
            try {
                const root = treeRoot({ severance: { damage: 40 } });
                linkNodeChild(root, bud, { tetherMaxLength: 400 });
                kill(bud);
                expect(bud.isAlive()).toBe(false);
                expect(root.hp).toBeCloseTo(95, 3);
            } finally {
                def.phases = undefined;
            }
        });

        it('dismissing a tree deals no Severance and lays Briar', () => {
            makeEngine();
            const root = treeRoot({ severance: { damage: 10 }, stemDeath: 'witherWhileRegrowing' });
            attachComponent(root, REGROWTH_STUB);
            tetheredChild(root, 'a', 7, 5);
            tetheredChild(root, 'b', 7, 7);
            const briar = vi.spyOn(engine.terrainManager!, 'placeBriar');
            expect(dismissGardenTree(engine, root)).toBe(2);
            expect(root.hp).toBe(100);
            expect(briar).toHaveBeenCalledTimes(2);
        });

        it('a wither kill lays no Briar and plays a Stem fade; the default lays Briar', () => {
            makeEngine();
            const withering = treeRoot({ stemDeath: 'witherWhileRegrowing' });
            attachComponent(withering, REGROWTH_STUB);
            const plain = node('plain', 5, 10, {});
            const briar = vi.spyOn(engine.terrainManager!, 'placeBriar');

            kill(tetheredChild(withering, 'w', 7, 5));
            expect(briar).not.toHaveBeenCalled();
            expect(engine.effects.some((e) => e.effectType === STEM_WITHER_EFFECT_TYPE)).toBe(true);

            const c = node('c', 7, 10);
            linkNodeChild(plain, c, { tetherMaxLength: 400 });
            kill(c);
            expect(briar).toHaveBeenCalledTimes(1);
        });

        it('a wither root without regrowth still lays Briar, and no severance without the option', () => {
            makeEngine();
            const root = treeRoot({ stemDeath: 'witherWhileRegrowing' });
            const briar = vi.spyOn(engine.terrainManager!, 'placeBriar');
            kill(tetheredChild(root, 'a', 7, 5));
            expect(briar).toHaveBeenCalledTimes(1);
            expect(root.hp).toBe(100);
        });
    });

    it('round-trips links and the leash through serialization', () => {
        makeEngine();
        const parent = node('parent', 5, 5);
        const child = node('child', 7, 5);
        linkNodeChild(parent, child, { tetherMaxLength: 180 });

        const restore = (src: Unit, id: string): Unit => {
            const data = JSON.parse(JSON.stringify(serializeUnit(src, 0))) as Record<string, unknown>;
            const copy = createUnitFromSpawnConfig(
                { id, characterId: src.characterId, name: 'copy', hp: 10, x: 0, y: 0, teamId: 'enemy', ownerId: 'ai' },
                engine.eventBus,
                engine,
            );
            applySerializedUnitState(copy, data, engine.eventBus, 0);
            return copy;
        };
        const parentCopy = restore(parent, 'parent2');
        const childCopy = restore(child, 'child2');
        expect(getNodeChildIds(parentCopy)).toEqual(['child']);
        expect(getNodeParentId(childCopy)).toBe('parent');
        expect(hasLivingChildren(parentCopy)).toBe(true);
        expect(JSON.parse(JSON.stringify(serializeUnit(childCopy, 0)))).toMatchObject({ nodeTetherMaxLength: 180 });
    });
});
