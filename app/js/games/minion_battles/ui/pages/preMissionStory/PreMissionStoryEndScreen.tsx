import React, { useEffect, useState } from 'react';
import PreMissionStoryLayout from './PreMissionStoryLayout';
import VNTextBox from '../../components/VNTextBox';

interface PreMissionStoryEndScreenProps {
    /** Resolved image URL (mission override or default bundle). */
    backgroundImage: string;
    /** Every lobby player has reached the end of the story and reported STORY_READY. */
    allReady: boolean;
    singlePlayer: boolean;
}

const GATHER_PARTY_LINE = 'You must gather your party before venturing forth.';

export default function PreMissionStoryEndScreen({
    backgroundImage,
    allReady,
    singlePlayer,
}: PreMissionStoryEndScreenProps) {
    const [bgOpacity, setBgOpacity] = useState(0);
    useEffect(() => {
        requestAnimationFrame(() => setBgOpacity(1));
    }, []);

    return (
        <PreMissionStoryLayout backgroundImage={backgroundImage} bgOpacity={bgOpacity} contentJustify="end">
            <div className="w-full pb-4 sm:pb-10 shrink-0 flex flex-col justify-end min-h-0 pt-8">
                <VNTextBox density="desktop" className="w-full max-w-4xl mx-auto">
                    <p className="text-center font-serif text-xl sm:text-2xl md:text-3xl lg:text-[2.125rem] text-amber-100/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.92)] leading-snug tracking-wide font-semibold">
                        {GATHER_PARTY_LINE}
                    </p>
                    {!allReady && !singlePlayer && (
                        <p className="text-center text-slate-400/95 text-sm sm:text-base mt-5 font-sans font-normal tracking-normal">
                            Waiting for other adventurers…
                        </p>
                    )}
                </VNTextBox>
            </div>
        </PreMissionStoryLayout>
    );
}
