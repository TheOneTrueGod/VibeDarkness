import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import { RewindingTextEffect } from '../../../game/effect_defs/hudEffects';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';

/** DOM rewind overlay fade duration (rollback restore under a frozen frame). */
export const REWIND_OVERLAY_FADE_MS = 500;

interface UseRewindOverlayParams {
    battleCanvasAreaRef: RefObject<HTMLDivElement | null>;
    hudEffectCanvasRef: RefObject<HudEffectCanvasHandle | null>;
}

/** Frozen-frame overlay state, fade timers, and capture on sequential targeting rewind. */
export function useRewindOverlay({ battleCanvasAreaRef, hudEffectCanvasRef }: UseRewindOverlayParams) {
    const [rewindOverlay, setRewindOverlay] = useState<{ frameUrl: string; token: number } | null>(null);
    const [rewindOverlayOpaque, setRewindOverlayOpaque] = useState(true);
    const rewindFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rewindFadeRafRef = useRef<number | null>(null);

    const clearRewindTimers = useCallback(() => {
        if (rewindFadeTimerRef.current != null) {
            clearTimeout(rewindFadeTimerRef.current);
            rewindFadeTimerRef.current = null;
        }
        if (rewindFadeRafRef.current != null) {
            cancelAnimationFrame(rewindFadeRafRef.current);
            rewindFadeRafRef.current = null;
        }
    }, []);

    const captureAndFade = useCallback(
        (session: BattleSession) => {
            const eng = session.getEngine();
            const cam = session.getCamera();
            const rend = session.getRenderer();
            if (eng && cam && rend?.isInitialized()) {
                rend.render(eng, cam, null, 0);
            }
            const canvas = battleCanvasAreaRef.current?.querySelector('canvas');
            let frameUrl = '';
            if (canvas instanceof HTMLCanvasElement) {
                try {
                    frameUrl = canvas.toDataURL('image/png');
                } catch {
                    frameUrl = '';
                }
            }
            clearRewindTimers();
            hudEffectCanvasRef.current?.addHudEffect(new RewindingTextEffect());
            setRewindOverlay({ frameUrl, token: Date.now() });
            setRewindOverlayOpaque(true);
            rewindFadeRafRef.current = requestAnimationFrame(() => {
                rewindFadeRafRef.current = requestAnimationFrame(() => {
                    rewindFadeRafRef.current = null;
                    setRewindOverlayOpaque(false);
                    rewindFadeTimerRef.current = setTimeout(() => {
                        setRewindOverlay(null);
                        rewindFadeTimerRef.current = null;
                    }, REWIND_OVERLAY_FADE_MS);
                });
            });
        },
        [battleCanvasAreaRef, hudEffectCanvasRef, clearRewindTimers],
    );

    useEffect(() => {
        return () => {
            clearRewindTimers();
        };
    }, [clearRewindTimers]);

    return {
        rewindOverlay,
        rewindOverlayOpaque,
        captureAndFade,
    };
}
