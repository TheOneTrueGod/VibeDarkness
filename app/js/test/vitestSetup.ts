import { afterEach } from 'vitest';
import {
    flushLobbyLogBatchQueueForTests,
    resetLobbyLogBatchQueueForTests,
} from '../lobbyLogBatchQueue';

afterEach(async () => {
    await flushLobbyLogBatchQueueForTests();
    resetLobbyLogBatchQueueForTests();
});
