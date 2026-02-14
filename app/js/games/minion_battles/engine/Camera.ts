/**
 * Camera - Viewport control for the battle canvas.
 *
 * The game world may be larger than the visible canvas. The camera
 * tracks an (x, y) offset representing the center of the viewport
 * and provides coordinate conversion methods.
 */

export class Camera {
    /** World-space X of the camera center. */
    x: number = 0;
    /** World-space Y of the camera center. */
    y: number = 0;
    /** Viewport width in pixels. */
    viewportWidth: number;
    /** Viewport height in pixels. */
    viewportHeight: number;
    /** World bounds. */
    worldWidth: number;
    worldHeight: number;
    /** Smooth follow lerp factor (0..1, higher = faster). */
    lerpSpeed: number = 0.08;

    constructor(viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.x = worldWidth / 2;
        this.y = worldHeight / 2;
    }

    /** Smoothly move the camera toward the target world position. */
    centerOn(targetX: number, targetY: number): void {
        this.x += (targetX - this.x) * this.lerpSpeed;
        this.y += (targetY - this.y) * this.lerpSpeed;
        this.clamp();
    }

    /** Immediately snap the camera to a world position. */
    snapTo(targetX: number, targetY: number): void {
        this.x = targetX;
        this.y = targetY;
        this.clamp();
    }

    /** Clamp camera so it doesn't show outside the world bounds. */
    private clamp(): void {
        const halfW = this.viewportWidth / 2;
        const halfH = this.viewportHeight / 2;
        this.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.x));
        this.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.y));
    }

    /** Convert a world-space coordinate to screen-space. */
    worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
        return {
            x: worldX - this.x + this.viewportWidth / 2,
            y: worldY - this.y + this.viewportHeight / 2,
        };
    }

    /** Convert a screen-space coordinate to world-space. */
    screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        return {
            x: screenX + this.x - this.viewportWidth / 2,
            y: screenY + this.y - this.viewportHeight / 2,
        };
    }

    /** Update viewport size (e.g. on window resize). */
    setViewportSize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.clamp();
    }
}
