import { describe, expect, it } from 'vitest';
import { abilityHandCardFlags, isModeStripInteractive } from './abilityHandCardFlags';

const BASE = {
    handIndex: 1,
    selectedCardIndex: 1 as number | null,
    specialActionAbilityId: null as string | null,
    cardAbilityId: 'swing',
    slotAbilityId: 'swing',
    activeHandIndex: 1,
    isMyTurn: false,
    itsAbilityId: 'swing' as string | null,
};

describe('abilityHandCardFlags', () => {
    it('greens the ITS ability during playahead, ahead of the yellow selection border', () => {
        expect(abilityHandCardFlags({ ...BASE, itsPreviewPhase: 'playing' })).toEqual({
            isSelected: false,
            isActive: true,
        });
    });

    it('greens the ITS ability during playahead before the cast is in activeAbilities', () => {
        expect(abilityHandCardFlags({
            ...BASE,
            itsPreviewPhase: 'playing',
            activeHandIndex: -1,
            selectedCardIndex: null,
        })).toEqual({
            isSelected: false,
            isActive: true,
        });
    });

    it('matches a mode-swapped slot id to the ITS ability', () => {
        expect(abilityHandCardFlags({
            ...BASE,
            itsPreviewPhase: 'playing',
            cardAbilityId: 'throw_rock',
            slotAbilityId: 'charged_rock',
            itsAbilityId: 'charged_rock',
            activeHandIndex: -1,
        })).toEqual({
            isSelected: false,
            isActive: true,
        });
    });

    it('drops the in-use green at a select pause and keeps a selected card yellow', () => {
        expect(abilityHandCardFlags({ ...BASE, itsPreviewPhase: 'paused' })).toEqual({
            isSelected: true,
            isActive: false,
        });
    });

    it('drops the in-use green when playahead freezes on a parallel-order pause', () => {
        expect(abilityHandCardFlags({
            ...BASE,
            itsPreviewPhase: 'playing',
            atParallelPause: true,
            selectedCardIndex: null,
        })).toEqual({
            isSelected: false,
            isActive: false,
        });
    });

    it('drops the in-use green when playahead reaches a done pause plane', () => {
        expect(abilityHandCardFlags({
            ...BASE,
            itsPreviewPhase: 'done',
            selectedCardIndex: null,
        })).toEqual({
            isSelected: false,
            isActive: false,
        });
    });

    it('keeps the ordinary in-use green when ITS is idle', () => {
        expect(abilityHandCardFlags({
            ...BASE,
            itsPreviewPhase: 'inactive',
            itsAbilityId: null,
            selectedCardIndex: null,
        })).toEqual({
            isSelected: false,
            isActive: true,
        });
    });

    it('does not green a different card during playahead', () => {
        expect(abilityHandCardFlags({
            ...BASE,
            handIndex: 0,
            itsPreviewPhase: 'playing',
            cardAbilityId: 'wait',
            slotAbilityId: 'wait',
            selectedCardIndex: 0,
            activeHandIndex: 1,
        })).toEqual({
            isSelected: true,
            isActive: false,
        });
    });
});

describe('isModeStripInteractive', () => {
    it('lets a swappable card toggle its mode during a preview (Combo auto-continue)', () => {
        expect(isModeStripInteractive({ isMyTurn: false, isSwapTarget: true })).toBe(true);
    });

    it('keeps the previewed card and locked cards fixed', () => {
        expect(isModeStripInteractive({ isMyTurn: false, isSwapTarget: false })).toBe(false);
    });

    it('allows toggling on the player turn', () => {
        expect(isModeStripInteractive({ isMyTurn: true, isSwapTarget: false })).toBe(true);
    });
});
