/**
 * CharacterCreator - Popover for creating a new campaign character.
 * Portrait carousel (selected centre, prev/next faded behind), Create button.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { getPortraitIds, getPortrait } from '../../../character_defs/portraits';
import { getRandomCharacterName } from '../../../character_defs/characterNames';
import { getDefaultEquipmentForCampaign } from '../../../character_defs/items';

const CARD_SIZE = 200;

interface CharacterCreatorProps {
    campaignId: string;
    missionId: string;
    initialPortraitId?: string;
    onCreate: (characterId: string, portraitId: string) => void;
    onClose: () => void;
    createCharacter: (payload: {
        portraitId: string;
        campaignId: string;
        missionId: string;
        name?: string;
        equipment?: string[];
    }) => Promise<{ id: string; portraitId: string }>;
    anchorRef: React.RefObject<HTMLElement | null>;
}

export default function CharacterCreator({
    campaignId,
    missionId,
    initialPortraitId,
    onCreate,
    onClose,
    createCharacter,
    anchorRef: _anchorRef,
}: CharacterCreatorProps) {
    const portraitIds = useMemo(() => getPortraitIds(), []);
    const totalCount = portraitIds.length;
    const initialIndex = useMemo(() => {
        if (initialPortraitId && portraitIds.includes(initialPortraitId)) {
            return portraitIds.indexOf(initialPortraitId);
        }
        return 0;
    }, [initialPortraitId, portraitIds]);
    const [selectedIndex, setSelectedIndex] = useState(initialIndex);
    const [creating, setCreating] = useState(false);
    const [animating, setAnimating] = useState<'prev' | 'next' | null>(null);

    const selectedPortraitId = portraitIds[selectedIndex] ?? portraitIds[0];
    const prevIndex = selectedIndex === 0 ? totalCount - 1 : selectedIndex - 1;
    const nextIndex = selectedIndex === totalCount - 1 ? 0 : selectedIndex + 1;
    const prevPortraitId = portraitIds[prevIndex];
    const nextPortraitId = portraitIds[nextIndex];

    const goPrev = useCallback(() => {
        if (animating) return;
        setAnimating('prev');
        setSelectedIndex((i) => (i === 0 ? totalCount - 1 : i - 1));
        setTimeout(() => setAnimating(null), 300);
    }, [animating, totalCount]);

    const goNext = useCallback(() => {
        if (animating) return;
        setAnimating('next');
        setSelectedIndex((i) => (i === totalCount - 1 ? 0 : i + 1));
        setTimeout(() => setAnimating(null), 300);
    }, [animating, totalCount]);

    const handleCreate = useCallback(async () => {
        if (creating || !selectedPortraitId) return;
        setCreating(true);
        try {
            const char = await createCharacter({
                portraitId: selectedPortraitId,
                campaignId,
                missionId,
                name: getRandomCharacterName(),
                equipment: getDefaultEquipmentForCampaign(campaignId),
            });
            onCreate(char.id, char.portraitId);
            onClose();
        } catch (e) {
            console.error('Failed to create character:', e);
        } finally {
            setCreating(false);
        }
    }, [creating, selectedPortraitId, campaignId, missionId, createCharacter, onCreate, onClose]);

    if (totalCount === 0) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-label="Create character"
        >
            <div
                className="bg-black border border-border-custom rounded-lg shadow-xl p-6 flex flex-col gap-6 w-[720px] max-w-[90vw]"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-bold text-gray-100">Create Character</h3>

                {/* Portrait carousel: left half = prev, right half = next; selected centre, prev/next faded behind and up */}
                <div className="relative flex items-end justify-center gap-0" style={{ height: 220 }}>
                    {/* Left click zone */}
                    <button
                        type="button"
                        className="absolute left-0 top-0 bottom-0 w-1/2 z-10 cursor-pointer"
                        onClick={goPrev}
                        aria-label="Previous portrait"
                    />
                    {/* Right click zone */}
                    <button
                        type="button"
                        className="absolute right-0 top-0 bottom-0 w-1/2 z-10 cursor-pointer"
                        onClick={goNext}
                        aria-label="Next portrait"
                    />

                    {/* Prev portrait - faded, left and up a bit */}
                    <div
                        className="absolute overflow-hidden rounded-lg opacity-50 pointer-events-none transition-transform duration-300"
                        style={{
                            width: CARD_SIZE,
                            height: CARD_SIZE,
                            left: '50%',
                            transform: 'translate(calc(-100% - 24px), -12px)',
                            zIndex: 0,
                        }}
                    >
                        <PortraitBlock portraitId={prevPortraitId} />
                    </div>
                    {/* Next portrait - faded, right and up a bit */}
                    <div
                        className="absolute overflow-hidden rounded-lg opacity-50 pointer-events-none transition-transform duration-300"
                        style={{
                            width: CARD_SIZE,
                            height: CARD_SIZE,
                            left: '50%',
                            transform: 'translate(24px, -12px)',
                            zIndex: 0,
                        }}
                    >
                        <PortraitBlock portraitId={nextPortraitId} />
                    </div>

                    {/* Selected portrait - centre */}
                    <div
                        className={`relative overflow-hidden rounded-lg border-2 border-primary shadow-lg transition-transform duration-300 ${animating ? 'scale-95' : 'scale-100'}`}
                        style={{ width: CARD_SIZE, height: CARD_SIZE, zIndex: 1 }}
                    >
                        <PortraitBlock portraitId={selectedPortraitId} />
                    </div>

                    {/* Arrows */}
                    <button
                        type="button"
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-dark-700 border border-border-custom text-gray-200 flex items-center justify-center hover:bg-dark-600"
                        onClick={goPrev}
                        aria-label="Previous portrait"
                    >
                        ←
                    </button>
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-dark-700 border border-border-custom text-gray-200 flex items-center justify-center hover:bg-dark-600"
                        onClick={goNext}
                        aria-label="Next portrait"
                    >
                        →
                    </button>
                </div>

                <p className="text-center text-sm text-gray-300">
                    {selectedIndex + 1} / {totalCount}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        className="px-4 py-2 rounded-lg border border-border-custom text-gray-200 hover:bg-dark-700"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="px-6 py-2 rounded-lg bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50"
                        onClick={handleCreate}
                        disabled={creating}
                    >
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PortraitBlock({ portraitId }: { portraitId: string }) {
    const portrait = getPortrait(portraitId);
    if (!portrait) return null;
    return (
        <div
            className="w-full h-full flex items-center justify-center bg-background"
            dangerouslySetInnerHTML={{ __html: portrait.picture }}
        />
    );
}
