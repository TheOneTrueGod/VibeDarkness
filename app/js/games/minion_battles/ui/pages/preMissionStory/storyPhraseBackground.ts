/** Dialogue and choice phrases may carry a full-screen backdrop URL. */
export function storyPhraseBackgroundUrl(
    phrase: { type: string; backgroundImage?: string } | undefined,
): string | undefined {
    if (!phrase) return undefined;
    if (phrase.type === 'dialogue' || phrase.type === 'choice') {
        return phrase.backgroundImage;
    }
    return undefined;
}
