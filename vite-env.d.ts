/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** `off` | `log` | `info` | `warn` | `error` | `critical` — floor for POSTing lobby_log lines (default off when unset). */
    readonly VITE_LOBBY_LOG_THRESHOLD?: string;
}
