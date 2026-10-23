import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARACTER_MAX_HUNGER } from './characterHunger';
import {
    HUNGER_PENALTY_TIERS,
    applyFightStartHunger,
    describeHungerPenalty,
    getHungerPenalty,
} from './hungerHealth';

const MAX = DEFAULT_CHARACTER_MAX_HUNGER;
const BASE_HP = 200;

function makeUnit() {
    return { maxHp: BASE_HP, hp: BASE_HP, hungerPenalty: 0 };
}

describe('getHungerPenalty', () => {
    it('has no penalty at full hunger', () => {
        expect(getHungerPenalty(MAX, MAX)).toBe(0);
    });

    it('has no penalty at exactly 15%', () => {
        expect(getHungerPenalty(15, MAX)).toBe(0);
    });

    it('is -25% just below 15%', () => {
        expect(getHungerPenalty(14.9, MAX)).toBe(0.25);
    });

    it('is -25% at 1 hunger', () => {
        expect(getHungerPenalty(1, MAX)).toBe(0.25);
    });

    it('is -50% at 0 hunger', () => {
        expect(getHungerPenalty(0, MAX)).toBe(0.5);
    });

    it('scales the 15% threshold with a researched max hunger', () => {
        const researchedMax = 200;
        expect(getHungerPenalty(30, researchedMax)).toBe(0);
        expect(getHungerPenalty(29, researchedMax)).toBe(0.25);
        expect(getHungerPenalty(0, researchedMax)).toBe(0.5);
    });

    it('is ordered most severe first so the lookup stays a first-match scan', () => {
        const penalties = HUNGER_PENALTY_TIERS.map((t) => t.maxHpPenalty);
        expect(penalties).toEqual([...penalties].sort((a, b) => b - a));
    });
});

describe('describeHungerPenalty', () => {
    it('names the tiers for the in-battle panel', () => {
        expect(describeHungerPenalty(0.25)).toBe('Hungry: −25% max health');
        expect(describeHungerPenalty(0.5)).toBe('Starving: −50% max health');
        expect(describeHungerPenalty(0)).toBeNull();
    });
});

describe('applyFightStartHunger', () => {
    it('leaves a well-fed unit untouched', () => {
        const unit = makeUnit();
        applyFightStartHunger(unit, MAX, MAX);
        expect(unit).toEqual({ maxHp: BASE_HP, hp: BASE_HP, hungerPenalty: 0 });
    });

    it('lowers maxHp and hp by 25% below the threshold', () => {
        const unit = makeUnit();
        applyFightStartHunger(unit, 10, MAX);
        expect(unit.maxHp).toBe(150);
        expect(unit.hp).toBe(150);
        expect(unit.hungerPenalty).toBe(0.25);
    });

    it('lowers maxHp and hp by 50% at 0 hunger', () => {
        const unit = makeUnit();
        applyFightStartHunger(unit, 0, MAX);
        expect(unit.maxHp).toBe(100);
        expect(unit.hp).toBe(100);
        expect(unit.hungerPenalty).toBe(0.5);
    });

    it('rounds and never drops below 1 max health', () => {
        const unit = { maxHp: 1, hp: 1, hungerPenalty: 0 };
        applyFightStartHunger(unit, 0, MAX);
        expect(unit.maxHp).toBe(1);
        expect(unit.hp).toBe(1);
    });
});
