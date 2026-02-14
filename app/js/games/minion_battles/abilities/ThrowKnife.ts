/**
 * ThrowKnife - A basic ranged ability.
 *
 * Targets a pixel. After 0.3s, creates a projectile that travels
 * 200px in a straight line toward the target. Deals 5 damage on hit.
 * Cooldown: 2s. No resource cost. Recharge: 1 round.
 */

import type { AbilityStatic } from './Ability';
import type { TargetDef } from './targeting';
import type { ResolvedTarget } from '../engine/types';
import type { Unit } from '../objects/Unit';
import { Projectile } from '../objects/Projectile';

// We'll reference the GameEngine type loosely to avoid circular deps.
// The engine is passed as `unknown` and cast at call site.
interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
    scheduleAction(delay: number, action: () => void): void;
    gameTime: number;
}

const THROW_KNIFE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="28" y="8" width="8" height="32" rx="2" fill="#c0c0c0"/>
  <polygon points="32,4 26,14 38,14" fill="#e0e0e0"/>
  <rect x="26" y="40" width="12" height="6" rx="1" fill="#8B4513"/>
  <rect x="30" y="46" width="4" height="12" rx="1" fill="#6b3a10"/>
</svg>`;

export const ThrowKnife: AbilityStatic = {
    id: 'throw_knife',
    name: 'Throw Knife',
    image: THROW_KNIFE_IMAGE,
    cooldownTime: 2,
    resourceCost: null,
    rechargeTurns: 1,
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],

    getDescription(_gameState?: unknown): string {
        return 'Throw a knife toward a target location. Deals 5 damage to the first enemy hit. Range: 200px.';
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[]): void {
        const eng = engine as GameEngineLike;
        const target = targets[0];
        if (!target || target.type !== 'pixel' || !target.position) return;

        const startX = caster.x;
        const startY = caster.y;
        const targetX = target.position.x;
        const targetY = target.position.y;

        // Schedule projectile creation after 0.3s delay
        eng.scheduleAction(0.3, () => {
            const dx = targetX - startX;
            const dy = targetY - startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return;

            const speed = 300; // pixels per second
            const velocityX = (dx / dist) * speed;
            const velocityY = (dy / dist) * speed;

            const projectile = new Projectile({
                x: startX,
                y: startY,
                velocityX,
                velocityY,
                damage: 5,
                sourceTeamId: caster.teamId,
                sourceUnitId: caster.id,
                maxDistance: 200,
            });

            eng.addProjectile(projectile);
        });
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        // Draw a dashed line from caster to mouse position
        ctx.save();
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);

        // Clamp to max range (200px)
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 200) {
            const ratio = 200 / dist;
            ctx.lineTo(caster.x + dx * ratio, caster.y + dy * ratio);
        } else {
            ctx.lineTo(mouseWorld.x, mouseWorld.y);
        }

        ctx.stroke();
        ctx.restore();

        // Draw a small crosshair at the clamped target
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
        ctx.lineWidth = 1;
        const endX = dist > 200 ? caster.x + (dx / dist) * 200 : mouseWorld.x;
        const endY = dist > 200 ? caster.y + (dy / dist) * 200 : mouseWorld.y;
        ctx.beginPath();
        ctx.arc(endX, endY, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(endX - 12, endY);
        ctx.lineTo(endX + 12, endY);
        ctx.moveTo(endX, endY - 12);
        ctx.lineTo(endX, endY + 12);
        ctx.stroke();
        ctx.restore();
    },
};
