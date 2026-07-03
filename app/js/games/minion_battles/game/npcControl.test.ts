/**
 * NPC player-control: assignment on spawn, events, controllable flag, serialization.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import { Unit } from './units/Unit';
import { createUnitFromSpawnConfig } from './units/index';
import { UnitTag } from './units/unitTag';
import type { ControlChangedEvent } from './EventBus';
import type { EnemySpawnDef, PlayerControlDef } from '../storylines/types';
import { BaseMissionDef } from '../storylines/BaseMissionDef';
import { makeControlSelection } from '../state';
import { ENEMY_ALPHA_WOLF } from '../constants/enemyConstants';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';

const PLAYER_ID = 'p1';
const BOSS_GROUP = 'boss';

const BOSS_CONTROL_DEF: PlayerControlDef = {
    unitTag: UnitTag.Boss,
    label: 'Control Boss',
};

function makeBareEngine(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: PLAYER_ID, randomSeed: 1 });
    return engine;
}

function makeEnemyUnit(opts: {
    id?: string;
    tags?: UnitTag[];
    controlGroupId?: string | null;
    controllable?: boolean;
    ownerId?: string;
}): Unit {
    const unit = new Unit({
        id: opts.id ?? 'enemy_1',
        x: 100,
        y: 100,
        hp: 50,
        speed: 40,
        teamId: 'enemy',
        ownerId: opts.ownerId ?? 'ai',
        characterId: 'alpha_wolf',
        name: 'Test Enemy',
        abilities: [],
    });
    if (opts.tags) unit.tags = [...opts.tags];
    if (opts.controlGroupId !== undefined) unit.controlGroupId = opts.controlGroupId;
    if (opts.controllable !== undefined) unit.controllable = opts.controllable;
    return unit;
}

describe('npcControl', () => {
    it('assigns ownerId and fires control_assigned when unit matches registered tag', () => {
        const engine = makeBareEngine();
        engine.registerPlayerControl([BOSS_CONTROL_DEF], { [BOSS_GROUP]: PLAYER_ID });

        const events: ControlChangedEvent[] = [];
        engine.eventBus.on('control_assigned', (e) => events.push(e));

        const unit = makeEnemyUnit({ tags: [UnitTag.Boss] });
        engine.addUnit(unit, 'initialGameSpawn');

        expect(unit.ownerId).toBe(PLAYER_ID);
        expect(unit.controlGroupId).toBe(BOSS_GROUP);
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
            unitId: unit.id,
            playerId: PLAYER_ID,
            groupId: BOSS_GROUP,
        });

        engine.destroy();
    });

    it('assigns ownerId when unit.controlGroupId matches a registered group', () => {
        const engine = makeBareEngine();
        const def: PlayerControlDef = {
            controlGroupId: 'support',
            label: 'Control Support',
        };
        engine.registerPlayerControl([def], { support: PLAYER_ID });

        const unit = makeEnemyUnit({ controlGroupId: 'support' });
        engine.addUnit(unit, 'initialGameSpawn');

        expect(unit.ownerId).toBe(PLAYER_ID);
        expect(unit.controlGroupId).toBe('support');

        engine.destroy();
    });

    it('skips assignment when controllable is false', () => {
        const engine = makeBareEngine();
        engine.registerPlayerControl([BOSS_CONTROL_DEF], { [BOSS_GROUP]: PLAYER_ID });

        const events: ControlChangedEvent[] = [];
        engine.eventBus.on('control_assigned', (e) => events.push(e));

        const unit = makeEnemyUnit({ tags: [UnitTag.Boss], controllable: false });
        engine.addUnit(unit, 'initialGameSpawn');

        expect(unit.ownerId).toBe('ai');
        expect(events).toHaveLength(0);

        engine.destroy();
    });

    it('leaves unmatched and non-AI units untouched', () => {
        const engine = makeBareEngine();
        engine.registerPlayerControl([BOSS_CONTROL_DEF], { [BOSS_GROUP]: PLAYER_ID });

        const unmatched = makeEnemyUnit({ id: 'grunt', tags: [] });
        engine.addUnit(unmatched, 'initialGameSpawn');
        expect(unmatched.ownerId).toBe('ai');

        const alreadyOwned = makeEnemyUnit({
            id: 'hero_pet',
            tags: [UnitTag.Boss],
            ownerId: 'p2',
        });
        engine.addUnit(alreadyOwned, 'initialGameSpawn');
        expect(alreadyOwned.ownerId).toBe('p2');

        engine.destroy();
    });

    it('releaseControl restores ai owner and fires control_released', () => {
        const engine = makeBareEngine();
        engine.registerPlayerControl([BOSS_CONTROL_DEF], { [BOSS_GROUP]: PLAYER_ID });

        const unit = makeEnemyUnit({ tags: [UnitTag.Boss] });
        engine.addUnit(unit, 'initialGameSpawn');
        expect(unit.ownerId).toBe(PLAYER_ID);

        const events: ControlChangedEvent[] = [];
        engine.eventBus.on('control_released', (e) => events.push(e));

        engine.releaseControl(unit);

        expect(unit.ownerId).toBe('ai');
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
            unitId: unit.id,
            playerId: PLAYER_ID,
            groupId: BOSS_GROUP,
        });

        engine.destroy();
    });

    it('toJSON/fromJSON round-trips assignments, controllable, and controlGroupId; late spawn still assigns', () => {
        const engine = makeBareEngine();
        engine.registerPlayerControl([BOSS_CONTROL_DEF], { [BOSS_GROUP]: PLAYER_ID });

        const boss = makeEnemyUnit({ id: 'boss_1', tags: [UnitTag.Boss] });
        engine.addUnit(boss, 'initialGameSpawn');

        const locked = createUnitFromSpawnConfig(
            {
                id: 'locked_1',
                characterId: 'swarmling',
                name: 'Locked',
                x: 200,
                y: 200,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'hunt',
                controlGroupId: 'support',
                controllable: false,
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(locked, 'initialGameSpawn');

        const json = engine.toJSON();
        expect(json.npcControlAssignments).toEqual({ [BOSS_GROUP]: PLAYER_ID });

        const bossJson = json.units.find((u) => u.id === 'boss_1')!;
        expect(bossJson.controlGroupId).toBe(BOSS_GROUP);
        expect(bossJson.controllable).toBeUndefined();

        const lockedJson = json.units.find((u) => u.id === 'locked_1')!;
        expect(lockedJson.controllable).toBe(false);
        expect(lockedJson.controlGroupId).toBe('support');

        const restored = GameEngine.fromJSON(json, PLAYER_ID, null);
        expect(restored.getNpcControlAssignments()).toEqual({ [BOSS_GROUP]: PLAYER_ID });

        const restoredBoss = restored.getUnit('boss_1')!;
        expect(restoredBoss.ownerId).toBe(PLAYER_ID);
        expect(restoredBoss.controlGroupId).toBe(BOSS_GROUP);

        const restoredLocked = restored.getUnit('locked_1')!;
        expect(restoredLocked.controllable).toBe(false);
        expect(restoredLocked.controlGroupId).toBe('support');
        expect(restoredLocked.ownerId).toBe('ai');

        // Defs are runtime-only; re-register after restore so late spawns still assign.
        restored.registerPlayerControl(
            [BOSS_CONTROL_DEF],
            { ...restored.getNpcControlAssignments() },
        );

        const lateBoss = makeEnemyUnit({ id: 'boss_late', tags: [UnitTag.Boss] });
        restored.addUnit(lateBoss, 'initialGameSpawn');
        expect(lateBoss.ownerId).toBe(PLAYER_ID);
        expect(lateBoss.controlGroupId).toBe(BOSS_GROUP);

        engine.destroy();
        restored.destroy();
    });

    it('createUnitFromSpawnConfig applies controlGroupId and controllable', () => {
        const engine = makeBareEngine();
        const unit = createUnitFromSpawnConfig(
            {
                characterId: 'swarmling',
                name: 'Spawned',
                x: 0,
                y: 0,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'hunt',
                controlGroupId: 'pack',
                controllable: false,
            },
            engine.eventBus,
            engine,
        );
        expect(unit.controlGroupId).toBe('pack');
        expect(unit.controllable).toBe(false);
        engine.destroy();
    });

    it('defeat fires when all team-player units are dead while a player-owned enemy lives', () => {
        const engine = makeBareEngine();
        let defeatFired = false;
        engine.setOnDefeat(() => {
            defeatFired = true;
        });

        const hero = new Unit({
            id: 'hero_1',
            x: 50,
            y: 50,
            hp: 10,
            speed: 40,
            teamId: 'player',
            ownerId: PLAYER_ID,
            characterId: 'player',
            name: 'Hero',
            abilities: [],
        });
        engine.addUnit(hero, 'initialGameSpawn');

        engine.registerPlayerControl([BOSS_CONTROL_DEF], { [BOSS_GROUP]: PLAYER_ID });
        const wolf = makeEnemyUnit({ tags: [UnitTag.Boss] });
        engine.addUnit(wolf, 'initialGameSpawn');
        expect(wolf.ownerId).toBe(PLAYER_ID);
        expect(wolf.isPlayerControlled()).toBe(true);

        engine.state.levelEventManager.runDefeatCheck();
        expect(defeatFired).toBe(false);

        hero.hp = 0;
        engine.state.levelEventManager.runDefeatCheck();
        expect(defeatFired).toBe(true);
        expect(wolf.isAlive()).toBe(true);

        engine.destroy();
    });

    it('initializeGameState with control selection spawns no hero for that player and assigns the wolf', () => {
        const HERO_PLAYER = 'p_hero';
        const CONTROL_PLAYER = 'p_control';

        class MinimalControlMission extends BaseMissionDef {
            missionId = 'test_npc_control';
            name = 'Test NPC Control';
            worldWidth = 5 * CELL_SIZE;
            worldHeight = 5 * CELL_SIZE;
            playerControl = [BOSS_CONTROL_DEF];
            enemies: EnemySpawnDef[] = [
                {
                    ...ENEMY_ALPHA_WOLF,
                    position: { x: 200, y: 200 },
                },
            ];
            createTerrain = () =>
                TerrainGrid.createTerrainFromArray(
                    5,
                    5,
                    CELL_SIZE,
                    Array.from({ length: 5 }, () => Array(5).fill(TerrainType.Grass) as TerrainType[]),
                    TerrainType.Grass,
                );
        }

        const mission = new MinimalControlMission();
        const engine = makeBareEngine();
        // Mirror BattleSession.load: control players are excluded from playerUnits.
        mission.initializeGameState(engine, {
            playerUnits: [{ playerId: HERO_PLAYER, name: 'Hero', portraitId: 'warrior' }],
            characterSelections: {
                [HERO_PLAYER]: 'char_hero',
                [CONTROL_PLAYER]: makeControlSelection(BOSS_GROUP),
            },
            localPlayerId: CONTROL_PLAYER,
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { [HERO_PLAYER]: ['004'] },
        });

        const heroes = engine.units.filter((u) => u.teamId === 'player' && u.isPlayerControlled());
        expect(heroes).toHaveLength(1);
        expect(heroes[0]!.ownerId).toBe(HERO_PLAYER);

        const controlHeroes = engine.units.filter(
            (u) => u.teamId === 'player' && u.ownerId === CONTROL_PLAYER,
        );
        expect(controlHeroes).toHaveLength(0);

        const wolf = engine.units.find((u) => u.tags.includes(UnitTag.Boss));
        expect(wolf).toBeDefined();
        expect(wolf!.ownerId).toBe(CONTROL_PLAYER);
        expect(wolf!.teamId).toBe('enemy');
        expect(engine.getNpcControlAssignments()).toEqual({ [BOSS_GROUP]: CONTROL_PLAYER });
        expect(engine.getLocalPlayerTeamId()).toBe('enemy');

        engine.destroy();
    });
});
