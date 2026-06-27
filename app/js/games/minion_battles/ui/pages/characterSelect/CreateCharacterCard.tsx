import React from 'react';

export const CreateCharacterCard = React.forwardRef<
    HTMLDivElement,
    { onClick: () => void }
>(function CreateCharacterCard({ onClick }, ref) {
    return (
        <div
            ref={ref}
            role="button"
            tabIndex={0}
            className="w-[200px] h-[200px] rounded-lg border-2 border-dashed border-border-custom bg-surface flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary hover:bg-surface-light transition-all"
            onClick={onClick}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
        >
            <div className="w-14 h-14 rounded-full border-2 border-gray-400 flex items-center justify-center text-2xl text-gray-400">
                +
            </div>
            <span className="text-sm font-semibold text-gray-300">Create Character</span>
        </div>
    );
});
