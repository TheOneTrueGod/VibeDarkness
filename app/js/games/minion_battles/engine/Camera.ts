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
    /** Smooth follow lerp factor (0..1, higher = faster). Chosen so the camera catches up within ~0.3–0.5 s. */
    lerpSpeed: number = 0.005;
    /** When the unit is within this many pixels of screen center after lerp, snap to centered for a clean stop. */
    private readonly centerSnapThresholdPx: number = 2;

    constructor(viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.x = worldWidth / 2;
        this.y = worldHeight / 2;
    }

    /**
     * When the focused unit leaves the ideal area (center 1/4 of the screen), smoothly
     * animates the camera until that unit is centered again. If the unit is inside the
     * dead zone, the camera does not pan.
     */
    centerOn(targetX: number, targetY: number): void {
        const screen = this.worldToScreen(targetX, targetY);
        const deadZoneLeft = this.viewportWidth * 0.25;
        const deadZoneRight = this.viewportWidth * 0.75;
        const deadZoneTop = this.viewportHeight * 0.25;
        const deadZoneBottom = this.viewportHeight * 0.75;
        const outsideDeadZone =
            screen.x < deadZoneLeft ||
            screen.x > deadZoneRight ||
            screen.y < deadZoneTop ||
            screen.y > deadZoneBottom;
        if (outsideDeadZone) {
            this.x += (targetX - this.x) * this.lerpSpeed;
            this.y += (targetY - this.y) * this.lerpSpeed;
            this.clamp();
            // When we're close enough to centered, snap so the unit is exactly centered and the animation feels complete
            const screenAfter = this.worldToScreen(targetX, targetY);
            const centerX = this.viewportWidth / 2;
            const centerY = this.viewportHeight / 2;
            const dx = Math.abs(screenAfter.x - centerX);
            const dy = Math.abs(screenAfter.y - centerY);
            if (dx <= this.centerSnapThresholdPx && dy <= this.centerSnapThresholdPx) {
                this.x = targetX;
                this.y = targetY;
                this.clamp();
            }
        }
    }

    /** Immediately snap the camera to a world position. */
    snapTo(targetX: number, targetY: number): void {
        this.x = targetX;
        this.y = targetY;
        this.clamp();
    }

    /**
     * Clamp camera so it doesn't show outside the world bounds.
     * When the viewport is smaller than the world, camera stays so no world outside [0, worldW/H] is visible.
     * When the viewport is larger than the world, we still follow the player and only clamp so the camera
     * center stays within [0, worldW/H]; empty space may show on the sides so the character stays in view.
     */
    private clamp(): void {
        const halfW = this.viewportWidth / 2;
        const halfH = this.viewportHeight / 2;
        if (this.viewportWidth >= this.worldWidth) {
            this.x = Math.max(0, Math.min(this.worldWidth, this.x));
        } else {
            this.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.x));
        }
        if (this.viewportHeight >= this.worldHeight) {
            this.y = Math.max(0, Math.min(this.worldHeight, this.y));
        } else {
            this.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.y));
        }
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
