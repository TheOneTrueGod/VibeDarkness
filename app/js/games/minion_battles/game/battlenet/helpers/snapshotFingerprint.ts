import type { SerializedGameState } from '../../types';

export function getSnapshotFingerprint(
    state: SerializedGameState,
    envelopeSynchash?: string | null,
): string | null {
    if (typeof envelopeSynchash === 'string' && envelopeSynchash !== '') {
        return envelopeSynchash;
    }
    return typeof state.initialFingerprint === 'string' && state.initialFingerprint !== ''
        ? state.initialFingerprint
        : null;
}
