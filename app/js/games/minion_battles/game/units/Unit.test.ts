/**
 * Unit serialization tests: toJSON round-trip restores all saveable properties.
 */
import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { UnitTag } from './unitTag';
import { StunnedBuff } from '../../buffs/StunnedBuff';
import { Mana } from '../../resources/Mana';
import { createPlan } from './unitAI/plans/planUtils';
import type { TacticalPlan } from './unitAI/plans/types';

/** Tick passed to toJSON/fromJSON in the golden checkpoint snapshot test. */
const GOLDEN_SERIALIZATION_TICK = 5;

/**
 * Build a unit with every optional serialization branch populated.
 * Used to pin the flat checkpoint wire format before the Unit.ts split refactor.
 */
function buildGoldenSerializationUnit(eventBus: EventBus): Unit {
    const unit = new Unit({
        id: 'golden_unit',
        x: 100,
        y: 200,
        hp: 80,
        maxHp: 100,
        speed: 120,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        portraitId: 'warrior',
        name: 'Golden Snapshot',
        abilities: ['throw_knife', '0101'],
        aiSettings: { minRange: 50, maxRange: 200 },
        combatSettings: { damageModifier: { flatAmt: 2, multiplier: 1.5 } },
        stamina: 2,
        stackSize: 3,
    });

    unit.active = true;
    unit.radius = 25;
    unit.pathfindingRetriggerOffset = 7;
    unit.pathInvalidated = true;
    unit.aiContext = { targetUnitId: 'enemy_1', aiState: 'hunt_pursue' };
    unit.unitAITreeId = 'hunt';
    unit.moveJitter = 0.42;
    unit.spawnTimer = 0.3;
    unit.growAnimTimer = 0.2;
    unit.waitMinEndTime = 10;
    unit.waitMaxEndTime = 20;
    unit.movementPaused = true;
    unit.corruptionProgress = 0.35;
    unit.crystalCorruptionProgress = 0.6;
    unit.darknessDamageProcCount = 2;
    unit.hpInjury = 8;
    unit.wallStuckTime = 1.25;
    unit.ephemeralDespawnAtGameTime = 99.5;
    unit.tags = [UnitTag.Boss, UnitTag.Enraged];

    unit.setMovement(
        [{ col: 2, row: 3 }, { col: 3, row: 4 }],
        'move_target_unit',
        42,
    );
    unit.movement!.targetPixel = { x: 130, y: 170 };

    unit.ccArmour.durationResistPct = { ALL: 0.25, STUN: 0.5 };
    unit.ccArmour.durationFlatSec = { ALL: 0.1 };
    unit.ccArmour.hardFloor = 2;
    unit.ccArmour.breakStunDuration = 1.5;
    unit.ccArmour.bonusHard = 3;
    unit.ccArmour.hardConsumed = 1;
    unit.ccArmour.chainResist = 2;
    unit.ccArmour.chainDecayRounds = 3;
    unit.ccArmour.chainStackNextIncrement = 4;
    unit.ccArmour.chainDecayRoundCounter = 2;
    unit.ccArmour.softFloor = 1;
    unit.ccArmour.bonusSoft = 2;
    unit.ccArmour.eventSerial = 5;
    unit.ccArmour.lastEventGameTime = 12.5;
    unit.ccArmour.lastEventKind = 'absorbed';

    unit.knockback = {
        knockbackVector: { x: 50, y: -30 },
        knockbackAirTime: 0.2,
        knockbackSlideTime: 0.1,
        knockbackSource: { unitId: 'source_unit', abilityId: 'knockback_ability' },
        knockbackElapsed: 0.05,
    };

    unit.wallEntryPoint = { x: 88, y: 92 };

    unit.lanterniteState.nestOwnerUnitId = 'nest_owner_1';
    unit.lanterniteState.patrolFarWorld = { x: 400, y: 300 };
    unit.lanterniteState.patrolLeg = 'toNest';
    unit.lanterniteState.nestConfig = {
        maxLanternites: 4,
        spawnIntervalSec: 2,
        patrolDestination: { kind: 'world', x: 400, y: 300 },
        networked: true,
        nestPoiId: 'nest_poi_a',
        scoutConstructionSec: 12,
    };
    unit.lanterniteState.nestSpawnState = {
        spawnedIds: ['scout_1', 'scout_2'],
        nextSpawnAtGameTime: 15,
    };
    unit.lanterniteState.role = 'scout';
    unit.lanterniteState.targetNestPoiId = 'target_nest_poi';
    unit.lanterniteState.homeNestPoiId = 'home_nest_poi';
    unit.lanterniteState.constructionCompleteAtGameTime = 20;
    unit.lanterniteState.attackReadyAtGameTime = 8;
    unit.lanterniteState.constructionAngle = 1.57;
    unit.invulnerabilityGenerations = 2;

    unit.thornlingState.nestConfig = {
        maxThornlings: 6,
        spawnIntervalSec: 3,
        spawnCount: 2,
        spawnCharacterId: 'thornling',
        spawnAbilities: ['0002'],
        spawnAITreeId: 'hunt',
    };
    unit.thornlingState.nestSpawnState = {
        spawnedIds: ['thorn_1'],
        nextSpawnAtGameTime: 18,
    };

    unit.swarmState.nestConfig = {
        maxSwarmlings: 8,
        spawnIntervalSec: 2.5,
        spawnCount: 2,
        scoutConstructionSec: 10,
    };
    unit.swarmState.nestSpawnState = {
        spawnedIds: ['swarm_1', 'swarm_2'],
        nextSpawnAtGameTime: 22,
    };
    unit.swarmState.nestHomePoiId = 'swarm_home_poi';
    unit.swarmState.orbitAngle = 2.4;
    unit.swarmState.targetNestPoiId = 'swarm_target_poi';
    unit.swarmState.nestOwnerUnitId = 'swarm_nest_owner';
    unit.swarmState.constructionCompleteAtGameTime = 25;

    unit.petState.ownerUnitId = 'owner_unit_1';
    unit.petState.unitIds = ['pet_1', 'pet_2'];
    unit.petState.defId = 'dog';

    unit.tacticalPlan = createPlan<TacticalPlan>(
        {
            type: 'chase_target',
            targetUnitId: 'chase_target_1',
            waypointGrid: { col: 3, row: 4 },
            groupCohesionCenter: { x: 120, y: 80 },
        },
        {
            baseTicks: 30,
            moveJitter: 0.25,
            maxJitterTicks: 10,
            invalidateOn: new Set(['target_died']),
            currentTick: GOLDEN_SERIALIZATION_TICK,
            path: [{ col: 1, row: 2 }, { col: 2, row: 2 }],
        },
    );

    const stunned = new StunnedBuff(2.5);
    stunned.appliedAtTime = 3.5;
    stunned.appliedAtRound = 2;
    unit.buffs = [stunned];

    const mana = new Mana();
    mana.current = 75;
    mana.max = 100;
    unit.attachResource(mana, eventBus);

    unit.abilityRuntime = {
        '0101': {
            currentUses: 2,
            maxUses: 6,
            recoveryChargesByType: { staminaCharge: 1 },
            active: true,
            replacedAbilityId: '0115',
        },
    };
    unit.abilityModifiers = {
        throw_knife: { addTags: ['melee'] },
    };

    unit.activeAbilities = [{
        abilityId: '0101',
        startTime: 1.5,
        targets: [{ type: 'unit', unitId: 'enemy_1' }],
        fired: true,
        castPayload: { lungeDir: { x: 1, y: 0 } },
        conditionalCancelPaused: true,
        conditionalCancelTagFilter: ['melee'],
        movementByLabel: {
            primary: {
                movePath: [{ col: 1, row: 1 }],
                moveTargetUnitId: 'target_1',
                moveTargetPixel: { x: 50, y: 60 },
            },
        },
    }];
    unit.abilityNote = { abilityId: '0001', abilityNote: { position: { x: 10, y: 20 } } };

    return unit;
}

/**
 * UnitManager reattaches resources after Unit.fromJSON (see Unit.fromJSON comment).
 * Mirror that here so round-trip matches production checkpoint restore.
 */
function attachResourcesFromSerializedUnit(
    unit: Unit,
    data: Record<string, unknown>,
    eventBus: EventBus,
): void {
    const resourceData = data.resources as Record<string, unknown>[] | undefined;
    if (!resourceData) return;
    for (const rd of resourceData) {
        if (rd.id === 'mana') {
            const mana = new Mana();
            mana.restoreFromJSON(rd);
            unit.attachResource(mana, eventBus);
        }
    }
}

describe('Unit', () => {
    it('golden serialization snapshot pins flat checkpoint shape and round-trips', () => {
        const eventBus = new EventBus();
        const unit = buildGoldenSerializationUnit(eventBus);
        const json = unit.toJSON(GOLDEN_SERIALIZATION_TICK);

        expect(JSON.parse(JSON.stringify(json))).toMatchInlineSnapshot(`
          {
            "_type": "unit",
            "abilities": [
              "throw_knife",
              "0101",
            ],
            "abilityModifiers": {
              "throw_knife": {
                "addTags": [
                  "melee",
                ],
              },
            },
            "abilityNote": {
              "abilityId": "0001",
              "abilityNote": {
                "position": {
                  "x": 10,
                  "y": 20,
                },
              },
            },
            "abilityRuntime": {
              "0101": {
                "active": true,
                "currentUses": 2,
                "maxUses": 6,
                "recoveryChargesByType": {
                  "staminaCharge": 1,
                },
                "replacedAbilityId": "0115",
              },
            },
            "active": true,
            "activeAbilities": [
              {
                "abilityId": "0101",
                "castPayload": {
                  "lungeDir": {
                    "x": 1,
                    "y": 0,
                  },
                },
                "conditionalCancelPaused": true,
                "conditionalCancelTagFilter": [
                  "melee",
                ],
                "fired": true,
                "movementByLabel": {
                  "primary": {
                    "movePath": [
                      {
                        "col": 1,
                        "row": 1,
                      },
                    ],
                    "moveTargetPixel": {
                      "x": 50,
                      "y": 60,
                    },
                    "moveTargetUnitId": "target_1",
                  },
                },
                "startTime": 1.5,
                "targets": [
                  {
                    "type": "unit",
                    "unitId": "enemy_1",
                  },
                ],
              },
            ],
            "aiContext": {
              "aiState": "hunt_pursue",
              "targetUnitId": "enemy_1",
            },
            "aiSettings": {
              "maxRange": 200,
              "minRange": 50,
            },
            "bonusHardCcArmour": 3,
            "bonusSoftCcArmour": 2,
            "buffs": [
              {
                "_type": "stunned",
                "appliedAtRound": 2,
                "appliedAtTime": 3.5,
                "durationUnit": "seconds",
                "durationValue": 2.5,
              },
            ],
            "ccArmourBreakStunDuration": 1.5,
            "ccDurationFlatSec": {
              "ALL": 0.1,
            },
            "ccDurationResistPct": {
              "ALL": 0.25,
              "STUN": 0.5,
            },
            "chainCcDecayRoundCounter": 2,
            "chainCcDecayRounds": 3,
            "chainCcResist": 2,
            "chainCcStackNextIncrement": 4,
            "characterId": "player",
            "combatSettings": {
              "damageModifier": {
                "flatAmt": 2,
                "multiplier": 1.5,
              },
            },
            "corruptionProgress": 0.35,
            "crystalCorruptionProgress": 0.6,
            "darknessDamageProcCount": 2,
            "ephemeralDespawnAtGameTime": 99.5,
            "growAnimTimer": 0.2,
            "hardCcArmourConsumed": 1,
            "hardCcArmourEventSerial": 5,
            "hardCcArmourFloor": 2,
            "hp": 80,
            "hpInjury": 8,
            "id": "golden_unit",
            "invulnerabilityGenerations": 2,
            "knockback": {
              "knockbackAirTime": 0.2,
              "knockbackElapsed": 0.05,
              "knockbackSlideTime": 0.1,
              "knockbackSource": {
                "abilityId": "knockback_ability",
                "unitId": "source_unit",
              },
              "knockbackVector": {
                "x": 50,
                "y": -30,
              },
            },
            "lanternPatrolFarWorld": {
              "x": 400,
              "y": 300,
            },
            "lanternPatrolLeg": "toNest",
            "lanterniteAttackReadyAtGameTime": 8,
            "lanterniteConstructionAngle": 1.57,
            "lanterniteConstructionCompleteAtGameTime": 20,
            "lanterniteHomeNestPoiId": "home_nest_poi",
            "lanterniteNestConfig": {
              "maxLanternites": 4,
              "nestPoiId": "nest_poi_a",
              "networked": true,
              "patrolDestination": {
                "kind": "world",
                "x": 400,
                "y": 300,
              },
              "scoutConstructionSec": 12,
              "spawnIntervalSec": 2,
            },
            "lanterniteNestOwnerUnitId": "nest_owner_1",
            "lanterniteNestSpawnState": {
              "nextSpawnAtGameTime": 15,
              "spawnedIds": [
                "scout_1",
                "scout_2",
              ],
            },
            "lanterniteRole": "scout",
            "lanterniteTargetNestPoiId": "target_nest_poi",
            "lastHardCcEventGameTime": 12.5,
            "lastHardCcEventKind": "absorbed",
            "maxHp": 100,
            "moveJitter": 0.42,
            "movement": {
              "path": [
                {
                  "col": 2,
                  "row": 3,
                },
                {
                  "col": 3,
                  "row": 4,
                },
              ],
              "pathfindingTick": 42,
              "targetPixel": {
                "x": 130,
                "y": 170,
              },
              "targetUnitId": "move_target_unit",
            },
            "movementPaused": true,
            "name": "Golden Snapshot",
            "nudge": null,
            "ownerId": "p1",
            "pathInvalidated": false,
            "pathfindingRetriggerOffset": 7,
            "petDefId": "dog",
            "petOwnerUnitId": "owner_unit_1",
            "petUnitIds": [
              "pet_1",
              "pet_2",
            ],
            "portraitId": "warrior",
            "radius": 25,
            "resources": [
              {
                "current": 75,
                "id": "mana",
                "max": 100,
              },
            ],
            "softCcArmourFloor": 1,
            "spawnTimer": 0.3,
            "speed": 120,
            "stackSize": 3,
            "stamina": 2,
            "swarmNestConfig": {
              "maxSwarmlings": 8,
              "scoutConstructionSec": 10,
              "spawnCount": 2,
              "spawnIntervalSec": 2.5,
            },
            "swarmNestHomePoiId": "swarm_home_poi",
            "swarmNestSpawnState": {
              "nextSpawnAtGameTime": 22,
              "spawnedIds": [
                "swarm_1",
                "swarm_2",
              ],
            },
            "swarmlingConstructionCompleteAtGameTime": 25,
            "swarmlingNestOwnerUnitId": "swarm_nest_owner",
            "swarmlingOrbitAngle": 2.4,
            "swarmlingTargetNestPoiId": "swarm_target_poi",
            "tacticalPlan": {
              "groupCohesionCenter": {
                "x": 120,
                "y": 80,
              },
              "targetUnitId": "chase_target_1",
              "ticksRemaining": 32,
              "type": "chase_target",
              "waypointGrid": {
                "col": 3,
                "row": 4,
              },
            },
            "tags": [
              "boss",
              "enraged",
            ],
            "teamId": "player",
            "thornlingNestConfig": {
              "maxThornlings": 6,
              "spawnAITreeId": "hunt",
              "spawnAbilities": [
                "0002",
              ],
              "spawnCharacterId": "thornling",
              "spawnCount": 2,
              "spawnIntervalSec": 3,
            },
            "thornlingNestSpawnState": {
              "nextSpawnAtGameTime": 18,
              "spawnedIds": [
                "thorn_1",
              ],
            },
            "unitAITreeId": "hunt",
            "waitMaxEndTime": 20,
            "waitMinEndTime": 10,
            "wallEntryPoint": {
              "x": 88,
              "y": 92,
            },
            "wallStuckTime": 1.25,
            "x": 100,
            "y": 200,
          }
        `);

        const restored = Unit.fromJSON(json, eventBus, GOLDEN_SERIALIZATION_TICK);
        attachResourcesFromSerializedUnit(restored, json, eventBus);
        expect(restored.toJSON(GOLDEN_SERIALIZATION_TICK)).toEqual(json);
    });

    it('serializes and restores to an equivalent object', () => {
        const eventBus = new EventBus();
        const unit = new Unit({
            id: 'unit_1',
            x: 100,
            y: 200,
            hp: 80,
            maxHp: 100,
            speed: 120,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'Test',
            abilities: ['throw_knife', '0101'],
            aiSettings: { minRange: 50, maxRange: 200 },
            combatSettings: { damageModifier: { flatAmt: 2, multiplier: 1 } },
        });
        unit.active = true;
        unit.waitMinEndTime = 10;
        unit.waitMaxEndTime = 20;
        unit.radius = 25;
        unit.setMovement([{ col: 2, row: 3 }, { col: 3, row: 3 }], undefined, 42);

        const json = unit.toJSON();
        const restored = Unit.fromJSON(json, eventBus);

        expect(restored.id).toBe(unit.id);
        expect(restored.x).toBe(unit.x);
        expect(restored.y).toBe(unit.y);
        expect(restored.active).toBe(unit.active);
        expect(restored.hp).toBe(unit.hp);
        expect(restored.maxHp).toBe(unit.maxHp);
        expect(restored.speed).toBe(unit.speed);
        expect(restored.teamId).toBe(unit.teamId);
        expect(restored.ownerId).toBe(unit.ownerId);
        expect(restored.characterId).toBe(unit.characterId);
        expect(restored.portraitId).toBe(unit.portraitId);
        expect(restored.name).toBe(unit.name);
        expect(restored.waitMinEndTime).toBe(unit.waitMinEndTime);
        expect(restored.waitMaxEndTime).toBe(unit.waitMaxEndTime);
        expect(restored.radius).toBe(unit.radius);
        expect(restored.abilities).toEqual(unit.abilities);
        expect(restored.aiSettings).toEqual(unit.aiSettings);
        expect(restored.combatSettings).toEqual(unit.combatSettings);
        expect(restored.movement).not.toBeNull();
        expect(restored.movement!.path).toEqual(unit.movement!.path);
        expect(restored.movement!.pathfindingTick).toBe(unit.movement!.pathfindingTick);
    });

    it('restores unit without movement', () => {
        const eventBus = new EventBus();
        const unit = new Unit({
            id: 'unit_2',
            x: 50,
            y: 50,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'ranger',
            name: 'Ranger',
        });
        const json = unit.toJSON();
        const restored = Unit.fromJSON(json, eventBus);
        expect(restored.movement).toBeNull();
        expect(restored.x).toBe(50);
        expect(restored.y).toBe(50);
        expect(restored.characterId).toBe('player');
        expect(restored.portraitId).toBe('ranger');
    });

    it('returns default damage modifier when unset', () => {
        const unit = new Unit({
            id: 'unit_3',
            x: 0,
            y: 0,
            hp: 10,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'NoMod',
        });
        expect(unit.getDamageModifier()).toEqual({ flatAmt: 0, multiplier: 1 });
    });

    it('clears wait lockout after min time when a live enemy is within 4 Chebyshev grid tiles (failsafe)', () => {
        const waiter = new Unit({
            id: 'unit_waiter',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 1;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement(
            [
                { col: 0, row: 0 },
                { col: 1, row: 0 },
                { col: 2, row: 0 },
            ],
            undefined,
            0,
        );

        const foe = new Unit({
            id: 'unit_foe',
            x: 4 * CELL_SIZE,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;

        waiter.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [waiter, foe] });

        expect(waiter.isInWaitLockout()).toBe(false);
        expect(waiter.movement).not.toBeNull();
    });

    it('does not clear wait lockout from enemy failsafe before min time', () => {
        const waiter = new Unit({
            id: 'unit_waiter2',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 5;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement([{ col: 0, row: 0 }, { col: 1, row: 0 }], undefined, 0);

        const foe = new Unit({
            id: 'unit_foe2',
            x: 0,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;

        waiter.update(1 / 60, { gameTime: 4.9, roundNumber: 1, units: [waiter, foe] });

        expect(waiter.isInWaitLockout()).toBe(true);
    });

    it('does not clear wait lockout from enemy failsafe when nearest enemy is 5 Chebyshev tiles away', () => {
        const waiter = new Unit({
            id: 'unit_waiter3',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 1;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement([{ col: 0, row: 0 }, { col: 1, row: 0 }], undefined, 0);

        const foe = new Unit({
            id: 'unit_foe3',
            x: 5 * CELL_SIZE,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;

        waiter.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [waiter, foe] });

        expect(waiter.isInWaitLockout()).toBe(true);
    });

    it('does not clear wait lockout from failsafe for allied units at close range', () => {
        const waiter = new Unit({
            id: 'unit_waiter4',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Waiter',
        });
        waiter.active = true;
        waiter.waitMinEndTime = 1;
        waiter.waitMaxEndTime = 10;
        waiter.setMovement([{ col: 0, row: 0 }, { col: 1, row: 0 }], undefined, 0);

        const ally = new Unit({
            id: 'unit_ally',
            x: 0,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'allied',
            ownerId: 'p2',
            characterId: 'player',
            name: 'Ally',
        });
        ally.active = true;

        waiter.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [waiter, ally] });

        expect(waiter.isInWaitLockout()).toBe(true);
    });
});
