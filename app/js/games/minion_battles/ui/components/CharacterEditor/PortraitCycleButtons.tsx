import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PortraitCycleButtonsProps {
    onPrev: () => void;
    onNext: () => void;
}

/** Compact Lucide arrows for cycling the character portrait. */
export function PortraitCycleButtons({ onPrev, onNext }: PortraitCycleButtonsProps) {
    return (
        <div className="flex gap-1 shrink-0">
            <button
                type="button"
                className="w-6 h-6 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer p-0"
                onClick={onPrev}
                aria-label="Previous portrait"
            >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
                type="button"
                className="w-6 h-6 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer p-0"
                onClick={onNext}
                aria-label="Next portrait"
            >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    );
}
