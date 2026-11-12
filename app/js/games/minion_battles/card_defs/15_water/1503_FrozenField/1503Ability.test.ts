import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import '../../../abilities/AbilityRegistry';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { getTotalAbilityDuration } from '../../../abilities/abilityTimings';
import { resolveModeAbilityId } from '../../../abilities/resolveAbilityMode';
import { SpellCircleBehaviour } from '../../../abilities/CastBehaviours/SpellCircleBehaviour';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { findPreviewDeferredSelectLabel } from '../../../game/interaction/selectTargetLookahead';
import { SPELL_CIRCLE_STYLE_WATER } from '../../../game/spellCircles/spellCircles';
import {
    SPIKES_RISE_EFFECT_TYPE,
    spikeRiseScale,
    spikesRiseAlpha,
    spikesRiseLayout,
    type SpikesRiseEffectData,
} from '../../../game/effects/spikesRise';
import { drawSpikesRise } from '../../../game/effect_defs/spikesRiseEffects';
import { effectDefRegistry } from '../../../game/effect_defs';
import type { Effect } from '../../../game/effects/Effect';
import { FROZEN_FIELD_EFFECT_TYPE, STANDING_DAMAGE_PARAM } from '../../../game/terrainEffects/terrainEffectDefs';
import { orientedRectAt, pointInOrientedRect } from '../../../hitboxes/OrientedRectHitbox';
import { GameEngine } from '../../../game/GameEngine';
import { FIXED_DT } from '../../../game/gameConstants';
import type { EngineContext } from '../../../game/EngineContext';
import type { ResolvedTarget } from '../../../game/types';
import { Water } from '../../../resources/Water';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    buildTinyBattleEngine,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import { getCardDef } from '../../index';
import { BURST_HP_COST, BurstAbility_0302 } from '../../03_blood_mage/0302_Burst/0302Ability';
import {
    FROZEN_FIELD_BLOOD_MODE,
    FROZEN_FIELD_HITBOX,
    FROZEN_FIELD_IMPACT_DAMAGE,
    FROZEN_FIELD_LENGTH,
    FROZEN_FIELD_LIFETIME_SEC,
    FROZEN_FIELD_MAX_USES,
    FROZEN_FIELD_PULSE_DAMAGE,
    FROZEN_FIELD_RANGE,
    FROZEN_FIELD_TIMINGS,
    FROZEN_FIELD_WATER_COST,
    FROZEN_FIELD_WIDTH,
    FrozenFieldAbility_1503,
} from './1503Ability';

const FIELD_ID = FrozenFieldAbility_1503.id;
const BURST_ID = BurstAbility_0302.id;
const P = TINY_BATTLE_PLAYER_ID;
const T = FROZEN_FIELD_TIMINGS;

const px = (x: number, y: number): ResolvedTarget => ({ type: 'pixel', position: { x, y } });

function stepTicks(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        engine.isPaused = false;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

/** Player at (100, 200) with Blood Burst + Frozen Field and `water`; dummies in and out of the field. */
function buildFieldEngine(water = 16) {
    const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, { playerId: P, x: 100, y: 200, abilities: [BURST_ID, FIELD_ID] });
    const res = new Water();
    res.current = water;
    player.attachResource(res, engine.eventBus);
    // Field centred at (200, 200), aimed along +x: x 120..280, y 140..260.
    const inside = placeTargetDummy(engine, { x: 200, y: 220 }, 'inside');
    const outside = placeTargetDummy(engine, { x: 200, y: 330 }, 'outside');
    stepTicks(engine, 1);
    return { engine, player, water: res, inside, outside };
}

function stunCount(spy: ReturnType<typeof vi.spyOn>): number {
    return spy.mock.calls.filter(([b]) => (b as { _type?: string })._type === 'stunned').length;
}

describe('FrozenFieldAbility_1503 timeline', () => {
    it('draws the water spell circle over the 0.8 s windup and lands at 1.0 s, cooldown to 1.8 s', () => {
        const [windup, select, impact, cooldown] = FrozenFieldAbility_1503.abilityTimings as {
            id: string; start: number; end: number; castBehaviours?: { behaviour: unknown }[];
        }[];
        expect([windup.id, windup.start, windup.end]).toEqual(['windup', 0, 0.8]);
        const circle = windup.castBehaviours![0].behaviour as SpellCircleBehaviour;
        expect(circle).toBeInstanceOf(SpellCircleBehaviour);
        expect(circle.config.style).toBe(SPELL_CIRCLE_STYLE_WATER);
        expect([select.id, select.start, select.end]).toEqual(['select', 0.8, 1.0]);
        expect([impact.id, impact.start]).toEqual(['impact', 1.0]);
        expect([cooldown.id, cooldown.end]).toEqual(['cooldown', 1.8]);
        expect(getTotalAbilityDuration(FrozenFieldAbility_1503)).toBeCloseTo(T.cooldownEnd);
    });

    it('picks its target at 0.8 s with the rectangle hitbox, not before the cast', () => {
        const select = (FrozenFieldAbility_1503.abilityTimings as { id: string; targetDef?: Record<string, unknown> }[])
            .find((t) => t.id === 'select')!;
        expect(select.targetDef).toMatchObject({ kind: 'select', pickAtEntry: true, allowMiss: true, hitbox: FROZEN_FIELD_HITBOX });
        expect(FROZEN_FIELD_HITBOX.length).toBe(FROZEN_FIELD_LENGTH);
        expect(FROZEN_FIELD_HITBOX.width).toBe(FROZEN_FIELD_WIDTH);
        expect(FROZEN_FIELD_HITBOX.maxRange).toBe(FROZEN_FIELD_RANGE);
        const { engine, player } = buildFieldEngine();
        // No up-front pick: the lookahead asks for it right before the select interval enters.
        expect(findPreviewDeferredSelectLabel(FrozenFieldAbility_1503, player, engine as unknown as EngineContext)).toBeNull();
    });
});

describe('FrozenFieldAbility_1503 in a battle', () => {
    it('hits and stuns enemies in the field at 1.0 s, then keeps hurting and re-stunning them until 4.0 s', () => {
        const { engine, player, water, inside, outside } = buildFieldEngine();
        // Start off a 0.5 s world boundary so the impact and the ice's pulses never share a tick.
        stepTicks(engine, Math.round(0.25 / FIXED_DT));
        const insideStuns = vi.spyOn(inside, 'addBuff');
        const outsideStuns = vi.spyOn(outside, 'addBuff');
        const hp0 = inside.hp;
        const castAt = engine.gameTime;
        executeUnitAbility(player, FrozenFieldAbility_1503, [px(200, 200)], engine as unknown as EngineContext);
        expect(water.current).toBe(16 - FROZEN_FIELD_WATER_COST);

        const at = (s: number) => stepTicks(engine, Math.max(0, Math.round((castAt + s - engine.gameTime) / FIXED_DT)));
        at(T.impactAt - 0.05);
        expect(inside.hp).toBe(hp0);
        at(T.impactAt + 0.05);
        expect(inside.hp).toBe(hp0 - FROZEN_FIELD_IMPACT_DAMAGE);
        expect(stunCount(insideStuns)).toBe(1);
        expect(inside.hasBuff('stunned')).toBe(true);

        // The ice covers the field's cells for its owner's team.
        const record = engine.terrainLayers.getEffectAt('ground', Math.floor(200 / CELL_SIZE), Math.floor(220 / CELL_SIZE));
        expect(record?.effectType).toBe(FROZEN_FIELD_EFFECT_TYPE);
        expect(record?.teamId).toBe(player.teamId);
        expect(record?.params?.[STANDING_DAMAGE_PARAM]).toBe(FROZEN_FIELD_PULSE_DAMAGE);

        const pulses = FROZEN_FIELD_LIFETIME_SEC / 0.5;
        at(T.impactAt + FROZEN_FIELD_LIFETIME_SEC - 0.05);
        expect(inside.hp).toBe(hp0 - FROZEN_FIELD_IMPACT_DAMAGE - pulses * FROZEN_FIELD_PULSE_DAMAGE);
        expect(stunCount(insideStuns)).toBe(1 + pulses);
        expect(inside.hasBuff('stunned')).toBe(true);

        at(T.impactAt + FROZEN_FIELD_LIFETIME_SEC + 1);
        expect(inside.hp).toBe(hp0 - FROZEN_FIELD_IMPACT_DAMAGE - pulses * FROZEN_FIELD_PULSE_DAMAGE);
        expect(engine.terrainLayers.getEffectAt('ground', Math.floor(200 / CELL_SIZE), Math.floor(220 / CELL_SIZE))).toBeNull();

        expect(outside.hp).toBe(hp0);
        expect(stunCount(outsideStuns)).toBe(0);
        expect(player.hp).toBe(player.maxHp);
    });

    it('raises ice across the clamped field at the pick and lays ice on exactly the hitbox cells', () => {
        const { engine, player } = buildFieldEngine();
        const added = vi.spyOn(engine, 'addEffect');
        // Aimed far past the range: the field's centre is pulled in to 140 px.
        const castAt = engine.gameTime;
        executeUnitAbility(player, FrozenFieldAbility_1503, [px(600, 200)], engine as unknown as EngineContext);
        const spikes = () => added.mock.calls.map(([e]) => e as Effect).filter((e) => e.effectType === SPIKES_RISE_EFFECT_TYPE);
        stepTicks(engine, Math.round((T.selectAt - 0.05) / FIXED_DT));
        expect(spikes()).toHaveLength(0);
        stepTicks(engine, Math.round((castAt + T.selectAt + 0.05 - engine.gameTime) / FIXED_DT));
        expect(spikes()).toHaveLength(1);
        const rise = spikes()[0];
        expect(rise.x).toBeCloseTo(player.x + FROZEN_FIELD_RANGE);
        expect(rise.y).toBeCloseTo(player.y);
        expect(rise.timeDomain).toBe('world');

        stepTicks(engine, Math.round((castAt + T.impactAt + 0.05 - engine.gameTime) / FIXED_DT));
        const cells = FROZEN_FIELD_HITBOX.resolveCells(player, { x: 600, y: 200 });
        expect(cells.length).toBeGreaterThan(0);
        for (const { col, row } of cells) {
            expect(engine.terrainLayers.getEffectAt('ground', col, row)?.effectType).toBe(FROZEN_FIELD_EFFECT_TYPE);
        }
        // A cell just outside the far edge stays bare.
        const farCol = Math.floor((player.x + FROZEN_FIELD_RANGE + FROZEN_FIELD_LENGTH / 2 + CELL_SIZE / 2) / CELL_SIZE);
        expect(engine.terrainLayers.getEffectAt('ground', farCol, Math.floor(player.y / CELL_SIZE))).toBeNull();
    });

    it('casts Blood Burst from its mode strip', () => {
        expect(resolveModeAbilityId(FrozenFieldAbility_1503, FROZEN_FIELD_BLOOD_MODE)).toBe(BURST_ID);
        expect(resolveModeAbilityId(FrozenFieldAbility_1503, FrozenFieldAbility_1503.abilityModes!.defaultMode)).toBe(FIELD_ID);
        const { engine, player, water } = buildFieldEngine();
        const burst = getAbility(resolveModeAbilityId(FrozenFieldAbility_1503, FROZEN_FIELD_BLOOD_MODE))!;
        executeUnitAbility(player, burst, [px(200, 200)], engine as unknown as EngineContext, FROZEN_FIELD_BLOOD_MODE);
        expect(player.activeAbilities.map((a) => a.abilityId)).toEqual([BURST_ID]);
        stepTicks(engine, Math.round(1 / FIXED_DT));
        expect(player.hp).toBe(player.maxHp - BURST_HP_COST);
        expect(water.current).toBe(16);
    });
});

describe('Frozen Field swap and card', () => {
    function slotHolderWith(startWater: number): string {
        return buildFieldEngine(startWater).player.abilities[0];
    }

    it('holds Blood Burst\'s slot with 16 Water and leaves Blood Burst there below 16', () => {
        expect(slotHolderWith(FROZEN_FIELD_WATER_COST)).toBe(FIELD_ID);
        expect(slotHolderWith(FROZEN_FIELD_WATER_COST - 1)).toBe(BURST_ID);
    });

    it('is registered with its card, Blood Burst\'s uses and a whileCastable swap', () => {
        expect(getAbility(FIELD_ID)).toBe(FrozenFieldAbility_1503);
        expect(getCardDef(FIELD_ID)?.abilityId).toBe(FIELD_ID);
        expect(FrozenFieldAbility_1503.swapConfig).toEqual({
            activateTrigger: { type: 'whileCastable' },
            deactivateTrigger: { type: 'whileCastable' },
            replacesAbilityId: BURST_ID,
        });
        expect(FrozenFieldAbility_1503.maxUses).toBe(2);
        expect(FROZEN_FIELD_MAX_USES).toBe(BurstAbility_0302.maxUses);
        expect(FrozenFieldAbility_1503.resourceCost).toEqual({ resourceId: 'water', amount: 16 });
        expect(FrozenFieldAbility_1503.getTooltipText(undefined).length).toBe(3);
    });
});

describe('SpikesRise effect', () => {
    const rect = orientedRectAt({ x: 0, y: 0 }, { x: 100, y: 100 }, FROZEN_FIELD_LENGTH, FROZEN_FIELD_WIDTH, 140);
    const data: SpikesRiseEffectData = {
        color: 0x5eead4, edgeColor: 0x0f1d45, highlightColor: 0xffffff, density: 0.9, heightPx: [12, 20], baseHalfWidthPx: 5,
        dirX: rect.dirX, dirY: rect.dirY, halfLength: rect.halfLength, halfWidth: rect.halfWidth,
        seed: 7, staggerShare: 0.1, riseShare: 0.06, fadeShare: 0.3,
    };

    it('lays spikes evenly inside the rotated rectangle, the same way every time', () => {
        const spikes = spikesRiseLayout(data);
        expect(spikes.length).toBe(Math.round((FROZEN_FIELD_LENGTH * FROZEN_FIELD_WIDTH / 1000) * 0.9));
        const local = { ...rect, centerX: 0, centerY: 0 };
        for (const s of spikes) {
            expect(pointInOrientedRect(local, s.x, s.y)).toBe(true);
            expect(s.startShare).toBeGreaterThanOrEqual(0);
            expect(s.startShare).toBeLessThanOrEqual(0.1);
        }
        expect(spikesRiseLayout(data)).toEqual(spikes);
        expect(spikesRiseLayout({ ...data, seed: 8 })).not.toEqual(spikes);
    });

    it('springs each spike up past full height, settles, then fades the field', () => {
        expect(spikeRiseScale(0.05, 0.1, 0.06)).toBe(0);
        const peak = Math.max(...Array.from({ length: 60 }, (_, i) => spikeRiseScale(0.1 + (i / 60) * 0.06, 0.1, 0.06)));
        expect(peak).toBeGreaterThan(1.05);
        expect(spikeRiseScale(0.5, 0.1, 0.06)).toBe(1);
        expect(spikesRiseAlpha(0.5, 0.3)).toBe(1);
        expect(spikesRiseAlpha(0.85, 0.3)).toBeCloseTo(0.5);
        expect(spikesRiseAlpha(1, 0.3)).toBe(0);
    });

    it('is registered and paints a spike per placed spike', () => {
        expect(effectDefRegistry[SPIKES_RISE_EFFECT_TYPE]).toBeDefined();
        const g = new Graphics();
        const poly = vi.spyOn(g, 'poly');
        const spikes = spikesRiseLayout(data);
        drawSpikesRise(g, data, spikes, 0.5);
        // Body + lit facet per spike.
        expect(poly).toHaveBeenCalledTimes(spikes.length * 2);
        poly.mockClear();
        drawSpikesRise(g, data, spikes, 0);
        expect(poly).not.toHaveBeenCalled();
    });
});
