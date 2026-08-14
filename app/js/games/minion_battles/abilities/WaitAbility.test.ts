import { describe, expect, it } from 'vitest';
import { OrderManager } from '../game/managers/OrderManager';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import type { EngineContext } from '../game/EngineContext';
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import {
    WAIT_ABILITY_MODE_FAR,
    WAIT_ABILITY_MODE_MEDIUM,
    WAIT_ABILITY_MODE_SHORT,
    WAIT_DURATION_FAR_MAX_SEC,
    WAIT_DURATION_FAR_MIN_SEC,
    WAIT_DURATION_MEDIUM_SEC,
    WAIT_DURATION_SHORT_SEC,
    resolveWaitOrderWindow,
    waitTimingsForMode,
} from './WaitAbility';

function makePlayer(id = 'unit_waiter'): Unit {
    const unit = new Unit({
        id,
        x: 0,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'Waiter',
        abilities: [],
    });
    unit.active = true;
    return unit;
}

function makeOrderManager(units: Unit[], gameTime = 0): OrderManager {
    const byId = new Map(units.map((u) => [u.id, u]));
    const ctx = {
        gameTick: 0,
        gameTime,
        getUnit: (id: string) => byId.get(id),
        units,
        mixOrderFingerprint: () => {},
        cancelActiveAbility: () => {},
        eventBus: new EventBus(),
    } as unknown as EngineContext;
    return new OrderManager(ctx, () => {});
}

describe('resolveWaitOrderWindow', () => {
    it('maps short / medium / far to the configured durations', () => {
        expect(resolveWaitOrderWindow(WAIT_ABILITY_MODE_SHORT)).toEqual({
            minSec: WAIT_DURATION_SHORT_SEC,
            maxSec: WAIT_DURATION_SHORT_SEC,
        });
        expect(resolveWaitOrderWindow(WAIT_ABILITY_MODE_MEDIUM)).toEqual({
            minSec: WAIT_DURATION_MEDIUM_SEC,
            maxSec: WAIT_DURATION_MEDIUM_SEC,
        });
        expect(resolveWaitOrderWindow(WAIT_ABILITY_MODE_FAR)).toEqual({
            minSec: WAIT_DURATION_FAR_MIN_SEC,
            maxSec: WAIT_DURATION_FAR_MAX_SEC,
        });
    });

    it('defaults unknown modes to short', () => {
        expect(resolveWaitOrderWindow(undefined)).toEqual({
            minSec: WAIT_DURATION_SHORT_SEC,
            maxSec: WAIT_DURATION_SHORT_SEC,
        });
    });

    it('builds wait timings whose end matches the mode max', () => {
        const shortTiming = waitTimingsForMode(WAIT_ABILITY_MODE_SHORT)[0];
        const farTiming = waitTimingsForMode(WAIT_ABILITY_MODE_FAR)[0];
        expect(shortTiming && 'end' in shortTiming ? shortTiming.end : undefined).toBe(WAIT_DURATION_SHORT_SEC);
        expect(farTiming && 'end' in farTiming ? farTiming.end : undefined).toBe(WAIT_DURATION_FAR_MAX_SEC);
    });
});

describe('wait order modes', () => {
    it('applies a short wait lockout of exactly 1 second', () => {
        const player = makePlayer();
        const mgr = makeOrderManager([player], 5);
        mgr.applyOrderLogic({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            abilityMode: WAIT_ABILITY_MODE_SHORT,
            endTurn: true,
        });

        expect(player.waitAbilityMode).toBe(WAIT_ABILITY_MODE_SHORT);
        expect(player.waitMinEndTime).toBe(5 + WAIT_DURATION_SHORT_SEC);
        expect(player.waitMaxEndTime).toBe(5 + WAIT_DURATION_SHORT_SEC);
    });

    it('applies a short wait lockout by default when abilityMode is omitted', () => {
        const player = makePlayer();
        const mgr = makeOrderManager([player], 4);
        mgr.applyOrderLogic({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
        });

        expect(player.waitAbilityMode).toBe(WAIT_ABILITY_MODE_SHORT);
        expect(player.waitMinEndTime).toBe(4 + WAIT_DURATION_SHORT_SEC);
        expect(player.waitMaxEndTime).toBe(4 + WAIT_DURATION_SHORT_SEC);
    });

    it('applies a medium wait lockout of exactly 2 seconds', () => {
        const player = makePlayer();
        const mgr = makeOrderManager([player], 3);
        mgr.applyOrderLogic({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            abilityMode: WAIT_ABILITY_MODE_MEDIUM,
            endTurn: true,
        });

        expect(player.waitAbilityMode).toBe(WAIT_ABILITY_MODE_MEDIUM);
        expect(player.waitMinEndTime).toBe(3 + WAIT_DURATION_MEDIUM_SEC);
        expect(player.waitMaxEndTime).toBe(3 + WAIT_DURATION_MEDIUM_SEC);
    });

    it('applies a far wait lockout with a 1s minimum and long safety max', () => {
        const player = makePlayer();
        const mgr = makeOrderManager([player], 2);
        mgr.applyOrderLogic({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            abilityMode: WAIT_ABILITY_MODE_FAR,
            endTurn: true,
        });

        expect(player.waitAbilityMode).toBe(WAIT_ABILITY_MODE_FAR);
        expect(player.waitMinEndTime).toBe(2 + WAIT_DURATION_FAR_MIN_SEC);
        expect(player.waitMaxEndTime).toBe(2 + WAIT_DURATION_FAR_MAX_SEC);
    });

    it('ends a far wait after the minimum when movement completes', () => {
        const player = makePlayer();
        player.waitAbilityMode = WAIT_ABILITY_MODE_FAR;
        player.waitMinEndTime = 1;
        player.waitMaxEndTime = 100;
        // No movement / walk intent → already at destination.

        player.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [player] });

        expect(player.isInWaitLockout()).toBe(false);
        expect(player.waitAbilityMode).toBeNull();
    });

    it('does not end a far wait on enemy proximity failsafe', () => {
        const player = makePlayer();
        player.waitAbilityMode = WAIT_ABILITY_MODE_FAR;
        player.waitMinEndTime = 1;
        player.waitMaxEndTime = 100;
        player.setMovement(
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

        player.update(1 / 60, { gameTime: 1, roundNumber: 1, units: [player, foe] });

        expect(player.isInWaitLockout()).toBe(true);
        expect(player.waitAbilityMode).toBe(WAIT_ABILITY_MODE_FAR);
    });

    it('keeps a far wait active before the minimum even with no remaining path', () => {
        const player = makePlayer();
        player.waitAbilityMode = WAIT_ABILITY_MODE_FAR;
        player.waitMinEndTime = 5;
        player.waitMaxEndTime = 100;

        player.update(1 / 60, { gameTime: 4.9, roundNumber: 1, units: [player] });

        expect(player.isInWaitLockout()).toBe(true);
    });
});

describe('far wait damage end', () => {
    it('clears far wait after min time when an enemy deals damage', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        const player = makePlayer('unit_far_wait');
        const foe = new Unit({
            id: 'unit_foe_dmg',
            x: CELL_SIZE,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;
        engine.addUnit(player);
        engine.addUnit(foe);

        engine.gameTime = 10;
        player.waitAbilityMode = WAIT_ABILITY_MODE_FAR;
        player.waitMinEndTime = 9;
        player.waitMaxEndTime = 100;

        player.takeDamage(5, foe.id, engine.eventBus);

        expect(player.isInWaitLockout()).toBe(false);
        expect(player.waitAbilityMode).toBeNull();
        engine.destroy();
    });

    it('does not clear far wait from enemy damage before the minimum', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        const player = makePlayer('unit_far_wait_early');
        const foe = new Unit({
            id: 'unit_foe_early',
            x: CELL_SIZE,
            y: 0,
            hp: 50,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'enemy_grunt',
            name: 'Foe',
        });
        foe.active = true;
        engine.addUnit(player);
        engine.addUnit(foe);

        engine.gameTime = 10;
        player.waitAbilityMode = WAIT_ABILITY_MODE_FAR;
        player.waitMinEndTime = 11;
        player.waitMaxEndTime = 100;

        player.takeDamage(5, foe.id, engine.eventBus);

        expect(player.isInWaitLockout()).toBe(true);
        expect(player.waitAbilityMode).toBe(WAIT_ABILITY_MODE_FAR);
        engine.destroy();
    });
});
