/**
 * Dropped weapons and sentries. Neither is a unit.
 * Dropped weapons have no expiry and no light. Sentries fire on a timer, then leave.
 */
import { generateGameObjectId } from '../GameObject';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { Unit } from '../units/Unit';
import type { Deployable } from '../deployables/Deployable';
import type { DeployableProvider } from '../deployables/DeployableRegistry';
import type { TeamId } from '../teams';
import { areEnemies } from '../teams';
import { Projectile } from '../projectiles/Projectile';
import type { SpriteProjectileConfig } from '../projectiles/projectile_defs/types';
import { FingerprintEvent } from '../Fingerprint';
import { pointInCone } from '../../abilities/coneGeometry';
import { THROW_PROJECTILE_SPEED } from '../../card_defs/throwNumbers';
import {
    ARMORY_TURRET_DEF_ID,
    DROPPED_WEAPON_ARC_DURATION,
    DROPPED_WEAPON_ARC_LIFT,
    DROPPED_WEAPON_ROTATION_STEPS,
    SWORD_CARD_TIP_OFFSET,
    TURRET_CONE_HALF_ANGLE_RAD,
    TURRET_FIRST_SHOT_DELAY,
    TURRET_LIFETIME,
    TURRET_SHOT_DAMAGE,
    TURRET_SHOT_COUNT,
    TURRET_SHOT_INTERVAL,
    TURRET_SHOT_RANGE,
    WEAPON_DISCARD_ARC_EFFECT_TYPE,
} from '../../card_defs/10_armory_core/armoryConstants';
import { Effect } from '../effects/Effect';
import { resolveDroppedWeaponLanding } from './landing';

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

export interface Sentry {
    id: string;
    defId: string;
    x: number;
    y: number;
    facing: number;
    teamId: TeamId;
    ownerUnitId: string;
    abilityId: string;
    shotsRemaining: number;
    nextShotAt: number;
    expiresAt: number;
    spawnedAtGameTime: number;
}

export interface SerializedFieldObjects {
    droppedWeapons: DroppedWeapon[];
    sentries: Sentry[];
}

/** The slice of the engine field objects need. Both GameEngine and ability casts satisfy it. */
export interface FieldObjectHost {
    gameTime: number;
    readonly units: readonly Unit[];
    terrainManager?: TerrainManager | null;
    addEffect(effect: Effect): void;
    addProjectile(projectile: Projectile): void;
    /** Battle RNG. Rest angles come from here so every client agrees. */
    generateRandomInteger(min: number, max: number): number;
    mixRuntimeFingerprint?(tag: number, ...payload: number[]): void;
}

const DROPPED_WEAPON_FINGERPRINT = 1;
const SENTRY_FINGERPRINT = 2;

const SENTRY_SPRITES = new Map<string, SpriteProjectileConfig>();

/** Visual for a sentry def. Reattached after a checkpoint because sprites are not serialized. */
export function registerSentrySprite(defId: string, spriteConfig: SpriteProjectileConfig): void {
    SENTRY_SPRITES.set(defId, spriteConfig);
}

export class FieldObjectManager implements DeployableProvider {
    droppedWeapons: DroppedWeapon[] = [];
    sentries: Sentry[] = [];

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
                restRotation: facing + SWORD_CARD_TIP_OFFSET,
            },
        }));
        return weapon;
    }

    spawnSentry(
        engine: FieldObjectHost,
        opts: {
            x: number;
            y: number;
            facing: number;
            teamId: TeamId;
            ownerUnitId: string;
            abilityId: string;
        },
    ): Sentry {
        const sentry: Sentry = {
            id: generateGameObjectId('sentry'),
            defId: ARMORY_TURRET_DEF_ID,
            x: opts.x,
            y: opts.y,
            facing: opts.facing,
            teamId: opts.teamId,
            ownerUnitId: opts.ownerUnitId,
            abilityId: opts.abilityId,
            shotsRemaining: TURRET_SHOT_COUNT,
            nextShotAt: engine.gameTime + TURRET_FIRST_SHOT_DELAY,
            expiresAt: engine.gameTime + TURRET_LIFETIME,
            spawnedAtGameTime: engine.gameTime,
        };
        this.sentries.push(sentry);
        mixSpawn(engine, SENTRY_FINGERPRINT, sentry.x, sentry.y);
        return sentry;
    }

    tick(engine: FieldObjectHost): void {
        const remove: string[] = [];
        for (const sentry of this.sentries) {
            if (engine.gameTime >= sentry.expiresAt) {
                remove.push(sentry.id);
                continue;
            }
            while (sentry.shotsRemaining > 0 && engine.gameTime >= sentry.nextShotAt) {
                this.fire(engine, sentry);
                sentry.shotsRemaining -= 1;
                sentry.nextShotAt += TURRET_SHOT_INTERVAL;
            }
            if (sentry.shotsRemaining <= 0) remove.push(sentry.id);
        }
        if (remove.length > 0) {
            const gone = new Set(remove);
            this.sentries = this.sentries.filter((sentry) => !gone.has(sentry.id));
        }
    }

    private fire(engine: FieldObjectHost, sentry: Sentry): void {
        const aim = aimPointForSentry(engine, sentry);
        const dx = aim.x - sentry.x;
        const dy = aim.y - sentry.y;
        const len = Math.hypot(dx, dy) || 1;
        const sprite = SENTRY_SPRITES.get(sentry.defId);
        engine.addProjectile(new Projectile({
            x: sentry.x,
            y: sentry.y,
            velocityX: (dx / len) * THROW_PROJECTILE_SPEED,
            velocityY: (dy / len) * THROW_PROJECTILE_SPEED,
            damage: TURRET_SHOT_DAMAGE,
            sourceTeamId: sentry.teamId,
            sourceUnitId: sentry.ownerUnitId,
            sourceAbilityId: sentry.abilityId,
            maxDistance: TURRET_SHOT_RANGE,
            ...(sprite ? { spriteConfig: sprite } : {}),
        }));
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
            tags: ['droppedWeapon'],
        }));
        const sentries: Deployable[] = this.sentries.map((sentry) => ({
            id: sentry.id,
            kind: 'sentry',
            x: sentry.x,
            y: sentry.y,
            active: true,
            ownerUnitId: sentry.ownerUnitId,
            ownerAbilityId: sentry.abilityId,
            teamId: sentry.teamId,
            tags: ['sentry'],
        }));
        return [...drops, ...sentries];
    }

    consume(id: string): boolean {
        const dropCount = this.droppedWeapons.length;
        this.droppedWeapons = this.droppedWeapons.filter((weapon) => weapon.id !== id);
        if (this.droppedWeapons.length !== dropCount) return true;
        const sentryCount = this.sentries.length;
        this.sentries = this.sentries.filter((sentry) => sentry.id !== id);
        if (this.sentries.length !== sentryCount) return true;
        return false;
    }

    toJSON(): SerializedFieldObjects {
        return {
            droppedWeapons: this.droppedWeapons.map((weapon) => ({ ...weapon })),
            sentries: this.sentries.map((sentry) => ({ ...sentry })),
        };
    }

    restoreFromJSON(data: Partial<SerializedFieldObjects> | undefined): void {
        this.droppedWeapons = (data?.droppedWeapons ?? []).map((weapon) => ({ ...weapon }));
        this.sentries = (data?.sentries ?? []).map((sentry) => ({ ...sentry }));
    }
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

function aimPointForSentry(engine: FieldObjectHost, sentry: Sentry): { x: number; y: number } {
    const dirX = Math.cos(sentry.facing);
    const dirY = Math.sin(sentry.facing);
    let best: { id: string; x: number; y: number; dist: number } | null = null;
    for (const unit of engine.units) {
        if (!unit.isAlive()) continue;
        if (!areEnemies(sentry.teamId, unit.teamId)) continue;
        if (!pointInCone(
            sentry.x,
            sentry.y,
            unit.x,
            unit.y,
            dirX,
            dirY,
            0,
            TURRET_SHOT_RANGE,
            TURRET_CONE_HALF_ANGLE_RAD,
        )) continue;
        const dist = Math.hypot(unit.x - sentry.x, unit.y - sentry.y);
        if (!best || dist < best.dist || (dist === best.dist && unit.id < best.id)) {
            best = { id: unit.id, x: unit.x, y: unit.y, dist };
        }
    }
    if (best) return { x: best.x, y: best.y };
    return {
        x: sentry.x + dirX * TURRET_SHOT_RANGE,
        y: sentry.y + dirY * TURRET_SHOT_RANGE,
    };
}
