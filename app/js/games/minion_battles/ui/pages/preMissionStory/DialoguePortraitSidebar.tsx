import React from 'react';
import type { DialoguePhrase } from '../../../storylines/storyTypes';
import { getNpc } from '../../../constants/npcs';
import CharacterPortrait from '../../components/CharacterPortrait';
import { STORY_LAPTOP_PORTRAIT_PX } from './storyViewportConstants';

interface DialoguePortraitSidebarProps {
    phrase: DialoguePhrase;
}

export default function DialoguePortraitSidebar({ phrase }: DialoguePortraitSidebarProps) {
    const leftIds = (phrase.portraits?.left ?? (phrase.speakerId ? [phrase.speakerId] : [])).slice(0, 2);
    const rightIds = (phrase.portraits?.right ?? []).slice(0, 2);

    const renderSlot = (npcId: string) => {
        const npc = getNpc(npcId);
        const isActive = phrase.speakerId === npcId;
        const frame = `border-2 shrink-0 ${isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'}`;

        return npc?.portrait ? (
            <CharacterPortrait
                key={npcId}
                picture={npc.portrait}
                sizePx={STORY_LAPTOP_PORTRAIT_PX}
                className={frame}
            />
        ) : (
            <div
                key={npcId}
                className={`rounded-lg shrink-0 ${frame}`}
                style={{
                    width: STORY_LAPTOP_PORTRAIT_PX,
                    height: STORY_LAPTOP_PORTRAIT_PX,
                    backgroundColor: npc?.color ?? '#333',
                }}
            />
        );
    };

    return (
        <div
            className="flex flex-col items-center justify-between self-stretch shrink-0 py-1 min-h-[6rem]"
            style={{ width: STORY_LAPTOP_PORTRAIT_PX }}
        >
            <div className="flex-1 min-h-[4px] shrink min-w-0" aria-hidden />
            <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="flex flex-col items-center gap-1">{leftIds.map((id) => renderSlot(id))}</div>
                {rightIds.length > 0 ? (
                    <div className="flex flex-col items-center gap-1 pt-1 border-t border-border-custom/50">
                        {rightIds.map((id) => renderSlot(id))}
                    </div>
                ) : null}
            </div>
            <div className="flex-1 min-h-[4px] shrink min-w-0" aria-hidden />
        </div>
    );
}
