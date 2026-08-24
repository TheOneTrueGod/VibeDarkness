import { describe, expect, it } from 'vitest';
import { Movement, MOVEMENT_BASE_MAX, MOVEMENT_BASE_RECOVERY_PER_ROUND } from './Movement';
import { EventBus } from '../game/EventBus';
import { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';
import { canAffordAbility } from '../abilities/Ability';
import { DodgeAbility } from '../card_defs/0101_Dodge/0101Ability';
import { ClawAbility } from '../card_defs/0111_Claw/0111Ability';
import { computePassiveBonuses } from '../../../researchTrees/passiveBonuses';
import {
    EARTH_ATTUNED_LEVELS,
    EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK,
    EARTH_NODE_EARTH_ATTUNED,
    EARTH_TREE_ID,
} from '../../../researchTrees/trees/earth';

function makeUnit(id: string): Unit {
    return new Unit({
        id,
        x: 0,
        y: 0,
        hp: 100,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: id,
    });
}

/** Minimal engine context for testing movement recovery without a full GameEngine. */
function makeEngineContext(terrainSlowStacks = 0): EngineContext {
    return {
        terrainLayers: {
            getGroundMovementRecoverySlowStacks: () => terrainSlowStacks,
        },
    } as unknown as EngineContext;
}

describe('Movement resource', () => {
    it('starts at base current and max', () => {
        const movement = new Movement();
        expect(movement.current).toBe(MOVEMENT_BASE_MAX);
        expect(movement.max).toBe(MOVEMENT_BASE_MAX);
        expect(movement.id).toBe('movement_points');
    });

    it('subscribe/unsubscribe are no-ops', () => {
        const eventBus = new EventBus();
        const unit = makeUnit('u1');
        const movement = new Movement();
        unit.attachResource(movement, eventBus);
        expect(movement.current).toBe(MOVEMENT_BASE_MAX);
        unit.detachAllResources(eventBus);
        expect(movement.current).toBe(MOVEMENT_BASE_MAX);
    });
});

describe('Movement recovery at round start', () => {
    it('recovers the base amount per round', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());

        unit.onRoundStart(1, makeEngineContext());
        expect(movement.current).toBe(MOVEMENT_BASE_RECOVERY_PER_ROUND);
    });

    it('is capped at max', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 1;
        unit.attachResource(movement, new EventBus());

        unit.onRoundStart(1, makeEngineContext());
        expect(movement.current).toBe(MOVEMENT_BASE_MAX);
    });

    it('stays at max when already full', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = MOVEMENT_BASE_MAX;
        unit.attachResource(movement, new EventBus());

        unit.onRoundStart(1, makeEngineContext());
        expect(movement.current).toBe(MOVEMENT_BASE_MAX);
    });

    it('1 slow stack reduces recovery to 1', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());
        unit.movementRecoverySlowStacks = 1;

        unit.onRoundStart(1, makeEngineContext());
        expect(movement.current).toBe(MOVEMENT_BASE_RECOVERY_PER_ROUND - 1);
    });

    it('2 slow stacks reduce recovery to 0', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());
        unit.movementRecoverySlowStacks = MOVEMENT_BASE_RECOVERY_PER_ROUND;

        unit.onRoundStart(1, makeEngineContext());
        expect(movement.current).toBe(0); // 2 - 2 = 0
    });

    it('slow stacks beyond recovery are floored at 0, not negative', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());
        unit.movementRecoverySlowStacks = 5;

        unit.onRoundStart(1, makeEngineContext());
        expect(movement.current).toBe(0);
    });

    it('terrain slow stacks are counted via engine context', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());

        unit.onRoundStart(1, makeEngineContext(1)); // 1 terrain slow stack
        expect(movement.current).toBe(MOVEMENT_BASE_RECOVERY_PER_ROUND - 1);
    });

    it('spell slow stacks and terrain slow stacks stack additively', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());
        unit.movementRecoverySlowStacks = 1; // spell slow

        unit.onRoundStart(1, makeEngineContext(1)); // +1 terrain slow
        expect(movement.current).toBe(0); // 2 - 1 - 1 = 0
    });

    it('round_start fires on first engine tick', () => {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: TINY_BATTLE_PLAYER_ID });
        const unit = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 200,
            y: 200,
            abilities: [],
        });
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, engine.eventBus);

        engine.stepSimulationFixedTicks(1); // round_start fires
        expect(movement.current).toBe(MOVEMENT_BASE_RECOVERY_PER_ROUND);
        engine.destroy();
    });
});

describe('Earth Attuned movement passives', () => {
    const attunedMax = MOVEMENT_BASE_MAX + EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK * EARTH_ATTUNED_LEVELS;
    const attunedRegen =
        MOVEMENT_BASE_RECOVERY_PER_ROUND + EARTH_ATTUNED_MOVEMENT_ADD_PER_RANK * EARTH_ATTUNED_LEVELS;

    function makeAttunedUnit(): Unit {
        const unit = makeUnit('attuned');
        unit.passiveBonuses = computePassiveBonuses(
            { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_ATTUNED] },
            { [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_ATTUNED]: EARTH_ATTUNED_LEVELS } },
        );
        return unit;
    }

    it('raises max and starting current by both ranks on attach', () => {
        const unit = makeAttunedUnit();
        const movement = new Movement();
        unit.attachResource(movement, new EventBus());
        expect(unit.getMaxMovement()).toBe(attunedMax);
        expect(movement.max).toBe(attunedMax);
        expect(movement.current).toBe(attunedMax);
    });

    it('recovers the attuned amount per round', () => {
        const unit = makeAttunedUnit();
        const movement = new Movement();
        unit.attachResource(movement, new EventBus());
        movement.current = 0;

        unit.onRoundStart(1, makeEngineContext());
        expect(unit.getMovementRecoveryPerRound()).toBe(attunedRegen);
        expect(movement.current).toBe(attunedRegen);
    });
});

describe('Movement cost for abilities', () => {
    it('Dodge can be afforded when movement >= 1', () => {
        const unit = makeUnit('u1');
        const movement = new Movement(); // starts at 2
        unit.attachResource(movement, new EventBus());
        expect(canAffordAbility(unit, DodgeAbility)).toBe(true);
    });

    it('Dodge cannot be afforded when movement = 0', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());
        expect(canAffordAbility(unit, DodgeAbility)).toBe(false);
    });

    it('Claw cannot be afforded when movement = 0', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 0;
        unit.attachResource(movement, new EventBus());
        expect(canAffordAbility(unit, ClawAbility)).toBe(false);
    });

    it('Claw can be afforded when movement = 1', () => {
        const unit = makeUnit('u1');
        const movement = new Movement();
        movement.current = 1;
        unit.attachResource(movement, new EventBus());
        expect(canAffordAbility(unit, ClawAbility)).toBe(true);
    });
});
