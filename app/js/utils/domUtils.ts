/**
 * DOM utilities
 */

/**
 * Escapes a string for safe insertion into HTML (e.g. when using innerHTML).
 * Uses a temporary div's textContent so that special characters are encoded.
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
