/**
 * Resting dropped weapons and sentries. Flight is an effect; this draws what is left on the ground.
 */
import { Graphics } from 'pixi.js';
import type { Container, Sprite } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import { DROPPED_WEAPON_ARC_DURATION } from '../../fieldObjects/landing';
import { weaponTipOffset } from '../../conjuredWeapons/registry';
import { paintTurret, turretHullColor } from '../../effect_defs/turretDeployDraw';
import { rangedAttackPull } from '../../animation/actorAnimation';
import { turretOpenAmount } from '../../effect_defs/turretDeployPose';
import {
    DROPPED_SWORD_SCALE,
    createWeaponCardSprite,
    sizeWeaponCardSprite,
    syncWeaponCardTexture,
    weaponCardArtUrl,
} from '../../fieldObjects/weaponArt';
import { ConcealedArrivalClock } from '../../fieldObjects/concealedArrival';
import { getSentryDef } from '../../fieldObjects/sentryDefs';

const Z_FIELD_OBJECTS = 6;

export class FieldObjectRenderer {
    private visuals = new Map<string, Container>();
    /** Hides a dropped sword until its flight has elapsed on game time or wall time. */
    private arrivals = new ConcealedArrivalClock();

    constructor(private readonly gameContainer: Container) {}

    render(engine: GameEngine): void {
        const manager = engine.state.fieldObjects;
        const live = new Set<string>();
        const resting = new Set<string>();
        for (const weapon of manager.droppedWeapons) {
            if (!weaponCardArtUrl(weapon.kind)) continue;
            live.add(weapon.id);
            if (!this.arrivals.hasArrived(weapon.id, weapon.spawnedAtGameTime, engine.gameTime, DROPPED_WEAPON_ARC_DURATION)) continue;
            resting.add(weapon.id);
            const sprite = this.weaponSprite(weapon.id, weapon.kind);
            syncWeaponCardTexture(sprite, weapon.kind);
            sprite.position.set(weapon.x, weapon.y);
            sprite.rotation = weapon.facing + weaponTipOffset(weapon.kind);
            sizeWeaponCardSprite(sprite, DROPPED_SWORD_SCALE);
            sprite.alpha = 1;
        }
        for (const sentry of manager.sentries) {
            live.add(sentry.id);
            const g = this.sentryGraphic(sentry.id);
            g.visible = true;
            g.position.set(sentry.x, sentry.y);
            g.rotation = sentry.facing;
            paintTurret(
                g,
                turretOpenAmount(sentry.spawnedAtGameTime, engine.gameTime),
                sentry.shotsRemaining,
                getSentryDef(sentry.defId)?.shotCount ?? sentry.shotsRemaining,
                turretHullColor(engine.getUnit(sentry.ownerUnitId)),
                rangedAttackPull(sentry.animation, engine.gameTime),
            );
        }
        for (const [id, visual] of this.visuals) {
            const sentryStillThere = manager.sentries.some((sentry) => sentry.id === id);
            if (resting.has(id) || sentryStillThere) continue;
            visual.destroy();
            this.visuals.delete(id);
        }
        this.arrivals.forgetExcept(live);
    }

    private weaponSprite(id: string, kind: string): Sprite {
        let visual = this.visuals.get(id);
        if (!visual) {
            const sprite = createWeaponCardSprite(kind);
            sprite.zIndex = Z_FIELD_OBJECTS;
            this.visuals.set(id, sprite);
            this.gameContainer.addChild(sprite);
            visual = sprite;
        }
        return visual as Sprite;
    }

    private sentryGraphic(id: string): Graphics {
        let visual = this.visuals.get(id);
        if (!visual) {
            const g = new Graphics();
            g.zIndex = Z_FIELD_OBJECTS;
            this.visuals.set(id, g);
            this.gameContainer.addChild(g);
            visual = g;
        }
        return visual as Graphics;
    }
}
