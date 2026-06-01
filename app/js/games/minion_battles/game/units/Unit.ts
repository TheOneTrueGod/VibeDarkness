/**
 * Unit - Base class for all units in the battle.
 *
 * Holds HP, team, owner, speed, resources, active abilities, wait lockout, and movement.
 * Supports waypoint-based pathfinding movement with terrain speed modifiers.
 * Subclasses define per-character defaults.
 */

import { GameObject, generateGameObjectId } from '../GameObject';
import { areEnemies, type TeamId } from '../teams';
import type { ActiveAbility } from '../types';
import type { AbilityNote } from '../AbilityNote';
import type { Resource } from '../../resources/Resource';
import type { EventBus } from '../EventBus';
import { getAbility } from '../../abilities/AbilityRegistry';
import { AbilityState, refundAbilityCost, spendAbilityCost, type AbilityStatic } from '../../abilities/Ability';
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
import { triggerAbilityEvent } from '../../abilities/events';
import { AbilityEventType } from '../../abilities/Ability';
import type { CastBehaviourInterruptContext } from '../../abilities/castBehaviourTypes';
import { isSelectTargetDef, isHitTargetDef } from '../../abilities/timingTargetDef';
import type { Buff, BuffSerialized } from '../../buffs/Buff';
import { buffFromJSON } from '../../buffs/buffRegistry';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import { computeForcedDisplacement } from '../forceMove';
import { DEFAULT_UNIT_RADIUS } from './unit_defs/unitConstants';
import { debugSettingsSnapshot } from '../../../../debug/debugSettingsStore';
import { PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE } from '../../../../gameConstants';
import { getDefaultHp, getUnitCombatCcDef, getUnitEnrageDef, PLAYER_CHARACTER_ID } from './unit_defs/unitDef';
import { getHealthBonusFromResearch } from '../../research/researchTrainingEffects';
import type { RecoveryChargeType } from '../../abilities/abilityUses';
import { UnitTag, parseUnitTagsFromJSON } from './unitTag';
import type { EnrageDef } from './enrageDef';
import { applyDamageToEarthCoreArmour } from '../../abilities/earthCoreArmour';
import type { CcResistKey } from '../../crowdControl/ccTypes';
import { getBrambleMovementMultiplier, type BramblePatch } from '../brambleSlow';
import type { LanterniteNestMissionConfig } from '../../storylines/types';
import type { EngineContext } from '../EngineContext';
import { tickUnitActiveAbilities } from './unitAbilityTick';
import { DarknessLevel } from '../darknessLevels';

/** Chebyshev grid tiles; after min wait time, end wait early if a live enemy is this close (wait+move failsafe). */
const WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID = 4;

/** Old unit.characterId values for player units before unified `player` id. */
const LEGACY_PLAYER_CHARACTER_IDS = new Set([
    'warrior', 'mage', 'ranger', 'healer', 'rogue', 'necromancer',
]);

/** AI behavior settings for enemy units. */
export interface AISettings {
    /** Minimum desired distance (px) to target. AI backs away if closer. */
    minRange: number;
    /** Maximum desired distance (px) to target. AI approaches if farther. */
    maxRange: number;
}

export type DamageModifier = { flatAmt: number; multiplier: number };

export interface UnitCombatSettings {
    damageModifier?: DamageModifier;
}

import type { UnitAIContext } from './unitAI/contextTypes';
export type { UnitAIContext } from './unitAI/contextTypes';

/** Movement state for a unit. */
export interface UnitMovement {
    /** Grid cells to traverse, each exactly 1 cell (cardinal or diagonal) from the previous. */
    path: { col: number; row: number }[];
    /** ID of the unit being pursued (undefined for ground-move orders). */
    targetUnitId: string | undefined;
    /** The gameTick when pathfinding was last computed. */
    pathfindingTick: number;
}

/** Source of knockback (for callbacks). Serializable. */
export interface KnockbackSource {
    /** Unit ID that applied the knockback. */
    unitId: string;
    /** Ability ID used. */
    abilityId: string;
}

/** Knockback state on a unit. Serializable. */
export interface KnockbackState {
    /** Direction and magnitude (px) of the knockback. */
    knockbackVector: { x: number; y: number };
    /** Time (seconds) the unit is in the air and cannot move; full vector applied. */
    knockbackAirTime: number;
    /** Time (seconds) after air during which half the vector is applied (slide). */
    knockbackSlideTime: number;
    /** Who applied the knockback (for callbacks). */
    knockbackSource: KnockbackSource;
    /** Time (seconds) this knockback has been active. */
    knockbackElapsed: number;
}

/** Parameters for applying knockback to a unit. */
export interface ApplyKnockbackParams {
    knockbackVector: { x: number; y: number };
    knockbackAirTime: number;
    knockbackSlideTime: number;
    knockbackSource: KnockbackSource;
}

export interface UnitAbilityRuntimeState {
    currentUses: number;
    maxUses: number;
    recoveryChargesByType: Partial<Record<RecoveryChargeType, number>>;
}

export class Unit extends GameObject {
    hp: number;
    maxHp: number;
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
    /** Stamina stat: round-start surge grants this many stamina charges to each eligible ability. */
    stamina: number = 1;

    /** Movement state: grid path, optional target unit, and pathfinding tick. */
    movement: UnitMovement | null = null;

    /** Ability IDs available to this unit. */
    abilities: string[] = [];

    /** Abilities currently being executed (tick-based effects in progress). */
    activeAbilities: ActiveAbility[] = [];

    /** Note set by the currently executing ability (e.g. stored target position). Cleared when ability ends or is overwritten. */
    abilityNote: AbilityNote | null = null;

    /** Visual radius for collision and rendering. */
    radius: number = 20;

    /** AI behavior settings (only used for AI-controlled units). */
    aiSettings: AISettings | null = null;

    /** Recalculate pathfinding every N ticks (0 = never). Set at spawn from engine RNG. */
    pathfindingRetriggerOffset: number = 0;

    /** True after forced movement (knockback, ability displacement); next normal move must recalculate path. */
    pathInvalidated: boolean = false;

    /** Per-controller AI context bag (serialized via toJSON/fromJSON). */
    aiContext: UnitAIContext = {};

    /** UnitAITree ID for AI-controlled units. Default 'default'. */
    unitAITreeId: string = 'default';

    /** Optional tags (crystal aura, boss UI, etc.). Serialized for checkpoints when non-empty. */
    tags: UnitTag[] = [];

    /** Enrage trigger sourced from the unit def — no backing field or serialization needed. */
    get enrageDef(): EnrageDef | undefined {
        return getUnitEnrageDef(this.characterId);
    }

    /** Per-unit aim jitter factor in [0, 1]. Used to bias attack direction. */
    moveJitter: number = 0;

    /** Seconds remaining in spawn animation (0 = not spawning). Unit is invisible and untargetable while > 0. */
    spawnTimer: number = 0;
    spawnParticleAcc1: number = 0;
    spawnParticleAcc2: number = 0;
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

    /**
     * How many darkness damage procs this unit has taken since last full reset.
     * Next proc deals `5 * (darknessDamageProcCount + 2)` damage (10 on first, +5 each subsequent). Reset when corruption drains to 0 outside full darkness.
     */
    darknessDamageProcCount: number = 0;

    /**
     * Knockback stability pool (legacy field name `poiseHp`). Depleted by knockback attempts;
     * unrelated to hard CC armour — see {@link Unit.applyKnockback}.
     */
    poiseHp: number = 0;
    /** Maximum knockback stability. Units with 0 skip the stability gate (knockback always applies). */
    maxPoiseHp: number = 0;

    /**
     * Reduces the effective tier of incoming tier-based knockback (see tryApplyKnockbackByTier).
     * Sourced from the unit def on demand — no backing field or serialization needed.
     */
    get knockbackResistance(): number {
        return getUnitCombatCcDef(this.characterId)?.knockbackResistance ?? 0;
    }

    /** Per-type CC duration resist; specific entry overrides `ALL`. Values 0–1 (fraction reduced). */
    ccDurationResistPct: Partial<Record<CcResistKey, number>> = {};
    /** Flat seconds removed after percent scaling; specific overrides `ALL`. */
    ccDurationFlatSec: Partial<Record<CcResistKey, number>> = {};
    /** Baseline hard CC threshold floor (absorbed hits before one lands). Boss default often 2. */
    hardCcArmourFloor: number = 0;
    /** When > 0, overrides the incoming hit's duration for the stun applied on CC armour break. */
    ccArmourBreakStunDuration: number = 0;
    /** Extra hard CC threshold from chain resist; decays per round toward 0. */
    bonusHardCcArmour: number = 0;
    /** Qualifying absorbed hard CC attempts since the last stun that actually applied. */
    hardCcArmourConsumed: number = 0;
    /** When > 0, successful hard CCs add stacking bonus per {@link Unit.chainCcStackNextIncrement}. */
    chainCcResist: number = 0;
    /** Apply one decay step to {@link Unit.bonusHardCcArmour} every N round ends. */
    chainCcDecayRounds: number = 1;
    /**
     * Next addend when a hard CC successfully lands and {@link Unit.chainCcResist} is active
     * (successive values 1, 2, 3, ...). Serialized for checkpoint determinism.
     */
    chainCcStackNextIncrement: number = 1;
    /** Counts round ends toward {@link Unit.chainCcDecayRounds} for bonus decay. */
    chainCcDecayRoundCounter: number = 0;
    /** Placeholder for future soft CC gate (matches hard CC pattern). */
    softCcArmourFloor: number = 0;
    /** Placeholder for future soft CC bonus pool. */
    bonusSoftCcArmour: number = 0;
    /** Bumps when a hard CC is absorbed or lands (for boss HUD animation). */
    hardCcArmourEventSerial: number = 0;
    lastHardCcEventGameTime: number = -1;
    lastHardCcEventKind: 'absorbed' | 'landed' | null = null;

    /** Active knockback state; unit cannot move while set. */
    knockback: KnockbackState | null = null;

    /** Active buffs/debuffs on this unit. Serialized for checkpoints. */
    buffs: Buff[] = [];
    /** Per-unit combat tuning values (optional, serialized). */
    combatSettings: UnitCombatSettings | undefined;

    /**
     * When non-null, unit dies when {@link GameEngine.gameTime} reaches this value (husks, etc.).
     */
    ephemeralDespawnAtGameTime: number | null = null;

    /** Set on Lanternites from a nest; skips global Lanternite corpse respawn. */
    lanterniteNestOwnerUnitId: string | null = null;

    /** Fixed far endpoint for nest-spawn Lanternite patrol legs. */
    lanternPatrolFarWorld: { x: number; y: number } | null = null;

    lanternPatrolLeg: 'toFar' | 'toNest' = 'toFar';

    /** Runtime config for `lanternite_nest`. */
    lanterniteNestConfig: LanterniteNestMissionConfig | null = null;

    /** Spawn pacing + bookkeeping for Lanternites created by this nest. */
    lanterniteNestSpawnState: { spawnedIds: string[]; nextSpawnAtGameTime: number } | null = null;

    /** Role assigned by the nest at spawn for networked behavior. */
    lanterniteRole: 'scout' | 'defender' | null = null;

    /** Scout: ID of the target `nest` POI this scout is pathfinding toward. */
    lanterniteTargetNestPoiId: string | null = null;

    /** Nest unit: ID of the `nest` POI this nest occupies. */
    lanterniteHomeNestPoiId: string | null = null;

    /** Scout: game time when construction completes and a new nest should spawn. */
    lanterniteConstructionCompleteAtGameTime: number | null = null;

    /** Stagger offset: unit is eligible to attack once gameTime reaches this value. */
    lanterniteAttackReadyAtGameTime: number = 0;

    /**
     * Angle (radians) at which this scout stands relative to the nest build target.
     * Assigned at spawn using golden-angle distribution so each scout has a unique offset.
     * Serialized so the scout stays at the same position after a checkpoint restore.
     */
    lanterniteConstructionAngle: number | null = null;

    /**
     * Runtime-only: true once the construction particle emitter has been registered.
     * Not serialized — the emitter is recreated next tick if needed after a restore.
     */
    lanterniteConstructionEmitterStarted: boolean = false;

    /** Active EffectEmitters created from declarative `emitterDef` on AbilityTimingInterval. Keyed by `intervalId`. Runtime-only. */
    activeTimingEmitters: Map<string, import('../effects/EffectEmitter').EffectEmitter> = new Map();

    /** Active sustained CastBehaviours for this unit's casts. Keyed by `${intervalId}_${behaviourIdx}`. Runtime-only. */
    activeCastBehaviours: Map<string, {
        entry: import('../../abilities/castBehaviourTypes').CastBehaviourEntry;
        intervalStart: number;
        intervalEnd: number;
        caster: Unit;
        active: ActiveAbility;
        /** targetDef from the parent timing interval, for resolving targetsByLabel. */
        targetDef?: import('../../abilities/timingTargetDef').TimingTargetDef;
    }> = new Map();

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        hp: number;
        maxHp?: number;
        speed: number;
        teamId: TeamId;
        ownerId: string;
        characterId: string;
        portraitId?: string;
        name: string;
        abilities?: string[];
        aiSettings?: AISettings | null;
        /** UnitAITree ID for AI. Default 'default'. */
        unitAITreeId?: string;
        /** Visual/collision radius. Defaults to DEFAULT_UNIT_RADIUS. */
        radius?: number;
        /** Max Poise HP. Default 0 (no poise). */
        maxPoiseHp?: number;
        /** Stamina stat. */
        stamina?: number;
        /** Optional per-unit combat tuning values. */
        combatSettings?: UnitCombatSettings;
        ephemeralDespawnAtGameTime?: number | null;
    }) {
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
        this.unitAITreeId = config.unitAITreeId ?? 'default';
        this.radius = config.radius ?? DEFAULT_UNIT_RADIUS;
        this.maxPoiseHp = config.maxPoiseHp ?? 0;
        this.poiseHp = this.maxPoiseHp;
        this.stamina = config.stamina ?? 1;
        this.combatSettings = config.combatSettings;
        this.ephemeralDespawnAtGameTime = config.ephemeralDespawnAtGameTime ?? null;
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

    /** Whether this unit cannot be damaged, targeted, or shown a health bar. */
    isInvincible(): boolean {
        return this.tags.includes(UnitTag.Invincible);
    }

    /** Whether this unit is in its spawn animation (invisible and untargetable). */
    isSpawning(): boolean {
        return this.spawnTimer > 0;
    }

    /**
     * Calculate max health from unit def base + health-affecting research.
     * Loops through RESEARCH_HEALTH_BONUSES for each researched node.
     * @param getResearchNodes Callback (treeId) => researched node IDs for this unit's owner.
     */
    calculateMaxHealth(getResearchNodes: (treeId: string) => string[]): number {
        const base = getDefaultHp(this.characterId);
        const bonus = getHealthBonusFromResearch(getResearchNodes);
        return base + bonus;
    }

    /** Return this unit's damage modifier; defaults to no bonus. */
    getDamageModifier(): DamageModifier {
        return this.combatSettings?.damageModifier ?? { flatAmt: 0, multiplier: 1 };
    }

    /** Apply damage to this unit. Returns actual damage dealt. */
    takeDamage(amount: number, sourceUnitId: string | null, eventBus: EventBus): number {
        if (!this.isAlive()) return 0;
        if (this.isInvincible()) return 0;
        if (this.isSpawning()) return 0;

        // God mode: prevent HP loss for player-controlled units.
        if (debugSettingsSnapshot.godModeEnabled && this.isPlayerControlled()) {
            return 0;
        }
        const incomingAmount = this.hasBuff('exposed') ? Math.round(amount * 1.2) : amount;
        const armourDamage = applyDamageToEarthCoreArmour(this, incomingAmount);
        const actual = Math.min(armourDamage.remainingDamage, this.hp);
        this.hp -= actual;

        eventBus.emit('damage_taken', {
            unitId: this.id,
            amount: actual,
            sourceUnitId,
            incomingDamage: amount,
            hpDamage: actual,
            armourRemoved: armourDamage.armourRemoved,
        });

        if (this.hp <= 0) {
            if (this.hasBuff('cant_die')) {
                this.hp = 1;
                return actual;
            }

            this.hp = 0;
            this.active = false;

            eventBus.emit('unit_died', {
                unitId: this.id,
                killerUnitId: sourceUnitId,
            });
        }

        return actual;
    }

    /** Set movement state with a grid-cell path. Clears movement if path is empty. Clears pathInvalidated. */
    setMovement(path: { col: number; row: number }[], targetUnitId: string | undefined, pathfindingTick: number): void {
        if (path.length === 0) {
            this.movement = null;
            return;
        }
        this.pathInvalidated = false;
        this.movement = {
            path: path.map((p) => ({ ...p })),
            targetUnitId,
            pathfindingTick,
        };
    }

    /** Clear all movement state. */
    clearMovement(): void {
        this.movement = null;
    }

    /**
     * Mark the current pathfinding route as invalid (e.g. after knockback or forced movement).
     * Next normal move will recalculate the path. Clears movement so the unit does not follow the old route.
     */
    invalidateMovementPath(): void {
        this.movement = null;
        this.pathInvalidated = true;
    }

    getEffectiveHardCcThreshold(): number {
        return this.hardCcArmourFloor + this.bonusHardCcArmour;
    }

    /** After a hard CC actually applies a debuff: stack chain bonus, then caller resets fill. */
    onSuccessfulHardCcLand(): void {
        if (this.chainCcResist > 0) {
            this.bonusHardCcArmour += this.chainCcStackNextIncrement;
            this.chainCcStackNextIncrement += 1;
        }
    }

    recordHardCcArmourEvent(kind: 'absorbed' | 'landed', gameTime: number): void {
        this.hardCcArmourEventSerial += 1;
        this.lastHardCcEventKind = kind;
        this.lastHardCcEventGameTime = gameTime;
    }

    /**
     * Decay {@link Unit.bonusHardCcArmour} at round boundaries (host + replicas).
     * One step per tick when the decay period elapses; effective threshold never below {@link Unit.hardCcArmourFloor}.
     */
    tickHardCcChainDecayAtRoundEnd(): void {
        if (this.chainCcDecayRounds <= 0) return;
        this.chainCcDecayRoundCounter += 1;
        if (this.chainCcDecayRoundCounter < this.chainCcDecayRounds) return;
        this.chainCcDecayRoundCounter = 0;
        if (this.bonusHardCcArmour > 0) {
            this.bonusHardCcArmour = Math.max(0, this.bonusHardCcArmour - 1);
        }
    }

    /**
     * Attempt to apply physical knockback. This uses **knockback stability** (`poiseHp` / `maxPoiseHp` only) —
     * not hard CC armour, stun resistance, or chain CC. Do not conflate with crowd control protection.
     * When stability blocks knockback, poise is reduced; when knockback applies, the unit is launched.
     */
    applyKnockback(
        poiseDamage: number,
        params: ApplyKnockbackParams,
        _eventBus: EventBus,
        onApplied?: (unit: Unit) => void,
    ): boolean {
        if (poiseDamage > 0) {
            this.poiseHp = Math.max(0, this.poiseHp - poiseDamage);
            if (this.maxPoiseHp > 0 && this.poiseHp > 0) return false;
        }
        this.knockback = {
            knockbackVector: { ...params.knockbackVector },
            knockbackAirTime: params.knockbackAirTime,
            knockbackSlideTime: params.knockbackSlideTime,
            knockbackSource: { ...params.knockbackSource },
            knockbackElapsed: 0,
        };
        this.invalidateMovementPath();
        onApplied?.(this);
        return true;
    }

    /** Whether the unit is currently being knocked back (cannot move or act). */
    isInKnockback(): boolean {
        return this.knockback !== null;
    }

    /**
     * Move the unit toward a world position by at most maxDistance.
     * If the unit has a movement path, checks whether a new step (current grid cell)
     * needs to be prepended to the path so pathfinding stays valid after the move.
     * Returns the actual distance moved.
     */
    moveUnit(towardX: number, towardY: number, maxDistance: number): number {
        const dx = towardX - this.x;
        const dy = towardY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return 0;

        const step = Math.min(maxDistance, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;

        if (this.movement && this.movement.path.length > 0) {
            const currentCol = Math.floor(this.x / CELL_SIZE);
            const currentRow = Math.floor(this.y / CELL_SIZE);
            const first = this.movement.path[0];
            if (currentCol !== first.col || currentRow !== first.row) {
                this.movement.path.unshift({ col: currentCol, row: currentRow });
            }
        }

        return step;
    }

    /** During wait+move: true if any live enemy is within Chebyshev distance on the grid from this unit's cell. */
    private hasEnemyWithinWaitProximityFailsafe(engine: unknown, maxChebyshevGrid: number): boolean {
        const units = (engine as { units?: readonly Unit[] }).units;
        if (!units?.length) return false;

        const myCol = Math.floor(this.x / CELL_SIZE);
        const myRow = Math.floor(this.y / CELL_SIZE);

        for (const other of units) {
            if (other === this || !other.isAlive()) continue;
            if (!areEnemies(this.teamId, other.teamId)) continue;
            const oCol = Math.floor(other.x / CELL_SIZE);
            const oRow = Math.floor(other.y / CELL_SIZE);
            if (Math.max(Math.abs(myCol - oCol), Math.abs(myRow - oRow)) <= maxChebyshevGrid) return true;
        }
        return false;
    }

    update(dt: number, engine: unknown): void {
        const eng = engine as { gameTime: number; roundNumber: number };
        const gameTime = eng.gameTime;
        const roundNumber = eng.roundNumber ?? 1;

        // Expire buffs
        this.buffs = this.buffs.filter((b) => !b.isExpired(gameTime, roundNumber));

        // Wait action: enforce minimum and maximum wait duration, allow early end when movement finishes,
        // or after min time if an enemy is within grid range (failsafe so long paths do not stall in melee).
        if (this.waitMinEndTime !== null && this.waitMaxEndTime !== null) {
            const reachedMovementTarget = !this.movement;
            const afterMin = gameTime >= this.waitMinEndTime;
            const afterMax = gameTime >= this.waitMaxEndTime;
            const enemyProximityFailsafe =
                afterMin && this.hasEnemyWithinWaitProximityFailsafe(engine, WAIT_ENEMY_PROXIMITY_FAILSAFE_GRID);

            const playerEarlyEnd = this.isPlayerControlled() && PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE && afterMin && reachedMovementTarget;
            if (afterMax || playerEarlyEnd || enemyProximityFailsafe) {
                this.waitMinEndTime = null;
                this.waitMaxEndTime = null;
                if (this.isPlayerControlled() && !PLAYER_WAIT_ENDS_ON_MOVEMENT_COMPLETE) {
                    this.movementPaused = true;
                }
            }
        }

        const terrainManager = (engine as { terrainManager?: TerrainManager }).terrainManager ?? null;
        const grid = terrainManager?.grid ?? null;

        // Knockback: unit cannot move normally; apply push and wall bounce
        if (this.knockback) {
            this.updateKnockback(dt, grid);
            return;
        }

        // Stunned/exposed units must not advance along a movement path (canAct already blocks new orders).
        if (this.hasBuff('stunned') || this.hasBuff('exposed')) {
            return;
        }

        // Move along grid path
        if (!this.isAlive() || !this.movement || this.movement.path.length === 0 || this.movementPaused) return;

        // Target: jittered position around the center of the next grid cell in the path
        const nextCell = this.movement.path[0];
        const centerX = nextCell.col * CELL_SIZE + CELL_SIZE / 2;
        const centerY = nextCell.row * CELL_SIZE + CELL_SIZE / 2;

        // Movement jitter: deterministic per-unit offset so multiple units in the same tile stand on different pixels.
        const jitterAngle = (this.moveJitter ?? 0) * Math.PI * 2;
        const jitterRadius = CELL_SIZE * 0.15;
        const jitterX = Math.cos(jitterAngle) * jitterRadius;
        const jitterY = Math.sin(jitterAngle) * jitterRadius;

        const targetX = centerX + jitterX;
        const targetY = centerY + jitterY;

        // Compute effective speed: base × ability penalties × terrain modifier × bramble patches
        let effectiveSpeed = this.getEffectiveSpeed(gameTime);
        const bp = (engine as { bramblePatches?: readonly BramblePatch[] }).bramblePatches;
        if (bp && bp.length > 0) {
            effectiveSpeed *= getBrambleMovementMultiplier(this.x, this.y, bp);
        }
        if (terrainManager) {
            effectiveSpeed *= terrainManager.getSpeedMultiplier(this.x, this.y);
        }

        // Debug: super speed for player-controlled units
        if (debugSettingsSnapshot.superSpeedEnabled && this.isPlayerControlled()) {
            effectiveSpeed *= 10;
        }

        // Move toward the jittered target within the tile
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const step = effectiveSpeed * dt;
        if (dist <= step) {
            this.x = targetX;
            this.y = targetY;
        } else if (dist > 0) {
            this.x += (dx / dist) * step;
            this.y += (dy / dist) * step;
        }

        // Only advance the path when we've effectively reached the jittered target position
        const remainingDx = targetX - this.x;
        const remainingDy = targetY - this.y;
        const remainingDistSq = remainingDx * remainingDx + remainingDy * remainingDy;
        const EPSILON = 1; // 1px tolerance
        if (remainingDistSq <= EPSILON * EPSILON) {
            this.movement.path.shift();
            if (this.movement.path.length === 0) {
                this.movement = null;
            }
        }
    }

    /**
     * Advance knockback state: apply push (full vector during air, half during slide).
     * If the next position would be out of bounds or unwalkable, knockback is cleared
     * immediately and no movement is applied.
     */
    private updateKnockback(dt: number, grid: TerrainGrid | null): void {
        const k = this.knockback!;
        const airTime = k.knockbackAirTime;
        const slideTime = k.knockbackSlideTime;
        const totalTime = airTime + slideTime;
        const v = k.knockbackVector;

        const displacementAt = (t: number): { x: number; y: number } => {
            if (t <= 0) return { x: 0, y: 0 };
            if (t <= airTime) {
                const f = t / airTime;
                return { x: v.x * f, y: v.y * f };
            }
            const slideT = Math.min(t - airTime, slideTime);
            return { x: v.x + 0.5 * (slideT / slideTime) * v.x, y: v.y + 0.5 * (slideT / slideTime) * v.y };
        };

        const prevElapsed = k.knockbackElapsed;
        k.knockbackElapsed = Math.min(k.knockbackElapsed + dt, totalTime);

        const prevD = displacementAt(prevElapsed);
        const newD = displacementAt(k.knockbackElapsed);
        const pushX = newD.x - prevD.x;
        const pushY = newD.y - prevD.y;

        const newX = this.x + pushX;
        const newY = this.y + pushY;

        const segmentLength = Math.sqrt(pushX * pushX + pushY * pushY);
        if (segmentLength > 0 && grid) {
            const { distance } = computeForcedDisplacement(
                this.x,
                this.y,
                newX,
                newY,
                segmentLength,
                { grid },
            );
            if (distance <= 0) {
                this.knockback = null;
                return;
            }

            const scale = distance / segmentLength;
            this.x += pushX * scale;
            this.y += pushY * scale;
        } else {
            this.x += pushX;
            this.y += pushY;
        }

        if (k.knockbackElapsed >= totalTime) {
            this.knockback = null;
        }
    }

    /**
     * Get the unit's effective speed accounting for movement penalties
     * from all active abilities. Takes the lowest penalty multiplier.
     */
    getEffectiveSpeed(gameTime: number): number {
        let lowestPenalty = 1;

        for (const active of this.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (!ability) continue;

            const currentTime = gameTime - active.startTime;
            const states =
                ability.getAbilityStatesForActive?.(currentTime, active) ??
                ability.getAbilityStates(currentTime);

            for (const entry of states) {
                if (entry.state === AbilityState.MOVEMENT_PENALTY) {
                    lowestPenalty = Math.min(lowestPenalty, entry.data.amount);
                }
            }
        }

        return this.speed * lowestPenalty;
    }

    /**
     * Whether the unit currently has invincibility frames from any active ability.
     * When true, projectiles should not deal damage to this unit.
     */
    hasIFrames(gameTime: number): boolean {
        for (const active of this.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (!ability) continue;

            const currentTime = gameTime - active.startTime;
            const states =
                ability.getAbilityStatesForActive?.(currentTime, active) ??
                ability.getAbilityStates(currentTime);

            for (const entry of states) {
                if (entry.state === AbilityState.IFRAMES) return true;
            }
        }
        return false;
    }

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
            !this.hasBuff('exposed') &&
            this.activeAbilities.length === 0 &&
            !this.isInWaitLockout()
        );
    }

    /** Fast check: does this unit have a buff of the given type? */
    hasBuff(buffType: string): boolean {
        return this.buffs.some((b) => b._type === buffType);
    }

    /** Add a buff to this unit. Caller sets appliedAtTime/appliedAtRound on the buff. */
    addBuff(buff: Buff, gameTime: number, roundNumber: number): void {
        buff.appliedAtTime = gameTime;
        buff.appliedAtRound = roundNumber;
        this.buffs.push(buff);
    }

    /** Interrupt all active abilities (e.g. when stunned). Refunds resource costs. */
    interruptAllAbilities(): void {
        for (const active of this.activeAbilities) {
            const ability = getAbility(active.abilityId);
            if (ability) refundAbilityCost(this, ability);
        }
        this.activeAbilities = [];
        this.clearAbilityNote();
    }

    tickActiveAbilities(dt: number, engine: EngineContext, onNaturalCompletion: () => void): void {
        tickUnitActiveAbilities(this, dt, engine, onNaturalCompletion);
    }

    onRoundStart(_roundNumber: number, engine: EngineContext): void {
        if (!this.isAlive()) return;
        this.applyStaminaSurge(Math.max(0, Math.floor(this.stamina)));
        this.grantRoundCharges();
        for (const abilityId of this.abilities) {
            getAbility(abilityId)?.onRoundStart?.(this, engine);
        }
        this.syncNestedCardState();
    }

    onRoundEnd(_roundNumber: number): void {
        this.tickHardCcChainDecayAtRoundEnd();
    }

    tickDarknessCorruption(dt: number, engine: EngineContext): void {
        const light = engine.getLightLevelAt(this.x, this.y);
        if (light === null) return;
        const inFullDarkness = light <= DarknessLevel.FULL_DARKNESS;
        const corruptionRate = 0.45;
        if (inFullDarkness) {
            this.corruptionProgress = Math.min(1, this.corruptionProgress + dt * corruptionRate);
        } else {
            this.corruptionProgress = Math.max(0, this.corruptionProgress - dt * corruptionRate);
            if (this.corruptionProgress <= 0) {
                this.darknessDamageProcCount = 0;
            }
        }
        if (inFullDarkness && this.corruptionProgress >= 1) {
            this.corruptionProgress = 0;
            const hitIndex = this.darknessDamageProcCount + 1;
            const damage = 5 * (hitIndex + 1);
            this.takeDamage(damage, null, engine.eventBus);
            this.darknessDamageProcCount += 1;
        }
    }

    tickMovement(dt: number, engine: EngineContext): void {
        this.update(dt, engine);
        if (this.ephemeralDespawnAtGameTime != null && engine.gameTime >= this.ephemeralDespawnAtGameTime) {
            this.hp = 0;
            this.active = false;
            engine.eventBus.emit('unit_died', { unitId: this.id, killerUnitId: null });
        }
    }

    // ---- Ability management OOP wrappers ----

    applyStaminaSurge(surgeAmount: number): void { applyStaminaSurgeToUnit(this, surgeAmount); }
    addRecoveryCharge(type: import('../../abilities/abilityUses').RecoveryChargeType, amount: number, rng: () => number): void { addRecoveryChargeToUnitAbilities(this, type, amount, rng); }
    grantRoundCharges(): void { grantRoundChargesToEligibleAbilities(this); }
    syncNestedCardState(): void { syncNestedCardAbilityState(this); }
    ensureAbilityRuntimeState(abilityId: string): void { ensureAbilityRuntimeStateUtil(this, abilityId); }
    canUseAbility(ability: AbilityStatic): boolean { return canUseAbilityNow(this, ability); }
    consumeAbilityUse(abilityId: string): boolean { return consumeAbilityUseUtil(this, abilityId); }
    spendAbilityCost(ability: AbilityStatic): boolean { return spendAbilityCost(this, ability); }
    refundAbilityCost(ability: AbilityStatic): void { refundAbilityCost(this, ability); }

    // ---- cleanupCastBehaviours: private helper for ability cancel / interrupt ----

    private cleanupCastBehavioursForAbility(active: ActiveAbility, engine: EngineContext): void {
        for (const [key, rec] of this.activeCastBehaviours) {
            if (rec.active !== active) continue;
            const fallback =
                active.targets[rec.entry.targetIndex ?? 0] ??
                active.targets[0] ??
                ({ type: 'pixel' as const, position: { x: this.x, y: this.y } });
            let target = fallback;
            const cleanupTargetDef = rec.targetDef;
            if (cleanupTargetDef) {
                if (isSelectTargetDef(cleanupTargetDef)) {
                    target = active.targetsByLabel?.[cleanupTargetDef.label] ?? fallback;
                } else if (isHitTargetDef(cleanupTargetDef)) {
                    for (const label of cleanupTargetDef.labels) {
                        const r = active.targetsByLabel?.[label];
                        if (r !== undefined) { target = r; break; }
                    }
                }
            }
            const ctx: CastBehaviourInterruptContext = {
                caster: this,
                abilityId: active.abilityId,
                target,
                allTargets: active.targets,
                castPayload: active.castPayload,
                behaviourPayload: active.castBehaviourPayloads?.[key],
                setBehaviourPayload: (data) => {
                    if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};
                    active.castBehaviourPayloads[key] = data;
                },
                engine,
            };
            rec.entry.behaviour.onInterrupt?.(ctx);
            this.activeCastBehaviours.delete(key);
        }
    }

    cancelActiveAbility(abilityId: string, engine: EngineContext): void {
        const idx = this.activeAbilities.findIndex((a) => a.abilityId === abilityId);
        if (idx < 0) return;
        const active = this.activeAbilities[idx];
        if (!active) return;
        const ability = getAbility(active.abilityId);
        if (ability) {
            const elapsed = Math.max(0, engine.gameTime - active.startTime);
            triggerAbilityEvent({
                engine,
                caster: this,
                ability,
                activeAbility: active,
                targets: active.targets,
                eventType: AbilityEventType.ON_CAST_END,
                prevTime: elapsed,
                currentTime: elapsed,
            });
        }
        this.cleanupCastBehavioursForAbility(active, engine);
        this.activeAbilities.splice(idx, 1);
    }

    interruptAndRefundAbilities(engine: EngineContext): void {
        while (this.activeAbilities.length > 0) {
            const active = this.activeAbilities[0];
            if (!active) break;
            const ability = getAbility(active.abilityId);
            if (ability) {
                refundAbilityCost(this, ability);
                const elapsed = Math.max(0, engine.gameTime - active.startTime);
                triggerAbilityEvent({
                    engine,
                    caster: this,
                    ability,
                    activeAbility: active,
                    targets: active.targets,
                    eventType: AbilityEventType.ON_CAST_END,
                    prevTime: elapsed,
                    currentTime: elapsed,
                });
            }
            this.cleanupCastBehavioursForAbility(active, engine);
            this.activeAbilities.splice(0, 1);
        }
        this.clearAbilityNote();
    }

    executeAbility(ability: AbilityStatic, targets: ResolvedTarget[], engine: EngineContext): void {
        ensureAbilityRuntimeStateUtil(this, ability.id);
        if (!canUseAbilityNow(this, ability)) return;
        if (!spendAbilityCost(this, ability)) return;
        if (!consumeAbilityUseUtil(this, ability.id)) return;
        syncNestedCardAbilityState(this);

        const existing = this.activeAbilities.findIndex((a) => a.abilityId === ability.id);
        if (existing >= 0) {
            const existingActive = this.activeAbilities[existing];
            if (existingActive) {
                const existingElapsed = Math.max(0, engine.gameTime - existingActive.startTime);
                triggerAbilityEvent({
                    engine,
                    caster: this,
                    ability,
                    activeAbility: existingActive,
                    targets: existingActive.targets,
                    eventType: AbilityEventType.ON_CAST_END,
                    prevTime: existingElapsed,
                    currentTime: existingElapsed,
                });
            }
            this.activeAbilities.splice(existing, 1);
            this.clearAbilityNote();
        }

        const active: ActiveAbility = {
            abilityId: ability.id,
            startTime: engine.gameTime,
            targets: targets.map((t) => ({ ...t })),
            castBehaviourPayloads: {},
            evadeFired: false,
        };
        ability.beginActiveCast?.(engine, this, active.targets, active);
        this.activeAbilities.push(active);
        triggerAbilityEvent({
            engine,
            caster: this,
            ability,
            activeAbility: active,
            targets: active.targets,
            eventType: AbilityEventType.ON_CAST_START,
            prevTime: 0,
            currentTime: 0,
        });

        engine.trackAbilityUse(this.id, ability.id);
        engine.eventBus.emit('ability_used', { unitId: this.id, abilityId: ability.id });
    }

    /** Set the ability note (overwrites any existing). Used by abilities during execution. */
    setAbilityNote(note: { abilityId: string; abilityNote: unknown } | null): void {
        this.abilityNote = note as AbilityNote | null;
    }

    /** Clear the ability note. */
    clearAbilityNote(): void {
        this.abilityNote = null;
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'unit',
            id: this.id,
            x: this.x,
            y: this.y,
            active: this.active,
            hp: this.hp,
            maxHp: this.maxHp,
            speed: this.speed,
            teamId: this.teamId,
            ownerId: this.ownerId,
            characterId: this.characterId,
            // Always persist a portrait id for players so JSON checkpoints do not omit it (undefined is stripped by JSON.stringify).
            portraitId:
                this.characterId === PLAYER_CHARACTER_ID ? (this.portraitId ?? 'warrior') : this.portraitId,
            name: this.name,
            movement: this.movement ? {
                path: this.movement.path.map((p) => ({ ...p })),
                targetUnitId: this.movement.targetUnitId,
                pathfindingTick: this.movement.pathfindingTick,
            } : null,
            abilities: this.abilities,
            activeAbilities: this.activeAbilities.map((a) => ({
                abilityId: a.abilityId,
                startTime: a.startTime,
                targets: a.targets.map((t) => ({ ...t })),
                fired: a.fired,
                castPayload:
                    a.castPayload !== undefined
                        ? JSON.parse(JSON.stringify(a.castPayload)) as unknown
                        : undefined,
            })),
            abilityNote: this.abilityNote,
            radius: this.radius,
            aiSettings: this.aiSettings,
            pathfindingRetriggerOffset: this.pathfindingRetriggerOffset,
            pathInvalidated: this.pathInvalidated,
            aiContext: this.aiContext,
            unitAITreeId: this.unitAITreeId,
            moveJitter: this.moveJitter,
            spawnTimer: this.spawnTimer,
            growAnimTimer: this.growAnimTimer,
            waitMinEndTime: this.waitMinEndTime,
            waitMaxEndTime: this.waitMaxEndTime,
            movementPaused: this.movementPaused,
            corruptionProgress: this.corruptionProgress,
            crystalCorruptionProgress: this.crystalCorruptionProgress,
            darknessDamageProcCount: this.darknessDamageProcCount,
            poiseHp: this.poiseHp,
            maxPoiseHp: this.maxPoiseHp,
            ccDurationResistPct: { ...this.ccDurationResistPct },
            ccDurationFlatSec: { ...this.ccDurationFlatSec },
            hardCcArmourFloor: this.hardCcArmourFloor,
            ccArmourBreakStunDuration: this.ccArmourBreakStunDuration,
            bonusHardCcArmour: this.bonusHardCcArmour,
            hardCcArmourConsumed: this.hardCcArmourConsumed,
            chainCcResist: this.chainCcResist,
            chainCcDecayRounds: this.chainCcDecayRounds,
            chainCcStackNextIncrement: this.chainCcStackNextIncrement,
            chainCcDecayRoundCounter: this.chainCcDecayRoundCounter,
            softCcArmourFloor: this.softCcArmourFloor,
            bonusSoftCcArmour: this.bonusSoftCcArmour,
            hardCcArmourEventSerial: this.hardCcArmourEventSerial,
            lastHardCcEventGameTime: this.lastHardCcEventGameTime,
            lastHardCcEventKind: this.lastHardCcEventKind,
            knockback: this.knockback ? {
                knockbackVector: { ...this.knockback.knockbackVector },
                knockbackAirTime: this.knockback.knockbackAirTime,
                knockbackSlideTime: this.knockback.knockbackSlideTime,
                knockbackSource: { ...this.knockback.knockbackSource },
                knockbackElapsed: this.knockback.knockbackElapsed,
            } : null,
            resources: this.resources.map((r) => r.toJSON()),
            abilityRuntime: Object.fromEntries(
                Object.entries(this.abilityRuntime).map(([abilityId, runtime]) => [
                    abilityId,
                    {
                        currentUses: runtime.currentUses,
                        maxUses: runtime.maxUses,
                        recoveryChargesByType: { ...runtime.recoveryChargesByType },
                    },
                ]),
            ),
            stamina: this.stamina,
            buffs: this.buffs.map((b) => b.toJSON()),
            combatSettings: this.combatSettings,
            ...(this.ephemeralDespawnAtGameTime != null
                ? { ephemeralDespawnAtGameTime: this.ephemeralDespawnAtGameTime }
                : {}),
            ...(this.tags.length > 0 ? { tags: [...this.tags] } : {}),
            ...(this.lanterniteNestOwnerUnitId != null ? { lanterniteNestOwnerUnitId: this.lanterniteNestOwnerUnitId } : {}),
            ...(this.lanternPatrolFarWorld != null ? { lanternPatrolFarWorld: { ...this.lanternPatrolFarWorld } } : {}),
            ...(this.lanternPatrolLeg !== 'toFar' ? { lanternPatrolLeg: this.lanternPatrolLeg } : {}),
            ...(this.lanterniteNestConfig != null
                ? { lanterniteNestConfig: JSON.parse(JSON.stringify(this.lanterniteNestConfig)) as LanterniteNestMissionConfig }
                : {}),
            ...(this.lanterniteNestSpawnState != null
                ? {
                      lanterniteNestSpawnState: {
                          spawnedIds: [...this.lanterniteNestSpawnState.spawnedIds],
                          nextSpawnAtGameTime: this.lanterniteNestSpawnState.nextSpawnAtGameTime,
                      },
                  }
                : {}),
            ...(this.lanterniteRole != null ? { lanterniteRole: this.lanterniteRole } : {}),
            ...(this.lanterniteTargetNestPoiId != null ? { lanterniteTargetNestPoiId: this.lanterniteTargetNestPoiId } : {}),
            ...(this.lanterniteHomeNestPoiId != null ? { lanterniteHomeNestPoiId: this.lanterniteHomeNestPoiId } : {}),
            ...(this.lanterniteConstructionCompleteAtGameTime != null ? { lanterniteConstructionCompleteAtGameTime: this.lanterniteConstructionCompleteAtGameTime } : {}),
            ...(this.lanterniteAttackReadyAtGameTime !== 0 ? { lanterniteAttackReadyAtGameTime: this.lanterniteAttackReadyAtGameTime } : {}),
            ...(this.lanterniteConstructionAngle != null ? { lanterniteConstructionAngle: this.lanterniteConstructionAngle } : {}),
        };
    }

    static fromJSON(data: Record<string, unknown>, _eventBus: EventBus): Unit {
        const ownerId = data.ownerId as string;
        let characterId = data.characterId as string;
        let portraitId = data.portraitId as string | undefined;
        if (LEGACY_PLAYER_CHARACTER_IDS.has(characterId) && ownerId !== 'ai') {
            portraitId = portraitId ?? characterId;
            characterId = PLAYER_CHARACTER_ID;
        }
        if (characterId === PLAYER_CHARACTER_ID && ownerId !== 'ai' && (portraitId === undefined || portraitId === '')) {
            portraitId = 'warrior';
        }
        const unit = new Unit({
            id: data.id as string,
            x: data.x as number,
            y: data.y as number,
            hp: data.hp as number,
            maxHp: data.maxHp as number,
            speed: data.speed as number,
            teamId: data.teamId as TeamId,
            ownerId,
            characterId,
            portraitId,
            name: data.name as string,
            abilities: data.abilities as string[],
            stamina: (data.stamina as number | undefined) ?? 1,
            combatSettings: data.combatSettings as UnitCombatSettings | undefined,
        });
        unit.active = data.active as boolean;
        if (data.ephemeralDespawnAtGameTime != null) {
            unit.ephemeralDespawnAtGameTime = data.ephemeralDespawnAtGameTime as number;
        }
        if (data.lanterniteNestOwnerUnitId != null) {
            unit.lanterniteNestOwnerUnitId = data.lanterniteNestOwnerUnitId as string;
        }
        if (data.lanternPatrolFarWorld != null) {
            const w = data.lanternPatrolFarWorld as { x?: number; y?: number };
            if (typeof w.x === 'number' && typeof w.y === 'number') unit.lanternPatrolFarWorld = { x: w.x, y: w.y };
        }
        if (data.lanternPatrolLeg === 'toNest' || data.lanternPatrolLeg === 'toFar') {
            unit.lanternPatrolLeg = data.lanternPatrolLeg;
        }
        if (data.lanterniteNestConfig != null) {
            unit.lanterniteNestConfig = data.lanterniteNestConfig as LanterniteNestMissionConfig;
        }
        if (data.lanterniteNestSpawnState != null) {
            const s = data.lanterniteNestSpawnState as { spawnedIds?: unknown; nextSpawnAtGameTime?: number };
            const ids = Array.isArray(s.spawnedIds)
                ? (s.spawnedIds as unknown[]).filter((x): x is string => typeof x === 'string')
                : [];
            if (typeof s.nextSpawnAtGameTime === 'number') {
                unit.lanterniteNestSpawnState = { spawnedIds: ids, nextSpawnAtGameTime: s.nextSpawnAtGameTime };
            }
        }
        if (data.lanterniteRole === 'scout' || data.lanterniteRole === 'defender') {
            unit.lanterniteRole = data.lanterniteRole;
        }
        if (typeof data.lanterniteTargetNestPoiId === 'string') {
            unit.lanterniteTargetNestPoiId = data.lanterniteTargetNestPoiId;
        }
        if (typeof data.lanterniteHomeNestPoiId === 'string') {
            unit.lanterniteHomeNestPoiId = data.lanterniteHomeNestPoiId;
        }
        if (typeof data.lanterniteConstructionCompleteAtGameTime === 'number') {
            unit.lanterniteConstructionCompleteAtGameTime = data.lanterniteConstructionCompleteAtGameTime;
        }
        if (typeof data.lanterniteAttackReadyAtGameTime === 'number') {
            unit.lanterniteAttackReadyAtGameTime = data.lanterniteAttackReadyAtGameTime;
        }
        if (typeof data.lanterniteConstructionAngle === 'number') {
            unit.lanterniteConstructionAngle = data.lanterniteConstructionAngle;
        }

        // Restore movement
        const movementData = data.movement as {
            path: { col: number; row: number }[];
            targetUnitId: string | undefined;
            pathfindingTick: number;
        } | null;
        if (movementData && movementData.path && movementData.path.length > 0) {
            unit.movement = {
                path: movementData.path.map((p) => ({ ...p })),
                targetUnitId: movementData.targetUnitId,
                pathfindingTick: movementData.pathfindingTick,
            };
        }

        unit.radius = (data.radius as number) ?? DEFAULT_UNIT_RADIUS;
        unit.aiSettings = (data.aiSettings as AISettings | null) ?? null;
        unit.pathfindingRetriggerOffset = (data.pathfindingRetriggerOffset as number) ?? 0;
        unit.pathInvalidated = (data.pathInvalidated as boolean) ?? false;
        const rawCtx = (data.aiContext ?? {}) as Record<string, unknown>;
        if (rawCtx.unitAINodeId !== undefined) { rawCtx.aiState = rawCtx.unitAINodeId; delete rawCtx.unitAINodeId; }
        if (rawCtx.aiTargetUnitId !== undefined) { rawCtx.targetUnitId = rawCtx.aiTargetUnitId; delete rawCtx.aiTargetUnitId; }
        unit.aiContext = rawCtx as UnitAIContext;
        unit.unitAITreeId = (data.unitAITreeId as string) ?? 'default';
        unit.moveJitter = (data.moveJitter as number) ?? 0;
        unit.spawnTimer = (data.spawnTimer as number | undefined) ?? 0;
        unit.growAnimTimer = (data.growAnimTimer as number | undefined) ?? 0;
        unit.waitMinEndTime = (data.waitMinEndTime as number | null) ?? null;
        unit.waitMaxEndTime = (data.waitMaxEndTime as number | null) ?? null;
        unit.movementPaused = (data.movementPaused as boolean | undefined) ?? false;
        unit.poiseHp = (data.poiseHp as number) ?? 0;
        unit.maxPoiseHp = (data.maxPoiseHp as number) ?? 0;
        unit.ccDurationResistPct = { ...(data.ccDurationResistPct as Partial<Record<CcResistKey, number>> | undefined) };
        unit.ccDurationFlatSec = { ...(data.ccDurationFlatSec as Partial<Record<CcResistKey, number>> | undefined) };
        unit.hardCcArmourFloor = (data.hardCcArmourFloor as number | undefined) ?? 0;
        unit.ccArmourBreakStunDuration = (data.ccArmourBreakStunDuration as number | undefined) ?? 0;
        unit.bonusHardCcArmour = (data.bonusHardCcArmour as number | undefined) ?? 0;
        unit.hardCcArmourConsumed = (data.hardCcArmourConsumed as number | undefined) ?? 0;
        unit.chainCcResist = (data.chainCcResist as number | undefined) ?? 0;
        unit.chainCcDecayRounds = (data.chainCcDecayRounds as number | undefined) ?? 1;
        unit.chainCcStackNextIncrement = (data.chainCcStackNextIncrement as number | undefined) ?? 1;
        unit.chainCcDecayRoundCounter = (data.chainCcDecayRoundCounter as number | undefined) ?? 0;
        unit.softCcArmourFloor = (data.softCcArmourFloor as number | undefined) ?? 0;
        unit.bonusSoftCcArmour = (data.bonusSoftCcArmour as number | undefined) ?? 0;
        unit.hardCcArmourEventSerial = (data.hardCcArmourEventSerial as number | undefined) ?? 0;
        unit.lastHardCcEventGameTime = (data.lastHardCcEventGameTime as number | undefined) ?? -1;
        const ev = data.lastHardCcEventKind;
        unit.lastHardCcEventKind = ev === 'absorbed' || ev === 'landed' ? ev : null;
        unit.corruptionProgress = Math.max(0, Math.min(1, (data.corruptionProgress as number) ?? 0));
        unit.crystalCorruptionProgress = Math.max(0, Math.min(1, (data.crystalCorruptionProgress as number) ?? 0));
        unit.darknessDamageProcCount = Math.max(0, Math.floor((data.darknessDamageProcCount as number) ?? 0));
        const kb = data.knockback as KnockbackState | null;
        if (kb && typeof kb.knockbackElapsed === 'number') {
            unit.knockback = {
                knockbackVector: { ...(kb.knockbackVector as { x: number; y: number }) },
                knockbackAirTime: kb.knockbackAirTime as number,
                knockbackSlideTime: kb.knockbackSlideTime as number,
                knockbackSource: { ...(kb.knockbackSource as KnockbackSource) },
                knockbackElapsed: kb.knockbackElapsed,
            };
        }
        unit.activeAbilities = (data.activeAbilities as ActiveAbility[]) ?? [];
        unit.abilityNote = (data.abilityNote as AbilityNote | null) ?? null;

        const buffsData = (data.buffs as BuffSerialized[] | undefined) ?? [];
        unit.buffs = buffsData.map((b) => buffFromJSON(b));
        unit.tags = parseUnitTagsFromJSON(data.tags);
        const runtimeData = (data.abilityRuntime as Record<string, UnitAbilityRuntimeState> | undefined) ?? {};
        unit.abilityRuntime = Object.fromEntries(
            Object.entries(runtimeData).map(([abilityId, runtime]) => [
                abilityId,
                {
                    currentUses: runtime.currentUses,
                    maxUses: runtime.maxUses,
                    recoveryChargesByType: { ...(runtime.recoveryChargesByType ?? {}) },
                },
            ]),
        );

        // Resources are reattached by the unit subclass factory
        return unit;
    }
}
