/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Semantic version from package.json (bumped on deploy). */
    readonly VITE_APP_VERSION: string;
    /** Deprecated for client lobby_log POST gating: use Debug Console → Debug Toggles → Persisted lobby log. */
    readonly VITE_LOBBY_LOG_THRESHOLD?: string;
}
