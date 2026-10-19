import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { Projectile } from '../../../game/projectiles/Projectile';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { getAbilityDisabledReason } from '../../../ui/components/abilityDisabledReason';
import { getTotalAbilityDuration } from '../../../abilities/abilityTimings';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import { ThrowKnife } from '../../0109_ThrowKnife/0109Ability';
import { ThrowRock } from '../../0107_ThrowRock/0107Ability';
import { THROW_PROJECTILE_SPEED } from '../../throwSharedTimings';
import {
    BLOOD_SHARD_DAMAGE,
    BLOOD_SHARD_HP_COST,
    BLOOD_SHARD_MAX_USES,
    BLOOD_SHARD_PROFILE,
    BLOOD_SHARD_PROJECTILE_SPEED,
    BloodShardAbility_0304,
} from './0304Ability';
import {
    BLOOD_MAGE_NODE_CORE,
    BLOOD_MAGE_NODE_SHARD,
    bloodMageTree,
} from '../../../../../researchTrees/trees/blood_mage';

const CARD_ID = BloodShardAbility_0304.id;
const TICK_DT = 0.01;
const ENEMY_DISTANCE = 150;
// Release at windupEnd, then flight time to the enemy, plus a margin.
const HIT_TICK_ADVANCE = BLOOD_SHARD_PROFILE.windupEnd + ENEMY_DISTANCE / BLOOD_SHARD_PROJECTILE_SPEED + 0.05;

function makeCaster(hp: number): Unit {
    const unit = new Unit({
        id: 'caster',
        x: 0,
        y: 0,
        hp,
        maxHp: 100,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: 'Caster',
        abilities: [CARD_ID],
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.abilityRuntime[CARD_ID] = {
        currentUses: BLOOD_SHARD_MAX_USES,
        maxUses: BLOOD_SHARD_MAX_USES,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    return unit;
}

function makeEnemy(id: string, x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'enemy_ai',
        characterId: 'enemy',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function makeEngine(units: Unit[], projectiles: Projectile[]): EngineContext {
    return {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
        addProjectile: (p: Projectile) => projectiles.push(p),
    } as unknown as EngineContext;
}

function aimTarget(distance: number): ResolvedTarget[] {
    return [{ type: 'pixel', position: { x: distance, y: 0 } }];
}

function advanceSimulation(caster: Unit, engine: EngineContext, projectiles: Projectile[], totalSeconds: number): void {
    const steps = Math.ceil(totalSeconds / TICK_DT);
    for (let i = 0; i < steps; i++) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
        for (const proj of projectiles) {
            if (!proj.active) continue;
            proj.update(TICK_DT, engine);
            proj.checkCollision(engine.units, engine.eventBus, engine.gameTime, engine);
        }
    }
}

function disabledReason(caster: Unit) {
    return getAbilityDisabledReason({
        playerUnit: caster,
        ability: BloodShardAbility_0304,
        abilityId: CARD_ID,
        currentUses: BLOOD_SHARD_MAX_USES,
        isMyTurn: true,
        allUnits: [caster],
        conditionalCancelContext: null,
    });
}

describe('BloodShardAbility_0304', () => {
    it('deals BLOOD_SHARD_DAMAGE to the first enemy hit only', () => {
        const caster = makeCaster(100);
        const front = makeEnemy('front', ENEMY_DISTANCE, 0);
        const behind = makeEnemy('behind', ENEMY_DISTANCE + 30, 0);
        const projectiles: Projectile[] = [];
        const engine = makeEngine([caster, front, behind], projectiles);

        executeUnitAbility(caster, BloodShardAbility_0304, aimTarget(ENEMY_DISTANCE), engine);
        advanceSimulation(caster, engine, projectiles, HIT_TICK_ADVANCE + 0.1);

        expect(front.hp).toBe(100 - BLOOD_SHARD_DAMAGE);
        expect(behind.hp).toBe(100);
    });

    it('pays BLOOD_SHARD_HP_COST at release, not during windup', () => {
        const caster = makeCaster(100);
        const projectiles: Projectile[] = [];
        const engine = makeEngine([caster, makeEnemy('e', ENEMY_DISTANCE, 0)], projectiles);

        executeUnitAbility(caster, BloodShardAbility_0304, aimTarget(ENEMY_DISTANCE), engine);
        advanceSimulation(caster, engine, projectiles, BLOOD_SHARD_PROFILE.windupEnd - 0.05);
        expect(caster.hp).toBe(100);
        expect(projectiles).toHaveLength(0);

        advanceSimulation(caster, engine, projectiles, 0.07);
        expect(caster.hp).toBe(100 - BLOOD_SHARD_HP_COST);
        expect(projectiles).toHaveLength(1);
    });

    it('is disabled at hp <= HP cost and castable just above it', () => {
        expect(disabledReason(makeCaster(BLOOD_SHARD_HP_COST))).toEqual({ reason_id: 'cannot_afford', resourceId: 'hp' });
        expect(disabledReason(makeCaster(BLOOD_SHARD_HP_COST + 1))).toBeNull();
    });

    it('winds up, flies and recovers faster than Throw Rock and Throw Knife', () => {
        expect(BloodShardAbility_0304.prefireTime).toBeLessThan(ThrowKnife.prefireTime);
        expect(BloodShardAbility_0304.prefireTime).toBeLessThan(ThrowRock.prefireTime);
        expect(BLOOD_SHARD_PROJECTILE_SPEED).toBeGreaterThan(THROW_PROJECTILE_SPEED);
        const shardDuration = getTotalAbilityDuration(BloodShardAbility_0304);
        expect(shardDuration).toBeLessThan(getTotalAbilityDuration(ThrowKnife));
        expect(shardDuration).toBeLessThan(getTotalAbilityDuration(ThrowRock));
    });

    it('has 2 uses that fully refill each round', () => {
        expect(BloodShardAbility_0304.maxUses).toBe(2);
        expect(BloodShardAbility_0304.recoveries).toEqual([
            { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: BLOOD_SHARD_MAX_USES },
        ]);
    });
});

describe('Blood Shard research node', () => {
    it('is a tier-11 node requiring Blood Mage Core that grants card 0304', () => {
        const node = bloodMageTree.nodes.find((n) => n.id === BLOOD_MAGE_NODE_SHARD);
        expect(node?.tier).toBe(11);
        expect(node?.prereqNodeIds).toEqual([BLOOD_MAGE_NODE_CORE]);
        expect(node?.effects).toContainEqual({ type: 'addCard', cardId: CARD_ID });
    });
});
