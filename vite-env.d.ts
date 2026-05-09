/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** `off` | `log` | `info` | `warn` | `error` | `critical` — floor for POSTing lobby_log lines (default off when unset). */
    readonly VITE_LOBBY_LOG_THRESHOLD?: string;
    /** Battle-sync lobby_log floor; unset → `info`. Same tokens as threshold; `true`/`1` → `log`. Server: `LOBBY_LOG_BATTLE_SYNC`. */
    readonly VITE_LOBBY_LOG_BATTLE_SYNC?: string;
}
