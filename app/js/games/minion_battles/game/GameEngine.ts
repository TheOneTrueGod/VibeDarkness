/**
 * GameEngine - Core game loop for the battle phase.
 *
 * Thin orchestrator ("manager of managers") that delegates data ownership,
 * CRUD, queries, and per-tick processing to specialized managers while
 * preserving the existing public API via facade methods/getters.
 */

import { EventBus } from './EventBus';
import type {
    ActiveAbility,
    WaitingForOrders,
    SerializedGameState,
    BattleOrder,
    OrderAtTick,
    ResolvedTarget,
} from './types';
import { Unit } from './units/Unit';
import { Projectile } from './projectiles/Projectile';
import { Effect } from './effects/Effect';
import { resetGameObjectIdCounter } from './GameObject';
import { getAbility } from '../abilities/AbilityRegistry';
import { getTotalAbilityDurationForCast } from '../abilities/abilityTimings';
import { spendAbilityCost, refundAbilityCost } from '../abilities/Ability';
import type { AbilityStatic } from '../abilities/Ability';
import { areEnemies } from './teams';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { LevelEvent } from '../storylines/types';
import type { SpecialTile } from './specialTiles/SpecialTile';
import { isTileDefendPoint } from './specialTiles/SpecialTile';
import { runUnitAI, runPathfindingRetrigger, getUnitAITree } from './units/unitAI';
import type { AIContext, AILightSource } from './units/unitAI';
import { getLightGrid, type LightSource } from './LightGrid';
import { getDeathEffectDef } from './units/unit_defs/unitDef';
import type { CardDefId } from '../card_defs';
import type { EngineContext } from './EngineContext';
import { GameState } from './GameState';
import { computeSynchash } from '../../../utils/synchash';
import { addRecoveryChargeToUnitAbilities, canUseAbilityNow, consumeAbilityUse, ensureAbilityRuntimeState } from '../abilities/abilityUses';

// Re-exports for backward compatibility
export type { CardInstance } from './managers/CardManager';
export { createCardInstance, MAX_HAND_SIZE, CARDS_PER_ROUND } from './managers/CardManager';

/** Seconds of game time per round. */
const ROUND_DURATION = 10;
/** Number of stamina charges granted by each round-start recovery. */
export const ROUND_STAMINA_RECOVERY = 4;

/** Fixed time step (seconds): 60 ticks/second. */
const FIXED_DT = 1 / 60;

/** Save a checkpoint to the server every this many game ticks. */
export const CHECKPOINT_INTERVAL = 10;

/** Game world dimensions. */
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export type EngineStateCallback = () => void;

/** Light level below or equal to this is "full darkness". */
const FULL_DARKNESS_THRESHOLD = -20;
/** Light level below or equal to this but above full darkness is "high darkness". */
const HIGH_DARKNESS_THRESHOLD = -16;

export class GameEngine implements EngineContext {
    /** Simulation data: managers, terrain, queues, timing scalars. */
    readonly state = new GameState(this);

    // -- Loop / orchestration (not stored on GameState) --
    private accumulator = 0;
    private lastTimestamp = 0;
    private animFrameId = 0;
    private running = false;
    private synchashUpdateSeq = 0;

    // -- Callbacks (engine wiring, not serialized) --
    private onWaitingForOrders: ((info: WaitingForOrders) => void) | null = null;
    private onRoundEnd: ((roundNumber: number) => void) | null = null;
    private onStateChanged: EngineStateCallback | null = null;
    private onCheckpoint: ((gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void) | null = null;
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

    get synchash(): string | null {
        return this.state.synchash;
    }
    set synchash(v: string | null) {
        this.state.synchash = v;
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

    addUnit(unit: Unit): void { this.state.unitManager.addUnit(unit); }
    getUnit(id: string): Unit | undefined { return this.state.unitManager.getUnit(id); }
    getUnits(): Unit[] { return this.state.unitManager.getUnits(); }
    getLocalPlayerUnit(): Unit | undefined { return this.state.unitManager.getLocalPlayerUnit(this.localPlayerId); }
    getAllies(caster: Unit): Unit[] { return this.state.unitManager.getAllies(caster); }

    addProjectile(projectile: Projectile): void { this.state.projectileManager.addProjectile(projectile); }

    addEffect(effect: Effect): void { this.state.effectManager.addEffect(effect); }

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
    setOnEmitMessage(cb: (text: string, npcId?: string) => void): void { this.state.levelEventManager.setOnEmitMessage(cb); }
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
            const deathEffectDef = getDeathEffectDef(unit.characterId);
            if (!deathEffectDef) return;
            const effect = new deathEffectDef.type({
                image: deathEffectDef.image,
                count: deathEffectDef.count,
            });
            effect.doEffect(this, unit);
        });

        this.eventBus.on('round_end', (data) => {
            this.handleRoundEnd(data.roundNumber);
        });
    }

    prepareForNewGame(config: { localPlayerId: string; terrainManager?: TerrainManager | null; isHost?: boolean; aiControllerId?: string | null }): void {
        this.registerCoreEventListeners();
        this.localPlayerId = config.localPlayerId;
        this.terrainManager = config.terrainManager ?? null;
        this.aiControllerId = config.aiControllerId ?? null;
        this.state.levelEventManager.resetTerminalState();
        resetGameObjectIdCounter(1);
        if (config.isHost) {
            this.randomSeed = this.generateHostSeed();
        }
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

    // ========================================================================
    // RNG
    // ========================================================================

    private generateHostSeed(): number {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const arr = new Uint32Array(1);
            crypto.getRandomValues(arr);
            return arr[0] >>> 0;
        }
        return (Date.now() & 0x7fffffff) || 1;
    }

    generateRandomNumber(): number {
        this.randomSeed = ((this.randomSeed * 1103515245 + 12345) >>> 0);
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
        this.lastTimestamp = performance.now();
        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    stop(): void {
        this.running = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = 0;
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

        const frameTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        if (!this.state.levelEventManager.isTerminal && !this.isPaused) {
            this.accumulator += frameTime;
        }

        let stateChanged = false;
        while (this.accumulator >= FIXED_DT) {
            this.fixedUpdate(FIXED_DT);
            this.accumulator -= FIXED_DT;
            stateChanged = true;
        }

        if (stateChanged) {
            this.onStateChanged?.();
        }

        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    private fixedUpdate(dt: number): void {
        if (this.state.levelEventManager.isTerminal) return;

        this.gameTime += dt;
        this.gameTick++;

        const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
        this.processStaminaPulse(roundTime);

        // Apply scheduled orders
        const toApply = this.pendingOrders.filter((o) => o.gameTick === this.gameTick);
        this.pendingOrders = this.pendingOrders.filter((o) => o.gameTick !== this.gameTick);
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

        this.state.levelEventManager.processLevelEvents();
        this.processActiveAbilities(dt);
        this.processUnitTicks(dt);
        this.state.unitManager.processCrystalAura();
        this.processCorrupting(dt);
        this.processPlayerDarknessCorruption(dt);
        this.state.projectileManager.update(dt);
        this.state.effectManager.update(dt);
        this.state.unitManager.cleanupInactive();
        this.state.projectileManager.cleanupInactive();
        this.state.effectManager.cleanupInactive();
        this.state.levelEventManager.runDefeatCheck();
        this.scheduleSynchashUpdate();
    }

    private scheduleSynchashUpdate(): void {
        const seq = ++this.synchashUpdateSeq;
        const state = this.toJSON() as unknown as Record<string, unknown>;
        void computeSynchash(state).then((h) => {
            if (seq !== this.synchashUpdateSeq) return;
            this.synchash = h;
        });
    }

    /** Per-tick unit processing: movement, pathfinding retriggering, AI, turn pausing. */
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

            if (this.shouldPauseForOrders(unit)) {
                this.state.levelEventManager.runVictoryChecks();
                this.pauseForOrders(unit);
                this.onCheckpoint?.(this.gameTick, this.toJSON(), [...this.pendingOrders]);
                return;
            }

            if (!unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                this.state.levelEventManager.runVictoryChecks();
                const tree = getUnitAITree(unit.unitAITreeId);
                if (tree) {
                    runUnitAI(unit, tree, this.buildAIContext());
                }
            }
        }
    }

    // ========================================================================
    // Turn / Pause System
    // ========================================================================

    /**
     * Returns true if there is already a pending order queued for the given unit at the next tick.
     * Used to decide whether to pause for orders or let the engine apply the order naturally.
     */
    hasPendingOrderForUnit(unitId: string): boolean {
        const atTick = this.gameTick + 1;
        return this.pendingOrders.some(
            (o) => o.gameTick === atTick && (o.order as { unitId?: string }).unitId === unitId,
        );
    }

    /**
     * Whether this engine should pause for orders for the given unit.
     * Returns false when an order is already pending (engine will apply it naturally).
     * Used both for initiating the pause during the tick loop and for UI replay after resync.
     */
    shouldPauseForOrders(unit: Unit): boolean {
        if (!unit.isPlayerControlled() || !unit.canAct() || !unit.isAlive()) return false;
        return !this.hasPendingOrderForUnit(unit.id);
    }

    private pauseForOrders(unit: Unit): void {
        this.waitingForOrders = {
            unitId: unit.id,
            ownerId: unit.ownerId,
        };
        this.isPaused = true;
        this.snapshotIndex++;
        this.onWaitingForOrders?.(this.waitingForOrders);
    }

    applyOrder(order: BattleOrder): void {
        const atTick = this.waitingForOrders ? this.gameTick + 1 : this.gameTick;
        this.queueOrder(atTick, order);

        if (this.waitingForOrders) {
            this.resumeAfterOrders();
        }
    }

    queueOrder(atTick: number, order: BattleOrder): void {
        const entry: OrderAtTick = { gameTick: atTick, order };
        this.pendingOrders.push(entry);

        if (atTick === this.gameTick) {
            this.applyOrderLogic(order);
        }
    }

    private applyOrderLogic(order: BattleOrder): void {
        const unit = this.getUnit(order.unitId);
        if (!unit || !unit.isAlive()) return;

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

    resumeAfterOrders(): void {
        const prev = this.waitingForOrders;
        this.waitingForOrders = null;
        this.isPaused = false;

        if (prev) {
            this.eventBus.emit('turn_end', { unitId: prev.unitId });
        }

        this.onStateChanged?.();
    }

    // ========================================================================
    // Ability Execution
    // ========================================================================

    private executeAbility(unit: Unit, ability: AbilityStatic, targets: ResolvedTarget[]): void {
        ensureAbilityRuntimeState(unit, ability.id);
        if (!canUseAbilityNow(unit, ability)) return;
        if (!spendAbilityCost(unit, ability)) return;
        if (!consumeAbilityUse(unit, ability.id)) return;

        const existing = unit.activeAbilities.findIndex((a) => a.abilityId === ability.id);
        if (existing >= 0) {
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

        this.state.cardManager.trackAbilityUse(unit.id, ability.id);

        this.eventBus.emit('ability_used', {
            unitId: unit.id,
            abilityId: ability.id,
        });

    }

    // ========================================================================
    // Active Ability Processing
    // ========================================================================

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

                ability.doCardEffect(this, unit, active.targets, Math.max(0, prevTime), currentTime, active);

                const totalDuration = getTotalAbilityDurationForCast(ability, unit, this);
                if (currentTime >= totalDuration) {
                    completed.push(i);
                }
            }

            for (let i = completed.length - 1; i >= 0; i--) {
                unit.activeAbilities.splice(completed[i], 1);
            }
        }
    }

    cancelActiveAbility(unitId: string, abilityId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        const idx = unit.activeAbilities.findIndex((a) => a.abilityId === abilityId);
        if (idx >= 0) unit.activeAbilities.splice(idx, 1);
    }

    interruptUnitAndRefundAbilities(unit: Unit): void {
        while (unit.activeAbilities.length > 0) {
            const active = unit.activeAbilities[0];
            const ability = getAbility(active.abilityId);
            if (ability) refundAbilityCost(unit, ability);
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
            emitTurnEnd: (unitId) => this.eventBus.emit('turn_end', { unitId }),
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

    /** Darkness corruption: player units in darkness accumulate corruption and take damage. */
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
            const inHighDarkness = light <= HIGH_DARKNESS_THRESHOLD;
            if (inHighDarkness) {
                unit.corruptionProgress = Math.min(1, unit.corruptionProgress + dt);
            } else {
                unit.corruptionProgress = Math.max(0, unit.corruptionProgress - dt);
            }

            if (unit.corruptionProgress >= 1) {
                unit.corruptionProgress = 0;
                const damage = inFullDarkness ? 5 : 2;
                unit.takeDamage(damage, null, this.eventBus);
            }
        }
    }

    // ========================================================================
    // Round End
    // ========================================================================

    private handleRoundEnd(_roundNumber: number): void {
        this.state.cardManager.clearAbilityUses();
        this.state.effectManager.handleRoundEndTorchDecay(this.roundNumber);
    }

    /** Apply the two per-round stamina pulses (start and midpoint). */
    private processStaminaPulse(roundTime: number): void {
        if (!this.appliedRoundStartRecovery) {
            this.applyStaminaPulse();
            this.appliedRoundStartRecovery = true;
        }
        if (!this.appliedMidRoundRecovery && roundTime >= ROUND_DURATION / 2) {
            this.applyStaminaPulse();
            this.appliedMidRoundRecovery = true;
        }
    }

    /** Stamina Pulse: each unit grants staminaCharge to all of its abilities. */
    private applyStaminaPulse(): void {
        for (const unit of this.units) {
            if (!unit.isAlive()) continue;
            addRecoveryChargeToUnitAbilities(
                unit,
                'staminaCharge',
                Math.max(0, unit.stamina * ROUND_STAMINA_RECOVERY),
                (min, max) => this.generateRandomInteger(min, max),
            );
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
            effects: this.state.effectManager.toJSON(),
            cards: cardData.cards as Record<string, import('./types').SerializedCardInstance[]>,
            waitingForOrders: this.waitingForOrders,
            orders: this.pendingOrders.map((o) => ({ gameTick: o.gameTick, order: { ...o.order, targets: o.order.targets.map((t) => ({ ...t })) } })),
            specialTiles: this.state.specialTileManager.toJSON() as unknown as import('./types').SerializedSpecialTile[],
            aiControllerId: this.aiControllerId,
            firedEventIndices: levelEventData.firedEventIndices,
            victoryCheckFirstEmitDone: levelEventData.victoryCheckFirstEmitDone,
            continuousSpawnLastSpawnedAt: levelEventData.continuousSpawnLastSpawnedAt,
            playerResearchTreesByPlayer: cardData.playerResearchTreesByPlayer,
        };
    }

    static fromJSON(data: SerializedGameState, localPlayerId: string, terrainManager?: TerrainManager | null): GameEngine {
        const engine = new GameEngine();
        engine.localPlayerId = localPlayerId;
        engine.terrainManager = terrainManager ?? null;
        engine.randomSeed = data.randomSeed ?? 0;
        engine.gameTime = data.gameTime;
        engine.gameTick = data.gameTick ?? 0;
        engine.roundNumber = data.roundNumber;
        engine.snapshotIndex = data.snapshotIndex;
        engine.waitingForOrders = data.waitingForOrders;
        engine.aiControllerId = data.aiControllerId ?? null;

        engine.state.levelEventManager.restoreFromJSON({
            firedEventIndices: data.firedEventIndices,
            victoryCheckFirstEmitDone: data.victoryCheckFirstEmitDone,
            continuousSpawnLastSpawnedAt: data.continuousSpawnLastSpawnedAt,
        });

        engine.pendingOrders = (data.orders ?? []).map((o) => ({
            gameTick: o.gameTick,
            order: { ...o.order, targets: (o.order.targets ?? []).map((t) => ({ ...t })) },
        }));

        engine.synchash = typeof data.synchash === 'string' ? data.synchash : null;

        // If the order is already in pendingOrders, the engine does not need to pause — it will
        // apply the order naturally on the appropriate tick. Clearing the pause state here allows
        // the engine to run without waiting for external order delivery.
        if (engine.waitingForOrders && engine.hasPendingOrderForUnit(engine.waitingForOrders.unitId)) {
            engine.waitingForOrders = null;
            engine.isPaused = false;
        }

        // Restore units (direct push, bypasses addUnit jitter since state is serialized)
        engine.state.unitManager.restoreFromJSON(data.units, engine.eventBus);

        // Restore projectiles
        engine.state.projectileManager.restoreFromJSON(data.projectiles);

        // Restore effects
        engine.state.effectManager.restoreFromJSON(data.effects);

        // Restore special tiles
        engine.state.specialTileManager.restoreFromJSON(data.specialTiles ?? []);

        // Restore cards + research trees
        engine.state.cardManager.restoreFromJSON(data.cards, data.playerResearchTreesByPlayer);

        // Advance global game-object ID counter
        advanceGameObjectIdCounterFromSnapshot(data);

        // Re-register core event listeners
        engine.registerCoreEventListeners();

        // Infer waitingForOrders for legacy checkpoints that omit the field.
        // Skip inference when the unit already has a pending order: the engine will apply it naturally.
        if (!engine.waitingForOrders) {
            for (const unit of engine.units) {
                if (unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                    if (!engine.hasPendingOrderForUnit(unit.id)) {
                        engine.waitingForOrders = { unitId: unit.id, ownerId: unit.ownerId };
                        engine.isPaused = true;
                    }
                    break;
                }
            }
        }

        const roundTime = engine.gameTime - (engine.roundNumber - 1) * ROUND_DURATION;
        engine.appliedRoundStartRecovery = roundTime > 0;
        engine.appliedMidRoundRecovery = roundTime >= ROUND_DURATION / 2;

        return engine;
    }

    destroy(): void {
        this.stop();
        this.synchashUpdateSeq++;
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

function parseGameObjectIdNumber(id: string): number | null {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : null;
}

function advanceGameObjectIdCounterFromSnapshot(data: SerializedGameState): void {
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
        resetGameObjectIdCounter(maxN + 1);
    }
}
