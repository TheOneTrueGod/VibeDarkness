import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';
import type { BattleInitPhase } from './useBattleSessionLifecycle';

export function useHudEffectCanvasBridge(
    battleInitPhase: BattleInitPhase,
    sessionRef: RefObject<BattleSession | null>,
    hudEffectCanvasRef: RefObject<HudEffectCanvasHandle | null>,
    battleCanvasAreaRef: RefObject<HTMLDivElement | null>,
): void {
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const cam = sessionRef.current?.getCamera();
        if (cam) hudEffectCanvasRef.current?.setCamera(cam);
        const el = battleCanvasAreaRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            hudEffectCanvasRef.current?.setCanvasPageOffset(rect.left, rect.top);
        }
    }, [battleInitPhase, sessionRef, hudEffectCanvasRef, battleCanvasAreaRef]);

    useEffect(() => {
        const onResize = () => {
            const el = battleCanvasAreaRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            hudEffectCanvasRef.current?.setCanvasPageOffset(rect.left, rect.top);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [battleCanvasAreaRef, hudEffectCanvasRef]);
}
