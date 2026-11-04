/**
 * Dropped weapons and placed deployables. Neither is a unit.
 * Dropped weapons have no expiry and no light. Deployables trigger their action on a timer
 * (see `deployableDefs.ts`), then leave. Neither collides with anything or can be interacted with.
 */
import { generateGameObjectId } from '../GameObject';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { Unit } from '../units/Unit';
import type { EventBus } from '../EventBus';
import type { Deployable } from '../deployables/Deployable';
import type { DeployableProvider } from '../deployables/DeployableRegistry';
import type { TeamId } from '../teams';
import { areAllies, areEnemies } from '../teams';
import { Projectile } from '../projectiles/Projectile';
import { FingerprintEvent } from '../Fingerprint';
import { circleOverlapsCone } from '../../abilities/coneGeometry';
import { WEAPON_DISCARD_ARC_EFFECT_TYPE } from '../effect_defs/weaponEffects';
import { weaponTipOffset } from '../conjuredWeapons/registry';
import { Effect } from '../effects/Effect';
import { getAbility } from '../../abilities/AbilityRegistry';
import { applyHeal, DEFAULT_HEAL_PENALTY_PCT } from '../units/unitHeal';
import { playAbilityAnimation, readActorAnimation, type ActorAnimationState } from '../animation/actorAnimation';
import {
    DROPPED_WEAPON_ARC_DURATION,
    DROPPED_WEAPON_ARC_LIFT,
    DROPPED_WEAPON_ROTATION_STEPS,
    resolveDroppedWeaponLanding,
} from './landing';
import {
    DEPLOYABLE_DELIVERY_PROJECTILE_TYPE,
    getDeployableDef,
    type DeployableDef,
    type DeployableHealPulseAction,
    type DeployableShootAction,
} from './deployableDefs';

export interface DroppedWeapon {
    id: string;
    x: number;
    y: number;
    kind: string;
    ownerUnitId: string;
    teamId: TeamId;
    abilityId: string;
    /** Game time the token was created. The resting sprite waits out the flight. */
    spawnedAtGameTime: number;
    /** Resting blade direction, chosen at random when the token is created. */
    facing: number;
}

/** A deployable on the field. Def-based numbers live on its {@link DeployableDef}. */
export interface PlacedDeployable {
    id: string;
    defId: string;
    x: number;
    y: number;
    facing: number;
    teamId: TeamId;
    ownerUnitId: string;
    abilityId: string;
    chargesRemaining: number;
    nextTriggerAt: number;
    expiresAt: number;
    spawnedAtGameTime: number;
    /** Clip the deployable's ability asked it to play. Null until the first trigger. */
    animation: ActorAnimationState | null;
}

export interface SerializedFieldObjects {
    droppedWeapons: DroppedWeapon[];
    placedDeployables: PlacedDeployable[];
}

/** The slice of the engine field objects need. Both GameEngine and ability casts satisfy it. */
export interface FieldObjectHost {
    gameTime: number;
    readonly units: readonly Unit[];
    terrainManager?: TerrainManager | null;
    /** Heal feedback (green numbers). Optional so light test hosts can omit it. */
    eventBus?: EventBus;
    addEffect(effect: Effect): void;
    addProjectile(projectile: Projectile): void;
    /** Battle RNG. Rest angles come from here so every client agrees. */
    generateRandomInteger(min: number, max: number): number;
    mixRuntimeFingerprint?(tag: number, ...payload: number[]): void;
}

const DROPPED_WEAPON_FINGERPRINT = 1;
const DEPLOYABLE_FINGERPRINT = 2;

/** `expireData.kind` for the projectile that becomes a deployable on arrival. */
export const DEPLOYABLE_DELIVERY_KIND = 'deployable';
/** The same, as written by checkpoints from before deployables were generalized. */
const LEGACY_SENTRY_DELIVERY_KIND = 'sentry';

/** Largest radius the `Pulse` effect reaches at scale 1 (its outermost wave). */
const PULSE_EFFECT_MAX_RADIUS = 120;

const warnedMissingDeployableDefs = new Set<string>();

/** Def for a live or restored deployable. Logs once per unknown id; callers drop the deployable. */
function deployableDefOrWarn(defId: string): DeployableDef | undefined {
    const def = getDeployableDef(defId);
    if (!def && !warnedMissingDeployableDefs.has(defId)) {
        warnedMissingDeployableDefs.add(defId);
        console.warn(`[FieldObjectManager] Unknown deployable def "${defId}"; removing its deployables.`);
    }
    return def;
}

/** Def for a new deployable. Spawning an unregistered def is a content bug, so it throws. */
function requireDeployableDef(defId: string): DeployableDef {
    const def = getDeployableDef(defId);
    if (!def) throw new Error(`Unknown deployable def "${defId}". Register it with registerDeployableDef first.`);
    return def;
}

export class FieldObjectManager implements DeployableProvider {
    droppedWeapons: DroppedWeapon[] = [];
    placedDeployables: PlacedDeployable[] = [];

    spawnDroppedWeapon(
        engine: FieldObjectHost,
        opts: {
            originX: number;
            originY: number;
            /** Travel direction of the toss. Omitted tosses use the default discard angle. */
            directionRad?: number;
            kind: string;
            ownerUnitId: string;
            teamId: TeamId;
            abilityId: string;
        },
    ): DroppedWeapon {
        const landing = resolveDroppedWeaponLanding(
            engine,
            opts.originX,
            opts.originY,
            opts.directionRad,
        );
        const facing = randomRestFacing(engine);
        const weapon: DroppedWeapon = {
            id: generateGameObjectId('drop'),
            x: landing.x,
            y: landing.y,
            kind: opts.kind,
            ownerUnitId: opts.ownerUnitId,
            teamId: opts.teamId,
            abilityId: opts.abilityId,
            spawnedAtGameTime: engine.gameTime,
            facing,
        };
        this.droppedWeapons.push(weapon);
        mixSpawn(engine, DROPPED_WEAPON_FINGERPRINT, weapon.x, weapon.y, facing);
        engine.addEffect(new Effect({
            x: opts.originX,
            y: opts.originY,
            duration: DROPPED_WEAPON_ARC_DURATION,
            effectType: WEAPON_DISCARD_ARC_EFFECT_TYPE,
            // The swing ends on the order pause. Wall time keeps the toss visible while the sim is halted.
            timeDomain: 'wall',
            pauseBehaviour: 'continue',
            effectData: {
                landX: landing.x,
                landY: landing.y,
                lift: DROPPED_WEAPON_ARC_LIFT,
                restRotation: facing + weaponTipOffset(opts.kind),
                weaponKind: opts.kind,
            },
        }));
        return weapon;
    }

    spawnDeployable(
        engine: FieldObjectHost,
        opts: {
            defId: string;
            x: number;
            y: number;
            facing: number;
            teamId: TeamId;
            ownerUnitId: string;
            abilityId: string;
        },
    ): PlacedDeployable {
        const def = requireDeployableDef(opts.defId);
        const deployable: PlacedDeployable = {
            id: generateGameObjectId('deployable'),
            defId: def.id,
            x: opts.x,
            y: opts.y,
            facing: opts.facing,
            teamId: opts.teamId,
            ownerUnitId: opts.ownerUnitId,
            abilityId: opts.abilityId,
            chargesRemaining: def.charges,
            nextTriggerAt: engine.gameTime + def.firstTriggerDelay,
            expiresAt: engine.gameTime + def.lifetime,
            spawnedAtGameTime: engine.gameTime,
            animation: null,
        };
        this.placedDeployables.push(deployable);
        mixSpawn(engine, DEPLOYABLE_FINGERPRINT, deployable.x, deployable.y);
        return deployable;
    }

    /**
     * Fly a folded deployable from the caster to the tile. The deployable does not exist until
     * the delivery projectile expires and its ability calls {@link spawnDeliveredDeployable}.
     * A zero-length toss, or a def with no delivery, spawns the deployable immediately.
     */
    launchDeployableDelivery(
        engine: FieldObjectHost,
        opts: {
            defId: string;
            fromX: number;
            fromY: number;
            toX: number;
            toY: number;
            facing: number;
            teamId: TeamId;
            ownerUnitId: string;
            abilityId: string;
        },
    ): void {
        const dx = opts.toX - opts.fromX;
        const dy = opts.toY - opts.fromY;
        const dist = Math.hypot(dx, dy);
        const def = requireDeployableDef(opts.defId);
        const delivery = def.delivery;
        if (dist === 0 || !delivery || !(delivery.speed > 0)) {
            this.spawnDeployable(engine, {
                defId: def.id,
                x: opts.toX,
                y: opts.toY,
                facing: opts.facing,
                teamId: opts.teamId,
                ownerUnitId: opts.ownerUnitId,
                abilityId: opts.abilityId,
            });
            return;
        }
        const projectile = new Projectile({
            x: opts.fromX,
            y: opts.fromY,
            velocityX: (dx / dist) * delivery.speed,
            velocityY: (dy / dist) * delivery.speed,
            damage: 0,
            sourceTeamId: opts.teamId,
            sourceUnitId: opts.ownerUnitId,
            sourceAbilityId: opts.abilityId,
            maxDistance: dist,
            projectileType: DEPLOYABLE_DELIVERY_PROJECTILE_TYPE,
            rotationSpeed: delivery.spinDegreesPerSecond ?? 0,
            passThroughEnemies: true,
            expireData: {
                kind: DEPLOYABLE_DELIVERY_KIND,
                defId: def.id,
                x: opts.toX,
                y: opts.toY,
                facing: opts.facing,
            },
        });
        if (delivery.bodyRadius != null) projectile.radius = delivery.bodyRadius;
        engine.addProjectile(projectile);
    }

    tick(engine: FieldObjectHost): void {
        const remove: string[] = [];
        for (const deployable of this.placedDeployables) {
            const def = deployableDefOrWarn(deployable.defId);
            if (!def || engine.gameTime >= deployable.expiresAt) {
                remove.push(deployable.id);
                continue;
            }
            while (deployable.chargesRemaining > 0 && engine.gameTime >= deployable.nextTriggerAt) {
                this.trigger(engine, deployable, def);
                deployable.chargesRemaining -= 1;
                deployable.nextTriggerAt += def.triggerInterval;
            }
            if (deployable.chargesRemaining <= 0) remove.push(deployable.id);
        }
        if (remove.length > 0) {
            const gone = new Set(remove);
            this.placedDeployables = this.placedDeployables.filter((deployable) => !gone.has(deployable.id));
        }
    }

    private trigger(engine: FieldObjectHost, deployable: PlacedDeployable, def: DeployableDef): void {
        const action = def.action;
        if (action.type === 'shoot') shoot(engine, deployable, action);
        else healPulse(engine, deployable, action);
        playAbilityAnimation(deployable, getAbility(deployable.abilityId), engine.gameTime);
    }

    listDeployables(): Deployable[] {
        const drops: Deployable[] = this.droppedWeapons.map((weapon) => ({
            id: weapon.id,
            kind: 'droppedWeapon',
            x: weapon.x,
            y: weapon.y,
            active: true,
            ownerUnitId: weapon.ownerUnitId,
            ownerAbilityId: weapon.abilityId,
            teamId: weapon.teamId,
            tags: ['droppedWeapon', 'conductor'],
            subtype: weapon.kind,
        }));
        const placed: Deployable[] = this.placedDeployables.map((deployable) => ({
            id: deployable.id,
            kind: 'placedDeployable',
            x: deployable.x,
            y: deployable.y,
            active: true,
            ownerUnitId: deployable.ownerUnitId,
            ownerAbilityId: deployable.abilityId,
            teamId: deployable.teamId,
            tags: ['placedDeployable', 'conductor'],
            subtype: deployable.defId,
        }));
        return [...drops, ...placed];
    }

    consume(id: string): boolean {
        const dropCount = this.droppedWeapons.length;
        this.droppedWeapons = this.droppedWeapons.filter((weapon) => weapon.id !== id);
        if (this.droppedWeapons.length !== dropCount) return true;
        const placedCount = this.placedDeployables.length;
        this.placedDeployables = this.placedDeployables.filter((deployable) => deployable.id !== id);
        if (this.placedDeployables.length !== placedCount) return true;
        return false;
    }

    toJSON(): SerializedFieldObjects {
        return {
            droppedWeapons: this.droppedWeapons.map((weapon) => ({ ...weapon })),
            placedDeployables: this.placedDeployables.map((deployable) => ({ ...deployable })),
        };
    }

    restoreFromJSON(data: Partial<SerializedFieldObjects> | undefined): void {
        this.droppedWeapons = (data?.droppedWeapons ?? []).map((weapon) => ({ ...weapon }));
        this.placedDeployables = (data?.placedDeployables ?? [])
            .filter((deployable) => deployableDefOrWarn(deployable.defId) != null)
            .map((deployable) => ({
                ...deployable,
                animation: readActorAnimation(deployable.animation),
            }));
    }
}

export interface DeployableDeliveryLanding {
    /** Def to spawn. Null on a legacy in-flight projectile, which did not record it. */
    defId: string | null;
    x: number;
    y: number;
    facing: number;
}

/** Landing written onto a delivery projectile. Null for shots and every other projectile. */
export function readDeployableDelivery(data: Record<string, unknown> | undefined): DeployableDeliveryLanding | null {
    if (!data) return null;
    if (data.kind !== DEPLOYABLE_DELIVERY_KIND && data.kind !== LEGACY_SENTRY_DELIVERY_KIND) return null;
    const { x, y, facing, defId } = data;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof facing !== 'number') return null;
    return { defId: typeof defId === 'string' ? defId : null, x, y, facing };
}

/**
 * Spawn the deployable a delivery projectile carried. Call from the ability's `onProjectileExpired`.
 * `fallbackDefId` covers a legacy in-flight projectile that did not record its def.
 */
export function spawnDeliveredDeployable(
    engine: unknown,
    caster: Unit,
    projectile: Projectile,
    abilityId: string,
    fallbackDefId: string,
): void {
    const landing = readDeployableDelivery(projectile.expireData);
    if (!landing) return;
    const host = engine as FieldObjectHost & { state?: { fieldObjects?: FieldObjectManager } };
    host.state?.fieldObjects?.spawnDeployable(host, {
        defId: landing.defId ?? fallbackDefId,
        x: landing.x,
        y: landing.y,
        facing: landing.facing,
        teamId: caster.teamId,
        ownerUnitId: caster.id,
        abilityId,
    });
}

function mixSpawn(engine: FieldObjectHost, kind: number, x: number, y: number, facing?: number): void {
    const payload = [kind, Math.floor(x), Math.floor(y)];
    if (facing != null) payload.push(Math.floor(facing * DROPPED_WEAPON_ROTATION_STEPS));
    engine.mixRuntimeFingerprint?.(FingerprintEvent.SPAWN, ...payload);
}

function randomRestFacing(engine: FieldObjectHost): number {
    const step = engine.generateRandomInteger(0, DROPPED_WEAPON_ROTATION_STEPS - 1);
    return (step / DROPPED_WEAPON_ROTATION_STEPS) * Math.PI * 2;
}

function shoot(engine: FieldObjectHost, deployable: PlacedDeployable, action: DeployableShootAction): void {
    const aim = aimPointForShot(engine, deployable, action);
    const dx = aim.x - deployable.x;
    const dy = aim.y - deployable.y;
    const len = Math.hypot(dx, dy) || 1;
    const sprite = action.sprite;
    const projectile = new Projectile({
        x: deployable.x,
        y: deployable.y,
        velocityX: (dx / len) * action.speed,
        velocityY: (dy / len) * action.speed,
        damage: action.damage,
        sourceTeamId: deployable.teamId,
        sourceUnitId: deployable.ownerUnitId,
        sourceAbilityId: deployable.abilityId,
        maxDistance: action.range,
        ...(sprite ? { projectileType: 'sprite_projectile', spriteConfig: sprite } : {}),
    });
    projectile.radius = action.hitRadius;
    engine.addProjectile(projectile);
}

/** Heal living allies whose centre is within the radius, in unit order (deterministic), then show the ring. */
function healPulse(engine: FieldObjectHost, deployable: PlacedDeployable, action: DeployableHealPulseAction): void {
    const radiusSq = action.radius * action.radius;
    const feedback = engine.eventBus ? { eventBus: engine.eventBus, sourceUnitId: deployable.ownerUnitId } : undefined;
    for (const unit of engine.units) {
        if (!unit.isAlive()) continue;
        if (!areAllies(deployable.teamId, unit.teamId)) continue;
        const dx = unit.x - deployable.x;
        const dy = unit.y - deployable.y;
        if (dx * dx + dy * dy > radiusSq) continue;
        applyHeal(unit, action.heal, DEFAULT_HEAL_PENALTY_PCT, feedback);
    }
    engine.addEffect(new Effect({
        x: deployable.x,
        y: deployable.y,
        duration: action.pulseDuration,
        effectType: 'Pulse',
        effectData: { colors: [...action.pulseColors], scale: action.radius / PULSE_EFFECT_MAX_RADIUS },
    }));
}

/** A target this close shares the deployable's point, so the shot keeps its facing instead. */
const SHOT_AIM_MIN_DISTANCE = 1;

function aimPointForShot(
    engine: FieldObjectHost,
    deployable: PlacedDeployable,
    action: DeployableShootAction,
): { x: number; y: number } {
    const dirX = Math.cos(deployable.facing);
    const dirY = Math.sin(deployable.facing);
    let best: { id: string; x: number; y: number; dist: number } | null = null;
    for (const unit of engine.units) {
        if (!unit.isAlive()) continue;
        if (!areEnemies(deployable.teamId, unit.teamId)) continue;
        if (!circleOverlapsCone(
            deployable.x,
            deployable.y,
            unit.x,
            unit.y,
            unit.radius,
            dirX,
            dirY,
            0,
            action.range,
            action.coneHalfAngleRad,
        )) continue;
        const dist = Math.hypot(unit.x - deployable.x, unit.y - deployable.y);
        if (!best || dist < best.dist || (dist === best.dist && unit.id < best.id)) {
            best = { id: unit.id, x: unit.x, y: unit.y, dist };
        }
    }
    if (best && best.dist > SHOT_AIM_MIN_DISTANCE) return { x: best.x, y: best.y };
    return {
        x: deployable.x + dirX * action.range,
        y: deployable.y + dirY * action.range,
    };
}
