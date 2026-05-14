/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Deprecated for client lobby_log POST gating: use Debug Console → Debug Toggles → Persisted lobby log. */
    readonly VITE_LOBBY_LOG_THRESHOLD?: string;
}
