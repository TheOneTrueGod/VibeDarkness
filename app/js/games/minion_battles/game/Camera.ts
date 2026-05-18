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

    /** Discrete zoom steps available. */
    static readonly ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.5, 2.0];
    /** Current zoom multiplier (always one of ZOOM_LEVELS). */
    zoom: number = 1.0;

    constructor(viewportWidth: number, viewportHeight: number, worldWidth: number, worldHeight: number) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.x = worldWidth / 2;
        this.y = worldHeight / 2;
    }

    /** Update the local focus target used for auto-follow. */
    setFocusTarget(targetX: number, targetY: number, _targetRadius: number = 0): void {
        this.clamp();
    }

    /**
     * When the focused unit leaves the ideal area (center 1/4 of the screen), smoothly
     * animates the camera until that unit is centered again. If the unit is inside the
     * dead zone, the camera does not pan.
     */
    centerOn(targetX: number, targetY: number, targetRadius: number = 0): void {
        this.setFocusTarget(targetX, targetY, targetRadius);
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
    snapTo(targetX: number, targetY: number, _targetRadius: number = 0): void {
        this.x = targetX;
        this.y = targetY;
        this.clamp();
    }

    /** Move the camera by a world-space delta and keep the focused unit visible. */
    panBy(deltaX: number, deltaY: number): void {
        this.x += deltaX;
        this.y += deltaY;
        this.clamp();
    }

    /** Step zoom in one level, keeping the pivot screen point fixed in world space. */
    zoomIn(pivotScreenX: number, pivotScreenY: number): void {
        const idx = Camera.ZOOM_LEVELS.indexOf(this.zoom);
        if (idx < Camera.ZOOM_LEVELS.length - 1) {
            this._applyZoom(Camera.ZOOM_LEVELS[idx + 1], pivotScreenX, pivotScreenY);
        }
    }

    /** Step zoom out one level, keeping the pivot screen point fixed in world space. */
    zoomOut(pivotScreenX: number, pivotScreenY: number): void {
        const idx = Camera.ZOOM_LEVELS.indexOf(this.zoom);
        if (idx > 0) {
            this._applyZoom(Camera.ZOOM_LEVELS[idx - 1], pivotScreenX, pivotScreenY);
        }
    }

    /**
     * Apply a new zoom level while keeping the given screen-space pivot point
     * fixed at the same world position before and after the zoom change.
     */
    private _applyZoom(newZoom: number, pivotScreenX: number, pivotScreenY: number): void {
        const pivotWorld = this.screenToWorld(pivotScreenX, pivotScreenY);
        this.zoom = newZoom;
        // Solve: (pivotWorld.x - camera.x) * newZoom + vw/2 = pivotScreenX
        this.x = pivotWorld.x - (pivotScreenX - this.viewportWidth / 2) / newZoom;
        this.y = pivotWorld.y - (pivotScreenY - this.viewportHeight / 2) / newZoom;
        this.clamp();
    }

    /**
     * Clamp camera so the visible area stays within the world bounds plus a 100px buffer.
     * If the viewport (in world space) is larger than the map + buffer, center on the world.
     */
    private clamp(): void {
        const buffer = 100;
        const halfW = this.viewportWidth / (2 * this.zoom);
        const halfH = this.viewportHeight / (2 * this.zoom);

        const minX = halfW - buffer;
        const maxX = this.worldWidth - halfW + buffer;
        this.x = minX <= maxX ? this.clampValue(this.x, minX, maxX) : this.worldWidth / 2;

        const minY = halfH - buffer;
        const maxY = this.worldHeight - halfH + buffer;
        this.y = minY <= maxY ? this.clampValue(this.y, minY, maxY) : this.worldHeight / 2;
    }

    private clampValue(value: number, min: number, max: number): number {
        if (min > max) return value;
        return Math.max(min, Math.min(max, value));
    }

    /** Convert a world-space coordinate to screen-space (zoom-aware). */
    worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
        return {
            x: (worldX - this.x) * this.zoom + this.viewportWidth / 2,
            y: (worldY - this.y) * this.zoom + this.viewportHeight / 2,
        };
    }

    /** Convert a screen-space coordinate to world-space (zoom-aware). */
    screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        return {
            x: (screenX - this.viewportWidth / 2) / this.zoom + this.x,
            y: (screenY - this.viewportHeight / 2) / this.zoom + this.y,
        };
    }

    /** Update viewport size (e.g. on window resize). */
    setViewportSize(width: number, height: number): void {
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.clamp();
    }
}
