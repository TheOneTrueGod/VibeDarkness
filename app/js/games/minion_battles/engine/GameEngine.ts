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
import { getTotalAbilityDuration } from '../abilities/abilityTimings';
import { asCardDefId, getCardDef } from '../card_defs';
import type { CardDefId } from '../card_defs';
import { spendAbilityCost, refundAbilityCost } from '../abilities/Ability';
import type { AbilityStatic } from '../abilities/Ability';
import { type TeamId, areAllies, areEnemies } from './teams';
import { Rage } from '../resources/Rage';
import { Mana } from '../resources/Mana';
import type { Resource } from '../resources/Resource';
import type { TerrainManager } from '../terrain/TerrainManager';
import type {
    LevelEvent,
    LevelEventSpawnWave,
    LevelEventVictoryCheck,
    LevelEventContinuousSpawn,
} from '../storylines/types';
import { getEdgePositions } from '../storylines/edgeSpawns';
import { createUnitFromSpawnConfig } from '../objects/units/index';
import {
    ENEMY_MELEE,
    ENEMY_RANGED,
    ENEMY_DARK_WOLF,
    ENEMY_ALPHA_WOLF,
    getEnemyHealthMultiplier,
} from '../constants/enemyConstants';
import type { SpecialTile } from '../objects/SpecialTile';
import { isTileDefendPoint, specialTileToJSON, specialTileFromJSON } from '../objects/SpecialTile';
import { getSpecialTileDef } from '../storylines/specialTileDefs';
import { buildAIController } from '../storylines/ai';
import type { AIContext } from '../storylines/ai';
import { getLightGrid, type LightSource } from './LightGrid';
import { getDeathEffectDef } from './unitDef';

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

/** Number of cards drawn at the beginning of each round. */
export const CARDS_PER_ROUND = 2;

let nextCardInstanceId = 1;

function generateCardInstanceId(): string {
    const suffix = nextCardInstanceId++;
    return `card-${Date.now().toString(36)}-${suffix}`;
}

/** Create a card instance with defaults (durability from card def). */
export function createCardInstance(
    cardDefId: CardDefId,
    abilityId: string,
    location: CardInstance['location'],
): CardInstance {
    const def = getCardDef(cardDefId);
    if (!def) {
        console.error(`ERROR: Unable to get card def (${cardDefId}) for ability id (${abilityId}).`);
    }
    return {
        instanceId: generateCardInstanceId(),
        cardDefId,
        abilityId,
        location,
        durability: def?.durability ?? 1,
    };
}

/** Card instance tracked per player. */
export interface CardInstance {
    instanceId: string;
    cardDefId: CardDefId;
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
    /** Ability uses this round per unit: `${unitId}:${abilityId}` -> count. Reset on round end. */
    private abilityUsesThisRound: Map<string, number> = new Map();
    /** Special tiles (defend points, etc.) with grid position and HP. */
    specialTiles: SpecialTile[] = [];

    // -- Terrain --
    terrainManager: TerrainManager | null = null;

    /** World width in pixels (from terrain grid when present, else fallback). */
    getWorldWidth(): number {
        const grid = this.terrainManager?.grid;
        return grid ? grid.worldWidth : WORLD_WIDTH;
    }

    /** World height in pixels (from terrain grid when present, else fallback). */
    getWorldHeight(): number {
        const grid = this.terrainManager?.grid;
        return grid ? grid.worldHeight : WORLD_HEIGHT;
    }

    /**
     * Crystal protection map: for each "col,row" the number of crystals protecting that tile (client-side only, not synced).
     * Derived from current specialTiles; recalculated on each call.
     */
    getCrystalProtectionMap(): Map<string, number> {
        const map = new Map<string, number>();
        const grid = this.terrainManager?.grid;
        if (!grid) return map;
        const crystals = this.specialTiles.filter((t) => t.defId === 'Crystal' && t.hp > 0);
        for (const c of crystals) {
            const radius = c.protectRadius ?? 0;
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    if (Math.max(Math.abs(dc), Math.abs(dr)) > radius) continue;
                    const col = c.col + dc;
                    const row = c.row + dr;
                    if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) continue;
                    const key = `${col},${row}`;
                    map.set(key, (map.get(key) ?? 0) + 1);
                }
            }
        }
        return map;
    }

    /** Set of "col,row" keys for tiles protected by at least one crystal (enemy pathfinding treats these as blocked). */
    getCrystalProtectedSet(): Set<string> {
        const map = this.getCrystalProtectionMap();
        return new Set(map.keys());
    }

    /** Number of crystals protecting the given tile (0 if none). */
    getCrystalProtectionCount(col: number, row: number): number {
        return this.getCrystalProtectionMap().get(`${col},${row}`) ?? 0;
    }

    // -- Cards per player --
    cards: Record<string, CardInstance[]> = {};
    /** Player research trees available to runtime ability logic. */
    playerResearchTreesByPlayer: Record<string, Record<string, string[]>> = {};

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
    /** Mission light config used for darkness-based logic (e.g. spawnBehaviour: 'darkness'). */
    lightLevelEnabled: boolean = true;
    globalLightLevel: number = 0;

    /** Level events from mission. Cleared on restore. */
    private levelEvents: LevelEvent[] = [];
    /** Indices of one-shot events that have already fired (spawnWave). */
    private firedEventIndices: Set<number> = new Set();
    /** Indices of victory checks that have emitted their first-attempt message. */
    private victoryCheckFirstEmitDone: Set<number> = new Set();
    /** For continuousSpawn events: event index -> gameTime of last spawn. */
    private continuousSpawnLastSpawnedAt: Record<number, number> = {};
    /** Callback to send a message to the lobby chat (e.g. from emittedMessage). npcId = NPC to display as sender. */
    private onEmitMessage: ((text: string, npcId?: string) => void) | null = null;
    /** Callback when victory is achieved. Passes mission result from the winning victory check. */
    private onVictory: ((missionResult: string) => void) | null = null;
    /** Callback when defeat is achieved (all player units dead). */
    private onDefeat: (() => void) | null = null;
    /** True once defeat has been triggered so we only fire once. */
    private defeatFired = false;
    /** When true, fixedUpdate no-ops so the game is paused. */
    private defeated = false;
    /** True once victory has been triggered so we only fire once. */
    private victoryFired = false;
    /** When true, fixedUpdate no-ops so the game is paused (victory). */
    private victorious = false;

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /**
     * (Re)register core event bus listeners that are required for both new games
     * and games restored from a snapshot.
     */
    private registerCoreEventListeners(): void {
        // Clear listeners from any previous run to prevent duplicate handlers.
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

    /**
     * Prepare the engine for a new game (before mission.initializeGameState populates it).
     * Sets localPlayerId, terrainManager, resets object IDs, and subscribes to round_end.
     * If isHost is true, generates a random seed for deterministic RNG across clients.
     */
    prepareForNewGame(config: { localPlayerId: string; terrainManager?: TerrainManager | null; isHost?: boolean; aiControllerId?: string | null }): void {
        this.registerCoreEventListeners();
        this.localPlayerId = config.localPlayerId;
        this.terrainManager = config.terrainManager ?? null;
        this.aiControllerId = config.aiControllerId ?? null;
        this.defeatFired = false;
        this.defeated = false;
        this.victoryFired = false;
        this.victorious = false;
        resetGameObjectIdCounter(1);
        if (config.isHost) {
            this.randomSeed = this.generateHostSeed();
        }
    }

    /** Set mission light config for darkness-based logic (e.g. spawnBehaviour: 'darkness'). */
    setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
        this.lightLevelEnabled = lightLevelEnabled;
        this.globalLightLevel = globalLightLevel;
    }

    /** Register level events from the mission. Call from initializeGameState. Clears fired-event state. */
    registerLevelEvents(events: LevelEvent[]): void {
        this.levelEvents = events;
        this.firedEventIndices.clear();
        this.victoryCheckFirstEmitDone.clear();
    }

    /** Set level events without clearing fired indices. Use when restoring from snapshot so spawn waves do not re-fire. */
    setLevelEvents(events: LevelEvent[]): void {
        this.levelEvents = events;
    }

    /** Set callback to send a message to the lobby chat. */
    setOnEmitMessage(cb: (text: string, npcId?: string) => void): void {
        this.onEmitMessage = cb;
    }

    /** Set callback when victory is achieved. */
    setOnVictory(cb: (missionResult: string) => void): void {
        this.onVictory = cb;
    }

    /** Set callback when defeat is achieved (all player units dead). */
    setOnDefeat(cb: () => void): void {
        this.onDefeat = cb;
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

        // Only accumulate time when the game is not paused, defeated, or victorious
        if (!this.defeated && !this.victorious && !this.isPaused && !this.waitingForOrders) {
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
        if (this.defeated || this.victorious) return;

        // Advance game time and tick (only when game is advancing)
        this.gameTime += dt;
        this.gameTick++;

        // Apply any orders scheduled for this tick
        const toApply = this.pendingOrders.filter((o) => o.gameTick === this.gameTick);
        this.pendingOrders = this.pendingOrders.filter((o) => o.gameTick !== this.gameTick);
        for (const { order } of toApply) {
            this.applyOrderLogic(order);
        }

        // Special tiles light emission decay (supports fractional-round intervals).
        this.processSpecialTileLightDecays();

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

            // AI units auto-act when cooldown finishes (no snapshot here; host saves only on player pause or player submit)
            if (!unit.isPlayerControlled() && unit.canAct() && unit.isAlive()) {
                this.runVictoryChecks(); // before turn
                const controller = buildAIController(this.aiControllerId);
                controller.executeTurn(unit, this.buildAIContext());
            }
        }

        // Crystal aura: player units within a Crystal's protectRadius get tag 'protectedByCrystal' (enemies cannot see them)
        const grid = this.terrainManager?.grid;
        if (grid) {
            const crystalTiles = this.specialTiles.filter((t) => t.defId === 'Crystal' && t.hp > 0);
            for (const unit of this.units) {
                if (!unit.isPlayerControlled() || !unit.isAlive()) continue;
                const { col: uc, row: ur } = grid.worldToGrid(unit.x, unit.y);
                const nearCrystal = crystalTiles.some((c) => {
                    const radius = c.protectRadius ?? 0;
                    return Math.max(Math.abs(uc - c.col), Math.abs(ur - c.row)) <= radius;
                });
                if (nearCrystal) {
                    if (!unit.tags.includes('protectedByCrystal')) unit.tags = [...unit.tags, 'protectedByCrystal'];
                } else {
                    unit.tags = unit.tags.filter((t) => t !== 'protectedByCrystal');
                }
            }
        }

        // Crystal protection (client-side derived): tiles in crystal protectRadius are protected; count per tile.
        // Not synced to server; recalculated from current specialTiles when needed.

        // Process corrupting (AI units at destructible defend points)
        this.processCorrupting(dt);

        // Process player darkness corruption (full darkness damages over time)
        this.processPlayerDarknessCorruption(dt);

        // Update projectiles and check collisions
        for (const proj of this.projectiles) {
            if (!proj.active) continue;
            proj.update(dt, this);
            proj.checkCollision(this.units, this.eventBus, this.gameTime, this);
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

        // Defeat check: all player units dead
        this.runDefeatCheck();
    }

    /** If all player units are dead, fire defeat once and pause. */
    private runDefeatCheck(): void {
        if (this.defeatFired) return;
        const hasAlivePlayer = this.units.some(
            (u) => u.isPlayerControlled() && u.isAlive(),
        );
        if (!hasAlivePlayer) {
            this.defeatFired = true;
            this.defeated = true;
            this.onDefeat?.();
        }
    }

    /** Process corrupting: units at destructible defend points deal 1 HP every 2 seconds and spawn orbs. */
    private processCorrupting(dt: number): void {
        const grid = this.terrainManager?.grid;
        if (!grid) return;

        for (const unit of this.units) {
            const tileId = unit.aiContext.corruptingTargetId;
            if (!tileId) continue;

            const tile = this.specialTiles.find((t) => t.id === tileId);
            if (!tile || tile.hp <= 0 || !tile.destructible) {
                unit.aiContext.corruptingTargetId = undefined;
                unit.aiContext.corruptingStartedAt = undefined;
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
                unit.aiContext.corruptingTargetId = undefined;
                unit.aiContext.corruptingStartedAt = undefined;
                const bar = this.effects.find(
                    (e) => e.effectType === 'CorruptionProgressBar' && (e.effectData as { unitId?: string }).unitId === unit.id,
                );
                if (bar) bar.active = false;
                continue;
            }

            const startedAt = unit.aiContext.corruptingStartedAt ?? this.gameTime;
            const elapsed = this.gameTime - startedAt;

            // Ensure progress bar effect exists
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
                unit.aiContext.corruptingStartedAt = this.gameTime;

                const targetWorld = grid.gridToWorld(tile.col, tile.row);
                const angle = (this.generateRandomInteger(0, 629) / 100) * Math.PI; // 0..2*PI
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

    /** Light level below or equal to this is "full darkness" (player takes 5 corruption damage when meter fills). */
    private static readonly FULL_DARKNESS_THRESHOLD = -20;
    /** Light level below or equal to this but above full darkness is the tier below total darkness (same meter, 2 damage when meter fills). */
    private static readonly HIGH_DARKNESS_THRESHOLD = -15;

    /** Build light sources from special tiles (same logic as renderer) for game logic. */
    private buildLightSourcesFromSpecialTiles(): LightSource[] {
        const sources: LightSource[] = [];
        for (const tile of this.specialTiles) {
            if (tile.hp <= 0) continue;
            const light = tile.emitsLight;
            if (light != null && tile.maxHp > 0) {
                const scale = 0.5 + 0.5 * (tile.hp / tile.maxHp);
                sources.push({
                    col: tile.col,
                    row: tile.row,
                    emission: light.lightAmount * scale,
                    radius: light.radius,
                });
            }
        }
        return sources;
    }

    /** Build light sources from Torch effects (use current lightAmount/radius updated in handleRoundEnd). */
    private buildLightSourcesFromEffects(): LightSource[] {
        const grid = this.terrainManager?.grid;
        if (!grid) return [];
        const sources: LightSource[] = [];
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as { lightAmount?: number; radius?: number };
            const emission = data.lightAmount ?? 0;
            const radius = data.radius ?? 0;
            if (emission <= 0 || radius <= 0) continue;
            const { col, row } = grid.worldToGrid(effect.x, effect.y);
            sources.push({ col, row, emission, radius });
        }
        return sources;
    }

    /** All light sources (special tiles + Torch effects) for darkness and spawn logic. */
    private getAllLightSources(): LightSource[] {
        return [...this.buildLightSourcesFromSpecialTiles(), ...this.buildLightSourcesFromEffects()];
    }

    /** Light sources with id for AI (FindLight state). */
    private getLightSourcesForAI(): import('../storylines/ai/types').AILightSource[] {
        const out: import('../storylines/ai/types').AILightSource[] = [];
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

    /** When a player is in full darkness (light <= -20), fill corruption bar over 1s; when full, deal 5 damage. In the tier below (light in (-20, -10]), same meter and timing but 2 damage when full. When not in darkness (light > -10), drain bar over 1s. */
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

            const inFullDarkness = light <= GameEngine.FULL_DARKNESS_THRESHOLD;
            const inHighDarkness = light <= GameEngine.HIGH_DARKNESS_THRESHOLD;
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

        // Any new order clears previous wait timing constraints.
        unit.waitMinEndTime = null;
        unit.waitMaxEndTime = null;

        // Apply movement from grid-cell path
        if (order.movePath !== undefined && order.movePath !== null && order.movePath.length > 0) {
            unit.setMovement(order.movePath, undefined, this.gameTick);
        } else if (order.movePath === null) {
            unit.clearMovement();
        }

        // Wait action: do nothing, but apply a cooldown that lasts
        // a minimum of 1 second and a maximum of 3 seconds.
        // The cooldown can end early (after the 1s minimum) once the unit
        // finishes its movement path.
        if (order.abilityId === 'wait') {
            unit.startCooldown(3);
            unit.waitMinEndTime = this.gameTime + 1;
            unit.waitMaxEndTime = this.gameTime + 3;
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

        // Replace any existing active instance of this ability so we only have one per abilityId.
        // Otherwise a previous instance (still in activeAbilities until total duration) can share
        // abilityNote with the new one and apply effects at the wrong time (e.g. immediate damage).
        const existing = unit.activeAbilities.findIndex((a) => a.abilityId === ability.id);
        if (existing >= 0) {
            unit.activeAbilities.splice(existing, 1);
            unit.clearAbilityNote();
        }

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
        this.onCardUsed(unit, ability);
    }

    /** Move the first in-hand card matching the ability: decrement durability; if 0, discard (or remove if discardDuration.unit is 'never'). Otherwise card stays in hand. */
    private onCardUsed(unit: Unit, ability: AbilityStatic): void {
        const playerId = unit.ownerId;
        const abilityId = ability.id;
        const playerCards = this.cards[playerId];
        if (!playerCards) return;
        const card = playerCards.find(
            (c) => c.abilityId === abilityId && c.location === 'hand',
        );
        if (!card) return;

        card.durability--;
        if (card.durability <= 0) {
            const exhaust = ability.keywords?.exhaust;
            if (exhaust) {
                const idx = playerCards.indexOf(card);
                if (idx >= 0) playerCards.splice(idx, 1);
                const generated = exhaust.newCards ?? [];
                for (const entry of generated) {
                    const quantity = Math.max(1, entry.quantity ?? 1);
                    for (let i = 0; i < quantity; i++) {
                        const newCard = createCardInstance(entry.cardDefId, entry.abilityId, entry.location);
                        if (entry.location === 'discard') {
                            newCard.durability = 0;
                            newCard.discardRoundsRemaining = entry.rounds;
                            delete newCard.discardAddedAtTime;
                        }
                        playerCards.push(newCard);
                    }
                }
                return;
            }
            const def = getCardDef(card.cardDefId);
            const discardDuration = def?.discardDuration ?? { duration: 1, unit: 'rounds' as const };
            if (discardDuration.unit === 'never') {
                const idx = playerCards.indexOf(card);
                if (idx >= 0) playerCards.splice(idx, 1);
                return;
            }
            this.moveToDiscard(card);
        }
    }

    /** Move a card to discard and set duration tracking. */
    private moveToDiscard(card: CardInstance): void {
        const def = getCardDef(card.cardDefId);
        const discardDuration = def?.discardDuration ?? { duration: 1, unit: 'rounds' as const };
        if (discardDuration.unit === 'never') return;

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
        const engine = this;
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
                if (!engine.terrainManager) return null;
                if (areEnemies(unit.teamId, 'player')) {
                    const blocked = engine.getCrystalProtectedSet();
                    return engine.terrainManager.findGridPathWithBlocked(fromCol, fromRow, toCol, toRow, blocked);
                }
                return engine.terrainManager.findGridPath(fromCol, fromRow, toCol, toRow);
            },
            queueOrder: (atTick, order) => this.queueOrder(atTick, order),
            emitTurnEnd: (unitId) => this.eventBus.emit('turn_end', { unitId }),
            generateRandomInteger: (min, max) => this.generateRandomInteger(min, max),
            getAbilityUsesThisRound: (unitId, abilityId) =>
                this.abilityUsesThisRound.get(`${unitId}:${abilityId}`) ?? 0,
            WORLD_WIDTH: this.getWorldWidth(),
            WORLD_HEIGHT: this.getWorldHeight(),
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
     * right moment. Removes abilities only when total ability duration
     * (including cooldown) has elapsed, so the unit tracks which ability
     * it used for the full cycle.
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

                const totalDuration = getTotalAbilityDuration(ability);
                if (currentTime >= totalDuration) {
                    completed.push(i);
                }
            }

            // Remove completed abilities (iterate in reverse to preserve indices)
            for (let i = completed.length - 1; i >= 0; i--) {
                unit.activeAbilities.splice(completed[i], 1);
            }
        }
    }

    /** Remove an active ability from a unit (e.g. so AI can interrupt and queue a different order). */
    cancelActiveAbility(unitId: string, abilityId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        const idx = unit.activeAbilities.findIndex((a) => a.abilityId === abilityId);
        if (idx >= 0) unit.activeAbilities.splice(idx, 1);
    }

    /**
     * Interrupt a unit: cancel all active abilities, refund their resource cost and cooldown.
     * Use when the unit is disrupted (e.g. knockback). Clears ability note.
     */
    interruptUnitAndRefundAbilities(unit: Unit): void {
        while (unit.activeAbilities.length > 0) {
            const active = unit.activeAbilities[0];
            const ability = getAbility(active.abilityId);
            if (ability) refundAbilityCost(unit, ability);
            unit.activeAbilities.splice(0, 1);
        }
        unit.cooldownRemaining = 0;
        unit.cooldownTotal = 0;
        unit.clearAbilityNote();
    }

    // ========================================================================
    // Object Management
    // ========================================================================

    /** Add a unit and assign pathfindingRetriggerOffset from the deterministic RNG. */
    addUnit(unit: Unit): void {
        unit.pathfindingRetriggerOffset = this.generateRandomInteger(30, 90);
        if (!unit.isPlayerControlled()) {
            // Deterministic per-enemy jitter factor in [0, 1].
            unit.moveJitter = this.generateRandomInteger(0, 1000) / 1000;
        }
        this.units.push(unit);
    }

    addSpecialTile(tile: SpecialTile): void {
        this.specialTiles.push(tile);
    }

    /**
     * Reduce a special tile's HP by amount. Removes the tile when HP reaches 0.
     * Returns true if the tile was damaged (and possibly removed).
     */
    damageSpecialTile(tileId: string, amount: number): boolean {
        const idx = this.specialTiles.findIndex((t) => t.id === tileId);
        if (idx < 0) return false;
        const tile = this.specialTiles[idx]!;
        tile.hp = Math.max(0, tile.hp - amount);
        if (tile.hp <= 0) {
            this.specialTiles.splice(idx, 1);
        }
        return true;
    }

    addProjectile(projectile: Projectile): void {
        this.projectiles.push(projectile);
    }

    addEffect(effect: Effect): void {
        this.effects.push(effect);
    }

    setPlayerResearchTreesByPlayer(map: Record<string, Record<string, string[]>>): void {
        this.playerResearchTreesByPlayer = {};
        for (const [playerId, trees] of Object.entries(map ?? {})) {
            const normalizedTrees: Record<string, string[]> = {};
            for (const [treeId, nodeIds] of Object.entries(trees ?? {})) {
                normalizedTrees[treeId] = Array.isArray(nodeIds) ? [...nodeIds] : [];
            }
            this.playerResearchTreesByPlayer[playerId] = normalizedTrees;
        }
    }

    getPlayerResearchNodes(playerId: string, treeId: string): string[] {
        return this.playerResearchTreesByPlayer[playerId]?.[treeId] ?? [];
    }

    /**
     * Picks a random ally (same owner, alive, not caster) and adds the given card to that ally's draw pile
     * (or the caster's if no allies). If the target unit doesn't have the ability in their list, adds it.
     */
    transferCardToAllyDeck(caster: Unit, cardDefId: CardDefId, abilityId: string): void {
        const playerId = caster.ownerId;
        const deck = this.cards[playerId];
        if (!deck) return;
        const allies = this.getAllies(caster);
        const targetUnit = allies.length > 0
            ? allies[this.generateRandomInteger(0, allies.length - 1)]
            : caster;
        if (!targetUnit.abilities.includes(abilityId)) {
            targetUnit.abilities.push(abilityId);
        }
        const newCard = createCardInstance(cardDefId, abilityId, 'deck');
        const targetPlayerId = targetUnit.ownerId;
        this.cards[targetPlayerId].push(newCard);
    }

    /**
     * Returns units that are on the same team as the caster (alive, excluding the caster).
     * Uses the team system: by default enemy units are "enemy", player units are "player";
     * "player" and "allied" are allied with each other.
     */
    getAllies(caster: Unit): Unit[] {
        return this.units.filter(
            (u) => u.id !== caster.id && u.isAlive() && areAllies(caster.teamId, u.teamId),
        );
    }

    getUnit(id: string): Unit | undefined {
        return this.units.find((u) => u.id === id);
    }

    getUnits(): Unit[] {
        return this.units;
    }

    /** Get the local player's unit. */
    getLocalPlayerUnit(): Unit | undefined {
        return this.units.find(
            (u) => u.ownerId === this.localPlayerId && u.isAlive(),
        );
    }

    /**
     * Draw a single card from the player's deck into their hand.
     * Does nothing if hand is full or deck is empty. Returns 1 if a card was drawn, 0 otherwise.
     */
    private drawCard(playerId: string): number {
        const playerCards = this.cards[playerId];
        if (!playerCards) return 0;
        const handCount = playerCards.filter((c) => c.location === 'hand').length;
        if (handCount >= MAX_HAND_SIZE) return 0;
        const deckCards = playerCards.filter((c) => c.location === 'deck');
        if (deckCards.length === 0) return 0;
        const idx = this.generateRandomInteger(0, deckCards.length - 1);
        const card = deckCards[idx];
        if (!card) return 0;
        card.location = 'hand';
        return 1;
    }

    /**
     * Draw up to `count` cards from the player's deck into their hand.
     * Does not exceed MAX_HAND_SIZE. Returns the number of cards actually drawn.
     */
    drawCardsForPlayer(playerId: string, count: number): number {
        let drawn = 0;
        for (let i = 0; i < count; i++) {
            drawn += this.drawCard(playerId);
        }
        return drawn;
    }

    /**
     * Fill hand up to maxHandSize: first move all cards with tag 'innate' from deck to hand,
     * then draw at random to fill the rest. Use when building the starting hand for a mission.
     */
    fillHandInnateFirst(playerId: string, maxHandSize: number): void {
        const playerCards = this.cards[playerId];
        if (!playerCards) return;
        let handCount = playerCards.filter((c) => c.location === 'hand').length;
        const deckCards = playerCards.filter((c) => c.location === 'deck');
        // First: move innate cards to hand (stable order: first innate in deck order)
        for (const card of deckCards) {
            if (handCount >= maxHandSize) break;
            const def = getCardDef(card.cardDefId);
            if (def?.tags?.includes('innate')) {
                card.location = 'hand';
                handCount++;
            }
        }
        // Then: draw to fill
        this.drawCardsForPlayer(playerId, maxHandSize - handCount);
    }

    // ========================================================================
    // Round End / Card Recharge
    // ========================================================================

    /** Emit a message to the lobby chat if callback is set. When npcId is set, message appears from that NPC. */
    private emitMessage(text: string, npcId?: string): void {
        this.onEmitMessage?.(text, npcId);
    }

    /** Process level events: spawn waves, continuous spawns, victory checks (periodic). */
    private processLevelEvents(): void {
        for (let i = 0; i < this.levelEvents.length; i++) {
            const evt = this.levelEvents[i];
            if (evt.type === 'spawnWave') {
                this.processSpawnWaveEvent(i, evt);
            } else if (evt.type === 'continuousSpawn') {
                this.processContinuousSpawnEvent(i, evt);
            } else if (evt.type === 'victoryCheck') {
                // Victory checks run every 10 frames when round >= afterRound
                if (this.roundNumber >= evt.trigger.afterRound && this.gameTick % 10 === 0) {
                    this.runVictoryCheck(i, evt);
                }
            }
        }
    }

    /**
     * Process a single spawn wave event.
     * Uses the engine's deterministic RNG (randomSeed) so spawn results are serializable:
     * all clients that restore from the same snapshot see the same units and positions.
     */
    private processSpawnWaveEvent(i: number, evt: LevelEventSpawnWave): void {
        if (this.firedEventIndices.has(i)) return;

        let shouldFire = false;
        if ('atRound' in evt.trigger) {
            shouldFire = this.roundNumber >= evt.trigger.atRound;
        } else if ('afterSeconds' in evt.trigger) {
            shouldFire = this.gameTime >= evt.trigger.afterSeconds;
        }
        if (!shouldFire) return;

        this.firedEventIndices.add(i);
        if (evt.emittedMessage) this.emitMessage(evt.emittedMessage, evt.emittedByNpcId);

        const terrainManager = this.terrainManager;
        if (!terrainManager) {
            // Without terrain we cannot pick valid tiles for spawn behaviours.
            // Skip this wave to avoid inconsistent state.
            // eslint-disable-next-line no-console
            console.error('spawnWave: terrainManager is null; skipping spawn wave.');
            return;
        }

        const grid = terrainManager.grid;
        const width = grid.width;
        const height = grid.height;
        const cellSize = grid.cellSize;
        const baseDefs = {
            enemy_melee: ENEMY_MELEE,
            enemy_ranged: ENEMY_RANGED,
            dark_wolf: ENEMY_DARK_WOLF,
            alpha_wolf: ENEMY_ALPHA_WOLF,
        };
        const playerCount = this.units.filter((u) => u.teamId === 'player').length;
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);

        // Track grid cells used for this wave so we don't double-place units on the same tile.
        const occupiedCells = new Set<string>();

        // Precompute light grid if any spawn entry uses darkness behaviour.
        let lightGrid: number[][] | null = null;
        const needsDarkness = evt.spawns.some((entry) => (entry.spawnBehaviour ?? 'edgeOfMap') === 'darkness');
        if (needsDarkness) {
            if (!this.lightLevelEnabled) {
                // eslint-disable-next-line no-console
                console.error('spawnWave: spawnBehaviour "darkness" requested but light system is disabled; skipping darkness spawns.');
            } else {
                lightGrid = getLightGrid(this.globalLightLevel, width, height, this.getAllLightSources());
            }
        }

        const edgeEntries: { base: typeof ENEMY_MELEE; entry: LevelEventSpawnWave['spawns'][number]; count: number }[] = [];
        const otherEntries: {
            base: typeof ENEMY_MELEE;
            entry: LevelEventSpawnWave['spawns'][number];
            behaviour: 'edgeOfMap' | 'darkness' | 'anywhere';
            count: number;
        }[] = [];

        for (const entry of evt.spawns) {
            const cid = entry.characterId;
            if (cid !== 'enemy_melee' && cid !== 'enemy_ranged' && cid !== 'dark_wolf' && cid !== 'alpha_wolf') continue;
            const base = baseDefs[cid];
            const behaviour = entry.spawnBehaviour ?? 'edgeOfMap';
            const count = Math.max(0, entry.spawnCount ?? 1);
            if (count <= 0) continue;

            if (behaviour === 'edgeOfMap') {
                edgeEntries.push({ base, entry, count });
            } else {
                otherEntries.push({ base, entry, behaviour, count });
            }
        }

        // Edge-of-map behaviour: distribute all requested units evenly around the map perimeter.
        const totalEdgeCount = edgeEntries.reduce((sum, e) => sum + e.count, 0);
        if (totalEdgeCount > 0) {
            const worldW = grid.worldWidth;
            const worldH = grid.worldHeight;
            const positions = getEdgePositions(totalEdgeCount, worldW, worldH);
            let idx = 0;
            for (const { base, entry, count } of edgeEntries) {
                for (let n = 0; n < count; n++) {
                    const pos = positions[idx] ?? { x: 40, y: 40 };
                    idx++;
                    const config = {
                        ...base,
                        ...entry,
                        position: pos,
                        x: pos.x,
                        y: pos.y,
                        ownerId: 'ai' as const,
                        hp: Math.round((entry.hp ?? base.hp) * enemyHealthMult),
                    };
                    const unit = createUnitFromSpawnConfig(config, this.eventBus);
                    this.addUnit(unit);
                }
            }
        }

        // Helper to collect candidate tiles for anywhere/darkness behaviours.
        const collectCandidateTiles = (
            behaviour: 'darkness' | 'anywhere',
            spawnTarget: { x: number; y: number; radius: number } | undefined,
        ): { col: number; row: number }[] => {
            const candidates: { col: number; row: number }[] = [];
            const hasTarget = !!spawnTarget;
            const targetX = spawnTarget?.x ?? 0;
            const targetY = spawnTarget?.y ?? 0;
            const radiusPx = (spawnTarget?.radius ?? 0) * cellSize;
            const radiusSq = radiusPx * radiusPx;

            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const key = `${col},${row}`;
                    if (occupiedCells.has(key)) continue;

                    const { x, y } = grid.gridToWorld(col, row);

                    if (hasTarget) {
                        const dx = x - targetX;
                        const dy = y - targetY;
                        if (dx * dx + dy * dy > radiusSq) continue;
                    }

                    if (!terrainManager.isPassable(x, y)) continue;

                    if (behaviour === 'darkness') {
                        if (!lightGrid) continue;
                        const level = lightGrid[row]?.[col];
                        // "Full darkness" = tiles where light level is very low.
                        if (level == null || level > -20) continue;
                    }

                    candidates.push({ col, row });
                }
            }

            return candidates;
        };

        // Helper to choose indices without replacement using deterministic RNG.
        const chooseRandomIndices = (availableCount: number, needed: number): number[] => {
            const indices: number[] = [];
            for (let i = 0; i < availableCount; i++) indices.push(i);
            const result: number[] = [];
            const count = Math.min(needed, availableCount);
            for (let i = 0; i < count; i++) {
                const pickIndex = this.generateRandomInteger(0, indices.length - 1);
                const [chosen] = indices.splice(pickIndex, 1);
                result.push(chosen);
            }
            return result;
        };

        // Anywhere/darkness behaviours: pick random valid tiles per entry.
        for (const { base, entry, behaviour, count } of otherEntries) {
            if (behaviour === 'darkness' && (!this.lightLevelEnabled || !lightGrid)) {
                // eslint-disable-next-line no-console
                console.error('spawnWave: spawnBehaviour "darkness" has no valid light grid; skipping this spawn entry.');
                continue;
            }

            const candidates = collectCandidateTiles(behaviour === 'darkness' ? 'darkness' : 'anywhere', entry.spawnTarget);
            if (candidates.length === 0) {
                // eslint-disable-next-line no-console
                console.error(
                    `spawnWave: no valid tiles for behaviour "${behaviour}"` +
                        (entry.spawnTarget ? ` near (${entry.spawnTarget.x}, ${entry.spawnTarget.y})` : '') +
                        '; skipping this spawn entry.',
                );
                continue;
            }

            const spawnAttempts = Math.min(count, candidates.length);
            if (spawnAttempts < count) {
                // eslint-disable-next-line no-console
                console.error(
                    `spawnWave: requested ${count} spawns for behaviour "${behaviour}" but only found ${candidates.length} valid tiles.`,
                );
            }

            const chosenIndices = chooseRandomIndices(candidates.length, spawnAttempts);
            for (const idx of chosenIndices) {
                const cell = candidates[idx];
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round((entry.hp ?? base.hp) * enemyHealthMult),
                };
                const unit = createUnitFromSpawnConfig(config, this.eventBus);
                this.addUnit(unit);
            }
        }
    }

    /**
     * Process a continuous spawn event: spawn units every intervalRounds (e.g. 0.25 = quarter-round).
     * Optional startRound/endRound limit the active window. All entries in spawns are spawned each tick.
     */
    private processContinuousSpawnEvent(i: number, evt: LevelEventContinuousSpawn): void {
        const startRound = evt.trigger.startRound ?? 1;
        const endRound = evt.trigger.endRound;
        if (this.roundNumber < startRound) return;
        if (endRound != null && this.roundNumber > endRound) return;

        const intervalRounds = evt.trigger.intervalRounds;
        const lastSpawned = this.continuousSpawnLastSpawnedAt[i] ?? 0;
        if (this.gameTime - lastSpawned < intervalRounds * ROUND_DURATION) return;

        this.continuousSpawnLastSpawnedAt[i] = this.gameTime;

        const terrainManager = this.terrainManager;
        if (!terrainManager) return;
        const grid = terrainManager.grid;
        const width = grid.width;
        const height = grid.height;
        const cellSize = grid.cellSize;
        const baseDefs = {
            enemy_melee: ENEMY_MELEE,
            enemy_ranged: ENEMY_RANGED,
            dark_wolf: ENEMY_DARK_WOLF,
            alpha_wolf: ENEMY_ALPHA_WOLF,
        };
        const playerCount = this.units.filter((u) => u.teamId === 'player').length;
        const enemyHealthMult = getEnemyHealthMultiplier(playerCount);

        const needsDarkness = evt.spawns.some((e) => (e.spawnBehaviour ?? 'darkness') === 'darkness');
        let lightGrid: number[][] | null = null;
        if (needsDarkness && this.lightLevelEnabled) {
            lightGrid = getLightGrid(this.globalLightLevel, width, height, this.getAllLightSources());
        }

        const maxUnits = evt.maxUnits;
        const unitCountByTeam: Record<string, number> | null =
            maxUnits != null
                ? this.units.reduce<Record<string, number>>((acc, u) => {
                      acc[u.teamId] = (acc[u.teamId] ?? 0) + 1;
                      return acc;
                  }, {})
                : null;

        const occupiedCells = new Set<string>();

        const collectCandidates = (
            behaviour: 'darkness' | 'anywhere',
            spawnTarget: { x: number; y: number; radius: number } | undefined,
        ): { col: number; row: number }[] => {
            const candidates: { col: number; row: number }[] = [];
            const hasTarget = !!spawnTarget;
            const targetX = spawnTarget?.x ?? 0;
            const targetY = spawnTarget?.y ?? 0;
            const radiusPx = (spawnTarget?.radius ?? 0) * cellSize;
            const radiusSq = radiusPx * radiusPx;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const key = `${col},${row}`;
                    if (occupiedCells.has(key)) continue;
                    const { x, y } = grid.gridToWorld(col, row);
                    if (!terrainManager.isPassable(x, y)) continue;
                    if (hasTarget) {
                        const dx = x - targetX;
                        const dy = y - targetY;
                        if (dx * dx + dy * dy > radiusSq) continue;
                    }
                    if (behaviour === 'darkness') {
                        if (!lightGrid) continue;
                        const level = lightGrid[row]?.[col];
                        if (level == null || level > -20) continue;
                    }
                    candidates.push({ col, row });
                }
            }
            return candidates;
        };

        const chooseRandomIndices = (availableCount: number, needed: number): number[] => {
            const indices: number[] = [];
            for (let j = 0; j < availableCount; j++) indices.push(j);
            const result: number[] = [];
            const count = Math.min(needed, availableCount);
            for (let j = 0; j < count; j++) {
                const pickIndex = this.generateRandomInteger(0, indices.length - 1);
                const [chosen] = indices.splice(pickIndex, 1);
                result.push(chosen);
            }
            return result;
        };

        for (const entry of evt.spawns) {
            const cid = entry.characterId;
            if (cid !== 'enemy_melee' && cid !== 'enemy_ranged' && cid !== 'dark_wolf' && cid !== 'alpha_wolf') continue;
            const base = baseDefs[cid];
            const behaviour = (entry.spawnBehaviour ?? 'darkness') as 'darkness' | 'anywhere';
            const count = Math.max(0, entry.spawnCount ?? 1);
            if (count <= 0) continue;
            if (behaviour === 'darkness' && (!this.lightLevelEnabled || !lightGrid)) continue;

            if (maxUnits != null && unitCountByTeam && unitCountByTeam[base.teamId] > maxUnits) continue;

            const candidates = collectCandidates(behaviour, entry.spawnTarget);
            if (candidates.length === 0) continue;
            const spawnAttempts = Math.min(count, candidates.length);
            const chosenIndices = chooseRandomIndices(candidates.length, spawnAttempts);
            for (const idx of chosenIndices) {
                if (maxUnits != null && unitCountByTeam && unitCountByTeam[base.teamId] > maxUnits) break;
                const cell = candidates[idx]!;
                const key = `${cell.col},${cell.row}`;
                occupiedCells.add(key);
                const pos = grid.gridToWorld(cell.col, cell.row);
                const config = {
                    ...base,
                    ...entry,
                    position: pos,
                    x: pos.x,
                    y: pos.y,
                    ownerId: 'ai' as const,
                    hp: Math.round((entry.hp ?? base.hp) * enemyHealthMult),
                };
                const unit = createUnitFromSpawnConfig(config, this.eventBus);
                this.addUnit(unit);
                if (unitCountByTeam) unitCountByTeam[base.teamId] += 1;
            }
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
    private runVictoryCheck(i: number, evt: LevelEventVictoryCheck): void {
        if (this.victoryFired) return;
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
                    this.victoryFired = true;
                    this.victorious = true;
                    const missionResult = evt.missionResult ?? 'victory';
                    this.onVictory?.(missionResult);
                    return;
                }
            }
            if (cond.type === 'allUnitsNearPosition') {
                const maxDist = cond.maxDistance ?? 1;
                const alivePlayers = this.units.filter((u) => u.isPlayerControlled() && u.isAlive());
                if (alivePlayers.length === 0) continue;
                const grid = this.terrainManager?.grid;
                if (!grid) continue;
                const allNear = alivePlayers.every((u) => {
                    const { col: uc, row: ur } = grid.worldToGrid(u.x, u.y);
                    return Math.max(Math.abs(uc - cond.col), Math.abs(ur - cond.row)) <= maxDist;
                });
                if (allNear) {
                    this.victoryFired = true;
                    this.victorious = true;
                    const missionResult = evt.missionResult ?? 'victory';
                    this.onVictory?.(missionResult);
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

                const def = getCardDef(card.cardDefId);
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

    /** Decay special tiles' `emitsLight` using `decayRate` + `decayInterval` (both expressed in rounds). */
    private processSpecialTileLightDecays(): void {
        const totalRoundsElapsed = this.gameTime / ROUND_DURATION;
        const eps = 1e-9;
        const radiusLossPerLightLoss = 0.5; // legacy: -1 light and -0.5 radius per 1 round decay step

        for (const tile of this.specialTiles) {
            const light = tile.emitsLight;
            if (!light) continue;

            const decayRate = light.decayRate;
            const decayInterval = light.decayInterval;
            if (decayRate === undefined || decayInterval === undefined) continue;
            if (decayRate <= 0 || decayInterval <= 0) continue;
            if (light.lightAmount <= 0 && light.radius <= 0) continue;

            if (tile.lightDecayNextAtRound === undefined || !Number.isFinite(tile.lightDecayNextAtRound)) {
                const stepsElapsed = Math.floor((totalRoundsElapsed + eps) / decayInterval);
                // Next boundary after current time. Avoid immediate decay when we're exactly on a boundary.
                tile.lightDecayNextAtRound = (stepsElapsed + 1) * decayInterval;
            }

            while (totalRoundsElapsed + eps >= tile.lightDecayNextAtRound) {
                const radiusLoss = radiusLossPerLightLoss * decayRate;
                light.lightAmount = Math.max(0, light.lightAmount - decayRate);
                light.radius = Math.max(0, light.radius - radiusLoss);

                tile.lightDecayNextAtRound += decayInterval;

                // Once both hit 0, further decay steps won't affect gameplay.
                if (light.lightAmount <= 0 && light.radius <= 0) {
                    light.lightAmount = Math.max(0, light.lightAmount);
                    light.radius = Math.max(0, light.radius);
                    tile.lightDecayNextAtRound = Number.POSITIVE_INFINITY;
                    break;
                }
            }
        }
    }

    private handleRoundEnd(_roundNumber: number): void {
        this.abilityUsesThisRound.clear();

        // Torch effects: decay light/radius each round from initial values and remove when expired
        for (const effect of this.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as {
                roundCreated?: number;
                initialLightAmount?: number;
                initialRadius?: number;
                lightAmount?: number;
                radius?: number;
                roundsTotal?: number;
            };
            const roundCreated = data.roundCreated ?? this.roundNumber;
            const initialLight = data.initialLightAmount ?? 15;
            const initialRadius = data.initialRadius ?? 5;
            const roundsTotal = data.roundsTotal ?? 5;
            const roundsLived = this.roundNumber - roundCreated;
            if (roundsLived >= roundsTotal) {
                effect.active = false;
                continue;
            }
            data.lightAmount = Math.max(0, initialLight - 2 * roundsLived);
            data.radius = Math.max(0, initialRadius - roundsLived);
        }

        for (const playerId of Object.keys(this.cards)) {
            // Process discard (rounds-based): decrement and return to deck when ready
            for (const card of this.cards[playerId]) {
                if (card.location !== 'discard' || card.discardRoundsRemaining === undefined) continue;

                const def = getCardDef(card.cardDefId);
                card.discardRoundsRemaining--;
                if (card.discardRoundsRemaining <= 0) {
                    card.location = 'deck';
                    card.durability = def?.durability ?? 1;
                    delete card.discardRoundsRemaining;
                    delete card.discardAddedAtTime;
                }
            }

            // Draw at round end (drawCard enforces hand size and deck non-empty)
            this.drawCardsForPlayer(playerId, CARDS_PER_ROUND);
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
            firedEventIndices: [...this.firedEventIndices],
            victoryCheckFirstEmitDone: [...this.victoryCheckFirstEmitDone],
            continuousSpawnLastSpawnedAt: Object.fromEntries(
                Object.entries(this.continuousSpawnLastSpawnedAt).map(([k, v]) => [k, v]),
            ),
            playerResearchTreesByPlayer: Object.fromEntries(
                Object.entries(this.playerResearchTreesByPlayer).map(([playerId, trees]) => [
                    playerId,
                    Object.fromEntries(Object.entries(trees).map(([treeId, nodeIds]) => [treeId, [...nodeIds]])),
                ]),
            ),
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
        if (Array.isArray(data.firedEventIndices)) {
            engine.firedEventIndices = new Set(data.firedEventIndices);
        }
        if (Array.isArray(data.victoryCheckFirstEmitDone)) {
            engine.victoryCheckFirstEmitDone = new Set(data.victoryCheckFirstEmitDone);
        }
        if (data.continuousSpawnLastSpawnedAt && typeof data.continuousSpawnLastSpawnedAt === 'object') {
            engine.continuousSpawnLastSpawnedAt = { ...data.continuousSpawnLastSpawnedAt } as Record<number, number>;
        }
        if (data.playerResearchTreesByPlayer && typeof data.playerResearchTreesByPlayer === 'object') {
            engine.setPlayerResearchTreesByPlayer(data.playerResearchTreesByPlayer);
        }
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

        // Restore special tiles (Campfire, Crystal, etc.)
        for (const tileData of data.specialTiles ?? []) {
            const def = getSpecialTileDef(tileData.defId);
            if (def) {
                engine.specialTiles.push(specialTileFromJSON(tileData as unknown as Record<string, unknown>, def));
            }
        }

        // Restore cards (ensure durability default; migrate legacy exile → deck; normalize cardDefId to real id)
        engine.cards = Object.fromEntries(
            Object.entries(data.cards).map(([pid, cards]) => [
                pid,
                cards.map((c) => {
                    const raw = c as SerializedCardInstance & { location?: string; exileRounds?: number };
                    const { exileRounds: _, ...rest } = raw;
                    const rawLoc: string = raw.location ?? 'deck';
                    const loc = rawLoc === 'exile' ? 'deck' : rawLoc;
                    const cardDefId = asCardDefId(raw.abilityId);
                    const def = getCardDef(cardDefId);
                    return {
                        ...rest,
                        cardDefId,
                        location: loc,
                        instanceId: raw.instanceId ?? generateCardInstanceId(),
                        durability: raw.durability ?? def?.durability ?? 1,
                    } as CardInstance;
                }),
            ]),
        );

        // Advance the global game-object ID counter so any new objects (e.g. from later spawn waves) get unique IDs
        advanceGameObjectIdCounterFromSnapshot(data);

        // Re-register core event listeners so restored games behave like new ones.
        engine.registerCoreEventListeners();

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

/** Parse numeric suffix from game object IDs (e.g. "unit_7" -> 7). Used to advance the global ID counter after load. */
function parseGameObjectIdNumber(id: string): number | null {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : null;
}

/** Ensure the global game object ID counter is above any ID in the snapshot to avoid duplicate IDs after load. */
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
