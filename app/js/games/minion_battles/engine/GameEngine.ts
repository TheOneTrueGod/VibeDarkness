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
import { spendAbilityCost } from '../abilities/Ability';
import type { AbilityStatic } from '../abilities/Ability';
import { areEnemies } from './teams';
import type { TeamId } from './teams';
import { Rage } from '../resources/Rage';
import { Mana } from '../resources/Mana';
import type { Resource } from '../resources/Resource';
import type { TerrainManager } from '../terrain/TerrainManager';

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

/** Card instance tracked per player. */
export interface CardInstance {
    cardDefId: string;
    abilityId: string;
    location: 'hand' | 'deck' | 'exile';
    exileRounds: number;
}

export class GameEngine {
    // -- Core state --
    readonly eventBus: EventBus = new EventBus();
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
    /** Called when a checkpoint should be saved (every CHECKPOINT_INTERVAL ticks). Receives gameTick, serialized state, and pending orders. */
    private onCheckpoint: ((gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void) | null = null;

    /** The local player's ID. Used to decide which unit to center camera on. */
    localPlayerId: string = '';

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /**
     * Prepare the engine for a new game (before mission.initializeGameState populates it).
     * Sets localPlayerId, terrainManager, resets object IDs, and subscribes to round_end.
     */
    prepareForNewGame(config: { localPlayerId: string; terrainManager?: TerrainManager | null }): void {
        this.localPlayerId = config.localPlayerId;
        this.terrainManager = config.terrainManager ?? null;
        resetGameObjectIdCounter(1);
        this.eventBus.on('round_end', (data) => {
            this.handleRoundEnd(data.roundNumber);
        });
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

    /** Set callback for checkpoint saves (every CHECKPOINT_INTERVAL ticks). */
    setOnCheckpoint(cb: (gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void): void {
        this.onCheckpoint = cb;
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

        // Process active abilities on all units
        this.processActiveAbilities(dt);

        // Update units
        for (const unit of this.units) {
            if (!unit.active) continue;
            unit.update(dt, this);

            // Check if a player-owned unit just finished cooldown
            if (unit.isPlayerControlled() && unit.canAct() && unit.isAlive() && !this.waitingForOrders) {
                this.pauseForOrders(unit);
                return; // Stop processing this tick
            }

            // AI units auto-act when cooldown finishes
            if (!unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                this.executeAITurn(unit);
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

        // Cleanup inactive objects
        this.units = this.units.filter((u) => u.active);
        this.projectiles = this.projectiles.filter((p) => p.active);
        this.effects = this.effects.filter((e) => e.active);

        // Checkpoint: host syncs every CHECKPOINT_INTERVAL ticks
        if (this.gameTick > 0 && this.gameTick % CHECKPOINT_INTERVAL === 0) {
            const state = this.toJSON();
            const orders = [...this.pendingOrders];
            this.onCheckpoint?.(this.gameTick, state, orders);
        }
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

        // Move the card to exile (for the unit's owner)
        this.exileCard(unit.ownerId, ability.id);
    }

    /** Move the first in-hand card matching the ability to exile. */
    private exileCard(playerId: string, abilityId: string): void {
        const playerCards = this.cards[playerId];
        if (!playerCards) return;
        const card = playerCards.find(
            (c) => c.abilityId === abilityId && c.location === 'hand',
        );
        if (card) {
            card.location = 'exile';
            card.exileRounds = 0;
        }
    }

    // ========================================================================
    // AI
    // ========================================================================

    private executeAITurn(unit: Unit): void {
        // Find all living enemies
        const enemies = this.units.filter(
            (u) => u.isAlive() && areEnemies(unit.teamId, u.teamId),
        );
        if (enemies.length === 0) {
            unit.startCooldown(1); // wait cooldown
            this.eventBus.emit('turn_end', { unitId: unit.id });
            return;
        }

        // Pick a random target for movement decisions
        const moveTarget = enemies[Math.floor(Math.random() * enemies.length)];

        // Set move target based on unit AI range settings
        if (unit.aiSettings) {
            this.applyAIMovement(unit, moveTarget);
        }

        // Try each ability and find one with a valid target in range
        for (const abilityId of unit.abilities) {
            const ability = getAbility(abilityId);
            if (!ability) continue;

            // Find a target within this ability's AI range
            const validTarget = this.findAIAbilityTarget(unit, ability, enemies);
            if (!validTarget) continue;

            // Build resolved targets aimed at the valid target
            const resolvedTargets: ResolvedTarget[] = ability.targets.map((t) => {
                if (t.type === 'pixel') {
                    return { type: 'pixel', position: { x: validTarget.x, y: validTarget.y } };
                }
                if (t.type === 'unit') {
                    return { type: 'unit', unitId: validTarget.id };
                }
                return { type: 'player', playerId: validTarget.ownerId, unitId: validTarget.id };
            });

            // Queue order at current tick so it is recorded and applied in this tick
            const order: BattleOrder = {
                unitId: unit.id,
                abilityId: ability.id,
                targets: resolvedTargets,
                movePath: unit.movement?.path ? [...unit.movement.path] : undefined,
            };
            this.queueOrder(this.gameTick, order);
            this.eventBus.emit('turn_end', { unitId: unit.id });
            return;
        }

        // No ability had a valid target in range — wait
        const waitOrder: BattleOrder = { unitId: unit.id, abilityId: 'wait', targets: [] };
        this.queueOrder(this.gameTick, waitOrder);
        this.eventBus.emit('turn_end', { unitId: unit.id });
    }

    /**
     * Find a random enemy target that is within an ability's AI range.
     * If the ability has no aiSettings, any enemy is valid.
     * Returns null if no target is in range.
     */
    private findAIAbilityTarget(unit: Unit, ability: AbilityStatic, enemies: Unit[]): Unit | null {
        const ai = ability.aiSettings;

        // No AI settings on the ability — pick a random enemy
        if (!ai) {
            return enemies[Math.floor(Math.random() * enemies.length)] ?? null;
        }

        // Filter enemies within the ability's range
        const inRange = enemies.filter((e) => {
            const dx = e.x - unit.x;
            const dy = e.y - unit.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist >= ai.minRange && dist <= ai.maxRange;
        });

        if (inRange.length === 0) return null;
        return inRange[Math.floor(Math.random() * inRange.length)];
    }

    /**
     * Set movement on an AI unit so it stays within its preferred range
     * of the given target. Reuses existing paths when possible.
     */
    private applyAIMovement(unit: Unit, target: Unit): void {
        const ai = unit.aiSettings;
        if (!ai || !this.terrainManager) return;

        const grid = this.terrainManager.grid;

        const dx = target.x - unit.x;
        const dy = target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return; // exactly on top; skip to avoid division by zero

        const idealRange = (ai.minRange + ai.maxRange) / 2;
        let destX: number | null = null;
        let destY: number | null = null;

        if (dist > ai.maxRange) {
            // Too far — move toward target, stopping at ideal range
            const moveToDistance = dist - idealRange;
            destX = unit.x + (dx / dist) * moveToDistance;
            destY = unit.y + (dy / dist) * moveToDistance;
        } else if (dist < ai.minRange) {
            // Too close — back away from target to ideal range
            const retreatDistance = idealRange - dist;
            destX = unit.x - (dx / dist) * retreatDistance;
            destY = unit.y - (dy / dist) * retreatDistance;
        }

        if (destX === null || destY === null) return; // Already in range

        // Clamp to world bounds
        destX = Math.max(0, Math.min(WORLD_WIDTH, destX));
        destY = Math.max(0, Math.min(WORLD_HEIGHT, destY));

        const destGrid = grid.worldToGrid(destX, destY);

        // Try to reuse existing path if tracking the same target
        if (
            unit.movement &&
            unit.movement.targetUnitId === target.id &&
            unit.movement.path.length > 0
        ) {
            const pathEnd = unit.movement.path[unit.movement.path.length - 1];

            // Path already leads to the right destination cell
            if (pathEnd.col === destGrid.col && pathEnd.row === destGrid.row) {
                return;
            }

            // Compute sub-path from end of current path to new destination
            const subPath = this.terrainManager.findGridPath(
                pathEnd.col, pathEnd.row,
                destGrid.col, destGrid.row,
            );

            if (subPath && subPath.length > 0) {
                // Remove overlapping cells: if the sub-path backtracks through
                // cells already in the current path, trim from both ends.
                let currentTrimAt = unit.movement.path.length;
                let subPathStart = 0;

                for (let s = 0; s < subPath.length; s++) {
                    let found = false;
                    for (let c = currentTrimAt - 1; c >= 0; c--) {
                        if (
                            unit.movement.path[c].col === subPath[s].col &&
                            unit.movement.path[c].row === subPath[s].row
                        ) {
                            currentTrimAt = c;
                            subPathStart = s + 1;
                            found = true;
                            break;
                        }
                    }
                    if (!found) break;
                }

                unit.movement.path.length = currentTrimAt;
                unit.movement.path.push(...subPath.slice(subPathStart));
                unit.movement.pathfindingTick = this.gameTick;
                return;
            }
        }

        // Fresh path from unit's current position to destination
        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const path = this.terrainManager.findGridPath(
            unitGrid.col, unitGrid.row,
            destGrid.col, destGrid.row,
        );

        if (path && path.length > 0) {
            unit.setMovement(path, target.id, this.gameTick);
        } else {
            unit.clearMovement();
        }
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

    addProjectile(projectile: Projectile): void {
        this.projectiles.push(projectile);
    }

    addEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    getUnit(id: string): Unit | undefined {
        return this.units.find((u) => u.id === id);
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

    private handleRoundEnd(_roundNumber: number): void {
        // Process exiled cards: increment exileRounds, recharge if ready
        for (const playerId of Object.keys(this.cards)) {
            for (const card of this.cards[playerId]) {
                if (card.location === 'exile') {
                    card.exileRounds++;
                    const ability = getAbility(card.abilityId);
                    if (ability && card.exileRounds >= ability.rechargeTurns) {
                        card.location = 'deck';
                        card.exileRounds = 0;
                    }
                }
            }

            // Auto-draw: move deck cards to hand if there's room
            // (For now we keep it simple: all cards cycle hand -> exile -> deck -> hand)
            const handCount = this.cards[playerId].filter((c) => c.location === 'hand').length;
            if (handCount < 4) {
                for (const card of this.cards[playerId]) {
                    if (card.location === 'deck') {
                        card.location = 'hand';
                        // Only draw enough to fill up to 4
                        if (this.cards[playerId].filter((c) => c.location === 'hand').length >= 4) {
                            break;
                        }
                    }
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
        };
    }

    static fromJSON(data: SerializedGameState, localPlayerId: string, terrainManager?: TerrainManager | null): GameEngine {
        const engine = new GameEngine();
        engine.localPlayerId = localPlayerId;
        engine.terrainManager = terrainManager ?? null;
        engine.gameTime = data.gameTime;
        engine.gameTick = data.gameTick ?? 0;
        engine.roundNumber = data.roundNumber;
        engine.snapshotIndex = data.snapshotIndex;
        engine.waitingForOrders = data.waitingForOrders;
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

        // Restore cards
        engine.cards = Object.fromEntries(
            Object.entries(data.cards).map(([pid, cards]) => [
                pid,
                cards.map((c) => ({ ...c })),
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
