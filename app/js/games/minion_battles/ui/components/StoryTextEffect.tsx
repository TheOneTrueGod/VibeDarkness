/**
 * Reusable story text effects (e.g. title_bounce: large, centered, purple, per-character bounce).
 */
import React from 'react';
import type { StoryTextEffect as StoryTextEffectType } from '../../storylines/storyTypes';

interface StoryTextEffectProps {
    effect: StoryTextEffectType;
    text: string;
}

/** Per-character bounce animation: each character slides up and down slowly with staggered delay. */
function TitleBounce({ text }: { text: string }) {
    const characters = Array.from(text);
    return (
        <div className="flex flex-wrap justify-center items-center gap-1" style={{ perspective: '500px' }}>
            {characters.map((char, i) => (
                <span
                    key={`${i}-${char}`}
                    className="inline-block text-[3rem] md:text-[4rem] font-bold text-purple-400 animate-story-title-bounce"
                    style={{ animationDelay: `${i * 0.08}s` }}
                >
                    {char === ' ' ? '\u00A0' : char}
                </span>
            ))}
        </div>
    );
}

export default function StoryTextEffect({ effect, text }: StoryTextEffectProps) {
    switch (effect) {
        case 'title_bounce':
            return <TitleBounce text={text} />;
        default:
            return <span className="text-white">{text}</span>;
    }
}
