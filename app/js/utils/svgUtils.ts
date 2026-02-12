/**
 * SVG markup utilities (e.g. reusable icon strings)
 */

/**
 * SVG path for a diamond crystal icon (single path, fill controlled by CSS --resource-color).
 * Use with aria-hidden="true" when decorative.
 */
export function getCrystalSvg(): string {
    return (
        '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M12 2L22 12L12 22L2 12Z"/>' +
        '</svg>'
    );
}
