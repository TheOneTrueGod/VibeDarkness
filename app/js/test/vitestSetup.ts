import { afterEach } from 'vitest';
import {
    flushLobbyLogBatchQueueForTests,
    resetLobbyLogBatchQueueForTests,
} from '../lobbyLogBatchQueue';

// App default is on; tests use mock APIs without lobby wiring.
try {
    localStorage.setItem('vibedarkness.debug.userStateLogging', '0');
} catch {
    /* ignore */
}

afterEach(async () => {
    await flushLobbyLogBatchQueueForTests();
    resetLobbyLogBatchQueueForTests();
});
