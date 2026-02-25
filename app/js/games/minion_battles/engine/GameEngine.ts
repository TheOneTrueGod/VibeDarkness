/**
 * GameEngine - Core game loop for the battle phase.
 *
 * Runs a fixed-step simulation at 60 ticks/second. Manages game time,
 * rounds, units, projectiles, effects, cards, scheduled actions,
 * pause/resume, and full serialization.
 */

import { EventBus } from './EventBus';
import type {
    WaitingForOrders,
    SerializedGameState,
    SerializedCardInstance,
    BattleOrder,
    OrderAtTick,
    ResolvedTarget,
} from './types';
import { Unit } from '../objects/Unit';
import { Projectile } from '../objects/Projectile';
import { Effect } from '../objects/Effect';
import { resetGameObjectIdCounter } from '../objects/GameObject';
import { getAbility } from '../abilities/AbilityRegistry';
import { getCardDef } from '../card_defs';
import { spendAbilityCost } from '../abilities/Ability';
import type { AbilityStatic } from '../abilities/Ability';
import { type TeamId, areEnemies } from './teams';
import { Rage } from '../resources/Rage';
import { Mana } from '../resources/Mana';
import type { Resource } from '../resources/Resource';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { LevelEvent } from '../missions/types';
import { getEdgePositions } from '../missions/edgeSpawns';
import { createUnitFromSpawnConfig } from '../objects/units/index';
import { ENEMY_MELEE, ENEMY_RANGED, ENEMY_DARK_WOLF } from '../constants/enemyConstants';
import type { SpecialTile } from '../objects/SpecialTile';
import { specialTileToJSON, specialTileFromJSON } from '../objects/SpecialTile';
import { getSpecialTileDef } from '../missions/specialTileDefs';
import { buildAIController } from '../missions/ai';
import type { AIContext } from '../missions/ai';
import { getPerceptionRange } from './unitDef';

/** Seconds of game time per round. */
const ROUND_DURATION = 10;

/** Fixed time step (seconds): 60 ticks/second. */
const FIXED_DT = 1 / 60;

/** Save a checkpoint to the server every this many game ticks. */
export const CHECKPOINT_INTERVAL = 10;

/** Game world dimensions. */
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export type EngineStateCallback = () => void;

/** Maximum cards in hand. Draw at round start if below this. */
export const MAX_HAND_SIZE = 6;

/** Create a card instance with defaults (durability from card def). */
export function createCardInstance(
    cardDefId: string,
    abilityId: string,
    location: CardInstance['location'],
): CardInstance {
    const def = getCardDef(abilityId);
    return {
        cardDefId,
        abilityId,
        location,
        durability: def?.durability ?? 1,
    };
}

/** Card instance tracked per player. */
export interface CardInstance {
    cardDefId: string;
    abilityId: string;
    location: 'hand' | 'deck' | 'discard';
    /** Remaining uses before discard. */
    durability: number;
    /** Rounds remaining in discard (rounds-based). */
    discardRoundsRemaining?: number;
    /** Game time when added to discard (seconds-based). */
    discardAddedAtTime?: number;
}

export class GameEngine {
    // -- Core state --
    readonly eventBus: EventBus = new EventBus();
    /** Deterministic RNG seed (host-generated before initial sync). */
    randomSeed: number = 0;
    gameTime: number = 0;
    gameTick: number = 0;
    roundNumber: number = 1;
    snapshotIndex: number = 0;
    isPaused: boolean = false;
    waitingForOrders: WaitingForOrders | null = null;

    // -- Game objects --
    units: Unit[] = [];
    projectiles: Projectile[] = [];
    effects: Effect[] = [];
    /** Special tiles (defend points, etc.) with grid position and HP. */
    specialTiles: SpecialTile[] = [];

    // -- Terrain --
    terrainManager: TerrainManager | null = null;

    // -- Cards per player --
    cards: Record<string, CardInstance[]> = {};

    /** Orders scheduled to be applied at specific game ticks (from players or AI). */
    pendingOrders: OrderAtTick[] = [];

    // -- Loop state --
    private accumulator: number = 0;
    private lastTimestamp: number = 0;
    private animFrameId: number = 0;
    private running: boolean = false;

    // -- Callbacks --
    private onWaitingForOrders: ((info: WaitingForOrders) => void) | null = null;
    private onRoundEnd: ((roundNumber: number) => void) | null = null;
    private onStateChanged: EngineStateCallback | null = null;
    /** Called when a checkpoint should be saved (when a unit is about to take a turn). Receives gameTick, serialized state, and pending orders. */
    private onCheckpoint: ((gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void) | null = null;

    /** The local player's ID. Used to decide which unit to center camera on. */
    localPlayerId: string = '';

    /** AI controller ID for enemy units ('legacy' | 'defensePoints'). Set from mission or restored from snapshot. */
    aiControllerId: string | null = null;

    /** Level events from mission. Cleared on restore. */
    private levelEvents: LevelEvent[] = [];
    /** Indices of one-shot events that have already fired (spawnWave). */
    private firedEventIndices: Set<number> = new Set();
    /** Indices of victory checks that have emitted their first-attempt message. */
    private victoryCheckFirstEmitDone: Set<number> = new Set();
    /** Callback to send a message to the lobby chat (e.g. from emittedMessage). npcId = NPC to display as sender. */
    private onEmitMessage: ((text: string, npcId?: string) => void) | null = null;
    /** Callback when victory is achieved. */
    private onVictory: (() => void) | null = null;

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /**
     * Prepare the engine for a new game (before mission.initializeGameState populates it).
     * Sets localPlayerId, terrainManager, resets object IDs, and subscribes to round_end.
     * If isHost is true, generates a random seed for deterministic RNG across clients.
     */
    prepareForNewGame(config: { localPlayerId: string; terrainManager?: TerrainManager | null; isHost?: boolean; aiControllerId?: string | null }): void {
        this.localPlayerId = config.localPlayerId;
        this.terrainManager = config.terrainManager ?? null;
        this.aiControllerId = config.aiControllerId ?? null;
        resetGameObjectIdCounter(1);
        if (config.isHost) {
            this.randomSeed = this.generateHostSeed();
        }
        this.eventBus.on('round_end', (data) => {
            this.handleRoundEnd(data.roundNumber);
        });
    }

    /** Register level events from the mission. Call from initializeGameState. */
    registerLevelEvents(events: LevelEvent[]): void {
        this.levelEvents = events;
        this.firedEventIndices.clear();
        this.victoryCheckFirstEmitDone.clear();
    }

    /** Set callback to send a message to the lobby chat. */
    setOnEmitMessage(cb: (text: string) => void): void {
        this.onEmitMessage = cb;
    }

    /** Set callback when victory is achieved. */
    setOnVictory(cb: () => void): void {
        this.onVictory = cb;
    }

    /** Set callback for when the engine pauses waiting for player orders. */
    setOnWaitingForOrders(cb: (info: WaitingForOrders) => void): void {
        this.onWaitingForOrders = cb;
    }

    /** Set callback for round end events (for UI updates). */
    setOnRoundEnd(cb: (roundNumber: number) => void): void {
        this.onRoundEnd = cb;
    }

    /** Set callback for any state change (for React re-renders). */
    setOnStateChanged(cb: EngineStateCallback): void {
        this.onStateChanged = cb;
    }

    /** Set callback for checkpoint saves (when a unit is about to take a turn). */
    setOnCheckpoint(cb: (gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void): void {
        this.onCheckpoint = cb;
    }

    /**
     * Generate initial seed for host (before initial sync).
     * Uses crypto.getRandomValues when available, else Date.now().
     */
    private generateHostSeed(): number {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const arr = new Uint32Array(1);
            crypto.getRandomValues(arr);
            return arr[0] >>> 0;
        }
        return (Date.now() & 0x7fffffff) || 1;
    }

    /**
     * Generate a deterministic random number (0..0x7fffffff) and advance the seed.
     * All clients produce the same sequence given the same initial seed.
     */
    generateRandomNumber(): number {
        this.randomSeed = ((this.randomSeed * 1103515245 + 12345) >>> 0);
        return this.randomSeed & 0x7fffffff;
    }

    /**
     * Generate a random integer in [min, max] (inclusive) using the deterministic RNG.
     */
    generateRandomInteger(min: number, max: number): number {
        if (max < min) return min;
        const n = this.generateRandomNumber();
        const range = max - min + 1;
        return min + (n % range);
    }

    // ========================================================================
    // Game Loop
    // ========================================================================

    /** Start the game loop. */
    start(): void {
        if (this.running) return;
        this.running = true;
        this.lastTimestamp = performance.now();
        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    /** Stop the game loop. */
    stop(): void {
        this.running = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = 0;
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

        const frameTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1); // cap at 100ms
        this.lastTimestamp = timestamp;

        // Only accumulate time when the game is not paused
        if (!this.isPaused && !this.waitingForOrders) {
            this.accumulator += frameTime;
        }

        // Fixed-step updates
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
        // Advance game time and tick (only when game is advancing)
        this.gameTime += dt;
        this.gameTick++;

        // Apply any orders scheduled for this tick
        const toApply = this.pendingOrders.filter((o) => o.gameTick === this.gameTick);
        this.pendingOrders = this.pendingOrders.filter((o) => o.gameTick !== this.gameTick);
        for (const { order } of toApply) {
            this.applyOrderLogic(order);
        }

        // Check for round end
        const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
        if (roundTime >= ROUND_DURATION) {
            this.eventBus.emit('round_end', { roundNumber: this.roundNumber });
            this.onRoundEnd?.(this.roundNumber);
            this.roundNumber++;
        }

        // Process level events (spawn waves, etc.)
        this.processLevelEvents();

        // Process active abilities on all units
        this.processActiveAbilities(dt);

        // Update units
        for (const unit of this.units) {
            if (!unit.active) continue;

            // Periodic pathfinding retrigger for AI units
            if (unit.pathfindingRetriggerOffset > 0 && this.gameTick % unit.pathfindingRetriggerOffset === 0) {
                const controller = buildAIController(this.aiControllerId);
                if (controller.onPathfindingRetrigger) {
                    controller.onPathfindingRetrigger(unit, this.buildAIContext());
                }
            }

            unit.update(dt, this);

            // Check if a player-owned unit just finished cooldown
            if (unit.isPlayerControlled() && unit.canAct() && unit.isAlive() && !this.waitingForOrders) {
                this.runVictoryChecks(); // before turn
                this.onCheckpoint?.(this.gameTick, this.toJSON(), [...this.pendingOrders]);
                this.pauseForOrders(unit);
                return; // Stop processing this tick
            }

            // AI units auto-act when cooldown finishes
            if (!unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                this.runVictoryChecks(); // before turn
                this.onCheckpoint?.(this.gameTick, this.toJSON(), [...this.pendingOrders]);
                const controller = buildAIController(this.aiControllerId);
                controller.executeTurn(unit, this.buildAIContext());
            }
        }

        // Update projectiles and check collisions
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            proj.update(dt, this);
            proj.checkCollision(this.units, this.eventBus, this.gameTime);
        }

        // Update effects
        for (const effect of this.effects) {
            if (!effect.active) continue;
            effect.update(dt, this);
        }

        // Process discard (seconds-based): move expired cards back to deck
        this.processDiscardSeconds();

        // Cleanup inactive objects
        this.units = this.units.filter((u) => u.active);
        this.projectiles = this.projectiles.filter((p) => p.active);
        this.effects = this.effects.filter((e) => e.active);
    }

    // ========================================================================
    // Turn / Pause System
    // ========================================================================

    private pauseForOrders(unit: Unit): void {
        this.waitingForOrders = {
            unitId: unit.id,
            ownerId: unit.ownerId,
        };
        this.snapshotIndex++;
        this.onWaitingForOrders?.(this.waitingForOrders);
    }

    /**
     * Queue an order to be applied at a specific game tick. If the order is for the current tick
     * (e.g. AI issuing in the same tick), it is applied immediately.
     * When the engine is waiting for orders, the order is scheduled for gameTick + 1 and the game resumes.
     */
    applyOrder(order: BattleOrder): void {
        const atTick = this.waitingForOrders ? this.gameTick + 1 : this.gameTick;
        this.queueOrder(atTick, order);

        if (this.waitingForOrders) {
            this.resumeAfterOrders();
        }
    }

    /**
     * Schedule an order at a specific game tick. If atTick === current gameTick, apply immediately.
     */
    queueOrder(atTick: number, order: BattleOrder): void {
        const entry: OrderAtTick = { gameTick: atTick, order };
        this.pendingOrders.push(entry);

        if (atTick === this.gameTick) {
            this.applyOrderLogic(order);
        }
    }

    /**
     * Apply a single battle order (ability use, wait, or move). Used when playing out orders at their tick.
     */
    private applyOrderLogic(order: BattleOrder): void {
        const unit = this.getUnit(order.unitId);
        if (!unit || !unit.isAlive()) return;

        // Apply movement from grid-cell path
        if (order.movePath !== undefined && order.movePath !== null && order.movePath.length > 0) {
            unit.setMovement(order.movePath, undefined, this.gameTick);
        } else if (order.movePath === null) {
            unit.clearMovement();
        }

        // Wait action: do nothing, just set a 1s cooldown
        if (order.abilityId === 'wait') {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cbf947fa-3cd1-4ede-9663-15ab42cb01ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GameEngine.ts:305',message:'wait order applied',data:{unitId:order.unitId,gameTick:this.gameTick},hypothesisId:'H2',timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            unit.startCooldown(1);
            return;
        }

        const ability = getAbility(order.abilityId);
        if (!ability) return;

        this.executeAbility(unit, ability, order.targets);
    }

    /** Resume simulation after orders (e.g. when remote order is received). Public for BattlePhase. */
    resumeAfterOrders(): void {
        const prev = this.waitingForOrders;
        this.waitingForOrders = null;

        if (prev) {
            this.eventBus.emit('turn_end', { unitId: prev.unitId });
        }

        this.onStateChanged?.();
    }

    // ========================================================================
    // Ability Execution
    // ========================================================================

    private executeAbility(unit: Unit, ability: AbilityStatic, targets: ResolvedTarget[]): void {
        // Spend resource cost
        if (!spendAbilityCost(unit, ability)) return;

        // Set cooldown
        unit.startCooldown(ability.cooldownTime);

        // Register the ability as active — the tick loop will call doCardEffect each frame
        unit.activeAbilities.push({
            abilityId: ability.id,
            startTime: this.gameTime,
            targets: targets.map((t) => ({ ...t })),
        });

        // Emit event
        this.eventBus.emit('ability_used', {
            unitId: unit.id,
            abilityId: ability.id,
        });

        // Move the card to discard when durability reaches 0 (for the unit's owner)
        this.onCardUsed(unit.ownerId, ability.id);
    }

    /** Move the first in-hand card matching the ability: decrement durability; if 0, discard. Otherwise card stays in hand. */
    private onCardUsed(playerId: string, abilityId: string): void {
        const playerCards = this.cards[playerId];
        if (!playerCards) return;
        const card = playerCards.find(
            (c) => c.abilityId === abilityId && c.location === 'hand',
        );
        if (!card) return;

        card.durability--;
        if (card.durability <= 0) {
            this.moveToDiscard(card);
        }
    }

    /** Move a card to discard and set duration tracking. */
    private moveToDiscard(card: CardInstance): void {
        const def = getCardDef(card.abilityId);
        const discardDuration = def?.discardDuration ?? { duration: 1, unit: 'rounds' as const };

        card.location = 'discard';
        card.durability = 0;

        if (discardDuration.unit === 'rounds') {
            card.discardRoundsRemaining = discardDuration.duration;
        } else {
            card.discardAddedAtTime = this.gameTime;
        }
    }

    // ========================================================================
    // AI (delegates to mission's UnitAIController)
    // ========================================================================

    private buildAIContext(): AIContext {
        return {
            gameTick: this.gameTick,
            getUnit: (id) => this.getUnit(id),
            getUnits: () => this.units,
            getSpecialTiles: () => this.specialTiles,
            getAliveDefendPoints: () =>
                this.specialTiles.filter((t) => t.defId === 'DefendPoint' && t.hp > 0),
            terrainManager: this.terrainManager,
            queueOrder: (atTick, order) => this.queueOrder(atTick, order),
            emitTurnEnd: (unitId) => this.eventBus.emit('turn_end', { unitId }),
            generateRandomInteger: (min, max) => this.generateRandomInteger(min, max),
            WORLD_WIDTH,
            WORLD_HEIGHT,
            hasLineOfSight: (fromX, fromY, toX, toY) =>
                this.terrainManager?.grid.hasLineOfSight(fromX, fromY, toX, toY) ?? false,
            cancelActiveAbility: (unitId, abilityId) => this.cancelActiveAbility(unitId, abilityId),
        };
    }

    // ========================================================================
    // Active Ability Processing
    // ========================================================================

    /**
     * Tick all active abilities on all units. Calls doCardEffect with
     * time-since-start thresholds so abilities can fire effects at the
     * right moment. Removes abilities once prefireTime is reached AND
     * getAbilityStates returns empty (no lingering states like movement penalty).
     */
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

                // ChannelDarkness: cancel if an enemy appears in perception with LOS
                if (active.abilityId === 'channel_darkness') {
                    const perception = getPerceptionRange(unit.characterId);
                    const hostiles = this.units.filter(
                        (u) => u.isAlive() && u.id !== unit.id && areEnemies(unit.teamId, u.teamId),
                    );
                    const inRangeAndLOS = hostiles.filter((h) => {
                        const d = Math.hypot(h.x - unit.x, h.y - unit.y);
                        if (d > perception) return false;
                        return this.terrainManager?.grid.hasLineOfSight(unit.x, unit.y, h.x, h.y) ?? false;
                    });
                    if (inRangeAndLOS.length > 0) {
                        inRangeAndLOS.sort(
                            (a, b) =>
                                Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y),
                        );
                        unit.aiTargetUnitId = inRangeAndLOS[0]!.id;
                        unit.activeAbilities.splice(i, 1);
                        i--;
                        continue;
                    }
                }

                ability.doCardEffect(this, unit, active.targets, Math.max(0, prevTime), currentTime);

                // Remove once prefire is done AND no lingering ability states remain
                if (currentTime >= ability.prefireTime && ability.getAbilityStates(currentTime).length === 0) {
                    completed.push(i);
                }
            }

            // Remove completed abilities (iterate in reverse to preserve indices)
            for (let i = completed.length - 1; i >= 0; i--) {
                unit.activeAbilities.splice(completed[i], 1);
            }
        }
    }

    // ========================================================================
    // Object Management
    // ========================================================================

    /** Add a unit and assign pathfindingRetriggerOffset from the deterministic RNG. */
    addUnit(unit: Unit): void {
        unit.pathfindingRetriggerOffset = this.generateRandomInteger(30, 90);
        this.units.push(unit);
    }

    addSpecialTile(tile: SpecialTile): void {
        this.specialTiles.push(tile);
    }

    addProjectile(projectile: Projectile): void {
        this.projectiles.push(projectile);
    }

    addEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    getUnit(id: string): Unit | undefined {
        return this.units.find((u) => u.id === id);
    }

    /** Deal damage to a special tile by id (e.g. DefendPoint). */
    damageSpecialTile(tileId: string, amount: number): void {
        const tile = this.specialTiles.find((t) => t.id === tileId);
        if (tile) tile.hp = Math.max(0, tile.hp - amount);
    }

    /** Remove an active ability from a unit (e.g. cancel channel when enemy appears). */
    cancelActiveAbility(unitId: string, abilityId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.activeAbilities = unit.activeAbilities.filter((a) => a.abilityId !== abilityId);
    }

    /** Get the local player's unit. */
    getLocalPlayerUnit(): Unit | undefined {
        return this.units.find(
            (u) => u.ownerId === this.localPlayerId && u.isAlive(),
        );
    }

    // ========================================================================
    // Round End / Card Recharge
    // ========================================================================

    /** Emit a message to the lobby chat if callback is set. When npcId is set, message appears from that NPC. */
    private emitMessage(text: string, npcId?: string): void {
        this.onEmitMessage?.(text, npcId);
    }

    /** Process level events: spawn waves, run victory checks (periodic). */
    private processLevelEvents(): void {
        for (let i = 0; i < this.levelEvents.length; i++) {
            const evt = this.levelEvents[i];
            if (evt.type === 'spawnWave') {
                this.processSpawnWaveEvent(i, evt);
            } else if (evt.type === 'victoryCheck') {
                // Victory checks run every 10 frames when round >= afterRound
                if (this.roundNumber >= evt.trigger.afterRound && this.gameTick % 10 === 0) {
                    this.runVictoryCheck(i, evt);
                }
            }
        }
    }

    /** Process a single spawn wave event. */
    private processSpawnWaveEvent(i: number, evt: import('../missions/types').LevelEventSpawnWave): void {
        if (this.firedEventIndices.has(i)) return;

        let shouldFire = false;
        if ('atRound' in evt.trigger) {
            shouldFire = this.roundNumber >= evt.trigger.atRound;
        } else if ('afterSeconds' in evt.trigger) {
            shouldFire = this.gameTime >= evt.trigger.afterSeconds;
        }
        if (!shouldFire) return;

        this.firedEventIndices.add(i);
        if (evt.emittedMessage) this.emitMessage(evt.emittedMessage);

        const positions = getEdgePositions(evt.spawns.length);
        const baseDefs = { enemy_melee: ENEMY_MELEE, enemy_ranged: ENEMY_RANGED, dark_wolf: ENEMY_DARK_WOLF };

        for (let s = 0; s < evt.spawns.length; s++) {
            const entry = evt.spawns[s];
            const cid = entry.characterId;
            if (cid !== 'enemy_melee' && cid !== 'enemy_ranged' && cid !== 'dark_wolf') continue;
            const base = baseDefs[cid];

            const pos = positions[s] ?? { x: 40, y: 40 };
            const config = {
                ...base,
                ...entry,
                position: pos,
                x: pos.x,
                y: pos.y,
                ownerId: 'ai' as const,
            };
            if (this.aiControllerId === 'defensePoints') {
                config.abilities = [...(config.abilities ?? []), 'channel_darkness'];
            }
            const unit = createUnitFromSpawnConfig(config, this.eventBus);
            this.addUnit(unit);
        }
    }

    /** Run all victory checks (called every 10 frames and before turns). */
    private runVictoryChecks(): void {
        for (let i = 0; i < this.levelEvents.length; i++) {
            const evt = this.levelEvents[i];
            if (evt.type === 'victoryCheck') {
                if (this.roundNumber >= evt.trigger.afterRound) {
                    this.runVictoryCheck(i, evt);
                }
            }
        }
    }

    /** Run a single victory check. */
    private runVictoryCheck(
        i: number,
        evt: import('../missions/types').LevelEventVictoryCheck,
    ): void {
        // First time: emit the message if present
        if (!this.victoryCheckFirstEmitDone.has(i)) {
            this.victoryCheckFirstEmitDone.add(i);
            if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);
        }

        for (const cond of evt.conditions) {
            if (cond.type === 'eliminateAllEnemies') {
                const hasEnemies = this.units.some(
                    (u) => u.isAlive() && u.teamId === 'enemy',
                );
                if (!hasEnemies) {
                    this.onVictory?.();
                    return;
                }
            }
        }
    }

    /** Process discard pile: seconds-based cards (called each tick). */
    private processDiscardSeconds(): void {
        for (const playerId of Object.keys(this.cards)) {
            for (const card of this.cards[playerId]) {
                if (card.location !== 'discard' || card.discardAddedAtTime === undefined) continue;

                const def = getCardDef(card.abilityId);
                const dd = def?.discardDuration;
                if (dd?.unit !== 'seconds') continue;

                if (this.gameTime - card.discardAddedAtTime >= dd.duration) {
                    card.location = 'deck';
                    card.durability = def?.durability ?? 1;
                    delete card.discardRoundsRemaining;
                    delete card.discardAddedAtTime;
                }
            }
        }
    }

    private handleRoundEnd(_roundNumber: number): void {
        for (const playerId of Object.keys(this.cards)) {
            // Process discard (rounds-based): decrement and return to deck when ready
            for (const card of this.cards[playerId]) {
                if (card.location !== 'discard' || card.discardRoundsRemaining === undefined) continue;

                const def = getCardDef(card.abilityId);
                card.discardRoundsRemaining--;
                if (card.discardRoundsRemaining <= 0) {
                    card.location = 'deck';
                    card.durability = def?.durability ?? 1;
                    delete card.discardRoundsRemaining;
                    delete card.discardAddedAtTime;
                }
            }

            // Draw at round start: draw 1 card per round from deck (if hand has room and deck has cards)
            const handCount = this.cards[playerId].filter((c) => c.location === 'hand').length;
            const deckCards = this.cards[playerId].filter((c) => c.location === 'deck');
            const toDraw = Math.min(1, MAX_HAND_SIZE - handCount, deckCards.length);

            for (let i = 0; i < toDraw; i++) {
                const idx = this.generateRandomInteger(0, deckCards.length - 1);
                const card = deckCards[idx];
                if (card) {
                    card.location = 'hand';
                    deckCards.splice(idx, 1);
                }
            }
        }
    }

    // ========================================================================
    // Timing Helpers
    // ========================================================================

    /** Get the progress of the current round (0..1). */
    get roundProgress(): number {
        const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
        return Math.min(1, roundTime / ROUND_DURATION);
    }

    // ========================================================================
    // Serialization
    // ========================================================================

    toJSON(): SerializedGameState {
        return {
            randomSeed: this.randomSeed,
            gameTime: this.gameTime,
            gameTick: this.gameTick,
            roundNumber: this.roundNumber,
            snapshotIndex: this.snapshotIndex,
            units: this.units.map((u) => u.toJSON()),
            projectiles: this.projectiles.map((p) => p.toJSON()),
            effects: this.effects.map((e) => e.toJSON()),
            cards: Object.fromEntries(
                Object.entries(this.cards).map(([pid, cards]) => [
                    pid,
                    cards.map((c) => ({ ...c })),
                ]),
            ),
            waitingForOrders: this.waitingForOrders,
            orders: this.pendingOrders.map((o) => ({ gameTick: o.gameTick, order: { ...o.order, targets: o.order.targets.map((t) => ({ ...t })) } })),
            specialTiles: this.specialTiles.map((t) => specialTileToJSON(t) as unknown as import('./types').SerializedSpecialTile),
            aiControllerId: this.aiControllerId,
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
        engine.pendingOrders = (data.orders ?? []).map((o) => ({
            gameTick: o.gameTick,
            order: { ...o.order, targets: (o.order.targets ?? []).map((t) => ({ ...t })) },
        }));

        // Restore units
        for (const unitData of data.units) {
            const unit = Unit.fromJSON(unitData as Record<string, unknown>, engine.eventBus);
            // Reattach resources based on serialized resource data
            const resourceData = (unitData as Record<string, unknown>).resources as Record<string, unknown>[] | undefined;
            if (resourceData) {
                for (const rd of resourceData) {
                    const resource = createResourceFromId(rd.id as string);
                    if (resource) {
                        resource.restoreFromJSON(rd);
                        unit.attachResource(resource, engine.eventBus);
                    }
                }
            }
            engine.units.push(unit);
        }

        // Restore projectiles
        for (const projData of data.projectiles) {
            engine.projectiles.push(Projectile.fromJSON(projData as Record<string, unknown>));
        }

        // Restore effects
        for (const fxData of data.effects) {
            engine.effects.push(Effect.fromJSON(fxData as Record<string, unknown>));
        }

        // Restore special tiles
        for (const tileData of data.specialTiles ?? []) {
            const def = getSpecialTileDef(tileData.defId);
            if (def && def.id === 'DefendPoint') {
                engine.specialTiles.push(specialTileFromJSON(tileData as unknown as Record<string, unknown>, def));
            }
        }

        // Restore cards (ensure durability default; migrate legacy exile → deck)
        engine.cards = Object.fromEntries(
            Object.entries(data.cards).map(([pid, cards]) => [
                pid,
                cards.map((c) => {
                    const def = getCardDef(c.abilityId);
                    const raw = c as SerializedCardInstance & { location?: string; exileRounds?: number };
                    const { exileRounds: _, ...rest } = raw;
                    const rawLoc: string = raw.location ?? 'deck';
                    const loc = rawLoc === 'exile' ? 'deck' : rawLoc;
                    return {
                        ...rest,
                        location: loc,
                        durability: raw.durability ?? def?.durability ?? 1,
                    } as CardInstance;
                }),
            ]),
        );

        // Re-subscribe to round_end
        engine.eventBus.on('round_end', (evtData) => {
            engine.handleRoundEnd(evtData.roundNumber);
        });

        return engine;
    }

    /** Destroy the engine and clean up. */
    destroy(): void {
        this.stop();
        for (const unit of this.units) {
            unit.detachAllResources(this.eventBus);
        }
        this.eventBus.clear();
        this.units = [];
        this.projectiles = [];
        this.effects = [];
        this.specialTiles = [];
    }
}

// Helper: create a resource instance from its type ID
function createResourceFromId(id: string): Resource | null {
    switch (id) {
        case 'rage':
            return new Rage();
        case 'mana':
            return new Mana();
        default:
            return null;
    }
}
