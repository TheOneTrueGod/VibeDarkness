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
import { coreBloodMageItem } from '../../../character_defs/items/core/022_core_blood_mage';
import { applyLockedAbilityModes, attachResourcesFromEquipment } from '../../../storylines/BaseMissionDef';
import { getAvailableModes, resolveEffectiveMode, resolveModeAbilityId } from '../../../abilities/resolveAbilityMode';
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

function setup(ability: AbilityStatic, enemies: Unit[], startWater = 8) {
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

    it('spends 2 Water once per cast and no HP', () => {
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

    it('is registered with its card and has an Ice / Blood mode strip', () => {
        expect(getAbility(ICE_ID)).toBe(IceClawsAbility_1501);
        expect(getCardDef(ICE_ID)?.abilityId).toBe(ICE_ID);
        expect(IceClawsAbility_1501.swapConfig).toBeUndefined();
        const modes = IceClawsAbility_1501.abilityModes!;
        expect(modes.modes).toEqual(['blood', 'ice']);
        expect(modes.defaultMode).toBe('ice');
        expect(modes.toggleStyle).toBe('cycle');
        expect(modes.modeAbilityIds).toEqual({ blood: BLOODY_ID });
        expect(modes.modeLabels).toEqual({ ice: 'Ice', blood: 'Blood' });
        expect(modes.fallbackMode).toBe('blood');
        expect(modes.ownedCardModes).toEqual(['blood']);
        expect(IceClawsAbility_1501.maxUses).toBe(3);
        expect(IceClawsAbility_1501.hpCost ?? 0).toBe(0);
        expect(ICE_CLAWS_DAMAGE).toBeGreaterThan(BLOODY_CLAWS_DAMAGE);
    });
});

// ---------------------------------------------------------------------------
// The Ice / Blood modes: the slot falls back to Bloody Claws when Ice can't be paid (real tiny engine)
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

/** `abilities` defaults to both cards owned; pass `[ICE_ID]` for a unit without Bloody Claws. */
function buildModeEngine(startWater: number, abilities: string[] = [ICE_ID, BLOODY_ID]) {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER_POS.x, y: PLAYER_POS.y, abilities });
    // The spawn path (BaseMissionDef) attaches Water from the ability costs and locks unowned modes.
    attachResourcesFromEquipment([coreBloodMageItem.id], player, engine.eventBus);
    applyLockedAbilityModes(player, { abilityIds: abilities, replacedCardIds: [] });
    const water = player.getResource('water') as Water;
    water.current = startWater;
    stepTicks(engine, 1);
    return { engine, player, water };
}

/** The player's order for the slot: `mode` is what the UI would send. */
function castSlot(player: Unit, engine: GameEngine, mode: string) {
    const aim = px(player.x, player.y - 60);
    // Like the UI: a non-default mode casts its own ability; the engine applies the cast-time fallback.
    const ability = getAbility(resolveModeAbilityId(IceClawsAbility_1501, mode)) ?? IceClawsAbility_1501;
    executeUnitAbility(player, ability, [aim, aim, aim], engine as unknown as EngineContext, mode);
}

describe('Ice Claws Ice / Blood modes', () => {
    it('starts with 5 Water and nothing locked when both cards are owned', () => {
        const { player, water } = buildModeEngine(5);
        expect(water.current).toBe(5);
        expect(player.lockedAbilityModes[ICE_ID] ?? []).toEqual([]);
        expect(getAvailableModes(player, IceClawsAbility_1501)).toEqual(['blood', 'ice']);
    });

    it('casts Ice with 2+ Water and Bloody Claws (HP, no Water) through the effective mode at 1 Water', () => {
        const { engine, player, water } = buildModeEngine(3);
        expect(resolveEffectiveMode(player, IceClawsAbility_1501, 'ice')).toBe('ice');

        castSlot(player, engine, 'ice');
        expect(water.current).toBe(1);
        expect(player.activeAbilities.map((a) => a.abilityId)).toEqual([ICE_ID]);
        stepTicks(engine, CAST_TICKS);
        expect(player.activeAbilities).toHaveLength(0);

        // Now below the cost: Ice resolves to Blood, and the cast is Bloody Claws.
        expect(resolveEffectiveMode(player, IceClawsAbility_1501, 'ice')).toBe('blood');
        const hpBefore = player.hp;
        castSlot(player, engine, 'ice');
        expect(player.activeAbilities.map((a) => a.abilityId)).toEqual([BLOODY_ID]);
        expect(water.current).toBe(1);
        // Bloody Claws pay their HP as the first strike starts.
        stepTicks(engine, CAST_TICKS);
        expect(player.hp).toBeLessThan(hpBefore);
    });

    it("spends each mode's own uses", () => {
        const { engine, player } = buildModeEngine(9);
        castSlot(player, engine, 'ice');
        stepTicks(engine, CAST_TICKS);
        expect(player.abilityRuntime[ICE_ID]?.currentUses).toBe(ICE_CLAWS_MAX_USES - 1);
        expect(player.abilityRuntime[BLOODY_ID]?.currentUses).toBe(BLOODY_CLAWS_MAX_USES);

        castSlot(player, engine, 'blood');
        expect(player.activeAbilities.map((a) => a.abilityId)).toEqual([BLOODY_ID]);
        stepTicks(engine, CAST_TICKS);
        expect(player.abilityRuntime[ICE_ID]?.currentUses).toBe(ICE_CLAWS_MAX_USES - 1);
        expect(player.abilityRuntime[BLOODY_ID]?.currentUses).toBe(BLOODY_CLAWS_MAX_USES - 1);
    });

    it('keeps casting only Ice when the Blood mode is locked (no Bloody Claws owned)', () => {
        const { engine, player, water } = buildModeEngine(1, [ICE_ID]);
        expect(player.lockedAbilityModes[ICE_ID]).toEqual(['blood']);
        expect(getAvailableModes(player, IceClawsAbility_1501)).toEqual(['ice']);
        // No fallback: the mode stays Ice, and the cast is refused for lack of Water.
        expect(resolveEffectiveMode(player, IceClawsAbility_1501, 'ice')).toBe('ice');
        expect(resolveEffectiveMode(player, IceClawsAbility_1501, 'blood')).toBe('ice');
        castSlot(player, engine, 'ice');
        expect(player.activeAbilities).toHaveLength(0);
        expect(water.current).toBe(1);
    });
});
