import { describe, it, expect } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';
import { ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS } from '../gameConstants';
import {
    getEndedEarlyPreviewStop,
    isAtMissingPickDecision,
    isITSPreviewComplete,
    isPreviewCastConditionalCancelPaused,
    isPreviewCastInstance,
    shouldAutoCommitItsPreview,
} from './isITSPreviewComplete';

const DOUBLE_PUNCH_ABILITY_ID = '0116';

function buildPreviewEngine() {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({
        gridW: 8,
        gridH: 8,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });
    const x = 4 * CELL_SIZE + CELL_SIZE / 2;
    const y = 4 * CELL_SIZE + CELL_SIZE / 2;
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x,
        y,
        abilities: [DOUBLE_PUNCH_ABILITY_ID],
    });
    engine.isSequentialTargetingPreview = true;
    engine.sequentialTargetingPreviewCast = {
        unitId: player.id,
        abilityId: DOUBLE_PUNCH_ABILITY_ID,
        startRound: engine.roundNumber, beganAtGameTime: engine.gameTime,
    };
    return { engine, player };
}

describe('isITSPreviewComplete', () => {
    it('returns false when not in ITS preview', () => {
        const { engine } = buildPreviewEngine();
        engine.isSequentialTargetingPreview = false;
        engine.sequentialTargetingPreviewCast = null;
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns false while waitingForTargetInput is set', () => {
        const { engine } = buildPreviewEngine();
        engine.waitingForTargetInput = {
            label: 'Target 1',
            unitId: engine.sequentialTargetingPreviewCast!.unitId,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
        };
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns false while preview cast is still active', () => {
        const { engine, player } = buildPreviewEngine();
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
        }];
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns false when preview order is queued but the cast has not started yet (lobby 1EFEAD)', () => {
        const { engine, player } = buildPreviewEngine();
        engine.state.orderMgr.pendingOrders.push({
            gameTick: engine.gameTick + 1,
            order: {
                unitId: player.id,
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                targets: [],
                endTurn: true,
            },
        });
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns true when preview cast leaves activeAbilities', () => {
        const { engine, player } = buildPreviewEngine();
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
        }];
        player.activeAbilities = [];
        expect(isITSPreviewComplete(engine)).toBe(true);
        engine.destroy();
    });

    it('returns true when preview cast has conditionalCancelPaused', () => {
        const { engine, player } = buildPreviewEngine();
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
        }];
        expect(isITSPreviewComplete(engine)).toBe(true);
        expect(isPreviewCastConditionalCancelPaused(engine)).toBe(true);
        engine.destroy();
    });

    it('returns false when round advances while preview cast is still active (lobby 10EA88)', () => {
        const { engine, player } = buildPreviewEngine();
        const startRound = engine.roundNumber;
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startRound,            beganAtGameTime: engine.gameTime,
        };
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
            targetsByLabel: {},
        }];
        engine.roundNumber = startRound + 1;
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    describe('ended-early preview cast', () => {
        function applyKnockback(player: ReturnType<typeof buildPreviewEngine>['player']): void {
            player.knockback = {
                knockbackVector: { x: 30, y: 0 },
                knockbackAirTime: 0.3,
                knockbackSlideTime: 0.1,
                knockbackSource: { unitId: 'thornbinder', abilityId: '0008' },
                knockbackElapsed: 0,
            };
        }

        function endEarly(engine: ReturnType<typeof buildPreviewEngine>['engine'], atTick: number): void {
            engine.waitingForOrders = null;
            engine.sequentialTargetingPreviewCast!.endedEarly = { atTick, reason: 'interrupted' };
        }

        it('is not complete while the caster is in knockback, even though the cast left activeAbilities', () => {
            const { engine, player } = buildPreviewEngine();
            player.activeAbilities = [];
            applyKnockback(player);
            engine.gameTick = 10;
            endEarly(engine, 8);
            expect(getEndedEarlyPreviewStop(engine)).toBeNull();
            expect(isITSPreviewComplete(engine)).toBe(false);
            engine.destroy();
        });

        it('stops with caster_ready once the caster can act again', () => {
            const { engine, player } = buildPreviewEngine();
            player.activeAbilities = [];
            applyKnockback(player);
            engine.gameTick = 20;
            endEarly(engine, 8);
            expect(isITSPreviewComplete(engine)).toBe(false);

            player.knockback = null;
            expect(getEndedEarlyPreviewStop(engine)).toBe('caster_ready');
            expect(isITSPreviewComplete(engine)).toBe(true);
            engine.destroy();
        });

        it('stops at the playahead cap while the caster is still stunned', () => {
            const { engine, player } = buildPreviewEngine();
            player.activeAbilities = [];
            applyKnockback(player);
            endEarly(engine, 5);

            engine.gameTick = 5 + ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS - 1;
            expect(getEndedEarlyPreviewStop(engine)).toBeNull();
            expect(isITSPreviewComplete(engine)).toBe(false);

            engine.gameTick = 5 + ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS;
            expect(getEndedEarlyPreviewStop(engine)).toBe('cap');
            expect(isITSPreviewComplete(engine)).toBe(true);
            engine.destroy();
        });

        it('is complete when the caster dies', () => {
            const { engine, player } = buildPreviewEngine();
            player.activeAbilities = [];
            applyKnockback(player);
            engine.gameTick = 10;
            endEarly(engine, 8);
            player.hp = 0;
            expect(getEndedEarlyPreviewStop(engine)).toBe('caster_died');
            expect(isITSPreviewComplete(engine)).toBe(true);
            engine.destroy();
        });

        it('is complete on a frozen parallel pause (waitingForOrders set)', () => {
            const { engine, player } = buildPreviewEngine();
            player.activeAbilities = [];
            applyKnockback(player);
            engine.gameTick = 10;
            endEarly(engine, 8);
            engine.waitingForOrders = { waiters: [], atTick: engine.gameTick };
            expect(getEndedEarlyPreviewStop(engine)).toBe('parallel_pause');
            expect(isITSPreviewComplete(engine)).toBe(true);
            engine.destroy();
        });

        it('still reports not complete while waitingForTargetInput is set', () => {
            const { engine, player } = buildPreviewEngine();
            player.activeAbilities = [];
            engine.gameTick = 10;
            endEarly(engine, 8);
            engine.waitingForTargetInput = {
                label: 'Target 1',
                unitId: player.id,
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
            };
            expect(isITSPreviewComplete(engine)).toBe(false);
            engine.destroy();
        });

        it('getEndedEarlyPreviewStop is null when the preview cast has not ended early', () => {
            const { engine } = buildPreviewEngine();
            expect(getEndedEarlyPreviewStop(engine)).toBeNull();
            engine.destroy();
        });

        it('records endedEarly from the engine cast_ended_early event for the preview cast only', () => {
            const { engine, player } = buildPreviewEngine();
            const previewCast = engine.sequentialTargetingPreviewCast!;
            previewCast.beganAtGameTime = 5;

            // An older cast of the same ability (Combo follow-up's previous cast) is ignored.
            engine.eventBus.emit('cast_ended_early', {
                unitId: player.id,
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                castStartTime: 4,
                reason: 'interrupted',
                outcome: 'cancelled',
                gameTick: 3,
            });
            expect(previewCast.endedEarly).toBeUndefined();

            // A different unit is ignored.
            engine.eventBus.emit('cast_ended_early', {
                unitId: 'someone_else',
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                castStartTime: 6,
                reason: 'interrupted',
                outcome: 'cancelled',
                gameTick: 4,
            });
            expect(previewCast.endedEarly).toBeUndefined();

            engine.eventBus.emit('cast_ended_early', {
                unitId: player.id,
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                castStartTime: 6,
                reason: 'interrupted',
                outcome: 'cancelled',
                source: { unitId: 'thornbinder', abilityId: '0008' },
                gameTick: 9,
            });
            expect(previewCast.endedEarly).toEqual({
                atTick: 9,
                reason: 'interrupted',
                source: { unitId: 'thornbinder', abilityId: '0008' },
            });

            // Only the first event is recorded.
            engine.eventBus.emit('cast_ended_early', {
                unitId: player.id,
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                castStartTime: 7,
                reason: 'fizzled',
                outcome: 'cancelled',
                gameTick: 12,
            });
            expect(previewCast.endedEarly?.atTick).toBe(9);
            engine.destroy();
        });

        it('does not record when no preview is running', () => {
            const { engine, player } = buildPreviewEngine();
            const previewCast = engine.sequentialTargetingPreviewCast!;
            engine.isSequentialTargetingPreview = false;
            engine.eventBus.emit('cast_ended_early', {
                unitId: player.id,
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                castStartTime: 1,
                reason: 'interrupted',
                outcome: 'cancelled',
                gameTick: 2,
            });
            expect(previewCast.endedEarly).toBeUndefined();
            engine.destroy();
        });
    });

    describe('shouldAutoCommitItsPreview', () => {
        it('does not commit an incomplete preview, whatever else is true', () => {
            expect(
                shouldAutoCommitItsPreview({ previewComplete: false, allTargetsCollected: true, endedEarly: true }),
            ).toBe(false);
            expect(
                shouldAutoCommitItsPreview({ previewComplete: false, allTargetsCollected: false, endedEarly: false }),
            ).toBe(false);
        });

        it('does not commit a complete preview with missing targets that did not end early (12D040 / 10EA88)', () => {
            expect(
                shouldAutoCommitItsPreview({ previewComplete: true, allTargetsCollected: false, endedEarly: false }),
            ).toBe(false);
        });

        it('commits a complete preview with every target collected', () => {
            expect(
                shouldAutoCommitItsPreview({ previewComplete: true, allTargetsCollected: true, endedEarly: false }),
            ).toBe(true);
        });

        it('commits a complete preview that ended early even with targets missing', () => {
            expect(
                shouldAutoCommitItsPreview({ previewComplete: true, allTargetsCollected: false, endedEarly: true }),
            ).toBe(true);
        });
    });

    describe('isAtMissingPickDecision', () => {
        it('is true only while a cast of the unit has awaitingPickLabel', () => {
            const { engine, player } = buildPreviewEngine();
            expect(isAtMissingPickDecision(engine, player.id)).toBe(false);
            player.activeAbilities = [
                { abilityId: DOUBLE_PUNCH_ABILITY_ID, startTime: 0, targets: [], awaitingPickLabel: 'Target 1' } as never,
            ];
            expect(isAtMissingPickDecision(engine, player.id)).toBe(true);
            player.activeAbilities = [
                { abilityId: DOUBLE_PUNCH_ABILITY_ID, startTime: 0, targets: [] } as never,
            ];
            expect(isAtMissingPickDecision(engine, player.id)).toBe(false);
            engine.destroy();
        });

        it('is false for a missing or unknown unit', () => {
            const { engine } = buildPreviewEngine();
            expect(isAtMissingPickDecision(engine, null)).toBe(false);
            expect(isAtMissingPickDecision(engine, undefined)).toBe(false);
            expect(isAtMissingPickDecision(engine, 'no_such_unit')).toBe(false);
            engine.destroy();
        });
    });

    describe('isPreviewCastInstance', () => {
        const base = {
            unitId: 'u1',
            abilityId: 'a1',
            startRound: 1,
            beganAtGameTime: 5,
        };

        it('rejects an older same-id cast and other units / abilities', () => {
            expect(isPreviewCastInstance(base, 'u1', 'a1', 4.9)).toBe(false);
            expect(isPreviewCastInstance(base, 'u2', 'a1', 6)).toBe(false);
            expect(isPreviewCastInstance(base, 'u1', 'a2', 6)).toBe(false);
        });

        it('accepts a cast that started at or after the preview began', () => {
            expect(isPreviewCastInstance(base, 'u1', 'a1', 5)).toBe(true);
            expect(isPreviewCastInstance(base, 'u1', 'a1', 7.5)).toBe(true);
        });

        it('accepts the resume cast by its start time even though it started before the preview', () => {
            const resume = { ...base, resumeCastStartTime: 3 };
            expect(isPreviewCastInstance(resume, 'u1', 'a1', 3)).toBe(true);
            expect(isPreviewCastInstance(resume, 'u1', 'a1', 4)).toBe(false);
        });
    });

    it('returns true when cast left activeAbilities even if round also advanced', () => {
        const { engine, player } = buildPreviewEngine();
        const startRound = engine.roundNumber;
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startRound,            beganAtGameTime: engine.gameTime,
        };
        player.activeAbilities = [];
        engine.roundNumber = startRound + 1;
        expect(isITSPreviewComplete(engine)).toBe(true);
        engine.destroy();
    });
});
