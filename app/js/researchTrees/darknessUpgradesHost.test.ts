import { describe, expect, it } from 'vitest';
import { GameEngine } from '../games/minion_battles/game/GameEngine';
import { resetGameObjectIdCounter } from '../games/minion_battles/game/GameObject';
import { TerrainGrid, CELL_SIZE } from '../games/minion_battles/terrain/TerrainGrid';
import { TerrainManager } from '../games/minion_battles/terrain/TerrainManager';
import { TerrainType } from '../games/minion_battles/terrain/TerrainType';
import type { DarknessUpgradesState } from '../types';
import { grantDarknessUpgradeNode, resolveActiveDarknessUpgrades } from './darknessUpgrades';
import { DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS } from './trees/darkness_upgrades';
import { PassiveStatKey } from './types';

const EMPTY: DarknessUpgradesState = { researchTrees: {}, researchNodeLevels: {}, researchNodeSources: {} };
const OWNED = grantDarknessUpgradeNode(EMPTY, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS);

const PLAYERS = { host: { isHost: true }, guest: { isHost: false } };

describe('resolveActiveDarknessUpgrades (host-only)', () => {
    it('returns the host bonuses even when a non-host also owns the upgrade', () => {
        const res = resolveActiveDarknessUpgrades({
            players: PLAYERS,
            darknessUpgradesByPlayer: { host: OWNED, guest: OWNED },
        });
        expect(res.hostPlayerId).toBe('host');
        expect(res.bonuses[PassiveStatKey.EnemyUnitSlimeMaxHealthBonus]?.add).toBe(12);
        expect(res.bonuses[PassiveStatKey.EnemyUnitSlimeExtraProjectiles]?.add).toBe(2);
        expect(res.activeNodeIds).toEqual([DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]);
        expect(res.state).toEqual(OWNED);
    });

    it('ignores a non-host player upgrades when the host has none', () => {
        const res = resolveActiveDarknessUpgrades({
            players: PLAYERS,
            darknessUpgradesByPlayer: { host: EMPTY, guest: OWNED },
        });
        expect(res.bonuses).toEqual({});
        expect(res.activeNodeIds).toEqual([]);
    });

    it('returns empty when the host has no data or there is no host', () => {
        expect(
            resolveActiveDarknessUpgrades({ players: PLAYERS, darknessUpgradesByPlayer: { guest: OWNED } }).bonuses,
        ).toEqual({});
        const noHost = resolveActiveDarknessUpgrades({
            players: { a: {}, b: {} },
            darknessUpgradesByPlayer: { a: OWNED },
        });
        expect(noHost.bonuses).toEqual({});
        expect(noHost.hostPlayerId).toBeNull();
    });
});

describe('darknessUpgradeBonuses engine checkpoint', () => {
    it('survives toJSON -> fromJSON', () => {
        resetGameObjectIdCounter(1);
        const terrain = () => new TerrainManager(new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass));
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: terrain() });
        const bag = resolveActiveDarknessUpgrades({
            players: PLAYERS,
            darknessUpgradesByPlayer: { host: OWNED },
        }).bonuses;
        engine.darknessUpgradeBonuses = bag;
        expect(engine.state.darknessUpgradeBonuses).toEqual(bag);

        const restored = GameEngine.fromJSON(engine.toJSON(), 'p1', terrain());
        expect(restored.darknessUpgradeBonuses).toEqual(bag);
    });

    it('keeps the active node ids across toJSON -> fromJSON', () => {
        resetGameObjectIdCounter(1);
        const terrain = () => new TerrainManager(new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass));
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: terrain() });
        const ids = resolveActiveDarknessUpgrades({
            players: PLAYERS,
            darknessUpgradesByPlayer: { host: OWNED },
        }).activeNodeIds;
        expect(ids).toEqual([DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]);
        engine.darknessUpgradeNodeIds = ids;

        const restored = GameEngine.fromJSON(engine.toJSON(), 'p1', terrain());
        expect(restored.darknessUpgradeNodeIds).toEqual(ids);
    });

    it('defaults to an empty bag and omits it from the checkpoint when empty', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        expect(engine.darknessUpgradeBonuses).toEqual({});
        expect(engine.toJSON().darknessUpgradeBonuses).toBeUndefined();
        expect(engine.darknessUpgradeNodeIds).toEqual([]);
        expect(engine.toJSON().darknessUpgradeNodeIds).toBeUndefined();
    });
});
