import type { Unit } from '../game/units/Unit';
import type { CcResistKey } from './ccTypes';

export interface UnitCcArmourState {
    /** Per-type CC duration resist; specific entry overrides `ALL`. Values 0–1 (fraction reduced). */
    durationResistPct: Partial<Record<CcResistKey, number>>;
    /** Flat seconds removed after percent scaling; specific overrides `ALL`. */
    durationFlatSec: Partial<Record<CcResistKey, number>>;
    /** Baseline hard CC threshold floor (absorbed hits before one lands). Boss default often 2. */
    hardFloor: number;
    /** When > 0, overrides the incoming hit's duration for the stun applied on CC armour break. */
    breakStunDuration: number;
    /** Extra hard CC threshold from chain resist; decays per round toward 0. */
    bonusHard: number;
    /** Qualifying absorbed hard CC attempts since the last stun that actually applied. */
    hardConsumed: number;
    /** When > 0, successful hard CCs add stacking bonus per {@link chainStackNextIncrement}. */
    chainResist: number;
    /** Apply one decay step to {@link bonusHard} every N round ends. */
    chainDecayRounds: number;
    /** Next addend when a hard CC successfully lands and {@link chainResist} is active. Serialized for checkpoint determinism. */
    chainStackNextIncrement: number;
    /** Counts round ends toward {@link chainDecayRounds} for bonus decay. */
    chainDecayRoundCounter: number;
    /** Placeholder for future soft CC gate. */
    softFloor: number;
    /** Placeholder for future soft CC bonus pool. */
    bonusSoft: number;
    /** Bumps when a hard CC is absorbed or lands (for boss HUD animation). */
    eventSerial: number;
    lastEventGameTime: number;
    lastEventKind: 'absorbed' | 'landed' | null;
}

export function createCcArmourState(): UnitCcArmourState {
    return {
        durationResistPct: {},
        durationFlatSec: {},
        hardFloor: 0,
        breakStunDuration: 0,
        bonusHard: 0,
        hardConsumed: 0,
        chainResist: 0,
        chainDecayRounds: 1,
        chainStackNextIncrement: 1,
        chainDecayRoundCounter: 0,
        softFloor: 0,
        bonusSoft: 0,
        eventSerial: 0,
        lastEventGameTime: -1,
        lastEventKind: null,
    };
}

export function getEffectiveHardCcThreshold(unit: Unit): number {
    return unit.ccArmour.hardFloor + unit.ccArmour.bonusHard;
}

/** After a hard CC actually applies a debuff: stack chain bonus, then caller resets fill. */
export function onSuccessfulHardCcLand(unit: Unit): void {
    if (unit.ccArmour.chainResist > 0) {
        unit.ccArmour.bonusHard += unit.ccArmour.chainStackNextIncrement;
        unit.ccArmour.chainStackNextIncrement += 1;
    }
}

export function recordHardCcArmourEvent(unit: Unit, kind: 'absorbed' | 'landed', gameTime: number): void {
    unit.ccArmour.eventSerial += 1;
    unit.ccArmour.lastEventKind = kind;
    unit.ccArmour.lastEventGameTime = gameTime;
}

/**
 * Decay {@link UnitCcArmourState.bonusHard} at round boundaries (host + replicas).
 * One step per tick when the decay period elapses; effective threshold never below {@link UnitCcArmourState.hardFloor}.
 */
export function tickHardCcChainDecayAtRoundEnd(unit: Unit): void {
    if (unit.ccArmour.chainDecayRounds <= 0) return;
    unit.ccArmour.chainDecayRoundCounter += 1;
    if (unit.ccArmour.chainDecayRoundCounter < unit.ccArmour.chainDecayRounds) return;
    unit.ccArmour.chainDecayRoundCounter = 0;
    if (unit.ccArmour.bonusHard > 0) {
        unit.ccArmour.bonusHard = Math.max(0, unit.ccArmour.bonusHard - 1);
    }
}

export function ccArmourStateToJSON(unit: Unit): Record<string, unknown> {
    return {
        ccDurationResistPct: { ...unit.ccArmour.durationResistPct },
        ccDurationFlatSec: { ...unit.ccArmour.durationFlatSec },
        hardCcArmourFloor: unit.ccArmour.hardFloor,
        ccArmourBreakStunDuration: unit.ccArmour.breakStunDuration,
        bonusHardCcArmour: unit.ccArmour.bonusHard,
        hardCcArmourConsumed: unit.ccArmour.hardConsumed,
        chainCcResist: unit.ccArmour.chainResist,
        chainCcDecayRounds: unit.ccArmour.chainDecayRounds,
        chainCcStackNextIncrement: unit.ccArmour.chainStackNextIncrement,
        chainCcDecayRoundCounter: unit.ccArmour.chainDecayRoundCounter,
        softCcArmourFloor: unit.ccArmour.softFloor,
        bonusSoftCcArmour: unit.ccArmour.bonusSoft,
        hardCcArmourEventSerial: unit.ccArmour.eventSerial,
        lastHardCcEventGameTime: unit.ccArmour.lastEventGameTime,
        lastHardCcEventKind: unit.ccArmour.lastEventKind,
    };
}

export function applyCcArmourStateFromJSON(unit: Unit, data: Record<string, unknown>): void {
    unit.ccArmour.durationResistPct = { ...(data.ccDurationResistPct as Partial<Record<CcResistKey, number>> | undefined) };
    unit.ccArmour.durationFlatSec = { ...(data.ccDurationFlatSec as Partial<Record<CcResistKey, number>> | undefined) };
    unit.ccArmour.hardFloor = (data.hardCcArmourFloor as number | undefined) ?? 0;
    unit.ccArmour.breakStunDuration = (data.ccArmourBreakStunDuration as number | undefined) ?? 0;
    unit.ccArmour.bonusHard = (data.bonusHardCcArmour as number | undefined) ?? 0;
    unit.ccArmour.hardConsumed = (data.hardCcArmourConsumed as number | undefined) ?? 0;
    unit.ccArmour.chainResist = (data.chainCcResist as number | undefined) ?? 0;
    unit.ccArmour.chainDecayRounds = (data.chainCcDecayRounds as number | undefined) ?? 1;
    unit.ccArmour.chainStackNextIncrement = (data.chainCcStackNextIncrement as number | undefined) ?? 1;
    unit.ccArmour.chainDecayRoundCounter = (data.chainCcDecayRoundCounter as number | undefined) ?? 0;
    unit.ccArmour.softFloor = (data.softCcArmourFloor as number | undefined) ?? 0;
    unit.ccArmour.bonusSoft = (data.bonusSoftCcArmour as number | undefined) ?? 0;
    unit.ccArmour.eventSerial = (data.hardCcArmourEventSerial as number | undefined) ?? 0;
    unit.ccArmour.lastEventGameTime = (data.lastHardCcEventGameTime as number | undefined) ?? -1;
    const ev = data.lastHardCcEventKind;
    unit.ccArmour.lastEventKind = ev === 'absorbed' || ev === 'landed' ? ev : null;
}
