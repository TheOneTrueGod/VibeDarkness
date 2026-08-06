/**
 * Viewport-aware placement helpers for portaled tooltips.
 * Pure functions — safe to unit-test without React.
 */

export type PortalTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface RectLike {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export interface TooltipSize {
    width: number;
    height: number;
}

export interface ViewportSize {
    width: number;
    height: number;
}

export interface TooltipPosition {
    left: number;
    top: number;
    placement: PortalTooltipPlacement;
}

const OPPOSITE: Record<PortalTooltipPlacement, PortalTooltipPlacement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
};

/** Preferred first, then opposite, then the remaining axis pair. */
export function orderPlacements(preferred: PortalTooltipPlacement): PortalTooltipPlacement[] {
    const opposite = OPPOSITE[preferred];
    if (preferred === 'top' || preferred === 'bottom') {
        return [preferred, opposite, 'right', 'left'];
    }
    return [preferred, opposite, 'top', 'bottom'];
}

function positionForPlacement(
    placement: PortalTooltipPlacement,
    anchor: RectLike,
    size: TooltipSize,
    gapPx: number,
): TooltipPosition {
    switch (placement) {
        case 'top':
            return {
                left: anchor.left + anchor.width / 2 - size.width / 2,
                top: anchor.top - gapPx - size.height,
                placement,
            };
        case 'bottom':
            return {
                left: anchor.left + anchor.width / 2 - size.width / 2,
                top: anchor.bottom + gapPx,
                placement,
            };
        case 'left':
            return {
                left: anchor.left - gapPx - size.width,
                top: anchor.top + anchor.height / 2 - size.height / 2,
                placement,
            };
        case 'right':
            return {
                left: anchor.right + gapPx,
                top: anchor.top + anchor.height / 2 - size.height / 2,
                placement,
            };
    }
}

function fitsViewport(
    pos: TooltipPosition,
    size: TooltipSize,
    viewport: ViewportSize,
    paddingPx: number,
): boolean {
    return (
        pos.left >= paddingPx
        && pos.top >= paddingPx
        && pos.left + size.width <= viewport.width - paddingPx
        && pos.top + size.height <= viewport.height - paddingPx
    );
}

/** Clamp top-left so the tooltip stays inside the viewport inset by padding. */
export function clampToViewport(
    pos: TooltipPosition,
    size: TooltipSize,
    viewport: ViewportSize,
    paddingPx: number,
): TooltipPosition {
    const maxLeft = Math.max(paddingPx, viewport.width - paddingPx - size.width);
    const maxTop = Math.max(paddingPx, viewport.height - paddingPx - size.height);
    return {
        ...pos,
        left: Math.min(maxLeft, Math.max(paddingPx, pos.left)),
        top: Math.min(maxTop, Math.max(paddingPx, pos.top)),
    };
}

/**
 * Pick the first placement (from preferred order) that fits; if none fit, use preferred
 * then clamp into the viewport.
 */
export function computeTooltipPosition(args: {
    anchor: RectLike;
    size: TooltipSize;
    viewport: ViewportSize;
    preferredPlacement: PortalTooltipPlacement;
    gapPx: number;
    paddingPx: number;
    autoFlip?: boolean;
}): TooltipPosition {
    const {
        anchor,
        size,
        viewport,
        preferredPlacement,
        gapPx,
        paddingPx,
        autoFlip = true,
    } = args;

    const candidates = autoFlip ? orderPlacements(preferredPlacement) : [preferredPlacement];
    for (const placement of candidates) {
        const pos = positionForPlacement(placement, anchor, size, gapPx);
        if (fitsViewport(pos, size, viewport, paddingPx)) {
            return pos;
        }
    }

    const fallback = positionForPlacement(preferredPlacement, anchor, size, gapPx);
    return clampToViewport(fallback, size, viewport, paddingPx);
}
