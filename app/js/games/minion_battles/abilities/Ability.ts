/**
 * Ability - Static base class for all abilities.
 *
 * Abilities are defined as static classes so that we can reference them
 * by ID (stored on the server) and look them up in the AbilityRegistry.
 * Each ability class holds all its properties as statics.
 */

import type { TargetDef } from './targeting';
import type { ResolvedTarget } from '../game/types';
import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';
import type { AbilityTimingEntry } from './abilityTimings';
import { getDoNotRefundCutoffElapsed } from './abilityTimings';
import type { AbilityEventRule } from './events/AbilityEventRule';
import type { UnitTag } from '../game/units/unitTag';
import type { PassiveDef } from './passiveDef';
import type { WindupLungeConfig } from './WindupLunge';

/** Minimal graphics interface for drawing ability previews (Pixi Graphics–compatible). */
export interface IAbilityPreviewGraphics {
    clear(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    circle(x: number, y: number, radius: number): void;
    fill(options: { color: number; alpha?: number }): void;
    stroke(options: { color: number; width: number; alpha?: number }): void;
}

export interface AbilityRenderOffset {
    x: number;
    y: number;
}

/** Resource cost for using an ability. */
export interface ResourceCost {
    resourceId: string;
    amount: number;
    /** If true, can be used while resource > 0, then pays full amount (may go negative). */
    allowPartialIfPositive?: boolean;
}

/** Possible ability states returned by getAbilityStates. */
export enum AbilityState {
    /** Slows the caster's movement. Data: { amount: number } (speed multiplier, e.g. 0.3 = 30% speed). */
    MOVEMENT_PENALTY = 'movement_penalty',
    /** Unit cannot be hit by projectiles. No data. */
    IFRAMES = 'iframes',
}

/** Event hooks for declarative ability rule execution. */
export enum AbilityEventType {
    /** Fires once when the cast starts and `beginActiveCast` has been initialized. */
    ON_CAST_START = 'on_cast_start',
    /** Fires each tick while the cast is active. Use rule conditions to gate timing windows. */
    ON_CAST_TICK = 'on_cast_tick',
    /** Fires once when the cast naturally ends or is removed from the active list. */
    ON_CAST_END = 'on_cast_end',
    /** Fires when this ability's attack successfully damages a target. */
    ON_ATTACK_HIT = 'on_attack_hit',
    /** Fires when this ability is blocked by another active blocking ability. */
    ON_ATTACK_BLOCKED = 'on_attack_blocked',
    /**
     * Fires on the **blocking** ability when it successfully blocks an attack.
     * `caster` = the defending unit; `attackInfo` has attack source coords for retaliation direction.
     * Prefer this over `onBlockSuccess` for new blocking abilities.
     */
    ON_BLOCK_SUCCESS = 'on_block_success',
    /** Fires once when this ability's evade window opens (legacy path for abilities with the `evade` tag). */
    ON_EVADE_START = 'on_evade_start',
    /**
     * Fires when a projectile launched by this ability expires — either because it hit a target
     * or because it reached its max range. `context.projectile` holds the expired projectile;
     * `context.hitUnit` holds the unit that was struck (absent on max-range expiry).
     */
    ON_PROJECTILE_EXPIRED = 'on_projectile_expired',
}

/**
 * Custom effect handler registered on an ability for use with `{ type: 'custom' }` event effects.
 * The `context` parameter is `AbilityEventRuntimeContext` from `abilities/events/AbilityEventRuntime.ts`
 * typed as `unknown` here to avoid a circular import. Cast it to access fields.
 */
export type AbilityCustomEffectHandler = (
    params: Record<string, unknown> | undefined,
    context: unknown,
) => void;

/** A single active state produced by an ability at a given time. */
export type AbilityStateEntry =
    | { state: AbilityState.MOVEMENT_PENALTY; data: { amount: number } }
    | { state: AbilityState.IFRAMES; data?: Record<string, never> };

/** Ninjutsu pool config for a specific ability. Controls how (or whether) the ability draws from the global attack budget. */
export interface AbilityNinjutsuConfig {
    /** If true, this ability bypasses the ninjutsu pool entirely (boss specials, defensive abilities). */
    ignore?: boolean;
    /** Pool units consumed when granted. Default: 1. */
    cost?: number;
    /** Post-grant delay as a fraction of ROUND_DURATION. Overrides the mission default when set. */
    overrideDelay?: number;
    /** Which named pool to draw from. Defaults to 'shadow'. */
    type?: string;
}

/** AI-specific settings that control when the AI will use this ability. */
export interface AbilityAISettings {
    /** Minimum distance (px) to target for the AI to consider using this ability. */
    minRange: number;
    /** Maximum distance (px) to target for the AI to consider using this ability. */
    maxRange: number;
    /** Max uses per round (for enemies). Omitted = no limit. */
    maxUsesPerRound?: number;
    /** Priority when multiple abilities can be used. Higher = preferred. Default 0. */
    priority?: number;
    /** Ninjutsu pool configuration. Absent = participate in default 'shadow' pool with cost 1. */
    ninjutsu?: AbilityNinjutsuConfig;
    /**
     * Which candidate-enemy pool `pickBestAbility` scores this ability against.
     * - `'lockedTarget'` (default when omitted): only the AI tree's current primary/locked
     *   target is considered — today's behavior for every existing ability.
     * - `'anyNearby'`: any enemy the calling tree node currently perceives is considered (see
     *   that node's `tryQueueAbilityOrder` call site for what "nearby" means there). Use for
     *   reactive/defensive abilities that should trigger off any threat, not just the unit's
     *   pursuit target.
     */
    candidateScope?: 'lockedTarget' | 'anyNearby';
    /**
     * When true, an ability with an empty `targets` array (self-cast / ground-AoE) is only a
     * valid AI choice when at least one candidate enemy is within `[minRange, maxRange]` of the
     * caster — the same distance check `pickBestAbility` already applies to targeted abilities.
     * Omitted/false preserves legacy behavior: zero-target abilities are considered valid
     * whenever any candidate enemy exists, ignoring `minRange`/`maxRange` entirely. Only
     * genuinely rangeless zero-target abilities (e.g. Alpha Wolf Summon, a self-cast with
     * `maxRange: 0`) should rely on that legacy behavior — any ability with a real max range
     * (ground-target AoEs like Thornbinder Bramble/Thorn Stomp) must set this to true.
     */
    enforceRangeWhenUntargeted?: boolean;
}

export type AbilityKeyword = 'nestedCard';

/** Per-cast mode options declared on an ability (distinct from research-granted AbilityModifier). */
export interface AbilityModesConfig {
    modes: readonly string[];
    defaultMode: string;
}

/**
 * Declarative windup telegraph rendered generically by `PreviewRenderer`.
 * When set, `Unit.executeAbility` captures the primary target position into
 * `castPayload` at cast start and no per-ability `beginActiveCast` / `renderActivePreview`
 * is needed for the standard shrinking-circle + aim-line visual.
 */
interface ShrinkingCircleTelegraph {
    kind: 'shrinkingCircle';
    /** Starting radius of the shrinking circle in world-space pixels. */
    startRadius: number;
    /** Pixi tint color (e.g. 0xff0000 for red). */
    color: number;
    /** Overall opacity multiplier (0–1). Default 1. */
    alpha?: number;
    /**
     * When true, the windup circle follows the primary unit target until lock breaks
     * (dodge or tether). Pixel targets remain static. Default false unless set by a factory.
     */
    trackTarget?: boolean;
}

interface GrowingLineTelegraph {
    kind: 'growingLine';
    /** Pixi tint color. */
    color: number;
    /** Overall opacity multiplier (0–1). Default 1. */
    alpha?: number;
    /** Line stroke width in pixels. Default 2. */
    lineWidth?: number;
    /** Extra px beyond caster.radius where the stub begins at progress 0. Default 4. */
    startOffset?: number;
    /** When true, the line tracks the target unit until lock breaks. Default false unless set by a factory. */
    trackTarget?: boolean;
}

export type AbilityTelegraph = ShrinkingCircleTelegraph | GrowingLineTelegraph;

/**
 * Simple capability / classification tags on an ability (distinct from structured `keywords` like nestedCard).
 * Extend this union when new tags are needed.
 */
export type AbilityTag = 'priority' | 'meleeTracking' | 'evade' | 'Entombed' | 'RockThrow' | 'free';

type AbilityTagResolver = (abilityId: string) => readonly AbilityTag[];

let abilityTagResolver: AbilityTagResolver | null = null;

/** Wired from `AbilityRegistry` after abilities are registered; avoids circular imports into `abilityUses`. */
export function setAbilityTagResolver(resolver: AbilityTagResolver): void {
    abilityTagResolver = resolver;
}

export function getAbilityTagsForId(abilityId: string): readonly AbilityTag[] {
    return abilityTagResolver?.(abilityId) ?? [];
}

export function abilityHasTag(abilityId: string, tag: AbilityTag): boolean {
    return getAbilityTagsForId(abilityId).includes(tag);
}

export interface AbilityKeywordDefs {
    nestedCard: {
        fallbackAbilityId: string;
    };
}

export type RecoveryChargeType = 'staminaCharge' | 'lightCharge' | 'energyCharge' | 'roundCharge' | 'commandCharge';

export interface AbilityRecoveryRule {
    chargeType: RecoveryChargeType;
    chargesPerRecovery: number;
    usesRecovered: number;
}

export type SwapTrigger =
    | { type: 'buffApplied'; buffType: string };

export type DeactivateTrigger =
    | { type: 'selfExhausted' }
    | { type: 'selfUsed' };

export interface AbilitySwapConfig {
    /** The trigger that causes this ability to activate and push aside `replacesAbilityId`. */
    activateTrigger: SwapTrigger;
    /** The ability ID that this ability replaces when it activates. */
    replacesAbilityId: string;
    /** Uses to grant when activating. Defaults to this ability's own `maxUses`. */
    usesOnActivation?: number;
    /** The trigger that causes this ability to deactivate and restore `replacedAbilityId`. */
    deactivateTrigger: DeactivateTrigger;
}

/** The shape every static ability class must implement. */
export interface AbilityStatic {
    /** Unique ability ID. */
    readonly id: string;
    /** Display name. */
    readonly name: string;
    /** Image URL or SVG string for the card. */
    readonly image: string;
    /** Resource cost to use the ability. Null means free. */
    readonly resourceCost: ResourceCost | null;
    /** Optional multi-resource costs. If set, this takes precedence over resourceCost. */
    readonly resourceCosts?: ResourceCost[];
    /**
     * Optional HP cost to cast this ability (deducted manually by the ability's cast behaviour,
     * not by the generic resource-cost pipeline). See `hpCostGate` for how affordability is gated.
     */
    readonly hpCost?: number;
    /**
     * Gating rule for `hpCost`. Defaults to `'requireSurplus'` when `hpCost` is set and this is
     * omitted.
     * - `'requireSurplus'`: caster must have `hp > hpCost` to cast (can't drop to 0 or below).
     * - `'floorAtOne'`: always castable regardless of current HP; deduction is clamped so it can't
     *   drop the caster below 1 HP.
     * - `'none'`: no HP-based affordability gating at all.
     */
    readonly hpCostGate?: 'requireSurplus' | 'floorAtOne' | 'none';
    /** Rounds the card spends in exile before returning to deck. */
    readonly rechargeTurns: number;
    /** Base max uses for this ability (default 1 when omitted). */
    readonly maxUses?: number;
    /** Uses available at battle start when different from maxUses (e.g. Energy Blast starts at 0). */
    readonly startingUses?: number;
    /** Recovery rules restoring uses. Default: 1 staminaCharge -> 1 use. */
    readonly recoveries?: readonly AbilityRecoveryRule[];
    /** Max-uses lookup. Default implementation returns this.maxUses; override for dynamic values. */
    getMaxUses?(): number;
    /** Ordered list of targets the player must select. */
    readonly targets: TargetDef[];
    /** Optional ability keywords that alter card lifecycle behavior. */
    readonly keywords?: Partial<{ [K in AbilityKeyword]: AbilityKeywordDefs[K] }>;
    /** Optional tags (e.g. recovery-charge priority). Distinct from `keywords`. */
    readonly tags?: readonly AbilityTag[];
    /** Optional declarative rules keyed by trigger event. */
    readonly abilityEvents?: Partial<Record<AbilityEventType, readonly AbilityEventRule[]>>;
    /**
     * Optional declarative windup telegraph. When set, `Unit.executeAbility` automatically
     * captures the primary target position into `castPayload` at cast start, and
     * `PreviewRenderer` draws an aim line plus a shrinking circle at the target over
     * `prefireTime`. No per-ability `beginActiveCast` or `renderActivePreview` is needed for
     * this visual.
     */
    readonly telegraph?: AbilityTelegraph;
    /**
     * Optional passive definition. When present, the engine's `processUnitPassives` fires this
     * automatically each tick — no cast order is needed. The unit must have this ability's ID in
     * its `abilities` list but never needs to cast it. See `abilities/passiveDef.ts` for the
     * available trigger types and effects.
     */
    readonly passive?: PassiveDef;
    /**
     * Optional windup lunge. When set, the caster physically steps forward toward the target during
     * the windup phase by up to `lunge.distance` px (reduced by terrain/research modifiers).
     * `defineAbility` automatically extends `getRange.maxRange` and generates `beginActiveCast` to
     * snapshot the lunge target into `castPayload` when this is present.
     */
    readonly lunge?: WindupLungeConfig;
    /**
     * Optional custom effect handlers for `{ type: 'custom' }` effects in `abilityEvents`.
     * Merged with any call-site handlers (call-site wins on key collision).
     * Context is `AbilityEventRuntimeContext`; cast as needed.
     */
    readonly customEffectHandlers?: Record<string, AbilityCustomEffectHandler>;
    /**
     * Optional target resolver. If omitted, callers should use `ability.targets`.
     * Use when target count/labels depend on runtime state (e.g. research).
     */
    getTargets?(caster?: Unit, gameState?: unknown): TargetDef[];
    /** AI settings controlling when this ability is used (range check). */
    readonly aiSettings?: AbilityAISettings;
    /** Caster must have ALL of these unit tags for the AI to consider using this ability. */
    readonly requiredTags?: readonly UnitTag[];
    /** Caster must have NONE of these unit tags for the AI to consider using this ability. */
    readonly forbiddenTags?: readonly UnitTag[];
    /**
     * Multiplies the attacker's flat damage bonus contribution for this ability.
     * Default behavior is 1; use lower values for multi-hit abilities.
     */
    readonly damageModifierMultiplier?: number;
    /**
     * Maximum extra random duration (seconds) this ability adds to individual cells of a
     * ground/air area effect it creates, so the area doesn't disappear all at once. Cells nearer
     * the area's center bias toward the upper half of `[0, durationJitterInSeconds]`; cells nearer
     * the edge bias toward the lower half (the midpoint, `durationJitterInSeconds / 2`, is implicit
     * and not itself configurable). Use with `engine.generateRandomInteger` for a synced result.
     */
    readonly durationJitterInSeconds?: number;
    /**
     * Declares that this ability's targeting and effect originate from a unit other than the caster.
     * - `type: 'pet'` — resolve from the caster's living pets.
     * - `selector: 'nearest'` — the single pet closest to the aim point (or caster if no aim point).
     * - `selector: 'all'` — all living pets of the caster.
     * Use `resolveAbilitySourceUnits` from `abilities/petCommands.ts` to evaluate at runtime.
     *
     * **Preview rule:** when set, `renderTargetingPreview` must draw from the resolved source unit
     * (via `createPetSourcedMovementPreview`), not from the caster. If the command orders a dash
     * on the source unit, import max distance and collision step from the delegate ability (e.g.
     * Pounce 0702) and use terrain-aware preview helpers — not `createPixelTargetPreview`.
     */
    readonly abilitySource?: { type: 'pet'; selector: 'nearest' | 'all' };
    /**
     * Time in seconds before the ability's main effect typically fires (windup / telegraph end).
     * The engine calls `doCardEffect` every tick until the cast ends; use this (or interval ids from
     * `abilityTimings`) inside `doCardEffect` for threshold checks. `AbilityBase` also uses it for the
     * default movement penalty until `prefireTime` elapses unless `getAbilityStates` is overridden.
     * Use `0` when the main effect is immediate.
     *
     * Cast **duration** and removal of the active ability entry come from `abilityTimings`
     * (`getTotalAbilityDuration` = `max(end)`), not from `prefireTime` alone.
     */
    readonly prefireTime: number;
    /**
     * `abilityTimings` interval `id` after which windup target-tracking stops ("fires").
     * When set, tracking mechanics that would otherwise cut off at `prefireTime` (e.g. the
     * telegraph aim in `telegraphTracking.ts`) instead freeze once the named interval starts.
     * Falls back to `prefireTime` when unset or the id is not found — see
     * `getTrackTargetCutoffElapsed` in `abilityTimings.ts`. Reusable by other "track the target
     * until X" mechanics beyond the telegraph.
     */
    readonly trackTargetUntilLabel?: string;
    /** Bright N tier for light-leaving abilities (see `brightKeyword.ts`). */
    readonly bright?: number;

    /**
     * When true, the unit's movement path is cleared when this ability naturally completes.
     * Use for abilities where continued movement after casting is unexpected (e.g. Throw Torch).
     */
    readonly clearMovementOnComplete?: boolean;

    /**
     * Optional per-cast mode toggle (e.g. push/pull). Mode is committed on the BattleOrder and
     * copied to ActiveAbility at cast start — behaviours read `ctx.abilityMode`, not UI state.
     */
    readonly abilityModes?: AbilityModesConfig;

    /**
     * Half-open timing intervals for UI (timeline, segmented cooldown ring) and duration (`max(end)`).
     * Required on every ability; use `abilities/abilityTimings.ts` helpers.
     */
    readonly abilityTimings: AbilityTimingEntry[];

    /**
     * Optional. When provided (with `caster` / `gameState`), overrides `abilityTimings` for that cast
     * (timeline, `getTotalAbilityDurationForCast`). Registry tests and static fallbacks still use `abilityTimings`.
     */
    getAbilityTimings?(caster?: Unit, gameState?: unknown): AbilityTimingEntry[];

    /**
     * Get tooltip lines for the card UI. Use {value} in a line for dynamic parts
     * (e.g. "Hit {1} enemy for {8} damage"). Dynamic segments are rendered in a distinct colour.
     */
    getTooltipText(gameState?: unknown): string[];

    /**
     * Execute the ability's effect over time using threshold checks.
     *
     * Called every tick while the ability is active. `prevTime` and `currentTime` are seconds elapsed
     * since the cast started. Fire one-shots with edge checks (e.g. `prevTime < 0.3 && currentTime >= 0.3`).
     * For repeating logic during a phase, gate on elapsed time or on `abilityTimings` (e.g. via helpers
     * in `abilityTimings.ts`), not only on `prefireTime`.
     *
     * The engine removes the active ability when `currentTime >= getTotalAbilityDuration(this)` (derived
     * from non-empty `abilityTimings`). That is independent of what `getAbilityStates` returns.
     *
     * On the first tick, `prevTime` is 0.
     */
    /** @deprecated Prefer `castBehaviours` on `abilityTimings` intervals for new abilities. */
    doCardEffect?(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void;

    /**
     * Optional. Called exactly once when an active ability entry is created (same tick as the order
     * that started the cast). Use for one-time setup (snapshots, resolved positions) and store data on
     * `active.castPayload` instead of relying on the first `doCardEffect` tick or phase boundaries.
     */
    beginActiveCast?(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        active: ActiveAbility,
    ): void;

    /**
     * Return active ability states at the given elapsed time (e.g. movement penalties, blocking).
     * Used by the engine alongside other unit logic; it does **not** control when the cast ends.
     * The active ability entry is removed when elapsed time reaches `getTotalAbilityDuration` from
     * `abilityTimings`, regardless of whether this method returns an empty list earlier or later.
     */
    getAbilityStates(currentTime: number): AbilityStateEntry[];

    /**
     * Optional. When implemented, `Unit` prefers this over `getAbilityStates` so per-cast data
     * (e.g. `castPayload` from `beginActiveCast`) can affect movement penalties and similar.
     */
    getAbilityStatesForActive?(currentTime: number, active: ActiveAbility): AbilityStateEntry[];

    /**
     * Optional. Render a preview while the ability is active (e.g. enemy telegraph).
     * Visible to all players. Called each frame until the ability ends.
     */
    renderActivePreview?(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void;

    /**
     * Optional. Returns a visual-only world-space offset for the caster while this cast is active.
     * This does not mutate simulation position, collision, or pathing.
     */
    getCasterRenderOffset?(
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
        gameState?: unknown,
    ): AbilityRenderOffset | null;

    /**
     * Optional. If provided, player-targeting range is validated (min/max distance).
     * For unit targets, distance is caster-to-target-unit center.
     */
    getRange?(caster: Unit): { minRange: number; maxRange: number } | null;

    /**
     * Optional. Render targeting preview using Pixi Graphics (range rings, crosshair, etc.).
     * Called each frame while the player is selecting a target.
     */
    renderTargetingPreview?(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
        gameState?: unknown,
    ): void;

    /**
     * Optional. Render additional targeting preview for already-selected targets (for multi-target abilities).
     * Called immediately after renderTargetingPreview, once per frame while selecting targets.
     */
    renderTargetingPreviewSelectedTargets?(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
        gameState?: unknown,
    ): void;

    /**
     * Optional. If this ability is currently providing a block (e.g. Raise Shield), return the arc in radians.
     * The arc is the range of angles (from the defender's perspective) from which an attack will be blocked.
     * Called when checking if an attack can be blocked; only blocking abilities implement this.
     */
    getBlockingArc?(
        caster: Unit,
        activeAbility: ActiveAbility,
        currentTime: number,
    ): { arcStartAngle: number; arcEndAngle: number } | null;

    /**
     * Optional. Called on this ability when its attack is blocked by a blocking ability (e.g. Raise Shield).
     * Each ability implements the behaviour when its attack is blocked: e.g. projectile abilities
     * destroy the projectile, melee abilities do nothing, charging abilities knock back the attacker.
     * Blocking abilities (the defender) never need to implement this — omit it entirely.
     */
    onAttackBlocked?(
        engine: unknown,
        defender: Unit,
        attackInfo: AttackBlockedInfo,
    ): void;

    /**
     * Optional. Called by projectile logic when a projectile reaches max range or hits a target.
     * Use this for on-expire side effects like explosions.
     */
    onProjectileExpired?(
        engine: unknown,
        caster: Unit,
        projectile: unknown,
        hitUnitId?: string,
    ): void;

    /**
     * @deprecated Prefer `abilityEvents[AbilityEventType.ON_BLOCK_SUCCESS]` rules for new abilities.
     * Called on the blocking ability when it successfully blocks an attack.
     * Receives the engine, defender (unit holding the shield), and attackInfo (includes attackSourceX/Y for retaliation direction).
     */
    onBlockSuccess?(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void;

    /**
     * Optional. Called at round start for each alive unit that has this ability.
     * Use for passive round-start effects (e.g. armour from terrain, resource charges).
     */
    onRoundStart?(unit: Unit, engine: import('../game/EngineContext').EngineContext): void;
    /** Swap network config. When present, this ability starts hidden and activates via the swap evaluator. */
    readonly swapConfig?: AbilitySwapConfig;
}

/** Information about an attack that was blocked. */
export interface AttackBlockedInfo {
    type: 'projectile' | 'melee' | 'charging';
    /** Present for projectile: the projectile. The attacking ability should deactivate it (e.g. set active = false). */
    projectile?: unknown;
    /** Unit ID of the attacker. */
    sourceUnitId?: string;
    /** World position of the attack source (projectile position or attacker position). Used for retaliation direction. */
    attackSourceX?: number;
    attackSourceY?: number;
}

/**
 * Check whether a unit can afford the resource cost for an ability.
 */
export function canAffordAbility(unit: Unit, ability: AbilityStatic): boolean {
    for (const cost of getAbilityResourceCosts(ability)) {
        const resource = unit.getResource(cost.resourceId);
        if (!resource) return false;
        if (cost.allowPartialIfPositive) {
            if (resource.current <= 0) return false;
            continue;
        }
        if (!resource.canAfford(cost.amount)) return false;
    }
    return true;
}

/**
 * Spend the resource cost for an ability. Returns false if cannot afford.
 */
export function spendAbilityCost(unit: Unit, ability: AbilityStatic): boolean {
    const costs = getAbilityResourceCosts(ability);
    if (costs.length === 0) return true;
    if (!canAffordAbility(unit, ability)) return false;
    for (const cost of costs) {
        const resource = unit.getResource(cost.resourceId);
        if (!resource) return false;
        if (cost.allowPartialIfPositive) {
            resource.current -= cost.amount;
            continue;
        }
        if (!resource.spend(cost.amount)) return false;
    }
    return true;
}

/**
 * Refund the resource cost for an ability (e.g. when the ability is interrupted).
 * `elapsed` is how far into the cast the interruption happened; if it's at or past the
 * ability's `doNotRefund` cutoff (see `getDoNotRefundCutoffElapsed`), no refund is given.
 */
export function refundAbilityCost(unit: Unit, ability: AbilityStatic, elapsed: number): void {
    if (elapsed >= getDoNotRefundCutoffElapsed(ability, unit)) return;
    for (const cost of getAbilityResourceCosts(ability)) {
        const resource = unit.getResource(cost.resourceId);
        if (resource) resource.add(cost.amount);
    }
}

/** Resolve runtime targets for an ability (dynamic if provided, otherwise static). */
export function getAbilityTargets(ability: AbilityStatic, caster?: Unit, gameState?: unknown): TargetDef[] {
    return ability.getTargets ? ability.getTargets(caster, gameState) : ability.targets;
}

export function getAbilityResourceCosts(ability: AbilityStatic): ResourceCost[] {
    if (ability.resourceCosts && ability.resourceCosts.length > 0) return ability.resourceCosts;
    if (ability.resourceCost) return [ability.resourceCost];
    return [];
}
