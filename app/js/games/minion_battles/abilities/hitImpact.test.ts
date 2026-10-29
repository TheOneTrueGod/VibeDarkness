/**
 * Unit strikes through `tryDamageOrBlock` on a full engine tick (`stepSimulationFixedTicks`
 * / `fixedUpdate`). Not a hand-passed `dt`.
 */
import { describe, expect, it } from 'vitest';
import { AbilityState, type AbilityStatic } from './Ability';
import { AbilityPhase } from './abilityTimings';
import { registerAbilityForTest } from './AbilityRegistry';
import { CastBehaviours } from './CastBehaviours';
import { defineAbility } from './defineAbility';
import { createDirectionalBlockingArc } from './shieldHelpers';
import { HIT_STOP_BUFF_TYPE } from '../buffs/HitStopBuff';
import { HIT_STUN_BUFF_TYPE, hitPauseTicks } from '../buffs/hitPause';
import { ShieldBuff } from '../buffs/ShieldBuff';
import { GameEngine } from '../game/GameEngine';
import type { ResolvedTarget } from '../game/types';
import { Unit } from '../game/units/Unit';
import { executeUnitAbility } from '../game/units/unitAbilityLifecycle';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import { DEFAULT_HIT_STOP_SECONDS, DEFAULT_HIT_STUN_SECONDS } from '../game/time/timeConstants';
import { perpendicularSwingHitbox } from '../hitboxes';
import { LOCK_ON_TETHER_EXTRA } from './targetLockTracking';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { buildTinyBattleEngine, TINY_BATTLE_PLAYER_ID } from '../testing/harness/buildTinyBattleEngine';

/** Outlasts a tempo-1 hitstun, so the victim's cast is still running when the freeze ends. */
const VICTIM_CAST_SECONDS = 1;
/** Swing window. Still open across the hitch so the attacker is mid-cast while frozen. */
const STRIKE_WINDOW_SECONDS = 1;
/** Facing-block window. Covers the strike tick (elapsed is one `FIXED_DT`). */
const BLOCK_SECONDS = 1;
const STRIKE_DAMAGE = 10;
const VICTIM_MAX_HP = 100;
const STRIKE_SWING_RANGE = CELL_SIZE;
const STRIKE_SWING_LENGTH = CELL_SIZE * 2;
const STRIKE_THICKNESS = CELL_SIZE / 2;
/** `MeleeAttack` treats `<= 0` as the first tick of the window. */
const IMPACT_ON_FIRST_TICK = 0;
const NO_SLIDE_DISTANCE = 0;
/** Authored hitstop of 0 turns that side off. */
const NO_HITSTOP_SECONDS = 0;
const SHIELD_HP = 30;
const SHIELD_DRAIN_PER_SECOND = 0;
const BATTLE_GRID_CELLS = 8;
const ATTACKER_COL = 2;
const VICTIM_COL = 4;
const UNIT_ROW = 3;
/** Centers are two cells apart, inside the swing's tether (`maxRange + LOCK_ON_TETHER_EXTRA`). */
const STRIKE_CENTER_GAP = (VICTIM_COL - ATTACKER_COL) * CELL_SIZE;
const STRIKE_TETHER = STRIKE_SWING_RANGE + DEFAULT_UNIT_RADIUS + LOCK_ON_TETHER_EXTRA;
const NO_AI_TREE = 'none';

const VICTIM_CAST_ID = 'test_hit_impact_victim_cast';
const STRIKE_ID = 'test_hit_impact_strike';
const NO_HITSTOP_STRIKE_ID = 'test_hit_impact_strike_no_hitstop';
const IFRAME_CAST_ID = 'test_hit_impact_iframe';
const BLOCK_CAST_ID = 'test_hit_impact_block';

const VictimCast = defineAbility({
    id: VICTIM_CAST_ID,
    name: 'Victim Cast',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: VICTIM_CAST_SECONDS, abilityPhase: AbilityPhase.Active }],
    getTooltipText: () => ['Victim cast'],
    getRange: () => ({ minRange: 0, maxRange: STRIKE_TETHER }),
});

const IFrameCast = defineAbility({
    id: IFRAME_CAST_ID,
    name: 'IFrame Cast',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'active', start: 0, end: VICTIM_CAST_SECONDS, abilityPhase: AbilityPhase.Active }],
    getAbilityStates: () => [{ state: AbilityState.IFRAMES }],
    getTooltipText: () => ['IFrame cast'],
    getRange: () => ({ minRange: 0, maxRange: STRIKE_TETHER }),
});

const BlockCast = defineAbility({
    id: BLOCK_CAST_ID,
    name: 'Facing Block',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [{ id: 'block', start: 0, end: BLOCK_SECONDS, abilityPhase: AbilityPhase.Active }],
    getBlockingArc: createDirectionalBlockingArc({ blockDuration: BLOCK_SECONDS }),
    getTooltipText: () => ['Facing block'],
    getRange: () => ({ minRange: 0, maxRange: STRIKE_TETHER }),
});

function makeStrike(id: string, hitstopSeconds?: number) {
    return defineAbility({
        id,
        name: id,
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        prefireTime: 0,
        targets: [],
        ...(hitstopSeconds !== undefined ? { hitImpact: { hitstopSeconds } } : {}),
        abilityTimings: [{
            id: 'swing',
            start: 0,
            end: STRIKE_WINDOW_SECONDS,
            abilityPhase: AbilityPhase.Active,
            behaviour: CastBehaviours.MeleeAttack()
                .withHitbox(perpendicularSwingHitbox(STRIKE_SWING_RANGE, STRIKE_SWING_LENGTH, STRIKE_THICKNESS))
                .withImpactAt(IMPACT_ON_FIRST_TICK)
                .withDamage(STRIKE_DAMAGE)
                .withSlide({ forwardDistance: NO_SLIDE_DISTANCE, backwardDistance: NO_SLIDE_DISTANCE }),
        }],
        getTooltipText: () => [id],
        getRange: () => ({ minRange: 0, maxRange: STRIKE_SWING_RANGE + DEFAULT_UNIT_RADIUS }),
    });
}

const Strike = makeStrike(STRIKE_ID);
const NoHitstopStrike = makeStrike(NO_HITSTOP_STRIKE_ID, NO_HITSTOP_SECONDS);

registerAbilityForTest(VictimCast);
registerAbilityForTest(IFrameCast);
registerAbilityForTest(BlockCast);
registerAbilityForTest(Strike);
registerAbilityForTest(NoHitstopStrike);

function cellCenter(index: number): number {
    return index * CELL_SIZE + CELL_SIZE / 2;
}

function makeUnit(
    id: string,
    x: number,
    y: number,
    teamId: 'player' | 'enemy',
    ownerId: string,
): Unit {
    const unit = new Unit({
        id,
        x,
        y,
        hp: VICTIM_MAX_HP,
        maxHp: VICTIM_MAX_HP,
        speed: 0,
        teamId,
        ownerId,
        characterId: 'test',
        name: id,
        abilities: [],
        unitAITreeId: NO_AI_TREE,
        radius: DEFAULT_UNIT_RADIUS,
    });
    unit.moveJitter = 0;
    return unit;
}

interface Battle {
    engine: GameEngine;
    attacker: Unit;
    victim: Unit;
}

function makeBattle(): Battle {
    const engine = buildTinyBattleEngine({
        gridW: BATTLE_GRID_CELLS,
        gridH: BATTLE_GRID_CELLS,
        cellSize: CELL_SIZE,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
    });
    // A living player-controlled hero. With none, defeat fires at the end of tick 1 and later ticks do not run.
    const attacker = makeUnit(
        'attacker',
        cellCenter(ATTACKER_COL),
        cellCenter(UNIT_ROW),
        'player',
        TINY_BATTLE_PLAYER_ID,
    );
    const victim = makeUnit('victim', cellCenter(VICTIM_COL), cellCenter(UNIT_ROW), 'enemy', 'ai');
    engine.addUnit(attacker, 'initialGameSpawn');
    engine.addUnit(victim, 'initialGameSpawn');
    return { engine, attacker, victim };
}

function cast(unit: Unit, ability: AbilityStatic, engine: GameEngine, targets: ResolvedTarget[]): void {
    unit.abilities = [...unit.abilities, ability.id];
    unit.abilityRuntime[ability.id] = {
        currentUses: 1,
        maxUses: 1,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    executeUnitAbility(unit, ability, targets, engine);
}

function activeIds(unit: Unit): string[] {
    return unit.activeAbilities.map((active) => active.abilityId);
}

/**
 * Ticks after the strike where `localTime` stays put. The strike tick itself already
 * advanced the clock; the pause freezes the ticks that follow.
 */
function frozenTicksWhile(unit: Unit, engine: GameEngine, steps: number): number {
    const start = unit.localTime;
    let frozen = 0;
    for (let i = 0; i < steps; i++) {
        engine.stepSimulationFixedTicks(1);
        if (unit.localTime !== start) break;
        frozen++;
    }
    return frozen;
}

describe('tryDamageOrBlock strike pauses', () => {
    it('a tempo-1 melee strike freezes the attacker for hitstop and the victim for hitstun, and the cast continues', () => {
        expect(STRIKE_CENTER_GAP).toBeLessThanOrEqual(STRIKE_TETHER);
        const { engine, attacker, victim } = makeBattle();
        try {
            cast(victim, VictimCast, engine, []);
            cast(attacker, Strike, engine, [{ type: 'unit', unitId: victim.id }]);
            expect(activeIds(victim)).toEqual([VICTIM_CAST_ID]);

            engine.stepSimulationFixedTicks(1);
            expect(victim.hp).toBe(VICTIM_MAX_HP - STRIKE_DAMAGE);
            expect(attacker.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(true);
            expect(victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(true);
            expect(engine.worldPace).toBe(1);

            const attackerAtHit = attacker.localTime;
            const victimAtHit = victim.localTime;
            const stopTicks = hitPauseTicks(DEFAULT_HIT_STOP_SECONDS, 1);
            const stunTicks = hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1);
            let attackerFrozen = 0;
            for (let i = 0; i < stunTicks; i++) {
                engine.stepSimulationFixedTicks(1);
                if (attacker.localTime === attackerAtHit) attackerFrozen++;
                expect(victim.localTime).toBe(victimAtHit);
                expect(activeIds(victim)).toEqual([VICTIM_CAST_ID]);
            }
            expect(attackerFrozen).toBe(stopTicks);

            engine.stepSimulationFixedTicks(1);
            expect(victim.localTime).toBeGreaterThan(victimAtHit);
            expect(attacker.localTime).toBeGreaterThan(attackerAtHit);
            expect(activeIds(victim)).toEqual([VICTIM_CAST_ID]);
            expect(engine.worldPace).toBe(1);
        } finally {
            engine.destroy();
        }
    });

    it('a shield-absorbed hit still pauses both bodies', () => {
        const { engine, attacker, victim } = makeBattle();
        try {
            cast(victim, VictimCast, engine, []);
            victim.addBuff(new ShieldBuff(SHIELD_HP, SHIELD_DRAIN_PER_SECOND), engine.gameTime, engine.roundNumber);
            cast(attacker, Strike, engine, [{ type: 'unit', unitId: victim.id }]);

            engine.stepSimulationFixedTicks(1);
            expect(victim.hp).toBe(VICTIM_MAX_HP);
            expect(attacker.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(true);
            expect(victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(true);
            expect(activeIds(victim)).toEqual([VICTIM_CAST_ID]);
            expect(frozenTicksWhile(victim, engine, hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1))).toBe(
                hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1),
            );
        } finally {
            engine.destroy();
        }
    });

    it('an iFrame miss and a facing block apply neither buff', () => {
        const iframe = makeBattle();
        try {
            cast(iframe.victim, IFrameCast, iframe.engine, []);
            cast(iframe.attacker, Strike, iframe.engine, [{ type: 'unit', unitId: iframe.victim.id }]);
            iframe.engine.stepSimulationFixedTicks(1);
            expect(iframe.victim.hp).toBe(VICTIM_MAX_HP);
            expect(iframe.attacker.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(false);
            expect(iframe.victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(false);
        } finally {
            iframe.engine.destroy();
        }

        const blocked = makeBattle();
        try {
            cast(blocked.victim, BlockCast, blocked.engine, [{
                type: 'pixel',
                position: { x: blocked.attacker.x, y: blocked.attacker.y },
            }]);
            cast(blocked.attacker, Strike, blocked.engine, [{ type: 'unit', unitId: blocked.victim.id }]);
            blocked.engine.stepSimulationFixedTicks(1);
            expect(blocked.victim.hp).toBe(VICTIM_MAX_HP);
            expect(blocked.attacker.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(false);
            expect(blocked.victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(false);
        } finally {
            blocked.engine.destroy();
        }
    });

    it('hitstopSeconds 0 skips the attacker pause and still stuns the victim', () => {
        const { engine, attacker, victim } = makeBattle();
        try {
            cast(victim, VictimCast, engine, []);
            cast(attacker, NoHitstopStrike, engine, [{ type: 'unit', unitId: victim.id }]);

            engine.stepSimulationFixedTicks(1);
            expect(victim.hp).toBe(VICTIM_MAX_HP - STRIKE_DAMAGE);
            expect(attacker.hasBuff(HIT_STOP_BUFF_TYPE)).toBe(false);
            expect(victim.hasBuff(HIT_STUN_BUFF_TYPE)).toBe(true);

            const attackerAtHit = attacker.localTime;
            const victimAtHit = victim.localTime;
            const stunTicks = hitPauseTicks(DEFAULT_HIT_STUN_SECONDS, 1);
            for (let i = 0; i < stunTicks; i++) {
                engine.stepSimulationFixedTicks(1);
                expect(attacker.localTime).toBeGreaterThan(attackerAtHit);
                expect(victim.localTime).toBe(victimAtHit);
                expect(activeIds(victim)).toEqual([VICTIM_CAST_ID]);
            }
            engine.stepSimulationFixedTicks(1);
            expect(victim.localTime).toBeGreaterThan(victimAtHit);
            expect(activeIds(victim)).toEqual([VICTIM_CAST_ID]);
        } finally {
            engine.destroy();
        }
    });
});
