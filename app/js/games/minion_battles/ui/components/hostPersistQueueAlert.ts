import {
    HOST_PERSIST_QUEUE_DANGER_DEPTH,
    HOST_PERSIST_QUEUE_SHOW_AFTER_MS,
    HOST_PERSIST_QUEUE_WARNING_DEPTH,
} from '../../game/battlenet/constants';
import type { SyncStatusTone } from './SyncStatusCard';

export interface HostPersistQueueAlertInput {
    depth: number;
    oldestAgeMs: number;
    /** The playahead cap is holding cards until saves catch up. */
    capBlocking: boolean;
}

export interface HostPersistQueueAlertModel {
    title: string;
    summary: string;
    tone: SyncStatusTone;
    busy: true;
    /** Extra line shown when the playahead cap is holding cards. */
    detail?: string;
}

export const HOST_PERSIST_QUEUE_CAP_DETAIL = 'Orders resume when saves catch up.';

/** Host "Waiting on server" alert, or null while there is nothing worth showing. */
export function hostPersistQueueAlertModel({
    depth,
    oldestAgeMs,
    capBlocking,
}: HostPersistQueueAlertInput): HostPersistQueueAlertModel | null {
    if (depth <= 0 || oldestAgeMs < HOST_PERSIST_QUEUE_SHOW_AFTER_MS) {
        return null;
    }
    const tone: SyncStatusTone =
        depth >= HOST_PERSIST_QUEUE_DANGER_DEPTH
            ? 'danger'
            : depth >= HOST_PERSIST_QUEUE_WARNING_DEPTH
              ? 'warning'
              : 'info';
    return {
        title: 'Waiting on server',
        summary: depth === 1 ? '1 save queued up' : `${depth} saves queued up`,
        tone,
        busy: true,
        ...(capBlocking ? { detail: HOST_PERSIST_QUEUE_CAP_DETAIL } : {}),
    };
}
