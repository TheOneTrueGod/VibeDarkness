/**
 * Compact cassette-style music transport for the global title bar.
 */
import React, { useEffect } from 'react';
import { FastForward, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { TestIds } from '../../../../testing/testIds';
import { getMusicPlayer } from '../../music/MusicPlayerController';
import { MUSIC_PLAYER_VOLUME_SLIDER_MAX } from '../../music/musicConstants';
import { formatSongReadout } from '../../music/songReadout';
import { useMusicPlayerState } from '../../music/useMusicPlayerState';

const ICON_BUTTON_CLASS =
    'p-1.5 rounded-md border border-border-custom bg-surface-light/90 text-muted hover:text-white hover:bg-border-custom transition-colors disabled:opacity-40 disabled:hover:text-muted disabled:hover:bg-surface-light/90';

export default function MusicPlayer() {
    const player = getMusicPlayer();
    const state = useMusicPlayerState();

    useEffect(() => {
        void player.preloadAll();
    }, [player]);

    const playing = state.status === 'playing';
    const PlayPauseIcon = playing ? Pause : Play;
    const volumePercent = Math.round(state.volume * MUSIC_PLAYER_VOLUME_SLIDER_MAX);
    const readout = formatSongReadout(state.songTitle);

    return (
        <div
            className="flex items-center gap-1.5"
            data-testid={TestIds.musicPlayer}
            role="group"
            aria-label="Music player"
        >
            <button
                type="button"
                data-testid={TestIds.musicPlayerPlayPause}
                className={ICON_BUTTON_CLASS}
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => player.togglePlayPause()}
            >
                <PlayPauseIcon className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                data-testid={TestIds.musicPlayerSkip}
                className={ICON_BUTTON_CLASS}
                aria-label="Next track"
                disabled={!state.canSkip}
                onClick={() => player.next()}
            >
                <FastForward className="w-4 h-4" aria-hidden="true" />
            </button>
            <div
                data-testid={TestIds.musicPlayerReadout}
                className="w-[11.5rem] h-8 shrink-0 overflow-hidden rounded-sm border border-dark-600 bg-black px-2 flex items-center"
                title={state.songTitle || undefined}
            >
                <span className="font-mono text-[11px] text-primary tracking-wide whitespace-pre leading-none">
                    {readout}
                </span>
            </div>
            <input
                type="range"
                data-testid={TestIds.musicPlayerVolume}
                className="w-24 accent-primary"
                min={0}
                max={MUSIC_PLAYER_VOLUME_SLIDER_MAX}
                step={1}
                value={volumePercent}
                aria-label="Music volume"
                onChange={(e) => player.setVolume(Number(e.target.value) / MUSIC_PLAYER_VOLUME_SLIDER_MAX)}
            />
            <button
                type="button"
                data-testid={TestIds.musicPlayerMute}
                className={ICON_BUTTON_CLASS}
                aria-label={state.muted ? 'Unmute' : 'Mute'}
                aria-pressed={state.muted}
                onClick={() => player.toggleMuted()}
            >
                {state.muted ? (
                    <VolumeX className="w-4 h-4" aria-hidden="true" />
                ) : (
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                )}
            </button>
        </div>
    );
}
