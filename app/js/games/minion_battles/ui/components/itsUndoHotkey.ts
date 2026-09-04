/**
 * Shared Undo enablement + Escape hotkey rules for ITS playahead controls.
 * The hotkey must match the Undo button: same disabled reasons, no action when disabled.
 */

export function isItsUndoDisabled(opts: {
    isRewindCrossfade: boolean;
    onlyUndoAtStart: boolean;
    hasCollectedTargets: boolean;
}): boolean {
    return opts.isRewindCrossfade || (opts.onlyUndoAtStart && opts.hasCollectedTargets);
}

export function isEscapeItsUndoHotkey(e: { code: string; repeat: boolean }): boolean {
    return e.code === 'Escape' && !e.repeat;
}

export function isKeyboardEventFromTextInput(e: { target: EventTarget | null }): boolean {
    const el = e.target;
    if (el == null || typeof el !== 'object') return false;
    const tag = 'tagName' in el ? String((el as { tagName?: string }).tagName) : '';
    const editable = 'isContentEditable' in el && Boolean((el as { isContentEditable?: boolean }).isContentEditable);
    return tag === 'INPUT' || tag === 'TEXTAREA' || editable;
}
