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
    type OrderWaiter,
    type WaitingForOrders,
    type SerializedGameState,
    type GameEngineFromJSONOpts,
    type OrderAtTick,
    type SpawnSource,
} from './types';
import { Unit } from './units/Unit';
import { Projectile } from './projectiles/Projectile';
import { Effect } from './effects/Effect';
import { getAbility } from '../abilities/AbilityRegistry';
import {
    elapsedIsInCoopCooldown,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../abilities/abilityTimings';
import { areAllies, areEnemies } from './teams';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { BattleObjectiveDef, LevelEvent } from '../storylines/types';
import type { SpecialTile } from './specialTiles/SpecialTile';
import { isTileDefendPoint } from './specialTiles/SpecialTile';
import type { AIContext, AILightSource } from './units/unitAI';
import { computeLightGrid, type LightSource as GridLightInput } from './LightGrid';
import { LightTileGrid } from './lightTileGrid/LightTileGrid';
import { LightSource } from './lightSources/LightSource';
import { DarkCreatureIconDeathEffect } from './deathEffects/DarkCreatureIconDeathEffect';
import { getDeathEffectDef, getBodyColorForUnit, getCharacterSpriteKey } from './units/unit_defs/unitDef';
import { STACK_GHOST_DURATION } from './effect_defs/movementEffects';
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
    getRoundChargeEligibleAbilityIds,
    getStaminaSurgeEligibleAbilityIds,
    syncNestedCardAbilityState,
} from '../abilities/abilityUses';
import { debugSettingsSnapshot, consumeDebugAdvanceTickRequest } from '../../../debug/debugSettingsStore';
import { tickAllDots, DOT_TICKS_PER_ROUND } from './dotTick';
import { createDamageTakenEffect } from './createDamageTakenEffect';
import { CantDieBuff } from '../buffs/CantDieBuff';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import {
    processLanternitePulseMilestone,
    removeLanterniteLightSources,
    LANTERNITE_CHARACTER_ID,
} from './lanternite/lanternitePulse';
import { processLanterniteNests } from './lanternite/lanterniteNestTick';
import { processThornlingNests } from './lanternite/thornlingNestTick';
import { TerrainLayerManager } from './TerrainLayerManager';
import { isWithinEarthCoreNearbyStoneDamagedRange } from '../abilities/earthCoreHelpers';
import { resetGameObjectIdCounter } from './GameObject';
import type { EffectEmitter } from './effects/EffectEmitter';
import { AlphaWolfStoryEmitter } from './effects/AlphaWolfStoryEmitter';

// Re-exports for backward compatibility
export type { CardInstance } from './managers/CardManager';
export { MAX_HAND_SIZE, CARDS_PER_ROUND } from './managers/CardManager';

import { ROUND_DURATION } from './gameConstants';
/** Matches default player stamina in unit defs; each ability receives this many stamina charges per surge unless overridden by unit stamina. */
export const DEFAULT_PLAYER_ROUND_STAMINA_SURGE = 2;
const CHARGED_ROCKS_NODE_ID = 'charged_rocks';
const CHARGED_ROCKS_LIGHT_CHARGE_PER_ROUND = 1;

/** Fixed time step (seconds): 60 ticks/second. */
const FIXED_DT = 1 / 60;

/** Save a checkpoint to the server every this many game ticks. */
export const CHECKPOINT_INTERVAL = 10;

/** Engine ticks between each lightGameTick (60/s → 10 ≈ 6 light updates/s). */
export const LIGHT_TICK_INTERVAL = 10;

/** Game world dimensions. */
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export type EngineStateCallback = () => void;

/** Per-cell light from `getLightGrid` (lower = darker). Corruption fills only in full darkness — see `DarknessLevel.FULL_DARKNESS`. */

function parseGameObjectIdNumber(id: string): number | null {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : null;
}

export class GameEngine implements EngineContext {
    /** Initialized before GameState so managers can subscribe during their constructors. */
    readonly eventBus = new EventBus();

    /** Simulation data: managers, terrain, queues, timing scalars. */
    readonly state = new GameState(this);

    // -- Loop / orchestration (not stored on GameState) --
    private accumulator = 0;
    private lastTimestamp = 0;
    private animFrameId = 0;
    private running = false;

    /** Monotonic id suffix for new GameObjects created while this engine is authoritative. */
    private objectIdSeq = 1;

    /**
     * Parallel order pause scheduled during a tick; committed in the **same** `fixedUpdate` after
     * `TICK_END` for that tick (see `commitDeferredOrderPauseAfterCompletedTick`).
     */
    private deferredOrderPause: {
        waiters: OrderWaiter[];
        naturalCompletionUnitIds: readonly string[];
    } | null = null;

    /** Units whose casts ended by duration this tick (cleared each normal tick before `processActiveAbilities`). */
    private naturalAbilityCompletionUnitIdsThisTick = new Set<string>();

    // -- Callbacks (engine wiring, not serialized) --
    private onWaitingForOrders: ((info: WaitingForOrders) => void) | null = null;
    private onRoundEnd: ((roundNumber: number) => void) | null = null;
    private onStateChanged: EngineStateCallback | null = null;
    private onCheckpoint: ((gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void) | null = null;
    private onTickComplete: ((gameTick: number, fingerprintHex: string, paused: boolean, adminReason?: string) => void) | null = null;
    private onParallelBatchResolved: ((batchAtTick: number) => void | Promise<void>) | null = null;
    private pendingAdminReason: string | null = null;
    private appliedRoundStartRecovery = false;
    private appliedMidRoundRecovery = false;
    private appliedDotTicks = 0;

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
        return this.state.orderMgr.waitingForOrders;
    }
    set waitingForOrders(v: WaitingForOrders | null) {
        this.state.orderMgr.waitingForOrders = v;
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

    get mapPOIs(): import('../terrain/segmentSchema').MapSegmentPOI[] {
        return this.state.mapPOIs;
    }
    set mapPOIs(v: import('../terrain/segmentSchema').MapSegmentPOI[]) {
        this.state.mapPOIs = v;
    }

    /** Register POIs from the loaded terrain segments for use by spawn behaviours. */
    registerMapPOIs(pois: import('../terrain/segmentSchema').MapSegmentPOI[]): void {
        this.state.mapPOIs = pois;
    }

    get pendingOrders(): OrderAtTick[] {
        return this.state.orderMgr.pendingOrders;
    }
    set pendingOrders(v: OrderAtTick[]) {
        this.state.orderMgr.pendingOrders = v;
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
    get terrainLayers(): TerrainLayerManager { return this.state.terrainLayers; }
    get cards(): Record<string, import('./managers/CardManager').CardInstance[]> { return this.state.cardManager.cards; }
    set cards(value: Record<string, import('./managers/CardManager').CardInstance[]>) { this.state.cardManager.cards = value; }

    get playerResearchTreesByPlayer(): Record<string, Record<string, string[]>> {
        return this.state.cardManager.playerResearchTreesByPlayer;
    }
    set playerResearchTreesByPlayer(value: Record<string, Record<string, string[]>>) {
        this.state.cardManager.playerResearchTreesByPlayer = value;
    }

    addUnit(unit: Unit, spawnSource: SpawnSource = 'darknessSpawn'): void {
        if (!unit.isPlayerControlled() && spawnSource === 'darknessSpawn') {
            unit.spawnTimer = 0.5;
        }
        if (spawnSource === 'nestSpawn') {
            unit.growAnimTimer = 0.3;
        }
        this.state.unitManager.addUnit(unit);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(unit.id), Math.floor(unit.x), Math.floor(unit.y));
    }
    getUnit(id: string): Unit | undefined { return this.state.unitManager.getUnit(id); }
    getUnits(): Unit[] { return this.state.unitManager.getUnits(); }
    getLocalPlayerUnit(): Unit | undefined { return this.state.unitManager.getLocalPlayerUnit(this.localPlayerId); }
    getAllies(caster: Unit): Unit[] { return this.state.unitManager.getAllies(caster); }

    addProjectile(projectile: Projectile): void {
        projectile.id = this.allocateObjectId('proj');
        this.state.projectileManager.addProjectile(projectile);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(projectile.id), Math.floor(projectile.x), Math.floor(projectile.y));
    }

    addEffect(effect: Effect): void {
        effect.id = this.allocateObjectId('fx');
        this.state.effectManager.addEffect(effect);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(effect.id), Math.floor(effect.x), Math.floor(effect.y));
    }

    addLightSource(ls: LightSource): void {
        this.state.lightSourceManager.addLightSource(ls);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(ls.id), Math.floor(ls.x), Math.floor(ls.y));
    }

    get effectEmitterManager() { return this.state.effectEmitterManager; }
    get lightSources() { return this.state.lightSourceManager.lightSources; }

    addEffectEmitter(emitter: EffectEmitter): void {
        this.state.effectEmitterManager.addEmitter(emitter);
    }

    private getUnitPositionSnapshot(): Map<string, { x: number; y: number }> {
        const snap = new Map<string, { x: number; y: number }>();
        for (const unit of this.units) snap.set(unit.id, { x: unit.x, y: unit.y });
        return snap;
    }

    addSpecialTile(tile: SpecialTile): void { this.state.specialTileManager.addSpecialTile(tile); }
    damageSpecialTile(tileId: string, amount: number): boolean { return this.state.specialTileManager.damageSpecialTile(tileId, amount); }
    getCrystalProtectionMap(): Map<string, number> { return this.state.specialTileManager.getCrystalProtectionMap(); }
    getCrystalProtectedSet(): Set<string> { return this.state.specialTileManager.getCrystalProtectedSet(); }
    getCrystalProtectionCount(col: number, row: number): number { return this.state.specialTileManager.getCrystalProtectionCount(col, row); }
    getDarkCrystalFilterSet(): Set<string> { return this.state.specialTileManager.getDarkCrystalFilterSet(); }

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

    trackAbilityUse(unitId: string, abilityId: string): void {
        this.state.cardManager.trackAbilityUse(unitId, abilityId);
    }

    mixOrderFingerprint(unitId: string, abilityId: string): void {
        this.mixRuntimeFingerprint(
            FingerprintEvent.ORDER_APPLIED,
            this.hashString32(unitId),
            this.hashString32(abilityId),
            this.gameTick >>> 0,
        );
    }

    getLightLevelAt(x: number, y: number): number | null {
        const grid = this.state.lightTileGrid;
        if (!grid || !this.lightLevelEnabled || !this.terrainManager?.grid) return null;
        const { col, row } = this.terrainManager.grid.worldToGrid(x, y);
        return grid.get(
            Math.max(0, Math.min(grid.gridHeight - 1, row)),
            Math.max(0, Math.min(grid.gridWidth - 1, col)),
        );
    }

    getLightAt(col: number, row: number): number | null {
        if (!this.state.lightLevelEnabled) return null;
        const grid = this.state.lightTileGrid;
        if (!grid) return this.state.globalLightLevel;
        if (row < 0 || row >= grid.gridHeight || col < 0 || col >= grid.gridWidth) return null;
        return grid.get(row, col);
    }

    private initLightGrid(): void {
        if (!this.terrainManager?.grid) return;
        const { width, height } = this.terrainManager.grid;
        const tileGrid = LightTileGrid.create(width, height);
        const target = computeLightGrid(this.globalLightLevel, width, height, this.getAllLightSources());
        for (let row = 0; row < height; row++)
            for (let col = 0; col < width; col++)
                tileGrid.set(row, col, target[row][col]);
        this.state.lightTileGrid = tileGrid;
    }

    private runLightGameTick(): void {
        const grid = this.state.lightTileGrid;
        if (!grid || !this.terrainManager?.grid) return;
        const { width, height } = this.terrainManager.grid;
        const target = computeLightGrid(this.globalLightLevel, width, height, this.getAllLightSources());
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const cur = grid.get(row, col);
                // Round target to integer — fractional emission/radius produces float targets
                // which would cause cur to oscillate between floor(tgt) and ceil(tgt) forever.
                const tgt = Math.round(target[row][col]);
                // Proportional step: moves 10% of the remaining delta each tick.
                // Snap to target when the step is negligible to avoid asymptotic drift
                // (important for integer threshold checks like corruption at light <= 0).
                const delta = tgt - cur;
                const step = 0.1 * delta;
                if (Math.abs(step) < 0.01) grid.set(row, col, tgt);
                else if (delta !== 0) grid.set(row, col, cur + step);
            }
        }
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

    getAllLightSources(): GridLightInput[] {
        return [
            ...this.state.specialTileManager.buildLightSourcesFromSpecialTiles(),
            ...this.state.lightSourceManager.buildGridLightInputs(),
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
        for (const ls of this.state.lightSourceManager.lightSources) {
            if (!ls.active || ls.lightAmount <= 0 || ls.radius <= 0) continue;
            const col = grid ? grid.worldToGrid(ls.x, ls.y).col : 0;
            const row = grid ? grid.worldToGrid(ls.x, ls.y).row : 0;
            out.push({ id: ls.id, col, row, emission: ls.lightAmount, radius: ls.radius });
        }
        return out;
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    private registerCoreEventListeners(): void {
        this.eventBus.clear();
        this.state.unitManager.registerListeners();

        this.eventBus.on('unit_died', (data) => {
            const unit = this.getUnit(data.unitId);
            if (!unit) return;
            if (unit.characterId === LANTERNITE_CHARACTER_ID) {
                removeLanterniteLightSources(unit.id, this.state.lightSourceManager.lightSources);
                if (unit.lanterniteNestOwnerUnitId == null) {
                    this.state.lanterniteRespawnManager.onLanterniteUnitDied(unit.x, unit.y, this.gameTime);
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

        this.eventBus.on('stack_members_died', (data) => {
            const unit = this.getUnit(data.unitId);
            if (!unit) return;
            const ghostCount = Math.min(5, Math.ceil(Math.sqrt(data.count)));
            const bodyColor = getBodyColorForUnit(unit);
            const characterSpriteKey = getCharacterSpriteKey(unit.characterId);
            for (let i = 0; i < ghostCount; i++) {
                const direction = this.generateRandomInteger(0, 1) === 0 ? -1 : 1;
                this.addEffect(new Effect({
                    x: unit.x,
                    y: unit.y,
                    duration: STACK_GHOST_DURATION,
                    effectType: 'StackGhost',
                    effectData: {
                        bodyColor,
                        radius: unit.radius,
                        characterSpriteKey,
                        vx: direction * this.generateRandomInteger(80, 120),
                        vy: -this.generateRandomInteger(100, 150),
                        direction,
                        initialAlpha: 0.8,
                    },
                }));
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

        this.eventBus.on('unit_enraged', (data) => {
            const unit = this.getUnit(data.unitId);
            if (!unit) return;
            this.addEffect(new Effect({
                x: unit.x,
                y: unit.y,
                duration: 0.75,
                effectType: 'EnrageBurst',
            }));
        });

        this.eventBus.on('terrain_stone_damaged', (event) => {
            if (!this.terrainManager) return;
            const sourceUnitId = event.sourceUnitId ?? null;
            const sourceUnit = sourceUnitId ? this.getUnit(sourceUnitId) : undefined;
            for (const unit of this.units) {
                if (!unit.isAlive() || !unit.getResource('resonance')) continue;
                const { col: unitCol, row: unitRow } = this.terrainManager.grid.worldToGrid(unit.x, unit.y);
                if (!isWithinEarthCoreNearbyStoneDamagedRange(unitCol, unitRow, event.col, event.row)) continue;
                const causedBySelfOrAlly = sourceUnit
                    ? (sourceUnit.id === unit.id || areAllies(sourceUnit.teamId, unit.teamId))
                    : false;
                this.emitNearbyStoneDamaged({
                    unitId: unit.id,
                    sourceUnitId,
                    causedBySelfOrAlly,
                    col: event.col,
                    row: event.row,
                });
            }
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
        this.addEffectEmitter(
            new AlphaWolfStoryEmitter({
                x: unit.x,
                y: unit.y,
                radialRatePerSecond: 24,
                homingRatePerSecond: 20,
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
        if (this.terrainManager) this.terrainManager.setTerrainLayers(this.state.terrainLayers);
        this.aiControllerId = config.aiControllerId ?? null;
        this.state.levelEventManager.resetTerminalState();
        this.resetObjectIdSequence(1);
        this.randomSeed = config.randomSeed >>> 0;
        this.runtimeFingerprint = fingerprintInitial();
        this.state.runtimeFingerprintRing.clear();
        this.appliedRoundStartRecovery = false;
        this.appliedMidRoundRecovery = false;
        this.appliedDotTicks = 0;
    }

    setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
        this.lightLevelEnabled = lightLevelEnabled;
        this.globalLightLevel = globalLightLevel;
        if (lightLevelEnabled && this.terrainManager?.grid && !this.state.lightTileGrid) this.initLightGrid();
    }

    applyInstantLightingPass(): void {
        if (!this.lightLevelEnabled || !this.terrainManager?.grid) return;
        this.initLightGrid();
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

    setOnTickComplete(cb: (gameTick: number, fingerprintHex: string, paused: boolean, adminReason?: string) => void): void {
        this.onTickComplete = cb;
    }

    setOnParallelBatchResolved(cb: ((batchAtTick: number) => void | Promise<void>) | null): void {
        this.onParallelBatchResolved = cb;
    }

    // ========================================================================
    // Admin commands — direct state mutations for debug/host use only.
    // Each mixes ADMIN_STATE_CHANGE into the running fingerprint so non-host
    // clients detect the divergence and resync with the saved snapshot.
    // ========================================================================

    adminHealUnit(unitId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.hp = unit.maxHp;
        this.mixRuntimeFingerprint(FingerprintEvent.ADMIN_STATE_CHANGE, 1);
        this.pendingAdminReason = 'admin_heal';
    }

    adminKillUnit(unitId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit || !unit.active) return;
        unit.hp = 0;
        unit.active = false;
        this.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
        this.mixRuntimeFingerprint(FingerprintEvent.ADMIN_STATE_CHANGE, 2);
        this.pendingAdminReason = 'admin_kill';
    }

    adminMoveUnit(unitId: string, x: number, y: number): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.x = x;
        unit.y = y;
        unit.clearMovement();
        this.mixRuntimeFingerprint(FingerprintEvent.ADMIN_STATE_CHANGE, 3);
        this.pendingAdminReason = 'admin_move';
    }

    /** True while {@link GameEngine.start} has started the rAF/tick loop and {@link GameEngine.stop} has not torn it down. */
    get isSimulationLoopRunning(): boolean {
        return this.running;
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

    /** True while `start()` has been called and `stop()` / `destroy()` has not. */
    get isRunningLoop(): boolean {
        return this.running;
    }

    /**
     * Advance purely visual effects (Effect elapsed time, emitter particle bursts) by `realDt` seconds.
     *
     * The engine's own `loop()` calls this automatically every rAF frame. External renderers that drive
     * the engine manually (e.g. scenario-preview modal) should call this once per render frame so effects
     * animate and expire correctly — but only when the engine is **not** already running its own loop
     * (i.e. when `isRunningLoop` is false).
     */
    doRenderTick(realDt: number): void {
        this.state.effectManager.renderUpdate(realDt);
        const posSnapshot = this.getUnitPositionSnapshot();
        const emitterVisualEffects = this.state.effectEmitterManager.renderUpdate(
            realDt, posSnapshot, this.isPaused,
        );
        for (const fx of emitterVisualEffects) this.state.effectManager.addEffect(fx);
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
    private static readonly SCENARIO_RUNNER_NON_BLOCKING_EFFECT_TYPES = new Set<string>(['Torch']);

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
        if (data.nextObjectId != null) {
            this.resetObjectIdSequence(data.nextObjectId);
            resetGameObjectIdCounter(data.nextObjectId);
            return;
        }
        // Legacy snapshots without nextObjectId: derive from max serialized ID.
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
        if (maxN > 0) {
            this.resetObjectIdSequence(maxN + 1);
            resetGameObjectIdCounter(maxN + 1);
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

        const frameTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        // Advance purely visual effects every render frame regardless of game pause.
        this.doRenderTick(frameTime);

        const debugPauseModeActive = debugSettingsSnapshot.debugPauseMode;
        const canRunSimulation =
            !this.state.levelEventManager.isTerminal &&
            !this.isPaused &&
            !this.state.multiplayerAwaitHostCatchup;
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

    /**
     * Same boolean written with each tick-complete fingerprint row (`runtimeFingerprintRing` / `onTickComplete`).
     */
    getFingerprintTailPaused(): boolean {
        return (
            this.isPaused ||
            this.waitingForOrders != null ||
            this.deferredOrderPause != null ||
            this.storyPauseActive
        );
    }

    /**
     * If {@link deferredOrderPause} was set during the tick that just completed, commit `waitingForOrders`,
     * notify UI, and fire `onCheckpoint` — same `fixedUpdate` pass as `TICK_END` for that tick.
     *
     * @returns true when a parallel order pause was committed (caller returns from `fixedUpdate` after emitting tick tail).
     */
    private commitDeferredOrderPauseAfterCompletedTick(): boolean {
        if (this.deferredOrderPause == null || this.deferredOrderPause.waiters.length === 0) {
            return false;
        }
        const { waiters: initialWaiters, naturalCompletionUnitIds } = this.deferredOrderPause;
        this.deferredOrderPause = null;
        const atTick = this.gameTick + 1;

        const naturalSet = new Set(naturalCompletionUnitIds);
        // Conditional cancel is not a natural completion — suppress coop cancel to avoid
        // unrelated team-ability interruptions during a single-unit decision.
        // Detect conditional cancel by checking if any waiter unit has a paused ability.
        const isConditionalCancelPause = initialWaiters.some(
            (w) => this.getUnit(w.unitId)?.activeAbilities.some((a) => a.conditionalCancelPaused) ?? false,
        );
        const hadNaturalWaiter = !isConditionalCancelPause && initialWaiters.some((w) => naturalSet.has(w.unitId));

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
                // Wait action coop cancel: if the unit is past its min wait time it is in the
                // coop-cancellable window (last 1 s of the 1.5–2.5 s wait duration).
                if (unit.isInWaitLockout() && unit.waitMinEndTime !== null && this.gameTime >= unit.waitMinEndTime) {
                    unit.waitMinEndTime = null;
                    unit.waitMaxEndTime = null;
                    cancelledOwners.add(unit.ownerId);
                }
            }

            if (cancelledOwners.size > 0) {
                teamworkCancelledOwnerIds = [...cancelledOwners].sort();
            }

            const mergedIds = new Set(waiters.map((w) => w.unitId));
            const extras: OrderWaiter[] = [];
            for (const unit of this.units) {
                if (!unit.active || !unit.isAlive()) continue;
                if (!this.state.orderMgr.shouldPauseForOrders(unit)) continue;
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
        return true;
    }

    private fixedUpdate(dt: number): void {
        if (this.state.levelEventManager.isTerminal) return;

        // Fingerprint invariant: row for tick N is emitted after TICK_END for tick N; `paused` matches
        // {@link getFingerprintTailPaused} after any in-frame deferred pause commit.
        // Plans/end_of_tick_persistence_and_fingerprint_paused.md

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
            this.state.orderMgr.applyOrderLogic(order);
        }

        this.state.specialTileManager.processSpecialTileLightDecays();
        this.state.lightSourceManager.processDecays();

        // Check for round end
        if (roundTime >= ROUND_DURATION) {
            this.eventBus.emit('round_end', { roundNumber: this.roundNumber });
            this.onRoundEnd?.(this.roundNumber);
            this.roundNumber++;
            this.appliedRoundStartRecovery = false;
            this.appliedMidRoundRecovery = false;
            this.appliedDotTicks = 0;
        }

        if (!this.storyPauseActive) {
            this.state.levelEventManager.processLevelEvents();
            this.state.objectiveManager.processObjectives();
            const aiCtx = this.buildAIContext();
            this.state.unitManager.gameTick(
                dt,
                this,
                (unitId) => this.naturalAbilityCompletionUnitIdsThisTick.add(unitId),
                aiCtx,
                () => this.state.levelEventManager.runVictoryChecks(),
            );
            if (this.waitingForOrders == null) {
                const waiters = this.state.orderMgr.collectParallelWaiters();
                if (waiters.length > 0) {
                    this.state.levelEventManager.runVictoryChecks();
                    this.deferredOrderPause = {
                        waiters,
                        naturalCompletionUnitIds: [...this.naturalAbilityCompletionUnitIdsThisTick],
                    };
                    this.naturalAbilityCompletionUnitIdsThisTick.clear();
                }
            }
            this.state.unitManager.processCrystalAura();
            this.state.specialTileManager.gameTick(this.units, this);
        }
        this.state.unitManager.tickDarknessCorruption(dt, this);
        if (!this.storyPauseActive) {
            this.state.projectileManager.update(dt);
        }
        const emitterEffects = this.state.effectEmitterManager.update(dt, this);
        for (const fx of emitterEffects) this.state.effectManager.addEffect(fx);
        this.state.effectManager.gameUpdate(dt);
        this.state.lightSourceManager.update(dt);
        if (this.gameTick % LIGHT_TICK_INTERVAL === 0) this.runLightGameTick();
        processLanterniteNests({
            gameTime: this.gameTime,
            units: this.units,
            eventBus: this.eventBus,
            addUnit: (u, src) => this.addUnit(u, src),
            idSource: this,
            mapPOIs: this.mapPOIs,
            terrainGrid: this.terrainManager?.grid ?? null,
            lightLevelEnabled: this.lightLevelEnabled,
            addLightSource: (ls) => this.addLightSource(ls),
            lightSources: this.state.lightSourceManager.lightSources,
            addEffectEmitter: (em) => this.addEffectEmitter(em),
            generateRandomNumber: () => this.generateRandomNumber(),
        });
        processThornlingNests({
            gameTime: this.gameTime,
            units: this.units,
            eventBus: this.eventBus,
            addUnit: (u) => this.addUnit(u, 'nestSpawn'),
            idSource: this,
            generateRandomNumber: () => this.generateRandomNumber(),
        });
        this.state.lanterniteRespawnManager.gameTick(this.gameTime, this, this.eventBus);
        this.state.unitManager.cleanupInactive();
        this.state.projectileManager.cleanupInactive();
        this.state.effectManager.cleanupInactive();
        this.state.lightSourceManager.cleanupInactive();
        this.state.terrainLayers.cleanupExpired(this.gameTime);
        this.mixRuntimeFingerprint(
            FingerprintEvent.EFFECT_TICK,
            this.projectiles.length >>> 0,
            this.units.length >>> 0,
            this.state.lightSourceManager.lightSources.length >>> 0,
        );
        if (!this.storyPauseActive) {
            this.state.levelEventManager.runDefeatCheck();
        } else if (this.storyPauseEndsAt != null && this.gameTime >= this.storyPauseEndsAt) {
            this.endStoryPause();
        }
        this.mixRuntimeFingerprint(FingerprintEvent.TICK_END, this.gameTick >>> 0, Math.floor(this.gameTime * 1000));
        const committedParallelPause = this.commitDeferredOrderPauseAfterCompletedTick();
        const paused =
            this.isPaused ||
            this.waitingForOrders != null ||
            this.deferredOrderPause != null ||
            this.storyPauseActive;
        this.state.runtimeFingerprintRing.push(this.gameTick, this.runtimeFingerprint, paused);
        this.onTickComplete?.(this.gameTick, this.getRuntimeFingerprintHex(), paused, this.pendingAdminReason ?? undefined);
        this.pendingAdminReason = null;
        if (debugSettingsSnapshot.logEveryTick) {
            console.log('[tick]', { syncHash: this.getRuntimeFingerprintHex(), gameTick: this.gameTick, gameState: this.toJSON() });
        }
        if (committedParallelPause) {
            return;
        }
    }

    // ========================================================================
    // Turn / Pause System
    // ========================================================================

    /**
     * Unpause only when every frozen waiter has a pending order at the batch tick.
     * Invoked after each `applyOrder` / remote `queueOrder` while paused.
     *
     * Host: when {@link setOnParallelBatchResolved} returns a Promise (or promise-like result),
     * clears the pause only after it settles successfully — merge-applied HTTP uses this path.
     * When the hook returns a non‑thenable (for example undefined with no networked adapter),
     * the pause clears synchronously so headless/engine-only loops remain deterministic.
     * Non-host / no hook: clears synchronously.
     */
    tryResumeParallel(): void {
        const batch = this.state.orderMgr.waitingForOrders;
        if (!batch) return;
        const allReady = batch.waiters.every((w) => this.state.orderMgr.hasPendingOrderForUnit(w.unitId, batch.atTick));
        if (!allReady) return;

        const unitIds = batch.waiters.map((w) => w.unitId).sort();
        const batchAtTick = batch.atTick;
        const pauseBatch = batch;
        const cb = this.onParallelBatchResolved;
        const finalizeResume = (): void => {
            if (this.state.orderMgr.waitingForOrders !== pauseBatch) {
                return;
            }
            this.state.orderMgr.waitingForOrders = null;
            this.isPaused = false;
            this.deferredOrderPause = null;
            this.eventBus.emit('turn_end', { unitIds });
            this.onStateChanged?.();
        };

        const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
            return (
                !!value &&
                (typeof value === 'object' || typeof value === 'function') &&
                typeof (value as PromiseLike<unknown>).then === 'function'
            );
        };

        if (cb != null) {
            let hookResult: unknown;
            try {
                hookResult = cb(batchAtTick);
            } catch (err: unknown) {
                console.error('[GameEngine] onParallelBatchResolved failed', err);
                return;
            }

            if (isPromiseLike(hookResult)) {
                void Promise.resolve(hookResult)
                    .then(() => {
                        finalizeResume();
                    })
                    .catch((err: unknown) => {
                        console.error('[GameEngine] onParallelBatchResolved failed', err);
                        // Stay paused until desync recovery or host retry restores a consistent pause plane.
                    });
                return;
            }

            finalizeResume();
            return;
        }

        finalizeResume();
    }

    /** @deprecated Use {@link tryResumeParallel}; kept for tests and gradual migration. */
    resumeAfterOrders(): void {
        this.tryResumeParallel();
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

    cancelActiveAbility(unitId: string, abilityId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.cancelActiveAbility(abilityId, this);
    }

    requestConditionalCancelPause(unit: Unit): void {
        const waiter: OrderWaiter = { unitId: unit.id, ownerId: unit.ownerId };
        if (this.deferredOrderPause) {
            if (!this.deferredOrderPause.waiters.some((w) => w.unitId === unit.id)) {
                this.deferredOrderPause.waiters.push(waiter);
            }
        } else {
            this.deferredOrderPause = {
                waiters: [waiter],
                naturalCompletionUnitIds: [],
            };
        }
    }

    interruptUnitAndRefundAbilities(unit: Unit): void {
        unit.interruptAndRefundAbilities(this);
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
            queueOrder: (atTick, order) => this.state.orderMgr.queueOrder(atTick, order),
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
    // Round End
    // ========================================================================

    private handleRoundEnd(roundNumber: number): void {
        this.state.cardManager.clearAbilityUses();
        this.state.lightSourceManager.handleRoundEnd(this.roundNumber);
        this.state.unitManager.onRoundEnd(roundNumber);
    }

    /**
     * Round timer milestones (same cadence as UI round progress: 0% and 50%).
     * Stamina surge runs at round start; all DoT effects tick DOT_TICKS_PER_ROUND times per round.
     */
    private processRoundProgressMilestones(roundTime: number): void {
        const bleedFx = {
            addEffect: (e: Effect) => this.addEffect(e),
            generateRandomInteger: (min: number, max: number) => this.generateRandomInteger(min, max),
        };
        if (!this.appliedRoundStartRecovery) {
            const surgeUnit = this.units.find(u => u.isPlayerControlled() && u.isAlive());
            const staminaSurgeAmount = surgeUnit ? Math.max(0, Math.floor(surgeUnit.stamina)) : 0;
            const roundChargeAbilityIds = surgeUnit ? getRoundChargeEligibleAbilityIds(surgeUnit) : [];
            const staminaSurgeAbilityIds =
                surgeUnit && staminaSurgeAmount > 0 ? getStaminaSurgeEligibleAbilityIds(surgeUnit) : [];
            this.eventBus.emit('round_start', {
                roundNumber: this.roundNumber,
                staminaSurgeAmount,
                roundChargeCount: roundChargeAbilityIds.length,
                roundChargeAbilityIds,
                staminaSurgeAbilityIds,
            });
            this.state.unitManager.onRoundStart(this.roundNumber, this);
            this.applyChargedRocksLightChargePulse();
            processLanternitePulseMilestone('round_start', {
                units: this.units,
                lightLevelEnabled: this.lightLevelEnabled,
                eventBus: this.eventBus,
                addLightSource: (ls) => this.addLightSource(ls),
                lightSources: this.state.lightSourceManager.lightSources,
            });
            this.appliedRoundStartRecovery = true;
        }
        if (!this.appliedMidRoundRecovery && roundTime >= ROUND_DURATION / 2) {
            processLanternitePulseMilestone('round_half', {
                units: this.units,
                lightLevelEnabled: this.lightLevelEnabled,
                eventBus: this.eventBus,
                addLightSource: (ls) => this.addLightSource(ls),
                lightSources: this.state.lightSourceManager.lightSources,
            });
            this.appliedMidRoundRecovery = true;
        }
        const dotTickInterval = ROUND_DURATION / DOT_TICKS_PER_ROUND;
        while (this.appliedDotTicks < DOT_TICKS_PER_ROUND && roundTime >= this.appliedDotTicks * dotTickInterval) {
            tickAllDots(this.units, this.terrainLayers, this.eventBus, bleedFx);
            this.appliedDotTicks++;
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
                this.eventBus,
            );
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
            gameTime: this.gameTime,
            gameTick: this.gameTick,
            roundNumber: this.roundNumber,
            snapshotIndex: this.snapshotIndex,
            units: this.state.unitManager.toJSON(),
            projectiles: this.state.projectileManager.toJSON(),
            effectEmitters: this.state.effectEmitterManager.toJSON(),
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
            storyPauseActive: this.storyPauseActive,
            storyPauseReason: this.storyPauseReason,
            storyPauseEndsAt: this.storyPauseEndsAt,
            objectives: this.state.objectiveManager.toJSON(),
            lightSources: this.state.lightSourceManager.toJSON(),
            terrainEffects: this.state.terrainLayers.toEffectsJSON(),
            floorTiles: this.state.terrainLayers.toFloorTilesJSON(),
            lightTileGrid: this.state.lightTileGrid?.toJSON() ?? null,
            nextObjectId: this.objectIdSeq,
            mapPOIs: this.mapPOIs,
        };
    }

    static fromJSON(
        data: SerializedGameState,
        localPlayerId: string,
        terrainManager?: TerrainManager | null,
        opts?: GameEngineFromJSONOpts,
    ): GameEngine {
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

        // Restore units (direct push, bypasses addUnit jitter since state is serialized)
        engine.state.unitManager.restoreFromJSON(data.units, engine.eventBus);

        // Some checkpoints only list a subset of parallel waiters (e.g. host order already saved).
        // Without merging, we would clear pause while another human's unit still owes an order,
        // the host would not run GET /minimal, and remote orders would never apply.
        if (engine.waitingForOrders) {
            const pauseBatch = engine.waitingForOrders;
            const { waiters, atTick } = pauseBatch;
            const waiterUnitIds = new Set(waiters.map((w) => w.unitId));
            const extra: OrderWaiter[] = [];
            for (const unit of engine.units) {
                if (!unit.active || !unit.isAlive()) continue;
                if (!unit.isPlayerControlled() || !unit.canAct()) continue;
                if (waiterUnitIds.has(unit.id)) continue;
                if (unit.movement !== null && unit.movement.path.length > 0 && !unit.movementPaused) continue;
                if (!engine.state.orderMgr.hasPendingOrderForUnit(unit.id, atTick)) {
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
                engine.waitingForOrders = {
                    waiters: merged,
                    atTick,
                    ...(pauseBatch.teamworkCancelledOwnerIds !== undefined
                        ? { teamworkCancelledOwnerIds: pauseBatch.teamworkCancelledOwnerIds }
                        : {}),
                };
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

        // Backward-compat: old snapshots stored conditionalCancelContext on waitingForOrders.
        // Migrate: set conditionalCancelPaused + conditionalCancelTagFilter on the matching ability.
        {
            const rawWFO = (data.waitingForOrders ?? null) as Record<string, unknown> | null;
            const rawCC = rawWFO?.conditionalCancelContext;
            if (rawCC && typeof rawCC === 'object') {
                const cc = rawCC as Record<string, unknown>;
                if (typeof cc.unitId === 'string' && typeof cc.activeAbilityId === 'string') {
                    const unit = engine.getUnit(cc.unitId);
                    const active = unit?.activeAbilities.find((a) => a.abilityId === cc.activeAbilityId);
                    if (active && !active.conditionalCancelPaused) {
                        active.conditionalCancelPaused = true;
                        const tagFilter = Array.isArray(cc.abilityTagFilter)
                            ? (cc.abilityTagFilter as unknown[]).filter((t): t is string => typeof t === 'string')
                            : undefined;
                        active.conditionalCancelTagFilter = tagFilter;
                    }
                }
            }
        }

        // If every waiter already has a pending order at the batch tick, clear pause.
        if (engine.waitingForOrders) {
            const { waiters, atTick } = engine.waitingForOrders;
            if (waiters.every((w) => engine.state.orderMgr.hasPendingOrderForUnit(w.unitId, atTick))) {
                engine.waitingForOrders = null;
                engine.isPaused = false;
            }
        }

        // Restore projectiles
        engine.state.projectileManager.restoreFromJSON(data.projectiles);

        // Restore effect emitters (runtime-only factories are dropped; emitters are short-lived)
        engine.state.effectEmitterManager.restoreFromJSON(data.effectEmitters ?? []);

        // Restore special tiles
        engine.state.specialTileManager.restoreFromJSON(data.specialTiles ?? []);

        // Restore light sources
        engine.state.lightSourceManager.restoreFromJSON(data.lightSources ?? []);

        // Restore light tile grid
        engine.state.lightTileGrid = data.lightTileGrid ? LightTileGrid.fromJSON(data.lightTileGrid) : null;

        // Restore map POIs (needed for networked lanternite nest spawning)
        engine.registerMapPOIs((data.mapPOIs ?? []) as import('../terrain/segmentSchema').MapSegmentPOI[]);

        // Restore terrain layers (floor/ground/air effects)
        engine.state.terrainLayers = TerrainLayerManager.fromJSON(data.terrainEffects ?? [], data.floorTiles ?? []);
        if (engine.terrainManager) engine.terrainManager.setTerrainLayers(engine.state.terrainLayers);

        // Restore cards + research trees
        engine.state.cardManager.restoreFromJSON(data.cards, data.playerResearchTreesByPlayer);

        engine.syncObjectIdsFromSnapshot(data);

        // Re-register core event listeners
        engine.registerCoreEventListeners();

        // Infer parallel waiters for legacy checkpoints that omit the field.
        if (!engine.waitingForOrders) {
            const inferredWaiters: OrderWaiter[] = [];
            for (const unit of engine.units) {
                if (!unit.active) continue;
                if (unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                    if (!engine.state.orderMgr.hasPendingOrderForUnit(unit.id)) {
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
        engine.appliedDotTicks = Math.min(DOT_TICKS_PER_ROUND, Math.floor(roundTime / (ROUND_DURATION / DOT_TICKS_PER_ROUND)));

        engine.deferredOrderPause = null;
        if (engine.waitingForOrders != null) {
            engine.isPaused = true;
        }

        const checkpointHex = opts?.checkpointRuntimeFingerprintHex;
        const legacyLayoutHex = typeof data.initialFingerprint === 'string' ? data.initialFingerprint : '';
        if (typeof checkpointHex === 'string' && checkpointHex !== '') {
            engine.runtimeFingerprint = fingerprintFromHex(checkpointHex);
        } else if (legacyLayoutHex !== '') {
            engine.runtimeFingerprint = fingerprintFromHex(legacyLayoutHex);
        } else if (engine.gameTick === 0) {
            engine.runtimeFingerprint = fingerprintFromHex(engine.computeInitialFingerprint());
        } else {
            engine.runtimeFingerprint = fingerprintInitial();
        }
        if (engine.gameTick > 0) {
            const pausedRestore =
                engine.isPaused ||
                engine.waitingForOrders != null ||
                engine.deferredOrderPause != null ||
                engine.storyPauseActive;
            engine.state.runtimeFingerprintRing.push(engine.gameTick, engine.runtimeFingerprint, pausedRestore);
        }

        return engine;
    }

    /** Pause game simulation for approximately `frames` game ticks (hitpause). */
    requestHitPause(frames: number): void {
        // Stub: no-op for MVP. Future implementation would freeze dt for N frames.
        void frames;
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
        this.state.effectEmitterManager.emitters = [];
        this.state.specialTileManager.specialTiles = [];
    }
}
