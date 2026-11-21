/**
 * Node regrowth: the window opens when the root's last node is killed, the whole tree comes back when it ends, single
 * nodes trickle back while the root is still shelled, a retreat cancels both, and the state round-trips.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, placeTargetDummy, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import { resolveParallelOrderPause } from '../testing/runner/SimulationRunner';
import type { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { serializeUnit } from './units/unitToJSON';
import { applySerializedUnitState } from './units/unitFromJSON';
import { createUnitFromSpawnConfig } from './units/index';
import { attachComponent, componentSpec } from './units/components/unitComponent';
import { NODE_REGROWTH_COMPONENT_ID, NODE_TREE_COMPONENT, getNodeLayoutKey, linkNodeChild, rootHasRegrowth } from './units/components/nodeTree';
import { NODE_REGROWTH_COMPONENT, getNodeRegrowthStatus, peekNodeRegrowthState, type NodeRegrowthOptions } from './units/components/nodeRegrowth';
import { registerNodeRegrowthCallback, type NodeRegrowthRequest } from './units/components/nodeRegrowthHooks';
import { peekPhaseState } from './units/components/phaseComponent';
import { burrowPreset } from './units/components/phaseDef';
import { getUnitDefEntry } from './units/unit_defs/unitDef';
import { growGardenTree, missingGardenNodeKeys, type GardenGrowContext } from './gardenHeart/growGardenTree';
import { gardenTreeLayout } from './gardenHeart/gardenTreeLayouts';
import { dismissGardenTree } from './gardenHeart/growGardenTree';
import { ENEMY_GARDEN_HEART } from '../constants/enemyConstants';

const TICKS_PER_SEC = 60;
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;

let engine: GameEngine;
const offs: Array<() => void> = [];

const DUMMY_DEF = getUnitDefEntry('target_dummy')!;

afterEach(() => {
    DUMMY_DEF.phases = undefined;
    for (const off of offs.splice(0)) off();
    engine?.destroy();
});

function makeEngine(): GameEngine {
    engine = buildTinyBattleEngine({ gridW: 40, gridH: 40, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: TINY_BATTLE_PLAYER_ID, x: cell(2), y: cell(2), abilities: [] });
    return engine;
}

function stepSeconds(seconds: number): void {
    for (let i = 0; i < Math.round(seconds * TICKS_PER_SEC); i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

function kill(unit: Unit): void {
    unit.takeDamage(unit.maxHp * 10, null, engine.eventBus);
}

const OPTIONS: NodeRegrowthOptions = {
    openSeconds: 5,
    trickleSeconds: 10,
    regrowCallback: 'test_regrow',
    callbacks: { opened: 'test_opened', regrown: 'test_regrown' },
};

interface Harness {
    root: Unit;
    nodes: Unit[];
    log: NodeRegrowthRequest['event'][];
    regrowRequests: Array<{ only?: number }>;
    /** How many slots the stub callback reports missing. */
    missing: { count: number };
}

/** A root with `count` dummy children, and stub callbacks that record what the component asked for. */
function setup(count: number, options: NodeRegrowthOptions = OPTIONS): Harness {
    makeEngine();
    const root = placeTargetDummy(engine, { x: cell(20), y: cell(20) }, 'root');
    root.hp = root.maxHp = 1000;
    attachComponent(root, componentSpec(NODE_TREE_COMPONENT, {}));
    attachComponent(root, componentSpec(NODE_REGROWTH_COMPONENT, options));
    const nodes: Unit[] = [];
    for (let i = 0; i < count; i++) {
        const n = placeTargetDummy(engine, { x: cell(24), y: cell(20 + i * 2) }, `n${i}`);
        linkNodeChild(root, n, { tetherMaxLength: 400 });
        nodes.push(n);
    }
    const h: Harness = { root, nodes, log: [], regrowRequests: [], missing: { count: 0 } };
    offs.push(
        registerNodeRegrowthCallback('test_regrow', (_r, _c, request) => {
            h.log.push(request.event);
            if (request.event === 'missing') return h.missing.count;
            if (request.event === 'regrow') {
                h.regrowRequests.push({ only: request.only });
                return 0;
            }
        }),
        registerNodeRegrowthCallback('test_opened', (_r, _c, request) => void h.log.push(request.event)),
        registerNodeRegrowthCallback('test_regrown', (_r, _c, request) => void h.log.push(request.event)),
    );
    return h;
}

describe('node regrowth', () => {
    it('uses the shared component id', () => {
        expect(NODE_REGROWTH_COMPONENT.id).toBe(NODE_REGROWTH_COMPONENT_ID);
    });

    it('opens when the last child is killed, then regrows after openSeconds and fires the cues', () => {
        const h = setup(2);
        kill(h.nodes[0]!);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).open).toBe(false); // one child still lives
        kill(h.nodes[1]!);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).open).toBe(true);
        expect(h.log).toEqual(['opened']);

        stepSeconds(4.8);
        expect(h.regrowRequests).toEqual([]);
        stepSeconds(0.4);
        expect(h.regrowRequests).toEqual([{ only: undefined }]); // the whole tree: no cap
        expect(h.log).toEqual(['opened', 'regrow', 'regrown']);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).open).toBe(false);
    });

    it('status fraction goes from 1 to 0 across the window', () => {
        const h = setup(1);
        kill(h.nodes[0]!);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).fraction).toBeCloseTo(1, 5);
        stepSeconds(2.5);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).fraction).toBeCloseTo(0.5, 1);
        stepSeconds(2.6);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime)).toEqual({ open: false, fraction: 0 });
    });

    it('trickles one node per interval while shelled and never while open', () => {
        const h = setup(2);
        h.missing.count = 3;
        stepSeconds(9.8);
        expect(h.regrowRequests).toEqual([]);
        stepSeconds(0.4);
        expect(h.regrowRequests).toEqual([{ only: 1 }]);
        stepSeconds(10.2);
        expect(h.regrowRequests).toEqual([{ only: 1 }, { only: 1 }]);

        // Nothing missing: no new trickle is armed (a timer already armed fires once as a harmless no-op).
        h.missing.count = 0;
        stepSeconds(11);
        h.regrowRequests.length = 0;
        stepSeconds(25);
        expect(h.regrowRequests).toEqual([]);

        // Open window: no trickle during it, only the full regrowth at its end.
        h.missing.count = 3;
        kill(h.nodes[0]!);
        kill(h.nodes[1]!);
        h.regrowRequests.length = 0;
        stepSeconds(5.2);
        expect(h.regrowRequests).toEqual([{ only: undefined }]);
    });

    it('a retreat (the root entering a burrow phase) cancels a pending regrowth', () => {
        DUMMY_DEF.phases = [
            {
                id: 'p2',
                enterWhen: { kind: 'health_below_percent', threshold: 0.75 },
                clampHitAtThreshold: true,
                transition: burrowPreset(
                    { closeSeconds: 0.2, sinkSeconds: 0.3, travelSeconds: 1, riseSeconds: 0.3, sproutPoints: [{ x: cell(30), y: cell(30) }] },
                    'Burrowing',
                ),
            },
        ];
        const h = setup(1);
        // The nodes share the phased dummy def, so their own phase clamp would stop a big hit: kill by hand.
        h.nodes[0]!.hp = 0;
        h.nodes[0]!.active = false;
        engine.eventBus.emit('unit_died', { unitId: h.nodes[0]!.id, killerUnitId: null });
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).open).toBe(true);
        h.root.takeDamage(400, null, engine.eventBus); // 1000 -> 600: past the 75% threshold
        expect(peekPhaseState(h.root)?.burrow).not.toBeNull();
        expect(rootHasRegrowth(h.root)).toBe(false);
        stepSeconds(0.1);
        expect(peekNodeRegrowthState(h.root)).toEqual({ openUntil: null, nextTrickleAt: null });
        stepSeconds(6);
        expect(h.regrowRequests).toEqual([]);
        expect(h.log).toEqual(['opened']);
        expect(rootHasRegrowth(h.root)).toBe(true); // surfaced again
    });

    it('a dismissal never opens the window', () => {
        const h = setup(2);
        dismissGardenTree(engine, h.root);
        expect(h.nodes.every((n) => !n.isAlive())).toBe(true);
        expect(getNodeRegrowthStatus(h.root, engine.gameTime).open).toBe(false);
        expect(h.log).toEqual([]);
    });

    it('does nothing for a dead root', () => {
        const h = setup(1);
        kill(h.root);
        kill(h.nodes[0]!);
        stepSeconds(6);
        expect(h.log).toEqual([]);
    });

    it('round-trips mid-window and resumes: the copy regrows at the same time', () => {
        const h = setup(1);
        kill(h.nodes[0]!);
        stepSeconds(2);
        const data = JSON.parse(JSON.stringify(serializeUnit(h.root, 0))) as Record<string, unknown>;
        expect(data.regrowthOpenUntil).toBe(peekNodeRegrowthState(h.root)!.openUntil);

        const copy = createUnitFromSpawnConfig(
            { id: 'root2', characterId: h.root.characterId, name: 'copy', hp: 10, x: 0, y: 0, teamId: 'enemy', ownerId: 'ai' },
            engine.eventBus,
            engine,
        );
        attachComponent(copy, componentSpec(NODE_REGROWTH_COMPONENT, OPTIONS));
        applySerializedUnitState(copy, data, engine.eventBus, 0);
        expect(peekNodeRegrowthState(copy)).toEqual(peekNodeRegrowthState(h.root));
        const status = getNodeRegrowthStatus(copy, engine.gameTime);
        expect(status.open).toBe(true);
        expect(status.fraction).toBeCloseTo(getNodeRegrowthStatus(h.root, engine.gameTime).fraction, 5);
    });
});

describe('growGardenTree onlyMissing', () => {
    const growCtx = (): GardenGrowContext => engine as unknown as GardenGrowContext;

    function heartWithTree(phase: number): { heart: Unit; grown: Map<string, Unit> } {
        makeEngine();
        const heart = createUnitFromSpawnConfig(
            { ...ENEMY_GARDEN_HEART, x: cell(20), y: cell(20), ownerId: 'ai', unitAITreeId: 'none' },
            engine.eventBus,
            engine,
        );
        engine.addUnit(heart, 'initialGameSpawn');
        return { heart, grown: growGardenTree(growCtx(), heart, phase) };
    }

    it('nodes remember their layout key', () => {
        const { grown } = heartWithTree(3);
        for (const [key, unit] of grown) expect(getNodeLayoutKey(unit)).toBe(key);
    });

    it('grows only the missing keys, parents first, up to the limit, and nothing when whole', () => {
        const { heart, grown } = heartWithTree(3);
        const layout = gardenTreeLayout(3)!;
        expect(missingGardenNodeKeys(engine, heart, 3)).toEqual([]);
        expect(growGardenTree(growCtx(), heart, 3, { onlyMissing: true }).size).toBe(0);

        // Cut a Knot's Bud and the Knot's own slot is untouched; cut the Bud's key only.
        const bud = grown.get('gourdSpit')!;
        bud.hp = 0;
        bud.active = false;
        engine.eventBus.emit('unit_died', { unitId: bud.id, killerUnitId: null });
        expect(missingGardenNodeKeys(engine, heart, 3)).toEqual(['gourdSpit']);

        const knot = grown.get('creeper')!;
        const knotBud = grown.get('creeperBloom')!;
        for (const u of [knotBud, knot]) {
            u.hp = 0;
            u.active = false;
            engine.eventBus.emit('unit_died', { unitId: u.id, killerUnitId: null });
        }
        const missing = missingGardenNodeKeys(engine, heart, 3);
        expect(missing).toEqual(layout.map((s) => s.key).filter((k) => ['gourdSpit', 'creeper', 'creeperBloom'].includes(k)));

        // One at a time: first the missing bud under the surviving Knot, then the Knot, then its Bud (parent first).
        const order: string[] = [];
        for (let i = 0; i < 3; i++) {
            const g = growGardenTree(growCtx(), heart, 3, { onlyMissing: true, limit: 1 });
            expect(g.size).toBe(1);
            const [key] = [...g][0]!;
            order.push(key);
        }
        expect(order).toEqual(missing);
        expect(missingGardenNodeKeys(engine, heart, 3)).toEqual([]);
        expect(growGardenTree(growCtx(), heart, 3, { onlyMissing: true }).size).toBe(0);
    });

    it('a Bud waits for its missing Knot when the limit stops short of the Knot', () => {
        const { heart, grown } = heartWithTree(3);
        for (const key of ['creeperBloom', 'creeper']) {
            const u = grown.get(key)!;
            u.hp = 0;
            u.active = false;
            engine.eventBus.emit('unit_died', { unitId: u.id, killerUnitId: null });
        }
        const g = growGardenTree(growCtx(), heart, 3, { onlyMissing: true, limit: 1 });
        expect([...g.keys()]).toEqual(['creeper']);
    });
});
