export interface RectLike {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface FlightTransform {
    translateX: number;
    translateY: number;
    scale: number;
}

/**
 * FLIP helper: the transform (with `transform-origin: top left`) that makes an element laid out at `fromRect`
 * land on `toRect`'s top-left corner at `toRect`'s width. Uniform scale so text is not distorted.
 */
export function computeFlightTransform(fromRect: RectLike, toRect: RectLike): FlightTransform {
    const scale = fromRect.width > 0 && toRect.width > 0 ? toRect.width / fromRect.width : 1;
    return {
        translateX: toRect.left - fromRect.left,
        translateY: toRect.top - fromRect.top,
        scale,
    };
}

export function flightTransformToCss(t: FlightTransform): string {
    return `translate(${t.translateX}px, ${t.translateY}px) scale(${t.scale})`;
}

/** Rect of an element of the given size centred in a viewport. */
export function centeredRect(width: number, height: number, viewportWidth: number, viewportHeight: number): RectLike {
    return { left: (viewportWidth - width) / 2, top: (viewportHeight - height) / 2, width, height };
}
