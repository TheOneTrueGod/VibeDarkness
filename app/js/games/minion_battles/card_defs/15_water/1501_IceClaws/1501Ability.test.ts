import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { tickUnitActiveAbilities } from '../../../game/units/unitAbilityTick';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import { BLEED_BUFF_TYPE, type BleedBuff } from '../../../buffs/BleedBuff';
import type { TeamId } from '../../../game/teams';
import type { ResolvedTarget } from '../../../game/types';
import type { AbilityStatic } from '../../../abilities/Ability';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { CLAW_COMBO_LABELS } from '../../../abilities/clawCombo';
import { Water } from '../../../resources/Water';
import { GameEngine } from '../../../game/GameEngine';
import { FIXED_DT } from '../../../game/gameConstants';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../../testing/harness/buildTinyBattleEngine';
import { getCardDef } from '../../index';
import {
    BLOODY_CLAWS_DAMAGE,
    BLOODY_CLAWS_MAX_USES,
    BLOODY_CLAWS_TIMINGS,
    BloodyClawsAbility_0306,
} from '../../03_blood_mage/0306_BloodyClaws/0306Ability';
import {
    ICE_CLAWS_CLAW_BASE,
    ICE_CLAWS_CLAW_TIP,
    ICE_CLAWS_DAMAGE,
    ICE_CLAWS_MAX_USES,
    ICE_CLAWS_WATER_COST,
    IceClawsAbility_1501,
} from './1501Ability';

const ICE_ID = IceClawsAbility_1501.id;
const BLOODY_ID = BloodyClawsAbility_0306.id;
const TICK_DT = 0.01;
const T = BLOODY_CLAWS_TIMINGS;

const px = (x: number, y: number): ResolvedTarget => ({ type: 'pixel', position: { x, y } });

// ---------------------------------------------------------------------------
// Claw geometry and damage (light harness, like Bloody Claws' tests)
// ---------------------------------------------------------------------------

function makeUnit(id: string, x: number, y: number, team: 'player' | 'enemy', abilities: string[] = []): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: team as TeamId,
        ownerId: team === 'player' ? 'p1' : 'enemy_ai',
        characterId: team === 'player' ? 'player' : 'enemy',
        name: id,
        abilities,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function setup(ability: AbilityStatic, enemies: Unit[], startWater = 16) {
    const caster = makeUnit('caster', 0, 0, 'player', [ability.id]);
    caster.abilityRuntime[ability.id] = {
        currentUses: BLOODY_CLAWS_MAX_USES,
        maxUses: BLOODY_CLAWS_MAX_USES,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    };
    const units = [caster, ...enemies];
    const eventBus = new EventBus();
    const water = new Water();
    water.current = startWater;
    caster.attachResource(water, eventBus);
    const engine = {
        gameTime: 0,
        gameTick: 0,
        roundNumber: 1,
        eventBus,
        units,
        terrainManager: null,
        getUnit: (id: string) => units.find((u) => u.id === id),
        trackAbilityUse: vi.fn(),
        addEffectEmitter: vi.fn(),
        addEffect: vi.fn(),
        addProjectile: vi.fn(),
    } as unknown as EngineContext;
    return { caster, engine, water };
}

/** Every strike aimed at the same pixel (no lock-ons, so hits are purely geometric). */
function cast(caster: Unit, ability: AbilityStatic, engine: EngineContext, aim: ResolvedTarget) {
    executeUnitAbility(caster, ability, [aim, aim, aim], engine);
    const active = caster.activeAbilities.find((a) => a.abilityId === ability.id)!;
    active.targetsByLabel = {
        [CLAW_COMBO_LABELS.swipeLeft]: aim,
        [CLAW_COMBO_LABELS.swipeRight]: aim,
        [CLAW_COMBO_LABELS.xStrike]: aim,
    };
}

function advanceTo(caster: Unit, engine: EngineContext, seconds: number) {
    while (engine.gameTime < seconds) {
        engine.gameTime += TICK_DT;
        tickUnitActiveAbilities(caster, TICK_DT, engine, vi.fn());
    }
}

/** World point `t` (0 = base, 1 = tip) along Ice Claws' left claw for a caster at the origin aiming up. */
function iceClawPoint(t: number): { x: number; y: number } {
    const forward = ICE_CLAWS_CLAW_BASE.forward + (ICE_CLAWS_CLAW_TIP.forward - ICE_CLAWS_CLAW_BASE.forward) * t;
    const side = ICE_CLAWS_CLAW_BASE.side + (ICE_CLAWS_CLAW_TIP.side - ICE_CLAWS_CLAW_BASE.side) * t;
    return { x: side, y: -forward };
}

const bleedStacks = (u: Unit) => (u.buffs.find((b) => b._type === BLEED_BUFF_TYPE) as BleedBuff | undefined)?.stacks ?? 0;
/** Within both cards' claw reach, so no step lunge moves the caster. */
const UP = px(0, -60);

describe('IceClawsAbility_1501', () => {
    it('reaches a unit 90 px ahead that Bloody Claws misses', () => {
        const farIce = makeUnit('far', 0, -90, 'enemy');
        const ice = setup(IceClawsAbility_1501, [farIce]);
        cast(ice.caster, IceClawsAbility_1501, ice.engine, UP);
        advanceTo(ice.caster, ice.engine, T.cooldownEnd);
        expect(farIce.hp).toBeLessThan(100);

        const farBloody = makeUnit('far', 0, -90, 'enemy');
        const bloody = setup(BloodyClawsAbility_0306, [farBloody]);
        cast(bloody.caster, BloodyClawsAbility_0306, bloody.engine, UP);
        advanceTo(bloody.caster, bloody.engine, T.cooldownEnd);
        expect(farBloody.hp).toBe(100);
    });

    it('deals 6 per claw and adds bleed, swiping left first', () => {
        // Near the left claw's base, where only the left claw reaches.
        const onLeftClaw = makeUnit('left', iceClawPoint(0.1).x, iceClawPoint(0.1).y, 'enemy');
        const { caster, engine } = setup(IceClawsAbility_1501, [onLeftClaw]);
        cast(caster, IceClawsAbility_1501, engine, UP);
        advanceTo(caster, engine, T.swipeLeftEnd);
        expect(ICE_CLAWS_DAMAGE).toBe(6);
        expect(onLeftClaw.hp).toBe(100 - ICE_CLAWS_DAMAGE);
        expect(bleedStacks(onLeftClaw)).toBe(1);
    });

    it('spends 3 Water once per cast and no HP', () => {
        const { caster, engine, water } = setup(IceClawsAbility_1501, [], 10);
        cast(caster, IceClawsAbility_1501, engine, UP);
        expect(water.current).toBe(10 - ICE_CLAWS_WATER_COST);
        advanceTo(caster, engine, T.cooldownEnd);
        expect(water.current).toBe(10 - ICE_CLAWS_WATER_COST);
        expect(caster.hp).toBe(100);
    });

    it('draws the slash in Tidewater colours with frost motes along the claw', () => {
        const target = makeUnit('t', iceClawPoint(0.5).x, iceClawPoint(0.5).y, 'enemy');
        const { caster, engine } = setup(IceClawsAbility_1501, [target]);
        cast(caster, IceClawsAbility_1501, engine, UP);
        advanceTo(caster, engine, T.swipeLeftEnd);
        const effects = vi.mocked(engine.addEffect).mock.calls.map(([e]) => e);
        const slash = effects.find((e) => e.effectType === 'ClawSlash')!;
        expect(slash.effectData.glowColor).toBe(0x5eead4);
        const motes = effects.filter((e) => e.effectType === 'Mote');
        expect(motes.some((m) => m.effectData.shape === 'frost')).toBe(true);
        expect(motes.some((m) => m.effectData.shape === 'shard')).toBe(true);
    });

    it('is registered with its card and replaces Bloody Claws while castable', () => {
        expect(getAbility(ICE_ID)).toBe(IceClawsAbility_1501);
        expect(getCardDef(ICE_ID)?.abilityId).toBe(ICE_ID);
        expect(IceClawsAbility_1501.swapConfig).toEqual({
            activateTrigger: { type: 'whileCastable' },
            deactivateTrigger: { type: 'whileCastable' },
            replacesAbilityId: BLOODY_ID,
        });
        expect(IceClawsAbility_1501.maxUses).toBe(3);
        expect(IceClawsAbility_1501.hpCost ?? 0).toBe(0);
        expect(ICE_CLAWS_DAMAGE).toBeGreaterThan(BLOODY_CLAWS_DAMAGE);
    });
});

// ---------------------------------------------------------------------------
// The swap: Ice Claws holds Bloody Claws' slot while castable (real tiny engine)
// ---------------------------------------------------------------------------

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 5 * CELL + CELL / 2 };
const CAST_TICKS = Math.ceil(T.cooldownEnd / FIXED_DT) + 2;

function stepTicks(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        engine.isPaused = false;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function buildSwapEngine(startWater: number) {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: PLAYER_POS.x,
        y: PLAYER_POS.y,
        abilities: [BLOODY_ID, ICE_ID],
    });
    const water = new Water();
    water.current = startWater;
    player.attachResource(water, engine.eventBus);
    stepTicks(engine, 1);
    return { engine, player, water };
}

const slotHolder = (player: Unit) => player.abilities[0];

function castIceClaws(player: Unit, engine: GameEngine) {
    cast(player, IceClawsAbility_1501, engine, px(player.x, player.y - 60));
}

describe('Ice Claws swap', () => {
    it('holds the slot with 3 Water and leaves Bloody Claws there below 3', () => {
        expect(slotHolder(buildSwapEngine(ICE_CLAWS_WATER_COST).player)).toBe(ICE_ID);
        expect(slotHolder(buildSwapEngine(ICE_CLAWS_WATER_COST - 1).player)).toBe(BLOODY_ID);
    });

    it('casts with 5 Water, then Bloody Claws is back in the slot at 2 Water', () => {
        const { engine, player, water } = buildSwapEngine(5);
        expect(slotHolder(player)).toBe(ICE_ID);

        castIceClaws(player, engine);
        expect(water.current).toBe(2);
        // Mid-cast the slot is left alone.
        stepTicks(engine, 5);
        expect(slotHolder(player)).toBe(ICE_ID);

        stepTicks(engine, CAST_TICKS);
        expect(player.activeAbilities.some((a) => a.abilityId === ICE_ID)).toBe(false);
        expect(water.current).toBe(2);
        expect(slotHolder(player)).toBe(BLOODY_ID);
        expect(player.abilityRuntime[BLOODY_ID]?.active).toBe(true);
    });

    it('spends 3 Water per cast across two casts and keeps its own uses', () => {
        const { engine, player, water } = buildSwapEngine(9);
        castIceClaws(player, engine);
        stepTicks(engine, CAST_TICKS);
        expect(water.current).toBe(6);
        expect(player.abilityRuntime[ICE_ID]?.currentUses).toBe(ICE_CLAWS_MAX_USES - 1);
        expect(slotHolder(player)).toBe(ICE_ID);

        castIceClaws(player, engine);
        stepTicks(engine, CAST_TICKS);
        expect(water.current).toBe(3);
        expect(player.abilityRuntime[ICE_ID]?.currentUses).toBe(ICE_CLAWS_MAX_USES - 2);
        expect(slotHolder(player)).toBe(ICE_ID);
    });
});
