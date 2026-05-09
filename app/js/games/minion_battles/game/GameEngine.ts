/**
 * GameEngine - Core game loop for the battle phase.
 *
 * Thin orchestrator ("manager of managers") that delegates data ownership,
 * CRUD, queries, and per-tick processing to specialized managers while
 * preserving the existing public API via facade methods/getters.
 */

import { EventBus, type DamageTakenEvent, type NearbyStoneDamagedEvent } from './EventBus';
import {
    normalizeWaitingForOrdersFromJSON,
    type ActiveAbility,
    type OrderWaiter,
    type WaitingForOrders,
    type SerializedGameState,
    type BattleOrder,
    type OrderAtTick,
    type ResolvedTarget,
} from './types';
import { Unit } from './units/Unit';
import { Projectile } from './projectiles/Projectile';
import { Effect } from './effects/Effect';
import { getAbility } from '../abilities/AbilityRegistry';
import {
    elapsedIsInCoopCooldown,
    getTotalAbilityDurationForCast,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../abilities/abilityTimings';
import { spendAbilityCost, refundAbilityCost } from '../abilities/Ability';
import type { AbilityStatic } from '../abilities/Ability';
import { AbilityEventType } from '../abilities/Ability';
import { areEnemies } from './teams';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { BattleObjectiveDef, LevelEvent } from '../storylines/types';
import type { SpecialTile } from './specialTiles/SpecialTile';
import { isTileDefendPoint } from './specialTiles/SpecialTile';
import { runUnitAI, runPathfindingRetrigger, getUnitAITree } from './units/unitAI';
import type { AIContext, AILightSource } from './units/unitAI';
import { getLightGrid, type LightSource } from './LightGrid';
import { DarkCreatureIconDeathEffect } from './deathEffects/DarkCreatureIconDeathEffect';
import { getDeathEffectDef } from './units/unit_defs/unitDef';
import type { CardDefId } from '../card_defs';
import type { EngineContext } from './EngineContext';
import { GameState } from './GameState';
import {
    FingerprintEvent,
    fingerprintFromHex,
    fingerprintInitial,
    fingerprintToHex,
    mix,
    type Fingerprint64,
} from './Fingerprint';
import {
    addRecoveryChargeToUnitAbilities,
    applyStaminaSurgeToUnit,
    canUseAbilityNow,
    consumeAbilityUse,
    ensureAbilityRuntimeState,
    grantRoundChargesToEligibleAbilities,
    syncNestedCardAbilityState,
} from '../abilities/abilityUses';
import { debugSettingsSnapshot, consumeDebugAdvanceTickRequest } from '../../../debug/debugSettingsStore';
import { onRoundProgressMilestone } from './roundProgressMilestones';
import { createDamageTakenEffect } from './createDamageTakenEffect';
import { triggerAbilityEvent } from '../abilities/events';
import { CantDieBuff } from '../buffs/CantDieBuff';
import { BEDROCK_SCAVENGER_PASSIVE_ID, countStoneTilesInTremorsense, getBedrockScavengerRoundStartArmour } from '../abilities/earthCoreMeleePassives';
import { grantEarthCoreArmourFromSource } from '../abilities/earthCoreArmour';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import { createGenericEnemy } from './units/GenericEnemy';
import { getDefaultHp, getDefaultSpeed } from './units/unit_defs/unitDef';
import {
    processLanternitePulseMilestone,
    removeLanterniteTorchEffects,
    LANTERNITE_CHARACTER_ID,
    LANTERNITE_RESPAWN_DELAY_SEC,
} from './lanternite/lanternitePulse';
import { processLanterniteNests } from './lanternite/lanterniteNestTick';

// Re-exports for backward compatibility
export type { CardInstance } from './managers/CardManager';
export { MAX_HAND_SIZE, CARDS_PER_ROUND } from './managers/CardManager';

/** Seconds of game time per round. */
const ROUND_DURATION = 10;
/** Matches default player stamina in unit defs; each ability receives this many stamina charges per surge unless overridden by unit stamina. */
export const DEFAULT_PLAYER_ROUND_STAMINA_SURGE = 3;
const CHARGED_ROCKS_NODE_ID = 'charged_rocks';
const CHARGED_ROCKS_LIGHT_CHARGE_PER_ROUND = 1;

/** Fixed time step (seconds): 60 ticks/second. */
const FIXED_DT = 1 / 60;

/** Save a checkpoint to the server every this many game ticks. */
export const CHECKPOINT_INTERVAL = 10;

/** Game world dimensions. */
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export type EngineStateCallback = () => void;

/** Per-cell light from `getLightGrid` (lower = darker). Corruption fills only in full darkness — see `FULL_DARKNESS_THRESHOLD`. */
const FULL_DARKNESS_THRESHOLD = -20;

function parseGameObjectIdNumber(id: string): number | null {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : null;
}

export class GameEngine implements EngineContext {
    /** Simulation data: managers, terrain, queues, timing scalars. */
    readonly state = new GameState(this);

    // -- Loop / orchestration (not stored on GameState) --
    private accumulator = 0;
    private lastTimestamp = 0;
    private animFrameId = 0;
    private running = false;

    /** Monotonic id suffix for new GameObjects created while this engine is authoritative. */
    private objectIdSeq = 1;

    /** Pending Lanternite respawns (Spore rebirth). */
    private lanterniteRespawns: Array<{ atGameTime: number; x: number; y: number }> = [];

    /**
     * Parallel order pause detected at end of a tick; committed at the **start** of the next
     * `fixedUpdate` (before `gameTick` / `gameTime` advance) so every unit's `update` ran on the prior tick.
     */
    private deferredOrderPause: { waiters: OrderWaiter[]; naturalCompletionUnitIds: readonly string[] } | null = null;

    /** Units whose casts ended by duration this tick (cleared each normal tick before `processActiveAbilities`). */
    private naturalAbilityCompletionUnitIdsThisTick = new Set<string>();

    // -- Callbacks (engine wiring, not serialized) --
    private onWaitingForOrders: ((info: WaitingForOrders) => void) | null = null;
    private onRoundEnd: ((roundNumber: number) => void) | null = null;
    private onStateChanged: EngineStateCallback | null = null;
    private onCheckpoint: ((gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void) | null = null;
    private onTickComplete: ((gameTick: number, fingerprintHex: string, paused: boolean) => void) | null = null;
    private appliedRoundStartRecovery = false;
    private appliedMidRoundRecovery = false;

    get eventBus(): EventBus {
        return this.state.eventBus;
    }

    get randomSeed(): number {
        return this.state.randomSeed;
    }
    set randomSeed(v: number) {
        this.state.randomSeed = v;
    }

    get gameTime(): number {
        return this.state.gameTime;
    }
    set gameTime(v: number) {
        this.state.gameTime = v;
    }

    get gameTick(): number {
        return this.state.gameTick;
    }
    set gameTick(v: number) {
        this.state.gameTick = v;
    }

    get roundNumber(): number {
        return this.state.roundNumber;
    }
    set roundNumber(v: number) {
        this.state.roundNumber = v;
    }

    get snapshotIndex(): number {
        return this.state.snapshotIndex;
    }
    set snapshotIndex(v: number) {
        this.state.snapshotIndex = v;
    }

    get isPaused(): boolean {
        return this.state.isPaused;
    }
    set isPaused(v: boolean) {
        this.state.isPaused = v;
    }

    get waitingForOrders(): WaitingForOrders | null {
        return this.state.waitingForOrders;
    }
    set waitingForOrders(v: WaitingForOrders | null) {
        this.state.waitingForOrders = v;
    }

    get storyPauseActive(): boolean {
        return this.state.storyPauseActive;
    }
    set storyPauseActive(v: boolean) {
        this.state.storyPauseActive = v;
    }

    get storyPauseReason(): string | null {
        return this.state.storyPauseReason;
    }
    set storyPauseReason(v: string | null) {
        this.state.storyPauseReason = v;
    }

    get storyPauseEndsAt(): number | null {
        return this.state.storyPauseEndsAt;
    }
    set storyPauseEndsAt(v: number | null) {
        this.state.storyPauseEndsAt = v;
    }

    get runtimeFingerprint(): Fingerprint64 {
        return this.state.runtimeFingerprint;
    }
    set runtimeFingerprint(v: Fingerprint64) {
        this.state.runtimeFingerprint = [v[0] >>> 0, v[1] >>> 0];
    }

    get terrainManager(): TerrainManager | null {
        return this.state.terrainManager;
    }
    set terrainManager(v: TerrainManager | null) {
        this.state.terrainManager = v;
    }

    get pendingOrders(): OrderAtTick[] {
        return this.state.pendingOrders;
    }
    set pendingOrders(v: OrderAtTick[]) {
        this.state.pendingOrders = v;
    }

    get localPlayerId(): string {
        return this.state.localPlayerId;
    }
    set localPlayerId(v: string) {
        this.state.localPlayerId = v;
    }

    get aiControllerId(): string | null {
        return this.state.aiControllerId;
    }
    set aiControllerId(v: string | null) {
        this.state.aiControllerId = v;
    }

    get lightLevelEnabled(): boolean {
        return this.state.lightLevelEnabled;
    }
    set lightLevelEnabled(v: boolean) {
        this.state.lightLevelEnabled = v;
    }

    get globalLightLevel(): number {
        return this.state.globalLightLevel;
    }
    set globalLightLevel(v: number) {
        this.state.globalLightLevel = v;
    }

    // ========================================================================
    // Facade Getters / Methods
    // ========================================================================

    get units(): Unit[] { return this.state.unitManager.units; }
    get projectiles(): Projectile[] { return this.state.projectileManager.projectiles; }
    get effects(): Effect[] { return this.state.effectManager.effects; }
    get specialTiles(): SpecialTile[] { return this.state.specialTileManager.specialTiles; }
    get cards(): Record<string, import('./managers/CardManager').CardInstance[]> { return this.state.cardManager.cards; }
    set cards(value: Record<string, import('./managers/CardManager').CardInstance[]>) { this.state.cardManager.cards = value; }

    get playerResearchTreesByPlayer(): Record<string, Record<string, string[]>> {
        return this.state.cardManager.playerResearchTreesByPlayer;
    }
    set playerResearchTreesByPlayer(value: Record<string, Record<string, string[]>>) {
        this.state.cardManager.playerResearchTreesByPlayer = value;
    }

    addUnit(unit: Unit): void {
        this.state.unitManager.addUnit(unit);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(unit.id), Math.floor(unit.x), Math.floor(unit.y));
    }
    getUnit(id: string): Unit | undefined { return this.state.unitManager.getUnit(id); }
    getUnits(): Unit[] { return this.state.unitManager.getUnits(); }
    getLocalPlayerUnit(): Unit | undefined { return this.state.unitManager.getLocalPlayerUnit(this.localPlayerId); }
    getAllies(caster: Unit): Unit[] { return this.state.unitManager.getAllies(caster); }

    addProjectile(projectile: Projectile): void {
        this.state.projectileManager.addProjectile(projectile);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(projectile.id), Math.floor(projectile.x), Math.floor(projectile.y));
    }

    addEffect(effect: Effect): void {
        this.state.effectManager.addEffect(effect);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(effect.id), Math.floor(effect.x), Math.floor(effect.y));
    }

    addSpecialTile(tile: SpecialTile): void { this.state.specialTileManager.addSpecialTile(tile); }
    damageSpecialTile(tileId: string, amount: number): boolean { return this.state.specialTileManager.damageSpecialTile(tileId, amount); }
    getCrystalProtectionMap(): Map<string, number> { return this.state.specialTileManager.getCrystalProtectionMap(); }
    getCrystalProtectedSet(): Set<string> { return this.state.specialTileManager.getCrystalProtectedSet(); }
    getCrystalProtectionCount(col: number, row: number): number { return this.state.specialTileManager.getCrystalProtectionCount(col, row); }
    getDarkCrystalFilterSet(): Set<string> { return this.state.specialTileManager.getDarkCrystalFilterSet(); }

    drawCardsForPlayer(playerId: string, count: number): number { return this.state.cardManager.drawCardsForPlayer(playerId, count); }
    fillHandInnateFirst(playerId: string, maxHandSize: number): void { this.state.cardManager.fillHandInnateFirst(playerId, maxHandSize); }
    transferCardToAllyDeck(caster: Unit, cardDefId: CardDefId, abilityId: string): void { this.state.cardManager.transferCardToAllyDeck(caster, cardDefId, abilityId); }
    setPlayerResearchTreesByPlayer(map: Record<string, Record<string, string[]>>): void { this.state.cardManager.setPlayerResearchTreesByPlayer(map); }
    getPlayerResearchNodes(playerId: string, treeId: string): string[] { return this.state.cardManager.getPlayerResearchNodes(playerId, treeId); }

    registerLevelEvents(events: LevelEvent[]): void { this.state.levelEventManager.registerLevelEvents(events); }
    setLevelEvents(events: LevelEvent[]): void { this.state.levelEventManager.setLevelEvents(events); }
    registerBattleObjectives(defs: BattleObjectiveDef[]): void {
        this.state.objectiveManager.setDefs(defs);
    }

    getBattleObjectiveRows(): { id: string; label: string; completed: boolean }[] {
        return this.state.objectiveManager.getDisplayRows();
    }

    revealBattleObjectives(ids: readonly string[]): void {
        this.state.objectiveManager.revealObjectiveIds(ids);
    }

    setOnEmitMessage(cb: (text: string, npcId?: string) => void): void {
        this.state.levelEventManager.setOnEmitMessage(cb);
        this.state.objectiveManager.setOnEmitMessage(cb);
    }
    setOnVictory(cb: (missionResult: string) => void): void { this.state.levelEventManager.setOnVictory(cb); }
    setOnDefeat(cb: () => void): void { this.state.levelEventManager.setOnDefeat(cb); }

    // ========================================================================
    // World
    // ========================================================================

    getWorldWidth(): number {
        const grid = this.terrainManager?.grid;
        return grid ? grid.worldWidth : WORLD_WIDTH;
    }

    getWorldHeight(): number {
        const grid = this.terrainManager?.grid;
        return grid ? grid.worldHeight : WORLD_HEIGHT;
    }

    // ========================================================================
    // Light
    // ========================================================================

    getAllLightSources(): LightSource[] {
        return [
            ...this.state.specialTileManager.buildLightSourcesFromSpecialTiles(),
            ...this.state.effectManager.buildLightSourcesFromEffects(),
        ];
    }

    /** Light sources with id for AI (FindLight state). */
    private getLightSourcesForAI(): AILightSource[] {
        const out: AILightSource[] = [];
        for (const tile of this.specialTiles) {
            if (tile.hp <= 0) continue;
            const light = tile.emitsLight;
            if (light != null && tile.maxHp > 0) {
                const scale = 0.5 + 0.5 * (tile.hp / tile.maxHp);
                out.push({
                    id: tile.id,
                    col: tile.col,
                    row: tile.row,
                    emission: light.lightAmount * scale,
                    radius: light.radius,
                });
            }
        }
        const grid = this.terrainManager?.grid;
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as { lightAmount?: number; radius?: number };
            const emission = data.lightAmount ?? 0;
            const radius = data.radius ?? 0;
            if (emission <= 0 || radius <= 0) continue;
            const col = grid ? grid.worldToGrid(effect.x, effect.y).col : 0;
            const row = grid ? grid.worldToGrid(effect.x, effect.y).row : 0;
            out.push({ id: effect.id, col, row, emission, radius });
        }
        return out;
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    private registerCoreEventListeners(): void {
        this.eventBus.clear();

        this.eventBus.on('unit_died', (data) => {
            const unit = this.getUnit(data.unitId);
            if (!unit) return;
            if (unit.characterId === LANTERNITE_CHARACTER_ID) {
                removeLanterniteTorchEffects(unit.id, this.effects);
                if (unit.lanterniteNestOwnerUnitId == null) {
                    this.lanterniteRespawns.push({
                        atGameTime: this.gameTime + LANTERNITE_RESPAWN_DELAY_SEC,
                        x: unit.x,
                        y: unit.y,
                    });
                }
            }
            if (unit.characterId === 'alpha_wolf') {
                this.startAlphaWolfStoryDeathSequence(unit);
                return;
            }
            const deathEffectDef = getDeathEffectDef(unit.characterId);
            if (!deathEffectDef) return;
            if (deathEffectDef.kind === 'particleBurst') {
                new deathEffectDef.type({
                    image: deathEffectDef.image,
                    count: deathEffectDef.count,
                }).doEffect(this, unit);
            } else {
                new DarkCreatureIconDeathEffect(deathEffectDef.particleCount).doEffect(this, unit);
            }
        });

        this.eventBus.on('round_end', (data) => {
            this.handleRoundEnd(data.roundNumber);
        });

        this.eventBus.on('damage_taken', (data: DamageTakenEvent) => {
            createDamageTakenEffect(
                {
                    addEffect: (e) => this.addEffect(e),
                    generateRandomInteger: (min, max) => this.generateRandomInteger(min, max),
                    getUnit: (id) => this.getUnit(id),
                },
                data,
            );
        });

        this.eventBus.on('round_start', () => {
            if (!this.terrainManager) return;
            for (const unit of this.units) {
                if (!unit.isAlive()) continue;
                if (!unit.abilities.includes(BEDROCK_SCAVENGER_PASSIVE_ID)) continue;
                const stoneTiles = countStoneTilesInTremorsense(unit, this.terrainManager);
                const armourGain = getBedrockScavengerRoundStartArmour(stoneTiles);
                if (armourGain <= 0) continue;
                grantEarthCoreArmourFromSource(unit, 'bedrock_scavenger', armourGain, 3);
            }
        });
        this.eventBus.on('damage_taken', (data) => {
            this.mixRuntimeFingerprint(FingerprintEvent.DAMAGE, this.hashString32(data.unitId), Math.floor(data.amount));
        });
        this.eventBus.on('unit_died', (data) => {
            this.mixRuntimeFingerprint(
                FingerprintEvent.DEATH,
                this.hashString32(data.unitId),
                this.hashString32(data.killerUnitId ?? ''),
            );
        });
        this.eventBus.on('projectile_hit', (data) => {
            this.mixRuntimeFingerprint(
                FingerprintEvent.PROJECTILE_HIT,
                this.hashString32(data.projectileId),
                this.hashString32(data.targetUnitId),
            );
        });
    }

    private startStoryPause(reason: string, durationSeconds: number): void {
        this.storyPauseActive = true;
        this.storyPauseReason = reason;
        this.storyPauseEndsAt = this.gameTime + durationSeconds;
        this.waitingForOrders = null;
        this.deferredOrderPause = null;
        this.isPaused = false;
        for (const unit of this.units) {
            if (!unit.isPlayerControlled() || !unit.isAlive()) continue;
            if (unit.hasBuff('cant_die')) continue;
            unit.addBuff(new CantDieBuff(durationSeconds), this.gameTime, this.roundNumber);
        }
        this.onStateChanged?.();
    }

    private endStoryPause(): void {
        this.storyPauseActive = false;
        this.storyPauseReason = null;
        this.storyPauseEndsAt = null;
        for (const unit of this.units) {
            if (!unit.isPlayerControlled()) continue;
            unit.buffs = unit.buffs.filter((buff) => buff._type !== 'cant_die');
        }
    }

    private startAlphaWolfStoryDeathSequence(unit: Unit): void {
        const STORY_DURATION_SECONDS = 5;
        this.startStoryPause('alpha_wolf_death', STORY_DURATION_SECONDS);
        this.addEffect(
            new Effect({
                x: unit.x,
                y: unit.y,
                duration: STORY_DURATION_SECONDS,
                effectType: 'AlphaWolfStoryRemnant',
                effectData: {
                    remnantCharacterKey: 'alpha_wolf',
                    shakeFrequencyHz: 3.5,
                    shakeAmplitudePx: 4,
                },
            }),
        );
        this.addEffect(
            new Effect({
                x: unit.x,
                y: unit.y,
                duration: STORY_DURATION_SECONDS,
                effectType: 'AlphaWolfStoryController',
                effectData: {
                    seededAt: this.gameTime,
                    radialRatePerSecond: 24,
                    homingRatePerSecond: 20,
                    radialRemainder: 0,
                    homingRemainder: 0,
                },
            }),
        );
    }

    prepareForNewGame(config: {
        localPlayerId: string;
        randomSeed: number;
        terrainManager?: TerrainManager | null;
        aiControllerId?: string | null;
    }): void {
        this.registerCoreEventListeners();
        this.localPlayerId = config.localPlayerId;
        this.terrainManager = config.terrainManager ?? null;
        this.terrainManager?.setStoneDamagedEmitter((event) => {
            this.eventBus.emit('terrain_stone_damaged', event);
        });
        this.aiControllerId = config.aiControllerId ?? null;
        this.state.levelEventManager.resetTerminalState();
        this.resetObjectIdSequence(1);
        this.randomSeed = config.randomSeed >>> 0;
        this.runtimeFingerprint = fingerprintInitial();
        this.state.runtimeFingerprintRing.clear();
        this.appliedRoundStartRecovery = false;
        this.appliedMidRoundRecovery = false;
    }

    setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
        this.lightLevelEnabled = lightLevelEnabled;
        this.globalLightLevel = globalLightLevel;
    }

    setOnWaitingForOrders(cb: (info: WaitingForOrders) => void): void {
        this.onWaitingForOrders = cb;
    }

    setOnRoundEnd(cb: (roundNumber: number) => void): void {
        this.onRoundEnd = cb;
    }

    setOnStateChanged(cb: EngineStateCallback): void {
        this.onStateChanged = cb;
    }

    setOnCheckpoint(cb: (gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void): void {
        this.onCheckpoint = cb;
    }

    setOnTickComplete(cb: (gameTick: number, fingerprintHex: string, paused: boolean) => void): void {
        this.onTickComplete = cb;
    }

    // ========================================================================
    // RNG
    // ========================================================================

    generateRandomNumber(): number {
        this.randomSeed = ((this.randomSeed * 1103515245 + 12345) >>> 0);
        this.mixRuntimeFingerprint(FingerprintEvent.RNG, this.randomSeed);
        return this.randomSeed & 0x7fffffff;
    }

    generateRandomInteger(min: number, max: number): number {
        if (max < min) return min;
        const n = this.generateRandomNumber();
        const range = max - min + 1;
        return min + (n % range);
    }

    // ========================================================================
    // Game Loop
    // ========================================================================

    start(): void {
        if (this.running) return;
        this.running = true;
        this.accumulator = 0;
        this.lastTimestamp = performance.now();
        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    /** Clear deferred pause and wall-clock catch-up so a loaded battle does not burst-simulate on first paint. */
    clearDeferredOrderPauseAndAccumulator(): void {
        this.deferredOrderPause = null;
        this.accumulator = 0;
    }

    stop(): void {
        this.running = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = 0;
        }
    }

    /**
     * Advance the simulation by N fixed physics steps (60 Hz), independent of `requestAnimationFrame` / pause.
     * Intended for headless tests and tooling.
     */
    stepSimulationFixedTicks(n: number): void {
        const steps = Math.max(0, Math.floor(n));
        for (let i = 0; i < steps; i++) {
            this.fixedUpdate(FIXED_DT);
        }
    }

    /** Advance simulation by a wall-clock duration using fixed-step integration at 60 Hz. */
    advanceSimulationSeconds(sec: number): void {
        if (sec <= 0) return;
        const steps = Math.round(sec / FIXED_DT);
        this.stepSimulationFixedTicks(steps);
    }

    /**
     * Effect types that may stay `active` for a long time but are not transient combat/VFX
     * (scenario runners should not wait on them to "finish playing").
     */
    private static readonly SCENARIO_RUNNER_NON_BLOCKING_EFFECT_TYPES = new Set<string>(['Torch', 'CorruptionProgressBar']);

    /**
     * True when scripted battle work is done: no pending orders, no casts/movement/knockback/wait
     * lockout on units, no active projectiles, and no active transient effects.
     * Used by `testing/runner/SimulationRunner` to end scenarios early instead of burning max ticks.
     */
    isScenarioRunnerBattleIdle(): boolean {
        if (this.pendingOrders.length > 0) return false;
        for (const unit of this.units) {
            if (!unit.active) continue;
            if (unit.activeAbilities.length > 0) return false;
            if (unit.isInKnockback()) return false;
            if (unit.movement != null && unit.movement.path.length > 0) return false;
            if (unit.isInWaitLockout()) return false;
        }
        for (const p of this.projectiles) {
            if (p.active) return false;
        }
        for (const e of this.effects) {
            if (!e.active) continue;
            if (GameEngine.SCENARIO_RUNNER_NON_BLOCKING_EFFECT_TYPES.has(e.effectType)) continue;
            return false;
        }
        return true;
    }

    /** Allocate a unique id for a new unit/projectile/effect under this engine instance. */
    allocateObjectId(prefix = 'obj'): string {
        return `${prefix}_${this.objectIdSeq++}`;
    }

    /** Reset id allocation (e.g. fresh battle). */
    resetObjectIdSequence(next = 1): void {
        this.objectIdSeq = Math.max(1, Math.floor(next));
    }

    /**
     * After deserializing a snapshot, bump the allocator so newly spawned objects never reuse
     * numeric suffixes from restored ids.
     */
    syncObjectIdsFromSnapshot(data: SerializedGameState): void {
        let maxN = 0;
        for (const u of data.units ?? []) {
            const id = (u as { id?: string }).id;
            if (typeof id === 'string') {
                const n = parseGameObjectIdNumber(id);
                if (n !== null && n > maxN) maxN = n;
            }
        }
        for (const p of data.projectiles ?? []) {
            const id = (p as { id?: string }).id;
            if (typeof id === 'string') {
                const n = parseGameObjectIdNumber(id);
                if (n !== null && n > maxN) maxN = n;
            }
        }
        for (const e of data.effects ?? []) {
            const id = (e as { id?: string }).id;
            if (typeof id === 'string') {
                const n = parseGameObjectIdNumber(id);
                if (n !== null && n > maxN) maxN = n;
            }
        }
        if (maxN > 0) {
            this.resetObjectIdSequence(maxN + 1);
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

        const frameTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        const debugPauseModeActive = debugSettingsSnapshot.debugPauseMode;
        const canRunSimulation = !this.state.levelEventManager.isTerminal && !this.isPaused;
        if (canRunSimulation) {
            if (debugPauseModeActive) {
                // Explicit one-step mode for deterministic debug inspection.
                if (consumeDebugAdvanceTickRequest()) {
                    this.accumulator += FIXED_DT;
                } else {
                    this.accumulator = 0;
                }
            } else {
                this.accumulator += frameTime;
            }
        }

        let stateChanged = false;
        while (this.accumulator >= FIXED_DT) {
            const hadWaitingOrders = this.waitingForOrders != null;
            this.fixedUpdate(FIXED_DT);
            this.accumulator -= FIXED_DT;
            stateChanged = true;
            // Stop draining this frame once we enter a parallel-order pause; remainder stays for later frames.
            if (this.waitingForOrders != null && !hadWaitingOrders) break;
        }

        if (stateChanged) {
            this.onStateChanged?.();
        }

        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    private hashString32(input: string): number {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i) & 0xff;
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    private mixRuntimeFingerprint(tag: number, ...payload: number[]): void {
        this.runtimeFingerprint = mix(this.runtimeFingerprint, tag, ...payload.map((v) => v >>> 0));
    }

    getRuntimeFingerprintHex(): string {
        return fingerprintToHex(this.runtimeFingerprint);
    }

    computeInitialFingerprint(): string {
        let fp = fingerprintInitial();
        fp = mix(
            fp,
            FingerprintEvent.TICK_END,
            this.randomSeed >>> 0,
            this.roundNumber >>> 0,
            this.gameTick >>> 0,
            this.snapshotIndex >>> 0,
        );
        const sortedUnits = [...this.units].sort((a, b) => a.id.localeCompare(b.id));
        for (const unit of sortedUnits) {
            fp = mix(
                fp,
                FingerprintEvent.SPAWN,
                this.hashString32(unit.id),
                Math.floor(unit.x),
                Math.floor(unit.y),
                Math.floor(unit.hp),
            );
        }
        return fingerprintToHex(fp);
    }

    private fixedUpdate(dt: number): void {
        if (this.state.levelEventManager.isTerminal) return;

        // Commit order pause at tick boundary (after all units updated on the prior completed tick).
        if (this.deferredOrderPause != null && this.deferredOrderPause.waiters.length > 0) {
            const { waiters: initialWaiters, naturalCompletionUnitIds } = this.deferredOrderPause;
            this.deferredOrderPause = null;
            const atTick = this.gameTick + 1;

            const naturalSet = new Set(naturalCompletionUnitIds);
            const hadNaturalWaiter = initialWaiters.some((w) => naturalSet.has(w.unitId));

            let teamworkCancelledOwnerIds: string[] | undefined;
            let waiters = [...initialWaiters];

            if (hadNaturalWaiter) {
                const initialWaiterUnitIds = new Set(initialWaiters.map((w) => w.unitId));
                const triggerTeamIds = new Set<string>();
                for (const w of initialWaiters) {
                    if (!naturalSet.has(w.unitId)) continue;
                    const u = this.getUnit(w.unitId);
                    if (u) triggerTeamIds.add(u.teamId);
                }

                const cancelledOwners = new Set<string>();
                for (const unit of this.units) {
                    if (!unit.active || !unit.isAlive()) continue;
                    if (!unit.isPlayerControlled()) continue;
                    if (initialWaiterUnitIds.has(unit.id)) continue;
                    if (!triggerTeamIds.has(unit.teamId)) continue;
                    for (const active of [...unit.activeAbilities]) {
                        const ability = getAbility(active.abilityId);
                        if (!ability) continue;
                        const entries = resolveAbilityTimingEntries(ability, unit, this);
                        const intervals = normalizeAbilityTimingsToIntervals(entries);
                        const elapsed = Math.max(0, this.gameTime - active.startTime);
                        if (elapsedIsInCoopCooldown(elapsed, intervals)) {
                            this.cancelActiveAbility(unit.id, active.abilityId);
                            cancelledOwners.add(unit.ownerId);
                        }
                    }
                }

                if (cancelledOwners.size > 0) {
                    teamworkCancelledOwnerIds = [...cancelledOwners].sort();
                }

                const mergedIds = new Set(waiters.map((w) => w.unitId));
                const extras: OrderWaiter[] = [];
                for (const unit of this.units) {
                    if (!unit.active || !unit.isAlive()) continue;
                    if (!this.shouldPauseForOrders(unit)) continue;
                    if (mergedIds.has(unit.id)) continue;
                    mergedIds.add(unit.id);
                    extras.push({ unitId: unit.id, ownerId: unit.ownerId });
                }
                extras.sort((a, b) =>
                    a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
                );
                waiters = [...waiters, ...extras].sort((a, b) =>
                    a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
                );
            }

            this.waitingForOrders = {
                waiters,
                atTick,
                ...(teamworkCancelledOwnerIds !== undefined ? { teamworkCancelledOwnerIds } : {}),
            };
            this.isPaused = true;
            this.snapshotIndex++;
            this.onWaitingForOrders?.(this.waitingForOrders);
            this.onCheckpoint?.(this.gameTick, this.toJSON(), [...this.pendingOrders]);
            return;
        }

        // Parallel order batch (`waitingForOrders`): do not advance gameTick or simulate further until resumed.
        // Do not key off `isPaused` alone — GameState defaults `isPaused` true before the battle shell clears it,
        // while headless `stepSimulationFixedTicks` must still run ticks in that window.
        // `loop()` may drain multiple FIXED_DT steps per rAF; without this guard, a second `fixedUpdate` in the
        // same frame could run the normal path after the deferred pause branch above committed this pause.
        if (this.waitingForOrders != null) return;

        this.gameTime += dt;
        this.gameTick++;
        this.naturalAbilityCompletionUnitIdsThisTick.clear();

        const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
        this.processRoundProgressMilestones(roundTime);

        // Apply scheduled orders (stable merge when multiple orders share this tick)
        const toApply = this.pendingOrders.filter((o) => o.gameTick === this.gameTick);
        this.pendingOrders = this.pendingOrders.filter((o) => o.gameTick !== this.gameTick);
        toApply.sort((a, b) => {
            const ua = a.order.unitId;
            const ub = b.order.unitId;
            return ua < ub ? -1 : ua > ub ? 1 : 0;
        });
        for (const { order } of toApply) {
            this.applyOrderLogic(order);
        }

        this.state.specialTileManager.processSpecialTileLightDecays();
        this.state.effectManager.processTorchEffectDecays();

        // Check for round end
        if (roundTime >= ROUND_DURATION) {
            this.eventBus.emit('round_end', { roundNumber: this.roundNumber });
            this.onRoundEnd?.(this.roundNumber);
            this.roundNumber++;
            this.appliedRoundStartRecovery = false;
            this.appliedMidRoundRecovery = false;
        }

        if (!this.storyPauseActive) {
            this.state.levelEventManager.processLevelEvents();
            this.state.objectiveManager.processObjectives();
            this.processActiveAbilities(dt);
            this.processUnitTicks(dt);
            this.state.unitManager.processCrystalAura();
            this.processCorrupting(dt);
        }
        this.processPlayerDarknessCorruption(dt);
        if (!this.storyPauseActive) {
            this.state.projectileManager.update(dt);
        }
        this.state.effectManager.update(dt);
        this.processEphemeralUnitExpiry();
        processLanterniteNests({
            gameTime: this.gameTime,
            units: this.units,
            eventBus: this.eventBus,
            addUnit: (u) => this.addUnit(u),
            idSource: this,
        });
        this.drainLanterniteRespawns();
        this.state.unitManager.cleanupInactive();
        this.state.projectileManager.cleanupInactive();
        this.state.effectManager.cleanupInactive();
        this.mixRuntimeFingerprint(
            FingerprintEvent.EFFECT_TICK,
            this.effects.length >>> 0,
            this.projectiles.length >>> 0,
            this.units.length >>> 0,
        );
        if (!this.storyPauseActive) {
            this.state.levelEventManager.runDefeatCheck();
        } else if (this.storyPauseEndsAt != null && this.gameTime >= this.storyPauseEndsAt) {
            this.endStoryPause();
        }
        this.mixRuntimeFingerprint(FingerprintEvent.TICK_END, this.gameTick >>> 0, Math.floor(this.gameTime * 1000));
        const paused =
            this.isPaused ||
            this.waitingForOrders != null ||
            this.deferredOrderPause != null ||
            this.storyPauseActive;
        this.state.runtimeFingerprintRing.push(this.gameTick, this.runtimeFingerprint, paused);
        this.onTickComplete?.(this.gameTick, this.getRuntimeFingerprintHex(), paused);
    }

    /** Per-tick unit processing: movement, pathfinding retriggering, AI, deferred order pause. */
    private processUnitTicks(dt: number): void {
        for (const unit of this.units) {
            if (!unit.active) continue;

            if (unit.pathfindingRetriggerOffset > 0 && this.gameTick % unit.pathfindingRetriggerOffset === 0) {
                const tree = getUnitAITree(unit.unitAITreeId);
                if (tree) {
                    runPathfindingRetrigger(unit, tree, this.buildAIContext());
                }
            }

            unit.update(dt, this);
        }

        for (const unit of this.units) {
            if (!unit.active) continue;
            if (!unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                this.state.levelEventManager.runVictoryChecks();
                const tree = getUnitAITree(unit.unitAITreeId);
                if (tree) {
                    runUnitAI(unit, tree, this.buildAIContext());
                }
            }
        }

        if (this.waitingForOrders != null) {
            return;
        }

        const waiters = this.collectParallelWaiters();
        if (waiters.length > 0) {
            this.state.levelEventManager.runVictoryChecks();
            this.deferredOrderPause = {
                waiters,
                naturalCompletionUnitIds: [...this.naturalAbilityCompletionUnitIdsThisTick],
            };
            this.naturalAbilityCompletionUnitIdsThisTick.clear();
        }
    }

    // ========================================================================
    // Turn / Pause System
    // ========================================================================

    /**
     * Returns true if `unitId` has a queued order scheduled at or after `earliestTickInclusive`.
     * Omit the second arg to detect any order at the current simulation tick onward (covers
     * late-network queueOrder snaps where the row lands on `gameTick` past the nominal batch tick).
     */
    hasPendingOrderForUnit(unitId: string, earliestTickInclusive = this.gameTick): boolean {
        return this.pendingOrders.some((o) => o.gameTick >= earliestTickInclusive && o.order.unitId === unitId);
    }

    /**
     * Whether this engine should pause for orders for the given unit.
     * Returns false when an order is already pending (engine will apply it naturally).
     * Used both for initiating the pause during the tick loop and for UI replay after resync.
     */
    shouldPauseForOrders(unit: Unit): boolean {
        if (!unit.isPlayerControlled() || !unit.canAct() || !unit.isAlive()) return false;
        // Still resolving a submitted move path — not yet time for a new command slice.
        if (unit.movement !== null && unit.movement.path.length > 0) return false;
        return !this.hasPendingOrderForUnit(unit.id);
    }

    /** All player units that owe orders in the current parallel slice (deterministic order). */
    private collectParallelWaiters(): OrderWaiter[] {
        const out: OrderWaiter[] = [];
        for (const unit of this.units) {
            if (!unit.active) continue;
            if (this.shouldPauseForOrders(unit)) {
                out.push({ unitId: unit.id, ownerId: unit.ownerId });
            }
        }
        out.sort((a, b) =>
            a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
        );
        return out;
    }

    /**
     * Next local player's unit in this batch that still needs an order at the batch tick (UI / previews).
     */
    getActiveOrderWaiterForPlayer(playerId: string): OrderWaiter | null {
        const w = this.waitingForOrders;
        if (!w) return null;
        for (const waiter of w.waiters) {
            if (waiter.ownerId !== playerId) continue;
            if (!this.hasPendingOrderForUnit(waiter.unitId, w.atTick)) {
                return waiter;
            }
        }
        return null;
    }

    applyOrder(order: BattleOrder): void {
        let atTick = this.gameTick;
        if (this.waitingForOrders) {
            const batch = this.waitingForOrders;
            const allowed = batch.waiters.some((x) => x.unitId === order.unitId);
            if (!allowed) {
                // TODO [rollback]: Support transactional batch apply—snapshot pre-batch, validate all orders, rollback state if any reject; or buffer commits until atomic apply.
                return;
            }
            if (this.hasPendingOrderForUnit(order.unitId, batch.atTick)) {
                // TODO [rollback]: Support transactional batch apply—snapshot pre-batch, validate all orders, rollback state if any reject; or buffer commits until atomic apply.
                return;
            }
            atTick = batch.atTick;
        }
        this.queueOrder(atTick, order);

        if (this.waitingForOrders) {
            this.tryResumeParallel();
        }
    }

    queueOrder(atTick: number, order: BattleOrder): void {
        const effectiveTick = atTick < this.gameTick ? this.gameTick : atTick;
        this.pendingOrders = this.pendingOrders.filter(
            (o) => !(o.gameTick === effectiveTick && o.order.unitId === order.unitId),
        );
        const entry: OrderAtTick = { gameTick: effectiveTick, order };
        this.pendingOrders.push(entry);
        this.pendingOrders.sort((a, b) => {
            if (a.gameTick !== b.gameTick) return a.gameTick - b.gameTick;
            const ua = a.order.unitId;
            const ub = b.order.unitId;
            if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
            const aa = a.order.abilityId;
            const ab = b.order.abilityId;
            return aa < ab ? -1 : aa > ab ? 1 : 0;
        });

        if (effectiveTick === this.gameTick) {
            this.applyOrderLogic(order);
        }
    }

    private applyOrderLogic(order: BattleOrder): void {
        const unit = this.getUnit(order.unitId);
        if (!unit || !unit.isAlive()) return;
        this.mixRuntimeFingerprint(
            FingerprintEvent.ORDER_APPLIED,
            this.hashString32(order.unitId),
            this.hashString32(order.abilityId),
            this.gameTick >>> 0,
        );

        unit.waitMinEndTime = null;
        unit.waitMaxEndTime = null;

        if (order.movePath !== undefined && order.movePath !== null && order.movePath.length > 0) {
            unit.setMovement(order.movePath, undefined, this.gameTick);
        } else if (order.movePath === null) {
            unit.clearMovement();
        }

        if (order.abilityId === 'wait') {
            unit.waitMinEndTime = this.gameTime + 1;
            unit.waitMaxEndTime = this.gameTime + 3;
            return;
        }

        const ability = getAbility(order.abilityId);
        if (!ability) return;

        this.executeAbility(unit, ability, order.targets);
    }

    /**
     * Unpause only when every frozen waiter has a pending order at the batch tick.
     * Invoked after each `applyOrder` / remote `queueOrder` while paused.
     */
    tryResumeParallel(): void {
        const batch = this.waitingForOrders;
        if (!batch) return;
        const allReady = batch.waiters.every((w) => this.hasPendingOrderForUnit(w.unitId, batch.atTick));
        if (!allReady) return;

        const unitIds = batch.waiters.map((w) => w.unitId).sort();
        this.waitingForOrders = null;
        this.isPaused = false;
        this.deferredOrderPause = null;

        this.eventBus.emit('turn_end', { unitIds });

        this.onStateChanged?.();
    }

    /** @deprecated Use {@link tryResumeParallel}; kept for tests and gradual migration. */
    resumeAfterOrders(): void {
        this.tryResumeParallel();
    }

    // ========================================================================
    // Ability Execution
    // ========================================================================

    private executeAbility(unit: Unit, ability: AbilityStatic, targets: ResolvedTarget[]): void {
        ensureAbilityRuntimeState(unit, ability.id);
        if (!canUseAbilityNow(unit, ability)) return;
        if (!spendAbilityCost(unit, ability)) return;
        if (!consumeAbilityUse(unit, ability.id)) return;
        syncNestedCardAbilityState(unit);

        const existing = unit.activeAbilities.findIndex((a) => a.abilityId === ability.id);
        if (existing >= 0) {
            const existingActive = unit.activeAbilities[existing];
            if (existingActive) {
                const existingElapsed = Math.max(0, this.gameTime - existingActive.startTime);
                triggerAbilityEvent({
                    engine: this,
                    caster: unit,
                    ability,
                    activeAbility: existingActive,
                    targets: existingActive.targets,
                    eventType: AbilityEventType.ON_CAST_END,
                    prevTime: existingElapsed,
                    currentTime: existingElapsed,
                });
            }
            unit.activeAbilities.splice(existing, 1);
            unit.clearAbilityNote();
        }

        const active: ActiveAbility = {
            abilityId: ability.id,
            startTime: this.gameTime,
            targets: targets.map((t) => ({ ...t })),
        };
        ability.beginActiveCast?.(this, unit, active.targets, active);
        unit.activeAbilities.push(active);
        triggerAbilityEvent({
            engine: this,
            caster: unit,
            ability,
            activeAbility: active,
            targets: active.targets,
            eventType: AbilityEventType.ON_CAST_START,
            prevTime: 0,
            currentTime: 0,
        });

        this.state.cardManager.trackAbilityUse(unit.id, ability.id);

        this.eventBus.emit('ability_used', {
            unitId: unit.id,
            abilityId: ability.id,
        });

    }

    // ========================================================================
    // Active Ability Processing
    // ========================================================================

    /**
     * Emit a typed nearby-stone-damaged event for Earth Core reactions.
     * Producers can call this helper instead of emitting directly.
     */
    emitNearbyStoneDamaged(event: NearbyStoneDamagedEvent): void {
        this.eventBus.emit('nearby_stone_damaged', event);
    }

    private processActiveAbilities(dt: number): void {
        for (const unit of this.units) {
            if (unit.activeAbilities.length === 0) continue;

            const completed: number[] = [];

            for (let i = 0; i < unit.activeAbilities.length; i++) {
                const active = unit.activeAbilities[i];
                const ability = getAbility(active.abilityId);
                if (!ability) {
                    completed.push(i);
                    continue;
                }

                const currentTime = this.gameTime - active.startTime;
                const prevTime = currentTime - dt;
                const safePrevTime = Math.max(0, prevTime);

                ability.doCardEffect(this, unit, active.targets, safePrevTime, currentTime, active);
                triggerAbilityEvent({
                    engine: this,
                    caster: unit,
                    ability,
                    activeAbility: active,
                    targets: active.targets,
                    eventType: AbilityEventType.ON_CAST_TICK,
                    prevTime: safePrevTime,
                    currentTime,
                });

                const totalDuration = getTotalAbilityDurationForCast(ability, unit, this);
                if (currentTime >= totalDuration) {
                    completed.push(i);
                }
            }

            for (let i = completed.length - 1; i >= 0; i--) {
                const completedIndex = completed[i];
                if (completedIndex === undefined) continue;
                const active = unit.activeAbilities[completedIndex];
                if (!active) continue;
                const ability = getAbility(active.abilityId);
                if (ability) {
                    const elapsed = Math.max(0, this.gameTime - active.startTime);
                    triggerAbilityEvent({
                        engine: this,
                        caster: unit,
                        ability,
                        activeAbility: active,
                        targets: active.targets,
                        eventType: AbilityEventType.ON_CAST_END,
                        prevTime: elapsed,
                        currentTime: elapsed,
                    });
                }
                this.naturalAbilityCompletionUnitIdsThisTick.add(unit.id);
                unit.activeAbilities.splice(completedIndex, 1);
            }
        }
    }

    cancelActiveAbility(unitId: string, abilityId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        const idx = unit.activeAbilities.findIndex((a) => a.abilityId === abilityId);
        if (idx < 0) return;
        const active = unit.activeAbilities[idx];
        if (!active) return;
        const ability = getAbility(active.abilityId);
        if (ability) {
            const elapsed = Math.max(0, this.gameTime - active.startTime);
            triggerAbilityEvent({
                engine: this,
                caster: unit,
                ability,
                activeAbility: active,
                targets: active.targets,
                eventType: AbilityEventType.ON_CAST_END,
                prevTime: elapsed,
                currentTime: elapsed,
            });
        }
        unit.activeAbilities.splice(idx, 1);
    }

    interruptUnitAndRefundAbilities(unit: Unit): void {
        while (unit.activeAbilities.length > 0) {
            const active = unit.activeAbilities[0];
            if (!active) break;
            const ability = getAbility(active.abilityId);
            if (ability) {
                refundAbilityCost(unit, ability);
                const elapsed = Math.max(0, this.gameTime - active.startTime);
                triggerAbilityEvent({
                    engine: this,
                    caster: unit,
                    ability,
                    activeAbility: active,
                    targets: active.targets,
                    eventType: AbilityEventType.ON_CAST_END,
                    prevTime: elapsed,
                    currentTime: elapsed,
                });
            }
            unit.activeAbilities.splice(0, 1);
        }
        unit.clearAbilityNote();
    }

    // ========================================================================
    // AI
    // ========================================================================

    private buildAIContext(): AIContext {
        return {
            gameTick: this.gameTick,
            gameTime: this.gameTime,
            getUnit: (id) => this.getUnit(id),
            getUnits: () => this.units,
            getSpecialTiles: () => this.specialTiles,
            getAliveDefendPoints: () => this.specialTiles.filter(isTileDefendPoint),
            getLightSources: () => this.getLightSourcesForAI(),
            terrainManager: this.terrainManager,
            findGridPathForUnit: (unit, fromCol, fromRow, toCol, toRow) => {
                if (!this.terrainManager) return null;
                if (areEnemies(unit.teamId, 'player')) {
                    const blocked = this.getCrystalProtectedSet();
                    return this.terrainManager.findGridPathWithBlocked(fromCol, fromRow, toCol, toRow, blocked);
                }
                return this.terrainManager.findGridPath(fromCol, fromRow, toCol, toRow);
            },
            queueOrder: (atTick, order) => this.queueOrder(atTick, order),
            emitTurnEnd: (unitId) => this.eventBus.emit('turn_end', { unitId, unitIds: [unitId] }),
            generateRandomInteger: (min, max) => this.generateRandomInteger(min, max),
            getAbilityUsesThisRound: (unitId, abilityId) =>
                this.state.cardManager.getAbilityUsesThisRound(unitId, abilityId),
            WORLD_WIDTH: this.getWorldWidth(),
            WORLD_HEIGHT: this.getWorldHeight(),
            hasLineOfSight: (fromX, fromY, toX, toY) =>
                this.terrainManager?.grid.hasLineOfSight(fromX, fromY, toX, toY) ?? false,
            cancelActiveAbility: (unitId, abilityId) => this.cancelActiveAbility(unitId, abilityId),
        };
    }

    // ========================================================================
    // Cross-Cutting Tick Logic
    // ========================================================================

    /** Process corrupting: units at destructible defend points deal 1 HP every 2 seconds and spawn orbs. */
    private processCorrupting(_dt: number): void {
        const grid = this.terrainManager?.grid;
        if (!grid) return;

        for (const unit of this.units) {
            if (unit.aiContext.aiTree !== 'default') continue;
            const ctx = unit.aiContext;
            const tileId = ctx.corruptingTargetId;
            if (!tileId) continue;

            const tile = this.specialTiles.find((t) => t.id === tileId);
            if (!tile || tile.hp <= 0 || !tile.destructible) {
                ctx.corruptingTargetId = undefined;
                ctx.corruptingStartedAt = undefined;
                const bar = this.effects.find(
                    (e) => e.effectType === 'CorruptionProgressBar' && (e.effectData as { unitId?: string }).unitId === unit.id,
                );
                if (bar) bar.active = false;
                continue;
            }

            const unitGrid = grid.worldToGrid(unit.x, unit.y);
            const atTile =
                Math.max(
                    Math.abs(unitGrid.col - tile.col),
                    Math.abs(unitGrid.row - tile.row),
                ) <= 1;
            if (!atTile) {
                ctx.corruptingTargetId = undefined;
                ctx.corruptingStartedAt = undefined;
                const bar = this.effects.find(
                    (e) => e.effectType === 'CorruptionProgressBar' && (e.effectData as { unitId?: string }).unitId === unit.id,
                );
                if (bar) bar.active = false;
                continue;
            }

            const startedAt = ctx.corruptingStartedAt ?? this.gameTime;
            const elapsed = this.gameTime - startedAt;

            let barEffect = this.effects.find(
                (e) => e.effectType === 'CorruptionProgressBar' && (e.effectData as { unitId?: string }).unitId === unit.id,
            );
            if (!barEffect) {
                barEffect = new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: 999,
                    effectType: 'CorruptionProgressBar',
                    effectData: { unitId: unit.id, progress: 0 },
                });
                this.addEffect(barEffect);
            }
            barEffect.x = unit.x;
            barEffect.y = unit.y;
            (barEffect.effectData as { progress?: number }).progress = Math.min(1, elapsed / 2);

            if (elapsed >= 2) {
                this.damageSpecialTile(tileId, 1);
                ctx.corruptingStartedAt = this.gameTime;

                const targetWorld = grid.gridToWorld(tile.col, tile.row);
                const angle = (this.generateRandomInteger(0, 629) / 100) * Math.PI;
                const dirX = Math.cos(angle);
                const dirY = Math.sin(angle);
                const orb = new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: 5,
                    effectType: 'CorruptionOrb',
                    effectData: {
                        targetX: targetWorld.x,
                        targetY: targetWorld.y,
                        phase: 0,
                        phase0Elapsed: 0,
                        dirX,
                        dirY,
                    },
                });
                this.addEffect(orb);
            }
        }
    }

    /** Darkness corruption: fills only in full darkness; escalating damage procs when the bar completes there. */
    private processPlayerDarknessCorruption(dt: number): void {
        if (!this.lightLevelEnabled || !this.terrainManager?.grid) return;

        const grid = this.terrainManager.grid;
        const width = grid.width;
        const height = grid.height;
        const sources = this.getAllLightSources();
        const lightGrid = getLightGrid(this.globalLightLevel, width, height, sources);

        for (const unit of this.units) {
            if (!unit.isPlayerControlled() || !unit.isAlive()) continue;

            const { col, row } = grid.worldToGrid(unit.x, unit.y);
            const safeRow = Math.max(0, Math.min(height - 1, row));
            const safeCol = Math.max(0, Math.min(width - 1, col));
            const light = lightGrid[safeRow]![safeCol]!;

            const inFullDarkness = light <= FULL_DARKNESS_THRESHOLD;
            /** Slower fill/drain so damage ticks take noticeably longer to proc (~2.2s to fill vs ~1s). */
            const corruptionRate = 0.45;
            if (inFullDarkness) {
                unit.corruptionProgress = Math.min(1, unit.corruptionProgress + dt * corruptionRate);
            } else {
                unit.corruptionProgress = Math.max(0, unit.corruptionProgress - dt * corruptionRate);
                if (unit.corruptionProgress <= 0) {
                    unit.darknessDamageProcCount = 0;
                }
            }

            if (inFullDarkness && unit.corruptionProgress >= 1) {
                unit.corruptionProgress = 0;
                const hitIndex = unit.darknessDamageProcCount + 1;
                const damage = 2 * hitIndex;
                unit.takeDamage(damage, null, this.eventBus);
                unit.darknessDamageProcCount += 1;
            }
        }
    }

    // ========================================================================
    // Round End
    // ========================================================================

    private handleRoundEnd(_roundNumber: number): void {
        this.state.cardManager.clearAbilityUses();
        this.state.effectManager.handleRoundEndTorchDecay(this.roundNumber);
        for (const unit of this.units) {
            if (!unit.isAlive()) continue;
            unit.tickHardCcChainDecayAtRoundEnd();
        }
    }

    /**
     * Round timer milestones (same cadence as UI round progress: 0% and 50%).
     * Stamina surge runs at round start; bleed ticks at both milestones.
     */
    private processRoundProgressMilestones(roundTime: number): void {
        const milestoneCtx = {
            units: this.units,
            eventBus: this.eventBus,
            applyStaminaPulse: () => this.applyStaminaPulse(),
            applyChargedRocksLightChargePulse: () => this.applyChargedRocksLightChargePulse(),
            applyRoundChargePulse: () => this.applyRoundChargePulse(),
            bleedFx: {
                addEffect: (e: Effect) => this.addEffect(e),
                generateRandomInteger: (min: number, max: number) => this.generateRandomInteger(min, max),
            },
        };
        if (!this.appliedRoundStartRecovery) {
            this.eventBus.emit('round_start', { roundNumber: this.roundNumber });
            onRoundProgressMilestone('round_start', milestoneCtx);
            processLanternitePulseMilestone('round_start', {
                units: this.units,
                lightLevelEnabled: this.lightLevelEnabled,
                eventBus: this.eventBus,
                addEffect: (e) => this.addEffect(e),
                effects: this.effects,
            });
            this.appliedRoundStartRecovery = true;
        }
        if (!this.appliedMidRoundRecovery && roundTime >= ROUND_DURATION / 2) {
            onRoundProgressMilestone('round_half', milestoneCtx);
            processLanternitePulseMilestone('round_half', {
                units: this.units,
                lightLevelEnabled: this.lightLevelEnabled,
                eventBus: this.eventBus,
                addEffect: (e) => this.addEffect(e),
                effects: this.effects,
            });
            this.appliedMidRoundRecovery = true;
        }
    }

    private processEphemeralUnitExpiry(): void {
        for (const u of this.units) {
            if (!u.isAlive() || !u.active) continue;
            const deadline = u.ephemeralDespawnAtGameTime;
            if (deadline == null || this.gameTime < deadline) continue;
            u.hp = 0;
            u.active = false;
            this.eventBus.emit('unit_died', { unitId: u.id, killerUnitId: null });
        }
    }

    private drainLanterniteRespawns(): void {
        const keep: typeof this.lanterniteRespawns = [];
        for (const job of this.lanterniteRespawns) {
            if (this.gameTime < job.atGameTime) {
                keep.push(job);
                continue;
            }
            const replacement = createGenericEnemy(
                {
                    id: this.allocateObjectId('unit'),
                    x: job.x,
                    y: job.y,
                    hp: getDefaultHp(LANTERNITE_CHARACTER_ID),
                    speed: getDefaultSpeed(LANTERNITE_CHARACTER_ID),
                    teamId: 'allied',
                    characterId: LANTERNITE_CHARACTER_ID,
                    name: 'Lanternite',
                    abilities: [],
                },
                this.eventBus,
            );
            this.addUnit(replacement);
        }
        this.lanterniteRespawns = keep;
    }

    /** Stamina surge at round start: each eligible ability receives `unit.stamina` stamina charges. */
    private applyStaminaPulse(): void {
        for (const unit of this.units) {
            if (!unit.isAlive()) continue;
            const surge = Math.max(0, Math.floor(unit.stamina));
            applyStaminaSurgeToUnit(unit, surge);
        }
    }

    /** Charged Rocks passive: grants one lightCharge at round start. */
    private applyChargedRocksLightChargePulse(): void {
        for (const unit of this.units) {
            if (!unit.isAlive()) continue;
            const researched = this.getPlayerResearchNodes(unit.ownerId, CRYSTAL_ROCKS_TREE_ID);
            if (!researched.includes(CHARGED_ROCKS_NODE_ID)) continue;
            addRecoveryChargeToUnitAbilities(
                unit,
                'lightCharge',
                CHARGED_ROCKS_LIGHT_CHARGE_PER_ROUND,
                (min, max) => this.generateRandomInteger(min, max),
            );
            syncNestedCardAbilityState(unit);
        }
    }

    /** One roundCharge per ability that lists it (e.g. Throw Torch), applied after stamina pulse. */
    private applyRoundChargePulse(): void {
        for (const unit of this.units) {
            if (!unit.isAlive()) continue;
            grantRoundChargesToEligibleAbilities(unit);
            syncNestedCardAbilityState(unit);
        }
    }

    // ========================================================================
    // Timing Helpers
    // ========================================================================

    get roundProgress(): number {
        const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
        return Math.min(1, roundTime / ROUND_DURATION);
    }

    // ========================================================================
    // Serialization
    // ========================================================================

    toJSON(): SerializedGameState {
        const levelEventData = this.state.levelEventManager.toJSON();
        const cardData = this.state.cardManager.toJSON();
        return {
            randomSeed: this.randomSeed,
            initialFingerprint: this.computeInitialFingerprint(),
            gameTime: this.gameTime,
            gameTick: this.gameTick,
            roundNumber: this.roundNumber,
            snapshotIndex: this.snapshotIndex,
            units: this.state.unitManager.toJSON(),
            projectiles: this.state.projectileManager.toJSON(),
            effects: this.state.effectManager.toJSON(),
            cards: cardData.cards as Record<string, import('./types').SerializedCardInstance[]>,
            waitingForOrders: this.waitingForOrders
                ? {
                      waiters: this.waitingForOrders.waiters,
                      atTick: this.waitingForOrders.atTick,
                  }
                : null,
            orders: this.pendingOrders.map((o) => ({ gameTick: o.gameTick, order: { ...o.order, targets: o.order.targets.map((t) => ({ ...t })) } })),
            specialTiles: this.state.specialTileManager.toJSON() as unknown as import('./types').SerializedSpecialTile[],
            aiControllerId: this.aiControllerId,
            firedEventIndices: levelEventData.firedEventIndices,
            victoryCheckFirstEmitDone: levelEventData.victoryCheckFirstEmitDone,
            continuousSpawnLastSpawnedAt: levelEventData.continuousSpawnLastSpawnedAt,
            playerResearchTreesByPlayer: cardData.playerResearchTreesByPlayer,
            terrainStoneMutations: this.terrainManager?.toStoneMutationsJSON() ?? [],
            storyPauseActive: this.storyPauseActive,
            storyPauseReason: this.storyPauseReason,
            storyPauseEndsAt: this.storyPauseEndsAt,
            objectives: this.state.objectiveManager.toJSON(),
        };
    }

    static fromJSON(data: SerializedGameState, localPlayerId: string, terrainManager?: TerrainManager | null): GameEngine {
        const engine = new GameEngine();
        engine.localPlayerId = localPlayerId;
        engine.terrainManager = terrainManager ?? null;
        engine.terrainManager?.setStoneDamagedEmitter((event) => {
            engine.eventBus.emit('terrain_stone_damaged', event);
        });
        engine.randomSeed = data.randomSeed ?? 0;
        engine.gameTime = data.gameTime;
        engine.gameTick = data.gameTick ?? 0;
        engine.roundNumber = data.roundNumber;
        engine.snapshotIndex = data.snapshotIndex;
        engine.waitingForOrders = normalizeWaitingForOrdersFromJSON(data.waitingForOrders, engine.gameTick);
        engine.aiControllerId = data.aiControllerId ?? null;
        engine.storyPauseActive = data.storyPauseActive ?? false;
        engine.storyPauseReason = data.storyPauseReason ?? null;
        engine.storyPauseEndsAt = data.storyPauseEndsAt ?? null;

        engine.state.levelEventManager.restoreFromJSON({
            firedEventIndices: data.firedEventIndices,
            victoryCheckFirstEmitDone: data.victoryCheckFirstEmitDone,
            continuousSpawnLastSpawnedAt: data.continuousSpawnLastSpawnedAt,
        });

        engine.state.objectiveManager.importSnapshot(data.objectives);

        engine.pendingOrders = (data.orders ?? []).map((o) => ({
            gameTick: o.gameTick,
            order: { ...o.order, targets: (o.order.targets ?? []).map((t) => ({ ...t })) },
        }));

        engine.runtimeFingerprint = typeof data.initialFingerprint === 'string'
            ? fingerprintFromHex(data.initialFingerprint)
            : fingerprintInitial();
        if (engine.gameTick > 0) {
            const pausedRestore =
                engine.isPaused ||
                engine.waitingForOrders != null ||
                engine.deferredOrderPause != null ||
                engine.storyPauseActive;
            engine.state.runtimeFingerprintRing.push(engine.gameTick, engine.runtimeFingerprint, pausedRestore);
        }

        // Restore units (direct push, bypasses addUnit jitter since state is serialized)
        engine.state.unitManager.restoreFromJSON(data.units, engine.eventBus);

        // Some checkpoints only list a subset of parallel waiters (e.g. host order already saved).
        // Without merging, we would clear pause while another human's unit still owes an order,
        // the host would not run GET /minimal, and remote orders would never apply.
        if (engine.waitingForOrders) {
            const { waiters, atTick } = engine.waitingForOrders;
            const waiterUnitIds = new Set(waiters.map((w) => w.unitId));
            const extra: OrderWaiter[] = [];
            for (const unit of engine.units) {
                if (!unit.active || !unit.isAlive()) continue;
                if (!unit.isPlayerControlled() || !unit.canAct()) continue;
                if (waiterUnitIds.has(unit.id)) continue;
                if (!engine.hasPendingOrderForUnit(unit.id, atTick)) {
                    extra.push({ unitId: unit.id, ownerId: unit.ownerId });
                }
            }
            if (extra.length > 0) {
                extra.sort((a, b) =>
                    a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
                );
                const merged = [...waiters, ...extra].sort((a, b) =>
                    a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
                );
                engine.waitingForOrders = { waiters: merged, atTick };
            }
        }

        // Parallel orders must be queued at waitingForOrders.atTick. Only the canonical deferred-
        // pause shape (atTick === gameTick + 1) is normalized: older checkpoints sometimes store
        // waiter rows at `gameTick` instead of `atTick`. Never rewrite when `atTick` drifts further
        // ahead — that would bump legitimate intermediate ticks and stall or corrupt the timeline.
        if (engine.waitingForOrders && engine.waitingForOrders.atTick === engine.gameTick + 1) {
            const { waiters, atTick } = engine.waitingForOrders;
            const waiterIds = new Set(waiters.map((w) => w.unitId));
            for (const entry of engine.pendingOrders) {
                const uid = entry.order.unitId;
                if (!waiterIds.has(uid)) continue;
                if (entry.gameTick === engine.gameTick && entry.gameTick < atTick) {
                    entry.gameTick = atTick;
                }
            }
        }

        // If every waiter already has a pending order at the batch tick, clear pause.
        if (engine.waitingForOrders) {
            const { waiters, atTick } = engine.waitingForOrders;
            if (waiters.every((w) => engine.hasPendingOrderForUnit(w.unitId, atTick))) {
                engine.waitingForOrders = null;
                engine.isPaused = false;
            }
        }

        // Restore projectiles
        engine.state.projectileManager.restoreFromJSON(data.projectiles);

        // Restore effects
        engine.state.effectManager.restoreFromJSON(data.effects);

        // Restore special tiles
        engine.state.specialTileManager.restoreFromJSON(data.specialTiles ?? []);

        // Restore cards + research trees
        engine.state.cardManager.restoreFromJSON(data.cards, data.playerResearchTreesByPlayer);
        engine.terrainManager?.restoreStoneMutationsJSON(data.terrainStoneMutations);

        engine.syncObjectIdsFromSnapshot(data);

        // Re-register core event listeners
        engine.registerCoreEventListeners();

        // Infer parallel waiters for legacy checkpoints that omit the field.
        if (!engine.waitingForOrders) {
            const inferredWaiters: OrderWaiter[] = [];
            for (const unit of engine.units) {
                if (!unit.active) continue;
                if (unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                    if (!engine.hasPendingOrderForUnit(unit.id)) {
                        inferredWaiters.push({ unitId: unit.id, ownerId: unit.ownerId });
                    }
                }
            }
            inferredWaiters.sort((a, b) =>
                a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
            );
            if (inferredWaiters.length > 0) {
                engine.waitingForOrders = { waiters: inferredWaiters, atTick: engine.gameTick + 1 };
                engine.isPaused = true;
            }
        }

        const roundTime = engine.gameTime - (engine.roundNumber - 1) * ROUND_DURATION;
        engine.appliedRoundStartRecovery = roundTime > 0;
        engine.appliedMidRoundRecovery = roundTime >= ROUND_DURATION / 2;

        engine.deferredOrderPause = null;
        if (engine.waitingForOrders != null) {
            engine.isPaused = true;
        }

        return engine;
    }

    destroy(): void {
        this.stop();
        this.deferredOrderPause = null;
        this.terrainManager?.setStoneDamagedEmitter(undefined);
        for (const unit of this.units) {
            unit.detachAllResources(this.eventBus);
        }
        this.eventBus.clear();
        this.state.unitManager.units = [];
        this.state.projectileManager.projectiles = [];
        this.state.effectManager.effects = [];
        this.state.specialTileManager.specialTiles = [];
    }
}
