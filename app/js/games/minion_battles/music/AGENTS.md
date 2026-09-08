# Music

Client-side music transport for Minion Battles. Owns playlists, preload, crossfade, and persisted volume / mute / autoplay. React chrome lives in `ui/components/MusicPlayer.tsx` (global title bar).

| File | Purpose |
|------|---------|
| `MusicPlayerController.ts` | Dual-channel playback singleton: play/pause, playlists, single songs, preload, crossfade |
| `playlists.ts` | Song asset URLs and the menu / battle / boss playlist definitions |
| `musicPlayerSettings.ts` | localStorage load/save for volume, mute, and autoplay/autopause |
| `crossfadeTiming.ts` | Pure fade-window math (in/out offsets vs duration) |
| `playlistIdForGamePhase.ts` | Which playlist to request for a lobby game phase + mission type |
