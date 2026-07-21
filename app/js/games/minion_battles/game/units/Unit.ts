/**
 * Unit - Base class for all units in the battle.
 *
 * Holds HP, team, owner, speed, resources, active abilities, wait lockout, and movement.
 * Supports waypoint-based pathfinding movement with terrain speed modifiers.
 * Subclasses define per-character defaults.
 */

import type { AbilityModifier, PassiveBonuses } from '../../../../researchTrees/types';
import { applyPassiveBonusToBase } from '../../../../researchTrees/passiveBonuses';
import { GameObject, generateGameObjectId } from '../GameObject';
import { type TeamId } from '../teams';
import type { ActiveAbility } from '../types';
import type { AbilityNote } from '../AbilityNote';
import type { Resource } from '../../resources/Resource';
import type { EventBus } from '../EventBus';
import { refundAbilityCost, spendAbilityCost, type AbilityStatic } from '../../abilities/Ability';
import {
    addRecoveryChargeToUnitAbilities,
    applyStaminaSurgeToUnit,
    canUseAbilityNow,
    consumeAbilityUse as consumeAbilityUseUtil,
    ensureAbilityRuntimeState as ensureAbilityRuntimeStateUtil,
    grantRoundChargesToEligibleAbilities,
    syncNestedCardAbilityState,
} from '../../abilities/abilityUses';
import type { ResolvedTarget } from '../types';
import type { Buff } from '../../buffs/Buff';
import { LIFTED_BUFF_TYPE } from '../../buffs/LiftedBuff';
import { DEFAULT_UNIT_RADIUS } from './unit_defs/unitConstants';
import {
    getDefaultHp,
    getDefaultRadius,
    getUnitCombatCcDef,
    getUnitEnrageDef,
    PLAYER_CHARACTER_ID,
    resolvePlayerUnitRadius,
} from './unit_defs/unitDef';
import { getHealthBonusFromResearch } from '../../research/researchTrainingEffects';
import { evaluateSwapTriggers } from '../../abilities/abilitySwap';
import { UnitTag } from './unitTag';
import type { EnrageDef } from './enrageDef';
import type { EngineContext } from '../EngineContext';
import { tickUnitActiveAbilities } from './unitAbilityTick';
import type { Plan, TacticalPlan, InterruptFlag } from './unitAI/plans/types';
import {
    cancelUnitActiveAbility,
    executeUnitAbility,
    interruptAllUnitAbilities,
    interruptAndRefundUnitAbilities,
    unitRoundStart,
} from './unitAbilityLifecycle';
import type {
    ActiveCastBehaviourRecord,
    AISettings,
    ApplyKnockbackParams,
    DamageModifier,
    KnockbackState,
    NudgeState,
    UnitAbilityRuntimeState,
    UnitCombatSettings,
    UnitConfig,
    UnitMovement,
    UnitWalkIntent,
} from './unitTypes';
import { createPetState, type UnitPetState } from './unitPetState';
import { createLanterniteState, type UnitLanterniteState } from './unitLanterniteState';
import { createThornlingState, type UnitThornlingState } from './unitThornlingState';
import { createSwarmState, type UnitSwarmState } from './unitSwarmState';
import { createCcArmourState, tickHardCcChainDecayAtRoundEnd, type UnitCcArmourState } from '../../crowdControl/ccArmourState';
import { serializeUnit } from './unitToJSON';
import { applySerializedUnitState, normalizeLegacyUnitIdentity } from './unitFromJSON';
import { moveUnitToward } from './unitCellSlide';
import { applyKnockbackToUnit } from './unitKnockback';
import { applyNudgeToUnit } from './unitNudge';
import { getUnitEffectiveSpeed, unitHasIFrames, isUnitInJuggernautWindow, getUnitLungeDistance } from './unitAbilityQueries';
import { updateUnit, tickUnitMovement, setUnitMovement, clearUnitMovement, invalidateUnitMovementPath } from './unitMovementTick';
import { applyDamageToUnit, applyDamageToUnitDetailed, tickUnitDarknessCorruption, type DamageBreakdown } from './unitDamage';
import { MIN_EFFECTIVE_MAX_HP_PCT } from './unitHeal';

export type {
    AISettings,
    ApplyKnockbackParams,
    DamageModifier,
    KnockbackSource,
    KnockbackState,
    UnitAbilityRuntimeState,
    UnitCombatSettings,
    UnitMovement,
    UnitWalkIntent,
} from './unitTypes';


import type { UnitAIContext } from './unitAI/contextTypes';
export type { UnitAIContext } from './unitAI/contextTypes';

export class Unit extends GameObject {
    hp: number;
    maxHp: number;
    /** Cumulative heal-penalty "lost ceiling". Never mutates maxHp — see getEffectiveMaxHp(). */
    hpInjury: number = 0;
    /** Number of units in this stack. `hp` tracks the frontmost member; damage cascades through the rest. */
    stackSize: number = 1;
    speed: number;
    teamId: TeamId;
    ownerId: string; // playerId or 'ai'
    characterId: string;
    /** Campaign portrait ID for player units (`characterId === 'player'`). */
    portraitId: string | undefined;
    name: string;

    /** Attached resource instances (Rage, Mana, etc.). */
    resources: Resource[] = [];
    /** Ability runtime state (uses and recharge charges) keyed by ability id. */
    abilityRuntime: Record<string, UnitAbilityRuntimeState> = {};
    /** Per-ability modifiers derived from research. Computed once at unit creation; never changes mid-battle. */
    abilityModifiers: Record<string, AbilityModifier> = {};
    /** Stamina stat: round-start surge grants this many stamina charges to each eligible ability. */
    stamina: number = 1;
    /** Stacks of movement recovery slow from spell/ability effects (1 per stack = −1 movement/round). */
    movementRecoverySlowStacks: number = 0;

    /** Movement state: grid path, optional target unit, and pathfinding tick. */
    movement: UnitMovement | null = null;

    /** Ability IDs available to this unit. */
    abilities: string[] = [];

    /** Abilities currently being executed (tick-based effects in progress). */
    activeAbilities: ActiveAbility[] = [];

    /** Note set by the currently executing ability (e.g. stored target position). Cleared when ability ends or is overwritten. */
    abilityNote: AbilityNote | null = null;

    /**
     * Explicit radius override (spawn config / scenarios). Undefined for nearly all units,
     * in which case radius resolves from the unit def. Serialized only when set.
     */
    radiusOverride: number | undefined = undefined;

    /** Visual radius for collision and rendering. Resolves from the unit def (portrait for players) unless overridden. */
    get radius(): number {
        if (this.radiusOverride !== undefined) return this.radiusOverride;
        if (this.characterId === PLAYER_CHARACTER_ID) return resolvePlayerUnitRadius(this.portraitId);
        return getDefaultRadius(this.characterId, DEFAULT_UNIT_RADIUS);
    }

    set radius(value: number) {
        this.radiusOverride = value;
    }

    /** AI behavior settings (only used for AI-controlled units). */
    aiSettings: AISettings | null = null;

    /** Recalculate pathfinding every N ticks (0 = never). Set at spawn from engine RNG. */
    pathfindingRetriggerOffset: number = 0;

    /** True after forced movement (knockback, ability displacement); next normal move must recalculate path. */
    pathInvalidated: boolean = false;

    /**
     * Durable walk destination. Survives path invalidation; cleared by clearMovement / arrival.
     * When set and `movement` is empty, movement tick repaths once the unit is free to walk.
     */
    walkIntent: UnitWalkIntent | null = null;

    /** Per-controller AI context bag (serialized via toJSON/fromJSON). */
    aiContext: UnitAIContext = {};

    /** UnitAITree ID for AI-controlled units. */
    unitAITreeId: string = 'hunt';

    /** Optional tags (crystal aura, boss UI, etc.). Serialized for checkpoints when non-empty. */
    tags: UnitTag[] = [];

    /**
     * When false, this unit is never auto-assigned to a player via npc control (default true).
     * Serialized only when false.
     */
    controllable: boolean = true;

    /**
     * Control group this unit belongs to (spawn stamp or assignControl). Null when ungrouped.
     * Serialized only when non-null.
     */
    controlGroupId: string | null = null;

    /** Enrage trigger sourced from the unit def — no backing field or serialization needed. */
    get enrageDef(): EnrageDef | undefined {
        return getUnitEnrageDef(this.characterId);
    }

    /** Per-unit timing/directional seed in [0, 1]. Set once at spawn; use for jitter, timing offsets, phase spreads. */
    moveJitter: number = 0;

    /** Set when shoved out of a cell; cleared on reaching a valid cell. Runtime only; prevents cascade bounce-back. */
    shoveFromCell: { col: number; row: number } | undefined = undefined;

    /** Current medium-term AI goal; serialized as relative ticks. Null = replan on next tactical tick. */
    tacticalPlan: Plan<TacticalPlan> | null = null;

    /** Events queued since last AI tick that may invalidate plans; cleared at end of AI decision. Not serialized. */
    pendingInterrupts: Set<InterruptFlag> = new Set();

    /** Seconds remaining in spawn animation (0 = not spawning). Unit is invisible and untargetable while > 0. */
    spawnTimer: number = 0;
    /** Seconds remaining in grow-in scale animation (0 = not growing). Set when spawned via nestSpawn. */
    growAnimTimer: number = 0;

    /** When using the "wait" action: earliest and latest gameTime (seconds) when the wait can end. */
    waitMinEndTime: number | null = null;
    waitMaxEndTime: number | null = null;
    /** When true, the unit holds position but retains its queued movement path for the next order. */
    movementPaused: boolean = false;

    /** Darkness corruption progress 0..1. Fills only in full darkness; drains when brighter. At 1 in full darkness: escalating damage then reset to 0. */
    corruptionProgress: number = 0;

    /** Crystal corruption progress 0..1. Set while this unit is actively corrupting a crystal; 0 when not corrupting. */
    crystalCorruptionProgress: number = 0;

    /** Darkness damage proc count since last reset. Next proc: `5 * (count + 2)` dmg. Resets when corruption drains outside full darkness. */
    darknessDamageProcCount: number = 0;

    /** Reduces effective tier of incoming tier-based knockback (see tryApplyKnockbackByTier). Def-sourced; no backing field. */
    get knockbackResistance(): number {
        return getUnitCombatCcDef(this.characterId)?.knockbackResistance ?? 0;
    }

    ccArmour: UnitCcArmourState = createCcArmourState();

    /** Active knockback state; unit cannot move while set. */
    knockback: KnockbackState | null = null;

    /** Active non-interrupting nudge displacement. Serialized. */
    nudge: NudgeState | null = null;

    /** Seconds this unit has spent inside an impassable tile. Serialized. */
    wallStuckTime: number = 0;

    /** Last world position where the unit was in passable terrain. Used for generic slingshot direction. */
    wallEntryPoint: { x: number; y: number } | null = null;

    /** Cardinal bounce direction for CONTROLLED_SLINGSHOT. Abilities set this before wall entry; cleared on exit to passable terrain. */
    controlledSlingshotDir: { x: number; y: number } | null = null;

    /** True while engine pilots this unit (CONTROLLED_SLINGSHOT, cinematic). No orders/movement; NOT CC; no boss armour. */
    controlled: boolean = false;
    /** Estimated game-time (seconds) at which the current controlled sequence ends. Used by the timeline UI. */
    controlledUntilTime: number | null = null;

    /** Active buffs/debuffs on this unit. Serialized for checkpoints. */
    buffs: Buff[] = [];
    /** Per-unit combat tuning values (optional, serialized). */
    combatSettings: UnitCombatSettings | undefined;
    /** Aggregated passive research bonuses (computed at mission start). Serialized. */
    passiveBonuses: PassiveBonuses | undefined;

    /** When non-null, unit dies when GameEngine.gameTime reaches this value (husks, etc.). */
    ephemeralDespawnAtGameTime: number | null = null;

    petState: UnitPetState = createPetState();

    lanterniteState: UnitLanterniteState = createLanterniteState();

    thornlingState: UnitThornlingState = createThornlingState();

    swarmState: UnitSwarmState = createSwarmState();

    /** Generational invulnerability (>0 = invulnerable). Children get max(0, this - 1), losing invuln when counter hits 0. */
    invulnerabilityGenerations: number | null = null;

    /** Active EffectEmitters created from declarative `emitterDef` on AbilityTimingInterval. Keyed by `intervalId`. Runtime-only. */
    activeTimingEmitters: Map<string, import('../effects/EffectEmitter').EffectEmitter> = new Map();

    /** Active sustained CastBehaviours for this unit's casts. Keyed by `${intervalId}_${behaviourIdx}`. Runtime-only. */
    activeCastBehaviours: Map<string, ActiveCastBehaviourRecord> = new Map();

    constructor(config: UnitConfig) {
        super(config.id ?? generateGameObjectId('unit'), config.x, config.y);
        this.hp = config.hp;
        this.maxHp = config.maxHp ?? config.hp;
        this.speed = config.speed;
        this.teamId = config.teamId;
        this.ownerId = config.ownerId;
        this.characterId = config.characterId;
        this.portraitId = config.portraitId;
        this.name = config.name;
        this.abilities = config.abilities ?? [];
        this.aiSettings = config.aiSettings ?? null;
        this.unitAITreeId = config.unitAITreeId ?? 'hunt';
        this.radiusOverride = config.radius;
        this.stamina = config.stamina ?? 1;
        this.combatSettings = config.combatSettings;
        this.passiveBonuses = config.passiveBonuses;
        this.ephemeralDespawnAtGameTime = config.ephemeralDespawnAtGameTime ?? null;
        this.stackSize = config.stackSize ?? 1;
    }

    /** Attach a resource and subscribe its event listeners. */
    attachResource(resource: Resource, eventBus: EventBus): void {
        this.resources.push(resource);
        resource.attach(this, eventBus);
    }

    /** Detach all resources and unsubscribe their event listeners. */
    detachAllResources(eventBus: EventBus): void {
        for (const resource of this.resources) {
            resource.detach(eventBus);
        }
        this.resources = [];
    }

    /** Get a resource by its ID. */
    getResource(resourceId: string): Resource | undefined {
        return this.resources.find((r) => r.id === resourceId);
    }

    /** Whether this unit is controlled by a real player (not AI). */
    isPlayerControlled(): boolean {
        return this.ownerId !== 'ai';
    }

    /** Whether this unit is alive. */
    isAlive(): boolean {
        return this.hp > 0 && this.active;
    }

    /** Max HP after subtracting accumulated heal-penalty injury, floored at MIN_EFFECTIVE_MAX_HP_PCT of maxHp. */
    getEffectiveMaxHp(): number {
        return Math.max(this.maxHp * MIN_EFFECTIVE_MAX_HP_PCT, this.maxHp - this.hpInjury);
    }

    /** Whether this unit cannot be damaged, targeted, or shown a health bar. */
    isInvincible(): boolean {
        return this.tags.includes(UnitTag.Invincible) ||
            (this.invulnerabilityGenerations != null && this.invulnerabilityGenerations > 0);
    }

    /** Whether this unit is in its spawn animation (invisible and untargetable). */
    isSpawning(): boolean {
        return this.spawnTimer > 0;
    }

    /**
     * Calculate max health from unit def base + Training health maps + unit passiveBonuses.
     * Prefer the bag attached at mission start; callers without a bag get Training-map HP only.
     * @param getResearchNodes Callback (treeId) => researched node IDs for this unit's owner.
     */
    calculateMaxHealth(getResearchNodes: (treeId: string) => string[]): number {
        const base = getDefaultHp(this.characterId);
        const bonus = getHealthBonusFromResearch(getResearchNodes);
        return applyPassiveBonusToBase(base + bonus, this.passiveBonuses?.maxHealth);
    }

    /** Return this unit's damage modifier; defaults to no bonus. */
    getDamageModifier(): DamageModifier {
        return this.combatSettings?.damageModifier ?? { flatAmt: 0, multiplier: 1 };
    }

    /** Apply damage to this unit. Returns actual damage dealt. */
    takeDamage(amount: number, sourceUnitId: string | null, eventBus: EventBus): number {
        return applyDamageToUnit(this, amount, sourceUnitId, eventBus);
    }

    /** Apply damage to this unit, returning the full shield/armour/hp breakdown. */
    takeDamageDetailed(amount: number, sourceUnitId: string | null, eventBus: EventBus): DamageBreakdown {
        return applyDamageToUnitDetailed(this, amount, sourceUnitId, eventBus);
    }

    /** Set movement state with a grid-cell path. Clears movement if path is empty. Sets walkIntent; clears pathInvalidated. */
    setMovement(path: { col: number; row: number }[], targetUnitId: string | undefined, pathfindingTick: number, targetPixel?: { x: number; y: number }): void { setUnitMovement(this, path, targetUnitId, pathfindingTick, targetPixel); }

    /** Clear live path and durable walk intent. */
    clearMovement(): void { clearUnitMovement(this); }

    /** Clear live path but keep walkIntent so movement can repath after forced displacement. */
    invalidateMovementPath(): void { invalidateUnitMovementPath(this); }

    /** Launch the unit with a knockback impulse. CC resistance is handled upstream by `tryApplyKnockbackByTier`. */
    applyKnockback(params: ApplyKnockbackParams, _eventBus: EventBus, onApplied?: (unit: Unit) => void): boolean {
        return applyKnockbackToUnit(this, params, _eventBus, onApplied);
    }

    /** Apply a non-interrupting nudge displacement (no CC gate, no path clear, no ability interrupt). */
    applyNudge(vector: { x: number; y: number }, durationSeconds: number): void {
        applyNudgeToUnit(this, vector, durationSeconds);
    }

    /** Whether the unit is currently being knocked back (cannot move or act). */
    isInKnockback(): boolean {
        return this.knockback !== null;
    }

    /** Whether the engine is currently piloting this unit (slingshot, cinematic, etc.). */
    isControlled(): boolean {
        return this.controlled;
    }

    /**
     * Move the unit toward a world position by at most maxDistance.
     * If the unit has a movement path, checks whether a new step (current grid cell)
     * needs to be prepended to the path so pathfinding stays valid after the move.
     * Returns the actual distance moved.
     */
    moveUnit(towardX: number, towardY: number, maxDistance: number): number {
        return moveUnitToward(this, towardX, towardY, maxDistance);
    }

    update(dt: number, engine: unknown): void { updateUnit(this, dt, engine); }

    /**
     * Get the unit's effective speed accounting for movement penalties
     * from all active abilities. Takes the lowest penalty multiplier.
     */
    getEffectiveSpeed(gameTime: number): number { return getUnitEffectiveSpeed(this, gameTime); }

    /** Maximum movement points. Override via research/item effects. */
    getMaxMovement(): number { return 2; }
    /** Movement points recovered at round start before slow stacks are applied. */
    getMovementRecoveryPerRound(): number { return 2; }
    /** Total slow stacks reducing movement recovery this round (terrain + spell effects). */
    getMovementSlowStacks(engine: EngineContext): number {
        let stacks = this.movementRecoverySlowStacks;
        stacks += engine.terrainLayers.getGroundMovementRecoverySlowStacks(this.x, this.y);
        return stacks;
    }

    /**
     * Returns the effective lunge distance for an ability, applying terrain speed multipliers.
     * The same two terrain layers used for movement speed are applied here.
     * Designed to be extended later with per-weapon-class research bonuses.
     */
    getLungeDistance(engine: unknown, baseLungeDistance: number): number { return getUnitLungeDistance(this, engine, baseLungeDistance); }

    /**
     * Whether the unit currently has invincibility frames from any active ability.
     * When true, projectiles should not deal damage to this unit.
     */
    hasIFrames(gameTime: number): boolean { return unitHasIFrames(this, gameTime); }

    /** True while a wait order is active (see `GameEngine` wait handling). */
    isInWaitLockout(): boolean {
        return this.waitMinEndTime !== null && this.waitMaxEndTime !== null;
    }

    /** Whether the unit can take a new order (move / card / wait). */
    canAct(): boolean {
        return (
            this.isAlive() &&
            !this.isInKnockback() &&
            !this.hasBuff('stunned') &&
            !this.hasBuff(LIFTED_BUFF_TYPE) &&
            !this.hasBuff('exposed') &&
            !this.controlled &&
            this.activeAbilities.length === 0 &&
            !this.isInWaitLockout()
        );
    }

    /** True while the unit is executing a timing interval tagged 'juggernaut' (immune to CC interruption). */
    isInJuggernautWindow(gameTime: number): boolean { return isUnitInJuggernautWindow(this, gameTime); }

    /** Fast check: does this unit have a buff of the given type? */
    hasBuff(buffType: string): boolean {
        return this.buffs.some((b) => b._type === buffType);
    }

    /** Add a buff to this unit. Caller sets appliedAtTime/appliedAtRound on the buff. */
    addBuff(buff: Buff, gameTime: number, roundNumber: number, eventBus?: import('../../game/EventBus').EventBus): void {
        buff.appliedAtTime = gameTime;
        buff.appliedAtRound = roundNumber;
        this.buffs.push(buff);
        evaluateSwapTriggers(this, { type: 'buffApplied', buffType: buff._type }, eventBus);
    }

    /** Interrupt all active abilities (e.g. when stunned). Refunds resource costs. */
    interruptAllAbilities(engine: { gameTime: number }): void { interruptAllUnitAbilities(this, engine); }

    tickActiveAbilities(dt: number, engine: EngineContext, onNaturalCompletion: () => void): void {
        tickUnitActiveAbilities(this, dt, engine, onNaturalCompletion);
    }

    onRoundStart(_roundNumber: number, engine: EngineContext): void { unitRoundStart(this, engine); }

    onRoundEnd(_roundNumber: number): void {
        tickHardCcChainDecayAtRoundEnd(this);
    }

    tickDarknessCorruption(dt: number, engine: EngineContext): void { tickUnitDarknessCorruption(this, dt, engine); }

    tickMovement(dt: number, engine: EngineContext): void { tickUnitMovement(this, dt, engine); }

    // ---- Ability management OOP wrappers ----

    applyStaminaSurge(surgeAmount: number): void { applyStaminaSurgeToUnit(this, surgeAmount); }
    addRecoveryCharge(type: import('../../abilities/abilityUses').RecoveryChargeType, amount: number, rng: () => number): void { addRecoveryChargeToUnitAbilities(this, type, amount, rng); }
    grantRoundCharges(): void { grantRoundChargesToEligibleAbilities(this); }
    syncNestedCardState(): void { syncNestedCardAbilityState(this); }
    ensureAbilityRuntimeState(abilityId: string): void { ensureAbilityRuntimeStateUtil(this, abilityId); }
    canUseAbility(ability: AbilityStatic): boolean { return canUseAbilityNow(this, ability); }
    consumeAbilityUse(abilityId: string): boolean { return consumeAbilityUseUtil(this, abilityId); }
    spendAbilityCost(ability: AbilityStatic): boolean { return spendAbilityCost(this, ability); }
    refundAbilityCost(ability: AbilityStatic, elapsed: number): void { refundAbilityCost(this, ability, elapsed); }

    cancelActiveAbility(abilityId: string, engine: EngineContext): void { cancelUnitActiveAbility(this, abilityId, engine); }

    interruptAndRefundAbilities(engine: EngineContext): void { interruptAndRefundUnitAbilities(this, engine); }

    executeAbility(
        ability: AbilityStatic,
        targets: ResolvedTarget[],
        engine: EngineContext,
        orderAbilityMode?: string,
    ): void { executeUnitAbility(this, ability, targets, engine, orderAbilityMode); }

    /** Set the ability note (overwrites any existing). Used by abilities during execution. */
    setAbilityNote(note: { abilityId: string; abilityNote: unknown } | null): void {
        this.abilityNote = note as AbilityNote | null;
    }

    /** Clear the ability note. */
    clearAbilityNote(): void {
        this.abilityNote = null;
    }

    toJSON(currentGameTick: number = 0): Record<string, unknown> {
        return serializeUnit(this, currentGameTick);
    }

    static fromJSON(data: Record<string, unknown>, eventBus: EventBus, currentGameTick: number = 0): Unit {
        const { characterId, portraitId } = normalizeLegacyUnitIdentity(data);
        const unit = new Unit({
            id: data.id as string,
            x: data.x as number,
            y: data.y as number,
            hp: data.hp as number,
            maxHp: data.maxHp as number,
            speed: data.speed as number,
            teamId: data.teamId as TeamId,
            ownerId: data.ownerId as string,
            characterId,
            portraitId,
            name: data.name as string,
            abilities: data.abilities as string[],
            stamina: (data.stamina as number | undefined) ?? 1,
            combatSettings: data.combatSettings as UnitCombatSettings | undefined,
            passiveBonuses: data.passiveBonuses as import('../../../../researchTrees/types').PassiveBonuses | undefined,
        });
        applySerializedUnitState(unit, data, eventBus, currentGameTick);
        return unit;
    }
}

